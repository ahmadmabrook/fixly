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
  await prisma.bookingStatusHistory.deleteMany({ where: { booking: { customerId: userId } } });
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

  // Regression test for the promo/validate ↔ BookingService.create.ts base-price
  // mismatch: a Protection-plan subscriber previewing a promo must see the same
  // discount math the real booking charge actually applies (promo stacked on the
  // member-discounted price), not a quote against the raw list price.
  it('quotes the promo against the subscriber (member) price when the customer has an active subscription', async () => {
    const subscription = await prisma.subscription.create({
      data: { customerId: userId, status: 'ACTIVE', discountPercent: 15, currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
    });
    try {
      const res = await request(app)
        .post('/api/v1/promo/validate')
        .set(auth())
        .send({ code: 'WELCOME10', serviceId: ELECTRICITY_SERVICE_ID })
        .expect(200);
      // 50 JOD list price − 15% member discount = 42.5 subscriber price;
      // WELCOME10 (10%) off 42.5 = 4.25 discount → 38.25 final. originalJod stays
      // the list price (50) so the UI can still show "was 50, now 38.25".
      expect(res.body.data.originalJod).toBe('50');
      expect(res.body.data.discountJod).toBe('4.25');
      expect(res.body.data.finalJod).toBe('38.25');
    } finally {
      await prisma.subscription.delete({ where: { id: subscription.id } });
    }
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
      .send({ serviceIds: [ELECTRICITY_SERVICE_ID], hourlyRateJod: 45, vehicle: 'Hyundai', agreementAccepted: true })
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

describe('Technician notification preferences', () => {
  it('defaults to all-true, then partially updates', async () => {
    const initial = await request(app).get('/api/v1/technician/notification-preferences').set(auth()).expect(200);
    expect(initial.body.data).toEqual({
      newJobRequests: true, reminders: true, earningsUpdates: true, promotions: true,
    });

    const updated = await request(app)
      .patch('/api/v1/technician/notification-preferences')
      .set(auth())
      .send({ promotions: false })
      .expect(200);
    expect(updated.body.data).toEqual({
      newJobRequests: true, reminders: true, earningsUpdates: true, promotions: false,
    });

    // The partial update persisted — a fresh GET reflects it, other toggles untouched.
    const after = await request(app).get('/api/v1/technician/notification-preferences').set(auth()).expect(200);
    expect(after.body.data.promotions).toBe(false);
    expect(after.body.data.newJobRequests).toBe(true);
  });
});

describe('Technician bank account', () => {
  it('is empty by default, then saves and reads back iban/bankName', async () => {
    const initial = await request(app).get('/api/v1/technician/bank-account').set(auth()).expect(200);
    expect(initial.body.data).toEqual({ iban: null, bankName: null });

    await request(app)
      .patch('/api/v1/technician/bank-account')
      .set(auth())
      .send({ iban: 'JO94CBJO0010000000000131000302', bankName: 'Cairo Amman Bank' })
      .expect(200);

    const after = await request(app).get('/api/v1/technician/bank-account').set(auth()).expect(200);
    expect(after.body.data).toEqual({ iban: 'JO94CBJO0010000000000131000302', bankName: 'Cairo Amman Bank' });
  });

  it('rejects an empty iban/bankName with 422', async () => {
    await request(app).patch('/api/v1/technician/bank-account').set(auth()).send({ iban: '', bankName: '' }).expect(422);
  });

  it('rejects a malformed IBAN (fails format/checksum) with 422', async () => {
    await request(app)
      .patch('/api/v1/technician/bank-account')
      .set(auth())
      .send({ iban: 'not-an-iban', bankName: 'Arab Bank' })
      .expect(422);
  });

  it('rejects a non-Jordan IBAN with 422 (payouts are JO-only)', async () => {
    // A structurally valid German IBAN — must still be rejected by the JO whitelist.
    await request(app)
      .patch('/api/v1/technician/bank-account')
      .set(auth())
      .send({ iban: 'DE89370400440532013000', bankName: 'Deutsche Bank' })
      .expect(422);
  });

  it('normalises whitespace/case before storing a valid IBAN', async () => {
    await request(app)
      .patch('/api/v1/technician/bank-account')
      .set(auth())
      .send({ iban: 'jo94 cbjo 0010 0000 0000 0131 0003 02', bankName: 'Cairo Amman Bank' })
      .expect(200);
    const after = await request(app).get('/api/v1/technician/bank-account').set(auth()).expect(200);
    expect(after.body.data.iban).toBe('JO94CBJO0010000000000131000302');
  });
});

describe('Technician post-approval services/rate edit (PATCH /technician/services-pricing)', () => {
  it('rejects when the technician is not APPROVED (still PENDING from onboarding above)', async () => {
    const res = await request(app)
      .patch('/api/v1/technician/services-pricing')
      .set(auth())
      .send({ serviceIds: [ELECTRICITY_SERVICE_ID], hourlyRateJod: 50 })
      .expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('rejects an out-of-range hourly rate with 422', async () => {
    await request(app)
      .patch('/api/v1/technician/services-pricing')
      .set(auth())
      .send({ serviceIds: [ELECTRICITY_SERVICE_ID], hourlyRateJod: 100 })
      .expect(422);
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

describe('Referrals', () => {
  const REFERRED_PHONE = '+962780000078';

  afterAll(async () => {
    const referred = await prisma.user.findUnique({ where: { phone: REFERRED_PHONE } });
    if (referred) {
      await prisma.referralRedemption.deleteMany({ where: { referredUserId: referred.id } });
      await prisma.user.delete({ where: { id: referred.id } }).catch(() => undefined);
    }
    await clearOtpState(REFERRED_PHONE);
  });

  it('generates a referral code on first access and returns zeroed stats', async () => {
    const res = await request(app).get('/api/v1/referrals/me').set(auth()).expect(200);
    expect(res.body.data.referralCode).toEqual(expect.any(String));
    expect(res.body.data.totalReferred).toBe(0);
    expect(res.body.data.totalCreditEarnedJod).toBe(0);
  });

  it('is idempotent — returns the same code on a second call', async () => {
    const first = await request(app).get('/api/v1/referrals/me').set(auth()).expect(200);
    const second = await request(app).get('/api/v1/referrals/me').set(auth()).expect(200);
    expect(second.body.data.referralCode).toBe(first.body.data.referralCode);
  });

  it('captures the referral code at a new phone number\'s signup', async () => {
    const me = await request(app).get('/api/v1/referrals/me').set(auth()).expect(200);
    const code = me.body.data.referralCode;

    await clearOtpState(REFERRED_PHONE);
    await request(app).post('/api/v1/auth/otp/request').send({ phone: REFERRED_PHONE }).expect(200);
    await request(app)
      .post('/api/v1/auth/otp/verify')
      .send({ phone: REFERRED_PHONE, code: '000000', referralCode: code })
      .expect(200);

    const stats = await request(app).get('/api/v1/referrals/me').set(auth()).expect(200);
    expect(stats.body.data.totalReferred).toBe(1);
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
