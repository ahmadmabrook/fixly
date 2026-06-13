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
