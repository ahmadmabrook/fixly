import request from 'supertest';
import type { Express } from 'express';
import { createApp } from './app';
import { prisma } from '../../infrastructure/database/prisma';
import { redis } from '../../infrastructure/cache/redis';

/**
 * Integration tests for the admin panel API against the real DB + Redis
 * (docker compose stack). Exercise the full HTTP pipeline:
 * middleware → validation → service → DB.
 *
 * NODE_ENV=test (set by jest) disables rate limiting so the suite isn't
 * throttled by authLimiter on /admin/login.
 *
 * Admin creds come from seed.ts: admin@fixly.jo / admin12345.
 * A CUSTOMER token is obtained via the OTP flow (OTP-registered users
 * default to role=CUSTOMER) to assert the requireRole('ADMIN') guard.
 */

const ADMIN_EMAIL = 'admin@fixly.jo';
const ADMIN_PASSWORD = 'admin12345';
const CUSTOMER_PHONE = '+962780000088';

let app: Express;

async function clearOtpState(phone: string) {
  await redis.del(`otp:${phone}`, `otp_cooldown:${phone}`, `otp_attempts:${phone}`);
}

async function customerLogin(phone: string): Promise<string> {
  await clearOtpState(phone);
  await request(app).post('/api/v1/auth/otp/request').send({ phone }).expect(200);
  const res = await request(app)
    .post('/api/v1/auth/otp/verify')
    .send({ phone, code: '000000' })
    .expect(200);
  return res.body.data.accessToken;
}

async function adminLogin(): Promise<string> {
  const res = await request(app)
    .post('/api/v1/admin/login')
    .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
    .expect(200);
  return res.body.data.accessToken;
}

beforeAll(() => {
  app = createApp().app;
});

afterAll(async () => {
  await clearOtpState(CUSTOMER_PHONE);
  await prisma.$disconnect();
  redis.disconnect();
});

describe('POST /api/v1/admin/login', () => {
  it('authenticates the seeded admin and returns a token + profile', async () => {
    const res = await request(app)
      .post('/api/v1/admin/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      .expect(200);

    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.body.data.admin).toMatchObject({
      email: ADMIN_EMAIL,
      name: expect.any(String),
      id: expect.any(String),
    });
  });

  it('rejects a wrong password with 401', async () => {
    const res = await request(app)
      .post('/api/v1/admin/login')
      .send({ email: ADMIN_EMAIL, password: 'wrong-password' })
      .expect(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('sets an httpOnly admin refresh cookie and does NOT return it in the body', async () => {
    const res = await request(app)
      .post('/api/v1/admin/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      .expect(200);
    expect(res.body.data.refreshToken).toBeUndefined();
    const cookies = (res.headers['set-cookie'] as unknown as string[]) ?? [];
    expect(cookies.some((c) => c.startsWith('admin_refresh_token=') && /HttpOnly/i.test(c))).toBe(true);
  });
});

describe('admin session (cookie refresh + logout)', () => {
  it('rotates the admin access token via the refresh cookie, then revokes on logout', async () => {
    const login = await request(app)
      .post('/api/v1/admin/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      .expect(200);
    const cookie = ((login.headers['set-cookie'] as unknown as string[]) ?? [])
      .find((c) => c.startsWith('admin_refresh_token='))!.split(';')[0];

    // Refresh issues a fresh access token using only the cookie.
    const refreshed = await request(app)
      .post('/api/v1/admin/auth/refresh')
      .set('Cookie', cookie)
      .expect(200);
    expect(refreshed.body.data.accessToken).toEqual(expect.any(String));

    // The old (rotated) cookie is now revoked — reuse is rejected.
    await request(app).post('/api/v1/admin/auth/refresh').set('Cookie', cookie).expect(401);

    // A fresh login + logout revokes that session's token.
    const relogin = await request(app)
      .post('/api/v1/admin/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      .expect(200);
    const cookie2 = ((relogin.headers['set-cookie'] as unknown as string[]) ?? [])
      .find((c) => c.startsWith('admin_refresh_token='))!.split(';')[0];
    await request(app).post('/api/v1/admin/auth/logout').set('Cookie', cookie2).expect(200);
    await request(app).post('/api/v1/admin/auth/refresh').set('Cookie', cookie2).expect(401);
  });
});

describe('admin route authorization', () => {
  it('rejects an admin endpoint with no token (401)', async () => {
    const res = await request(app).get('/api/v1/admin/stats').expect(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects a CUSTOMER token with 403', async () => {
    const customerToken = await customerLogin(CUSTOMER_PHONE);
    const res = await request(app)
      .get('/api/v1/admin/stats')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('allows an ADMIN token (200) and returns the stats shape', async () => {
    const token = await adminLogin();
    const res = await request(app)
      .get('/api/v1/admin/stats')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data).toMatchObject({
      totalBookings: expect.any(Number),
      pendingBookings: expect.any(Number),
      completedBookings: expect.any(Number),
      totalTechnicians: expect.any(Number),
      verifiedTechnicians: expect.any(Number),
      totalRevenueJod: expect.any(Number),
      pendingPayouts: expect.any(Number),
    });
  });
});

describe('admin refund route', () => {
  const SOME_UUID = '99999999-9999-4999-8999-999999999999';

  it('rejects an unauthenticated refund (401)', async () => {
    await request(app).post(`/api/v1/admin/bookings/${SOME_UUID}/refund`).send({ amountJod: 1 }).expect(401);
  });

  it('rejects a non-positive amount with 422', async () => {
    const token = await adminLogin();
    await request(app)
      .post(`/api/v1/admin/bookings/${SOME_UUID}/refund`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amountJod: 0 })
      .expect(422);
  });

  it('returns 404 when the booking has no captured payment', async () => {
    const token = await adminLogin();
    const res = await request(app)
      .post(`/api/v1/admin/bookings/${SOME_UUID}/refund`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amountJod: 1 })
      .expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('admin actions', () => {
  it('verifies a technician via POST /technicians/:id/verify', async () => {
    const token = await adminLogin();

    const list = await request(app)
      .get('/api/v1/admin/technicians')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(Array.isArray(list.body.data)).toBe(true);
    expect(list.body.data.length).toBeGreaterThan(0);

    const techId = list.body.data[0].id;
    const res = await request(app)
      .post(`/api/v1/admin/technicians/${techId}/verify`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.id).toBe(techId);
    expect(res.body.data.isVerified).toBe(true);
  });
});
