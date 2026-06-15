import { prisma } from '../../infrastructure/database/prisma';
import { redis } from '../../infrastructure/cache/redis';
import { BookingService } from '../booking/BookingService';
import { PaymentService } from './PaymentService';
import { MockPaymentProvider } from '../../infrastructure/providers/MockPaymentProvider';

/**
 * End-to-end money flow against the real DB + mock PSP. Proves the lifecycle
 * the unit tests mock out:
 *   created → pre-auth (hold)  → cancelled → VOID  → REFUNDED   (no funds lost)
 *   created → pre-auth (hold)  → completed → CAPTURE
 * plus idempotency on replay. This is the regression guard for the
 * "pre-auth hold never released on cancellation" bug.
 */
const bookingService = new BookingService();
const payment = new PaymentService(new MockPaymentProvider());

let customerId: string;
let serviceId: string;
const createdBookingIds: string[] = [];

beforeAll(async () => {
  const phone = `+96279${Date.now().toString().slice(-7)}`;
  const user = await prisma.user.create({ data: { phone, role: 'CUSTOMER', name: 'Flow Test' } });
  customerId = user.id;
  const service = await prisma.service.findFirstOrThrow({ where: { isActive: true } });
  serviceId = service.id;
});

afterAll(async () => {
  // FK-safe teardown for everything this suite created.
  const payments = await prisma.payment.findMany({ where: { bookingId: { in: createdBookingIds } }, select: { id: true } });
  const paymentIds = payments.map((p) => p.id);
  await prisma.ledgerEntry.deleteMany({ where: { paymentId: { in: paymentIds } } });
  await prisma.payment.deleteMany({ where: { bookingId: { in: createdBookingIds } } });
  await prisma.outboxEvent.deleteMany({ where: { bookingId: { in: createdBookingIds } } });
  await prisma.notification.deleteMany({ where: { bookingId: { in: createdBookingIds } } });
  await prisma.booking.deleteMany({ where: { id: { in: createdBookingIds } } });
  await prisma.user.deleteMany({ where: { id: customerId } });
  await prisma.$disconnect();
  // BookingService imports the shared ioredis client; close it so Jest exits.
  redis.disconnect();
});

async function newBooking(): Promise<string> {
  const b = await bookingService.createBooking({
    customerId,
    serviceId,
    addressLine: 'Flow test, Amman',
    addressLat: 31.95,
    addressLng: 35.93,
  });
  createdBookingIds.push(b.id);
  return b.id;
}

describe('Payment flow (real DB, mock PSP)', () => {
  it('cancelling a PRE_AUTHORIZED booking voids the hold and refunds (no held funds)', async () => {
    const bookingId = await newBooking();

    await payment.preAuthorizeForBooking(bookingId);
    let row = await prisma.payment.findUniqueOrThrow({ where: { bookingId } });
    expect(row.status).toBe('PRE_AUTHORIZED');

    await bookingService.cancel(bookingId, customerId, 'changed mind');
    await payment.handleCancellation(bookingId);

    row = await prisma.payment.findUniqueOrThrow({ where: { bookingId } });
    expect(row.status).toBe('REFUNDED');
    expect(row.refundedAt).not.toBeNull();

    const ledger = await prisma.ledgerEntry.findMany({ where: { paymentId: row.id }, orderBy: { createdAt: 'asc' } });
    expect(ledger.map((l) => l.type)).toEqual(['CHARGE', 'REFUND']);
  });

  it('is idempotent: replaying the cancellation writes no second REFUND', async () => {
    const bookingId = await newBooking();
    await payment.preAuthorizeForBooking(bookingId);
    await bookingService.cancel(bookingId, customerId);

    await payment.handleCancellation(bookingId);
    await payment.handleCancellation(bookingId); // replay

    const row = await prisma.payment.findUniqueOrThrow({ where: { bookingId } });
    const refunds = await prisma.ledgerEntry.count({ where: { paymentId: row.id, type: 'REFUND' } });
    expect(refunds).toBe(1);
  });

  it('capturing a PRE_AUTHORIZED booking is idempotent and writes exactly one CAPTURE', async () => {
    const bookingId = await newBooking();
    await payment.preAuthorizeForBooking(bookingId);

    await payment.captureForBooking(bookingId);
    await payment.captureForBooking(bookingId); // replay

    const row = await prisma.payment.findUniqueOrThrow({ where: { bookingId } });
    expect(row.status).toBe('CAPTURED');
    const captures = await prisma.ledgerEntry.count({ where: { paymentId: row.id, type: 'CAPTURE' } });
    expect(captures).toBe(1);
  });

  it('double pre-authorize creates exactly one Payment + one CHARGE', async () => {
    const bookingId = await newBooking();
    await payment.preAuthorizeForBooking(bookingId);
    await payment.preAuthorizeForBooking(bookingId); // replay

    const payments = await prisma.payment.count({ where: { bookingId } });
    expect(payments).toBe(1);
    const row = await prisma.payment.findUniqueOrThrow({ where: { bookingId } });
    const charges = await prisma.ledgerEntry.count({ where: { paymentId: row.id, type: 'CHARGE' } });
    expect(charges).toBe(1);
  });
});
