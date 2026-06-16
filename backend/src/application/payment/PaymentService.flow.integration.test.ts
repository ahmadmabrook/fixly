import { Prisma } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma';
import { redis } from '../../infrastructure/cache/redis';
import { BookingService } from '../booking/BookingService';
import { PaymentService } from './PaymentService';
import { MockPaymentProvider } from '../../infrastructure/providers/MockPaymentProvider';
import { splitCommission, toDecimal } from '../../shared/money';

/**
 * End-to-end money flow against the real DB + mock PSP. Proves the full
 * lifecycle the unit tests mock out: hold → capture (commission split + payout
 * accrual) → void/refund (+ payout clawback) → partial refund → dispute, plus
 * idempotency on replay. Regression guard for every payment edge case.
 */
const bookingService = new BookingService();
const payment = new PaymentService(new MockPaymentProvider());
const COMMISSION = 15;

let customerId: string;
let techUserId: string;
let techProfileId: string;
let serviceId: string;
let price: Prisma.Decimal;
const createdBookingIds: string[] = [];

beforeAll(async () => {
  const suffix = Date.now().toString().slice(-7);
  const customer = await prisma.user.create({ data: { phone: `+96279${suffix}`, role: 'CUSTOMER', name: 'Flow Cust' } });
  customerId = customer.id;
  const tech = await prisma.user.create({ data: { phone: `+96278${suffix}`, role: 'TECHNICIAN', name: 'Flow Tech' } });
  techUserId = tech.id;
  const profile = await prisma.technicianProfile.create({ data: { userId: tech.id, isVerified: true } });
  techProfileId = profile.id;
  const service = await prisma.service.findFirstOrThrow({ where: { isActive: true } });
  serviceId = service.id;
  price = toDecimal(service.priceJod);
});

afterAll(async () => {
  const payments = await prisma.payment.findMany({ where: { bookingId: { in: createdBookingIds } }, select: { id: true } });
  const paymentIds = payments.map((p) => p.id);
  await prisma.ledgerEntry.deleteMany({ where: { OR: [{ paymentId: { in: paymentIds } }, { payout: { paymentId: { in: paymentIds } } }] } });
  await prisma.payout.deleteMany({ where: { paymentId: { in: paymentIds } } });
  await prisma.dispute.deleteMany({ where: { paymentId: { in: paymentIds } } });
  await prisma.payment.deleteMany({ where: { bookingId: { in: createdBookingIds } } });
  await prisma.outboxEvent.deleteMany({ where: { bookingId: { in: createdBookingIds } } });
  await prisma.notification.deleteMany({ where: { bookingId: { in: createdBookingIds } } });
  await prisma.booking.deleteMany({ where: { id: { in: createdBookingIds } } });
  await prisma.technicianProfile.deleteMany({ where: { id: techProfileId } });
  await prisma.user.deleteMany({ where: { id: { in: [customerId, techUserId] } } });
  await prisma.$disconnect();
  redis.disconnect();
});

/** Create a booking; if `assignTech`, attach the technician so payouts accrue. */
async function newBooking(assignTech = true): Promise<string> {
  const b = await bookingService.createBooking({ customerId, serviceId, addressLine: 'Flow, Amman', addressLat: 31.95, addressLng: 35.93 });
  createdBookingIds.push(b.id);
  if (assignTech) await prisma.booking.update({ where: { id: b.id }, data: { technicianId: techProfileId } });
  return b.id;
}

describe('Payment flow (real DB, mock PSP)', () => {
  it('void on cancellation of a PRE_AUTHORIZED hold → REFUNDED, no funds lost', async () => {
    const bookingId = await newBooking();
    await payment.preAuthorizeForBooking(bookingId);
    expect((await prisma.payment.findUniqueOrThrow({ where: { bookingId } })).status).toBe('PRE_AUTHORIZED');

    await bookingService.cancel(bookingId, customerId, 'changed mind');
    await payment.handleCancellation(bookingId);

    const row = await prisma.payment.findUniqueOrThrow({ where: { bookingId } });
    expect(row.status).toBe('REFUNDED');
    const ledger = await prisma.ledgerEntry.findMany({ where: { paymentId: row.id }, orderBy: { createdAt: 'asc' } });
    expect(ledger.map((l) => l.type)).toEqual(['CHARGE', 'REFUND']);
  });

  it('capture splits commission, accrues the technician payout, and is idempotent', async () => {
    const bookingId = await newBooking();
    await payment.preAuthorizeForBooking(bookingId);

    await payment.captureForBooking(bookingId);
    await payment.captureForBooking(bookingId); // replay

    const row = await prisma.payment.findUniqueOrThrow({ where: { bookingId } });
    expect(row.status).toBe('CAPTURED');
    const { fee, net } = splitCommission(price, COMMISSION);
    expect(toDecimal(row.feeJod!).equals(fee)).toBe(true);

    // Exactly one CAPTURE + one FEE ledger (idempotent).
    expect(await prisma.ledgerEntry.count({ where: { paymentId: row.id, type: 'CAPTURE' } })).toBe(1);
    expect(await prisma.ledgerEntry.count({ where: { paymentId: row.id, type: 'FEE' } })).toBe(1);

    // One PENDING payout for the net, linked to the payment.
    const payouts = await prisma.payout.findMany({ where: { paymentId: row.id } });
    expect(payouts).toHaveLength(1);
    expect(payouts[0].status).toBe('PENDING');
    expect(payouts[0].technicianId).toBe(techProfileId);
    expect(toDecimal(payouts[0].amountJod).equals(net)).toBe(true);
  });

  it('cancel after capture → REFUNDED and the pending payout is clawed back', async () => {
    const bookingId = await newBooking();
    await payment.preAuthorizeForBooking(bookingId);
    await payment.captureForBooking(bookingId);

    await payment.handleCancellation(bookingId);

    const row = await prisma.payment.findUniqueOrThrow({ where: { bookingId } });
    expect(row.status).toBe('REFUNDED');
    expect(toDecimal(row.refundedAmountJod).equals(toDecimal(row.capturedAmountJod!))).toBe(true);
    const payout = await prisma.payout.findFirstOrThrow({ where: { paymentId: row.id } });
    expect(payout.status).toBe('FAILED'); // clawed back
  });

  it('partial refund → PARTIALLY_REFUNDED, then the remainder → REFUNDED', async () => {
    const bookingId = await newBooking();
    await payment.preAuthorizeForBooking(bookingId);
    await payment.captureForBooking(bookingId);

    await payment.refundBooking(bookingId, 1); // 1 JOD partial
    let row = await prisma.payment.findUniqueOrThrow({ where: { bookingId } });
    expect(row.status).toBe('PARTIALLY_REFUNDED');
    expect(toDecimal(row.refundedAmountJod).equals(toDecimal(1))).toBe(true);

    const remainder = toDecimal(row.capturedAmountJod!).minus(toDecimal(row.refundedAmountJod));
    await payment.refundBooking(bookingId, remainder.toNumber());
    row = await prisma.payment.findUniqueOrThrow({ where: { bookingId } });
    expect(row.status).toBe('REFUNDED');
  });

  it('rejects a refund larger than the outstanding captured amount', async () => {
    const bookingId = await newBooking();
    await payment.preAuthorizeForBooking(bookingId);
    await payment.captureForBooking(bookingId);
    await expect(payment.refundBooking(bookingId, price.plus(100).toNumber())).rejects.toThrow(/exceeds outstanding/);
  });

  it('PSP dispute webhook → DISPUTED + dispute row + DISPUTE ledger', async () => {
    const bookingId = await newBooking();
    await payment.preAuthorizeForBooking(bookingId);
    await payment.captureForBooking(bookingId);
    const row = await prisma.payment.findUniqueOrThrow({ where: { bookingId } });

    await payment.handleWebhookEvent({ eventId: `evt-${bookingId}`, type: 'payment.dispute.opened', providerRef: row.providerRef!, amountJod: price.toNumber(), reason: 'fraud' });

    const after = await prisma.payment.findUniqueOrThrow({ where: { bookingId } });
    expect(after.status).toBe('DISPUTED');
    expect(after.disputedAt).not.toBeNull();
    expect(await prisma.dispute.count({ where: { paymentId: row.id } })).toBe(1);
    expect(await prisma.ledgerEntry.count({ where: { paymentId: row.id, type: 'DISPUTE' } })).toBe(1);
  });
});
