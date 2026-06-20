import request from 'supertest';
import type { Express } from 'express';
import { createApp } from './app';
import { prisma } from '../../infrastructure/database/prisma';
import { redis } from '../../infrastructure/cache/redis';

/**
 * Integration coverage for the feature endpoints added on top of the core
 * (promo, addresses, payment methods, technician onboarding, guarantee, support).
 * Runs against the real docker stack; self-cleans the test user at the end.
 */

const TEST_PHONE = '+962780000077';
const ELECTRICITY_SERVICE_ID = '00000000-0000-0000-0000-000000000001'; // Electricity, 50 JOD

let app: Express;
let token: string;
let userId: string;

async function clearOtpState(phone: string) {
  await redis.del(`otp:${phone}`, `otp_cooldown:${phone}`, `otp_attempts:${phone}`);
}

async function login(phone: string): Promise<string> {
  await clearOtpState(phone);
  await request(app).post('/api/v1/auth/otp/request').send({ phone }).expect(200);
  const res = await request(app).post('/api/v1/auth/otp/verify').send({ phone, code: '000000' }).expect(200);
  return res.body.data.accessToken;
}

const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  app = createApp().app;
  token = await login(TEST_PHONE);
  const me = await request(app).get('/api/v1/auth/me').set(auth()).expect(200);
  userId = me.body.data.id;
});

afterAll(async () => {
  // Self-clean so re-runs stay deterministic (promo per-user limits etc.).
  await prisma.paymentMethod.deleteMany({ where: { userId } });
  await prisma.promoRedemption.deleteMany({ where: { userId } });
  await prisma.supportMessage.deleteMany({ where: { ticket: { userId } } });
  await prisma.supportTicket.deleteMany({ where: { userId } });
  await prisma.booking.deleteMany({ where: { customerId: userId } });
  await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  await clearOtpState(TEST_PHONE);
  await prisma.$disconnect();
  redis.disconnect();
});

describe('POST /api/v1/promo/validate', () => {
  it('quotes a 10% discount on a 50 JOD service (WELCOME10)', async () => {
    const res = await request(app)
      .post('/api/v1/promo/validate')
      .set(auth())
      .send({ code: 'WELCOME10', serviceId: ELECTRICITY_SERVICE_ID })
      .expect(200);
    expect(res.body.data.discountJod).toBe('5');
    expect(res.body.data.finalJod).toBe('45');
  });

  it('rejects an invalid code with 422', async () => {
    await request(app)
      .post('/api/v1/promo/validate')
      .set(auth())
      .send({ code: 'NOPE-NOPE', serviceId: ELECTRICITY_SERVICE_ID })
      .expect(422);
  });
});

describe('Addresses CRUD', () => {
  it('creates, lists, and deletes an address', async () => {
    const created = await request(app)
      .post('/api/v1/addresses')
      .set(auth())
      .send({ label: 'المنزل', line: 'خلدا، شارع وصفي التل', lat: 31.99, lng: 35.86 })
      .expect(201);
    expect(created.body.data.isDefault).toBe(true); // first address → default

    const list = await request(app).get('/api/v1/addresses').set(auth()).expect(200);
    expect(list.body.data.length).toBe(1);

    await request(app).delete(`/api/v1/addresses/${created.body.data.id}`).set(auth()).expect(204);
  });
});

describe('Payment methods (mock)', () => {
  it('adds and lists a card without exposing a PAN', async () => {
    const created = await request(app)
      .post('/api/v1/payment-methods')
      .set(auth())
      .send({ brand: 'visa', last4: '4242', expMonth: 5, expYear: 2030 })
      .expect(201);
    expect(created.body.data.last4).toBe('4242');
    expect(created.body.data).not.toHaveProperty('providerRef');

    const list = await request(app).get('/api/v1/payment-methods').set(auth()).expect(200);
    expect(list.body.data.length).toBe(1);
  });

  it('promotes a new default when the current default is deleted (F6)', async () => {
    await prisma.paymentMethod.deleteMany({ where: { userId } }); // isolate from the card above
    const a = await request(app).post('/api/v1/payment-methods').set(auth())
      .send({ brand: 'visa', last4: '1111', expMonth: 5, expYear: 2030 }).expect(201);
    await request(app).post('/api/v1/payment-methods').set(auth())
      .send({ brand: 'mastercard', last4: '2222', expMonth: 6, expYear: 2031 }).expect(201);
    expect(a.body.data.isDefault).toBe(true); // first card is the default

    await request(app).delete(`/api/v1/payment-methods/${a.body.data.id}`).set(auth()).expect(204);

    const list = await request(app).get('/api/v1/payment-methods').set(auth()).expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].isDefault).toBe(true); // remaining card promoted to default
  });
});

describe('Technician onboarding', () => {
  it('applies and reports PENDING status', async () => {
    const apply = await request(app)
      .post('/api/v1/technician/onboarding')
      .set(auth())
      .send({ serviceIds: [ELECTRICITY_SERVICE_ID], hourlyRateJod: 45, vehicle: 'Hyundai' })
      .expect(201);
    expect(apply.body.data.status).toBe('PENDING');

    const me = await request(app).get('/api/v1/technician/me').set(auth()).expect(200);
    expect(me.body.data.status).toBe('PENDING');

    // Not yet approved → cannot go available.
    await request(app).patch('/api/v1/technician/availability').set(auth()).send({ isAvailable: true }).expect(403);

    // PII guard: a non-approved technician cannot browse the job pool (which
    // would otherwise expose customers' pending-booking locations).
    await request(app).get('/api/v1/technician/jobs').set(auth()).expect(403);
  });
});

describe('Guarantee + Support', () => {
  it('returns no eligible bookings for a fresh user', async () => {
    const res = await request(app).get('/api/v1/guarantee/eligible').set(auth()).expect(200);
    expect(res.body.data).toEqual([]);
  });

  it('opens a support ticket and appends a message', async () => {
    const created = await request(app)
      .post('/api/v1/support')
      .set(auth())
      .send({ subject: 'استفسار', body: 'مرحباً، لدي سؤال' })
      .expect(201);
    const ticketId = created.body.data.id;

    const replied = await request(app)
      .post(`/api/v1/support/${ticketId}/messages`)
      .set(auth())
      .send({ body: 'رسالة إضافية' })
      .expect(201);
    expect(replied.body.data.messages.length).toBe(2);
  });
});

describe('account standing (requireActiveUser)', () => {
  // MUST run last — it deactivates the shared test user.
  it('blocks state-changing requests once the account is deactivated', async () => {
    await prisma.user.update({ where: { id: userId }, data: { isActive: false } });
    // A non-GET (POST) is gated by requireActiveUser → 403.
    await request(app)
      .post('/api/v1/bookings')
      .set(auth())
      .send({ serviceId: ELECTRICITY_SERVICE_ID, addressLine: 'خلدا', addressLat: 31.95, addressLng: 35.93 })
      .expect(403);
  });
});
