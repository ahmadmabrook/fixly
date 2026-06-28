import { prisma } from '../infrastructure/database/prisma';
import { BookingService } from './booking/BookingService';
import { TechnicianService } from './technician/TechnicianService';

/**
 * Race tests against the real DB — they PROVE the concurrency guards, not just
 * the single-threaded logic:
 *   - promo per-user/global cap (SELECT … FOR UPDATE in PromoService.redeem)
 *   - one in-flight withdrawal per technician (partial-unique index)
 * Each fires N parallel operations and asserts exactly one wins.
 */

const ELECTRICITY = '00000000-0000-0000-0000-000000000001';
const tag = Date.now();
const created = { userIds: [] as string[], promoIds: [] as string[], techProfileIds: [] as string[] };

afterAll(async () => {
  // Children first (FK order), then parents.
  await prisma.promoRedemption.deleteMany({ where: { userId: { in: created.userIds } } });
  await prisma.outboxEvent.deleteMany({ where: { booking: { customerId: { in: created.userIds } } } });
  await prisma.booking.deleteMany({ where: { customerId: { in: created.userIds } } });
  await prisma.withdrawalRequest.deleteMany({ where: { technicianId: { in: created.techProfileIds } } });
  await prisma.payout.deleteMany({ where: { technicianId: { in: created.techProfileIds } } });
  await prisma.technicianProfile.deleteMany({ where: { id: { in: created.techProfileIds } } });
  await prisma.user.deleteMany({ where: { id: { in: created.userIds } } });
  await prisma.promoCode.deleteMany({ where: { id: { in: created.promoIds } } });
  await prisma.$disconnect();
});

describe('promo redemption cap under concurrency', () => {
  it('lets exactly ONE of many parallel bookings redeem a one-use code', async () => {
    // CI runners can be slow under load — extend from the default 5s.
    jest.setTimeout(15_000);
    const user = await prisma.user.create({ data: { phone: `+962799${String(tag).slice(-6)}`, name: 'Race C', role: 'CUSTOMER' } });
    created.userIds.push(user.id);
    const promo = await prisma.promoCode.create({
      data: { code: `RACE-${tag}`, type: 'PERCENT', value: 10, perUserLimit: 1, maxRedemptions: 1, isActive: true },
    });
    created.promoIds.push(promo.id);

    const booking = new BookingService();
    const attempts = Array.from({ length: 6 }, () =>
      booking.createBooking({
        customerId: user.id,
        serviceId: ELECTRICITY,
        addressLine: 'خلدا',
        addressLat: 31.95,
        addressLng: 35.93,
        promoCode: promo.code,
      }),
    );
    const results = await Promise.allSettled(attempts);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');

    // Exactly one booking carried the discount; the DB-level guards rejected the rest.
    const redemptions = await prisma.promoRedemption.count({ where: { promoCodeId: promo.id } });
    const fresh = await prisma.promoCode.findUniqueOrThrow({ where: { id: promo.id } });
    expect(redemptions).toBe(1);
    expect(fresh.timesRedeemed).toBe(1);
    expect(fulfilled.filter((r) => Number((r as PromiseFulfilledResult<{ discountJod: unknown }>).value.discountJod) > 0)).toHaveLength(1);
  });
});

describe('withdrawal one-pending guard under concurrency', () => {
  it('lets exactly ONE of many parallel withdrawal requests succeed', async () => {
    const user = await prisma.user.create({ data: { phone: `+962788${String(tag).slice(-6)}`, name: 'Race T', role: 'TECHNICIAN' } });
    created.userIds.push(user.id);
    const profile = await prisma.technicianProfile.create({
      data: { userId: user.id, status: 'APPROVED', isVerified: true, isAvailable: true, hourlyRateJod: 45 },
    });
    created.techProfileIds.push(profile.id);
    // Give the technician a 100 JOD balance via a completed payout.
    await prisma.payout.create({ data: { technicianId: profile.id, amountJod: 100, status: 'COMPLETED' } });

    const tech = new TechnicianService();
    const attempts = Array.from({ length: 4 }, () => tech.requestWithdrawal(user.id, 50, 'JO00TEST'));
    const results = await Promise.allSettled(attempts);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const pending = await prisma.withdrawalRequest.count({ where: { technicianId: profile.id } });
    expect(fulfilled).toHaveLength(1);
    expect(pending).toBe(1);
  });
});
