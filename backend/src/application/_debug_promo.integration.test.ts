import { prisma } from '../infrastructure/database/prisma';
import { BookingService } from './booking/BookingService';

const ELECTRICITY = '00000000-0000-0000-0000-000000000001';

it('debug: shows per-attempt outcome', async () => {
  jest.setTimeout(30000);
  const tag = Date.now();
  const user = await prisma.user.create({ data: { phone: `+962799${String(tag).slice(-6)}`, name: 'Race Debug', role: 'CUSTOMER' } });
  const promo = await prisma.promoCode.create({
    data: { code: `RACE-${tag}`, type: 'PERCENT', value: 10, perUserLimit: 1, maxRedemptions: 1, isActive: true },
  });

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
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      // eslint-disable-next-line no-console
      console.log(`[${i}] FULFILLED discountJod=${(r.value as any).discountJod} id=${(r.value as any).id}`);
    } else {
      // eslint-disable-next-line no-console
      console.log(`[${i}] REJECTED: ${(r as any).reason?.message ?? (r as any).reason}`);
    }
  });

  const redemptions = await prisma.promoRedemption.count({ where: { promoCodeId: promo.id } });
  // eslint-disable-next-line no-console
  console.log('total redemptions:', redemptions);

  await prisma.promoRedemption.deleteMany({ where: { userId: user.id } });
  await prisma.outboxEvent.deleteMany({ where: { booking: { customerId: user.id } } });
  await prisma.bookingStatusHistory.deleteMany({ where: { booking: { customerId: user.id } } });
  await prisma.booking.deleteMany({ where: { customerId: user.id } });
  await prisma.user.deleteMany({ where: { id: user.id } });
  await prisma.promoCode.deleteMany({ where: { id: promo.id } });
});
