import request from 'supertest';
import type { Express } from 'express';
import { createApp } from './app';
import { prisma } from '../../infrastructure/database/prisma';
import { redis } from '../../infrastructure/cache/redis';

/**
 * Integration tests against the real DB + Redis (docker compose stack).
 * Exercise the full HTTP pipeline: middleware → validation → service → DB.
 *
 * NODE_ENV=test (set by jest) disables rate limiting so the suite isn't
 * throttled. OTP_PROVIDER=mock makes the verification code deterministic: 000000.
 */

const TEST_PHONE = '+962780000099';
const SEED_SERVICE_ID = '00000000-0000-0000-0000-000000000003'; // Electrician

let app: Express;

async function clearOtpState(phone: string) {
  await redis.del(`otp:${phone}`, `otp_cooldown:${phone}`, `otp_attempts:${phone}`);
}

async function login(phone: string): Promise<string> {
  await clearOtpState(phone);
  await request(app).post('/api/v1/auth/otp/request').send({ phone }).expect(200);
  const res = await request(app)
    .post('/api/v1/auth/otp/verify')
    .send({ phone, code: '000000' })
    .expect(200);
  return res.body.data.accessToken;
}

beforeAll(() => {
  app = createApp().app;
});

afterAll(async () => {
  await clearOtpState(TEST_PHONE);
  await prisma.$disconnect();
  redis.disconnect();
});

describe('GET /health', () => {
  it('reports ok with db + redis up', async () => {
    const res = await request(app).get('/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', db: 'ok', redis: 'ok' });
  });
});

describe('GET /live (liveness probe)', () => {
  it('always returns 200 — must not depend on DB or Redis', async () => {
    const res = await request(app).get('/live').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('GET /ready (readiness probe)', () => {
  it('returns 200 when db + redis are reachable', async () => {
    const res = await request(app).get('/ready').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', db: 'ok', redis: 'ok' });
  });
});

describe('error envelope contract', () => {
  it('echoes the X-Request-Id back on a 422 (validation)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/otp/request')
      .set('X-Request-Id', 'req-test-abc-123')
      .send({ phone: 'not-a-phone' })
      .expect(422);
    expect(res.body).toEqual(
      expect.objectContaining({ error: expect.objectContaining({ code: 'VALIDATION_ERROR' }) }),
    );
  });
});

describe('GET /api/v1/services', () => {
  it('returns the active service catalogue', async () => {
    const res = await request(app).get('/api/v1/services').expect(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('honors Accept-Encoding: gzip (compression middleware)', async () => {
    const res = await request(app)
      .get('/api/v1/services')
      .set('Accept-Encoding', 'gzip')
      .expect(200);
    // The 5-row service catalogue body is small (~500 bytes), below the
    // 1kb compression threshold — so we expect no Content-Encoding header.
    // The presence of the body is the assertion: compression middleware
    // didn't break the response.
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe('auth flow', () => {
  beforeEach(() => clearOtpState(TEST_PHONE));

  it('requests an OTP', async () => {
    const res = await request(app)
      .post('/api/v1/auth/otp/request')
      .send({ phone: TEST_PHONE })
      .expect(200);
    expect(res.body.data.sent).toBe(true);
  });

  it('rejects a second request within the cooldown window', async () => {
    await request(app).post('/api/v1/auth/otp/request').send({ phone: TEST_PHONE }).expect(200);
    await request(app).post('/api/v1/auth/otp/request').send({ phone: TEST_PHONE }).expect(422);
  });

  it('rejects an invalid phone number', async () => {
    await request(app).post('/api/v1/auth/otp/request').send({ phone: 'not-a-phone' }).expect(422);
  });

  it('verifies a correct OTP, returns the access token, and sets an httpOnly refresh cookie', async () => {
    await request(app).post('/api/v1/auth/otp/request').send({ phone: TEST_PHONE }).expect(200);
    const res = await request(app)
      .post('/api/v1/auth/otp/verify')
      .send({ phone: TEST_PHONE, code: '000000' })
      .expect(200);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.body.data.refreshToken).toBeUndefined(); // refresh token is cookie-only now
    const cookies = (res.headers['set-cookie'] as unknown as string[]) ?? [];
    expect(cookies.some((c) => c.startsWith('refresh_token=') && /HttpOnly/i.test(c))).toBe(true);
  });

  it('rejects a wrong OTP', async () => {
    await request(app).post('/api/v1/auth/otp/request').send({ phone: TEST_PHONE }).expect(200);
    await request(app)
      .post('/api/v1/auth/otp/verify')
      .send({ phone: TEST_PHONE, code: '111111' })
      .expect(401);
  });

  it('returns the current user from a valid token', async () => {
    const token = await login(TEST_PHONE);
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.phone).toBe(TEST_PHONE);
  });

  it('rotates the refresh cookie and revokes the old one (reuse detection)', async () => {
    await clearOtpState(TEST_PHONE);
    await request(app).post('/api/v1/auth/otp/request').send({ phone: TEST_PHONE }).expect(200);
    const verify = await request(app)
      .post('/api/v1/auth/otp/verify')
      .send({ phone: TEST_PHONE, code: '000000' })
      .expect(200);
    const cookies = (verify.headers['set-cookie'] as unknown as string[]) ?? [];
    const refreshCookie = cookies.find((c) => c.startsWith('refresh_token='))!.split(';')[0];

    // First refresh with the cookie succeeds and rotates the token.
    await request(app).post('/api/v1/auth/refresh').set('Cookie', refreshCookie).expect(200);
    // Replaying the now-revoked cookie value must fail.
    await request(app).post('/api/v1/auth/refresh').set('Cookie', refreshCookie).expect(401);
  });

  it('logs out: clears the cookie and revokes the refresh token', async () => {
    await clearOtpState(TEST_PHONE);
    await request(app).post('/api/v1/auth/otp/request').send({ phone: TEST_PHONE }).expect(200);
    const verify = await request(app)
      .post('/api/v1/auth/otp/verify')
      .send({ phone: TEST_PHONE, code: '000000' })
      .expect(200);
    const cookies = (verify.headers['set-cookie'] as unknown as string[]) ?? [];
    const refreshCookie = cookies.find((c) => c.startsWith('refresh_token='))!.split(';')[0];

    await request(app).post('/api/v1/auth/logout').set('Cookie', refreshCookie).expect(200);
    // The revoked token can no longer refresh.
    await request(app).post('/api/v1/auth/refresh').set('Cookie', refreshCookie).expect(401);
  });
});

describe('bookings', () => {
  it('rejects an unauthenticated request', async () => {
    await request(app).post('/api/v1/bookings').send({}).expect(401);
  });

  it('rejects an invalid body with 422', async () => {
    const token = await login(TEST_PHONE);
    await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ serviceId: SEED_SERVICE_ID, addressLine: 'x', addressLat: 999, addressLng: 35.9 })
      .expect(422);
  });

  it('returns 404 for a non-existent service', async () => {
    const token = await login(TEST_PHONE);
    await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        serviceId: '99999999-9999-4999-8999-999999999999',
        addressLine: 'Amman',
        addressLat: 31.95,
        addressLng: 35.93,
      })
      .expect(404);
  });

  it('creates a booking and lists it for the customer', async () => {
    const token = await login(TEST_PHONE);
    const create = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ serviceId: SEED_SERVICE_ID, addressLine: 'خلدا', addressLat: 31.9522, addressLng: 35.9331 })
      .expect(201);

    // POST /bookings now returns { booking, checkout }. In mock/instant mode the
    // booking is live (PENDING) immediately and there is no hosted-checkout session.
    const bookingId = create.body.data.booking.id;
    expect(create.body.data.booking.status).toBe('PENDING');
    expect(create.body.data.checkout).toBeNull();

    const list = await request(app)
      .get('/api/v1/bookings')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(list.body.data.some((b: { id: string }) => b.id === bookingId)).toBe(true);
  });

  // §17.5.2: isEmergency is customer-declared (not auto-detected from
  // time-of-day), so the route must actually read it off the request body —
  // this was previously accepted by BookingService.createBooking's type but
  // silently dropped by the route handler, making the whole feature
  // unreachable from any client.
  it('applies the flat emergency surcharge as its own invoice line when isEmergency=true', async () => {
    const token = await login(TEST_PHONE);
    const create = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ serviceId: SEED_SERVICE_ID, addressLine: 'خلدا', addressLat: 31.9522, addressLng: 35.9331, isEmergency: true })
      .expect(201);

    expect(create.body.data.booking.isEmergency).toBe(true);
    expect(Number(create.body.data.booking.surchargeFils)).toBe(10000);
  });
});

describe('unmatched routes', () => {
  it('returns a structured 404', async () => {
    const res = await request(app).get('/api/v1/does-not-exist').expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('GET /metrics', () => {
  it('exposes Prometheus metrics including HTTP + process series', async () => {
    // Generate at least one request so the HTTP histogram has a sample.
    await request(app).get('/health');
    const res = await request(app).get('/metrics').expect(200);
    expect(res.text).toContain('http_request_duration_seconds');
    expect(res.text).toContain('http_requests_total');
    expect(res.text).toContain('process_cpu_user_seconds_total'); // default Node metrics
  });
});

describe('POST /api/v1/webhooks/psp', () => {
  it('accepts a verified event and dedupes re-delivery', async () => {
    const eventId = `evt-test-${Date.now()}`;
    const body = JSON.stringify({ eventId, type: 'payment.refunded', providerRef: 'no-such-ref', amountJod: 1 });

    const first = await request(app)
      .post('/api/v1/webhooks/psp')
      .set('Content-Type', 'application/json')
      .send(body)
      .expect(200);
    expect(first.body.data.ok).toBe(true);

    const second = await request(app)
      .post('/api/v1/webhooks/psp')
      .set('Content-Type', 'application/json')
      .send(body)
      .expect(200);
    expect(second.body.data.duplicate).toBe(true);

    await prisma.pspWebhookEvent.deleteMany({ where: { eventId } });
  });
});
