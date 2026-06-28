import { prisma } from '../../infrastructure/database/prisma';
import { redis } from '../../infrastructure/cache/redis';
import { BookingService } from '../booking/BookingService';
import { DispatchService } from './DispatchService';

/**
 * Real-DB race + lifecycle tests for broadcast-and-accept dispatch.
 *
 * ⚠️  CI-DEFERRED (intentionally skipped here). These require the `dispatch_offers`
 * table + the new `bookings.dispatch*` columns from the GENERATE-ONLY migration
 * `20260627120000_broadcast_dispatch`, which has NOT been applied to any reachable
 * database. The only DB reachable from this worktree is the shared dev DB
 * (`fixly_db`), which the migration must NOT touch (schema change → requires
 * approval; flagged as the sole allowed deferral).
 *
 * To enable in CI: apply the migration to the ephemeral CI/test database
 * (`prisma migrate deploy` against the CI DATABASE_URL — never dev/prod), then
 * flip `describe.skip` → `describe`. The assertions below are written against the
 * real schema and are ready to run unchanged.
 */

const ELECTRICITY = '00000000-0000-0000-0000-000000000001';
const tag = Date.now();
const created = { userIds: [] as string[], techProfileIds: [] as string[], bookingIds: [] as string[] };

// Socket.io is a fire-and-forget side-effect in dispatch; stub it.
const ioStub = { to: () => ({ emit: () => undefined }) } as unknown as import('socket.io').Server;

afterAll(async () => {
  await prisma.dispatchOffer.deleteMany({ where: { bookingId: { in: created.bookingIds } } }).catch(() => undefined);
  await prisma.notification.deleteMany({ where: { userId: { in: created.userIds } } }).catch(() => undefined);
  await prisma.outboxEvent.deleteMany({ where: { bookingId: { in: created.bookingIds } } }).catch(() => undefined);
  await prisma.payment.deleteMany({ where: { bookingId: { in: created.bookingIds } } }).catch(() => undefined);
  await prisma.booking.deleteMany({ where: { id: { in: created.bookingIds } } }).catch(() => undefined);
  await prisma.technicianProfile.deleteMany({ where: { id: { in: created.techProfileIds } } }).catch(() => undefined);
  await prisma.user.deleteMany({ where: { id: { in: created.userIds } } }).catch(() => undefined);
  await prisma.$disconnect();
  redis.disconnect();
});

async function makeCustomer(suffix: string) {
  const user = await prisma.user.create({ data: { phone: `+96279${suffix}`, name: 'Cust', role: 'CUSTOMER' } });
  created.userIds.push(user.id);
  return user;
}

async function makeApprovedTech(suffix: string) {
  const user = await prisma.user.create({ data: { phone: `+96278${suffix}`, name: 'Tech', role: 'TECHNICIAN' } });
  created.userIds.push(user.id);
  const profile = await prisma.technicianProfile.create({
    data: {
      userId: user.id, status: 'APPROVED', isVerified: true, isAvailable: true,
      hourlyRateJod: 45, currentLat: 31.95, currentLng: 35.93,
      services: { connect: [{ id: ELECTRICITY }] },
    },
  });
  created.techProfileIds.push(profile.id);
  return { user, profile };
}

async function makeAuthorizedBooking(customerId: string) {
  const booking = await prisma.booking.create({
    data: { customerId, serviceId: ELECTRICITY, addressLine: 'خلدا', addressLat: 31.95, addressLng: 35.93, totalJod: 50, status: 'PENDING' },
  });
  created.bookingIds.push(booking.id);
  await prisma.payment.create({ data: { bookingId: booking.id, provider: 'mock', status: 'PRE_AUTHORIZED', amountJod: 50 } });
  return booking;
}

describe.skip('DispatchService (integration — CI-deferred: needs dispatch_offers migration)', () => {
  it('double-accept race yields exactly ONE winner (lock + version + offer guard)', async () => {
    const customer = await makeCustomer(`${String(tag).slice(-7)}1`);
    const t1 = await makeApprovedTech(`${String(tag).slice(-7)}1`);
    const t2 = await makeApprovedTech(`${String(tag).slice(-7)}2`);
    const booking = await makeAuthorizedBooking(customer.id);

    const dispatch = new DispatchService(ioStub);
    await dispatch.startDispatch(booking.id); // both techs in-range → both OFFERED

    const offers = await prisma.dispatchOffer.findMany({ where: { bookingId: booking.id } });
    expect(offers).toHaveLength(2);

    const svc = new BookingService();
    const results = await Promise.allSettled([
      svc.accept(booking.id, t1.user.id),
      svc.accept(booking.id, t2.user.id),
    ]);
    const won = results.filter((r) => r.status === 'fulfilled');

    expect(won).toHaveLength(1); // exactly one accept survives
    const fresh = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(fresh.status).toBe('CONFIRMED');
    expect(fresh.technicianId).not.toBeNull();

    const accepted = await prisma.dispatchOffer.count({ where: { bookingId: booking.id, status: 'ACCEPTED' } });
    const superseded = await prisma.dispatchOffer.count({ where: { bookingId: booking.id, status: 'SUPERSEDED' } });
    expect(accepted).toBe(1);
    expect(superseded).toBe(1);
  });

  it('full lifecycle: create → dispatch → offer → accept → CONFIRMED', async () => {
    const customer = await makeCustomer(`${String(tag).slice(-7)}3`);
    const tech = await makeApprovedTech(`${String(tag).slice(-7)}3`);
    const booking = await makeAuthorizedBooking(customer.id);

    const dispatch = new DispatchService(ioStub);
    await dispatch.startDispatch(booking.id);

    const offer = await prisma.dispatchOffer.findUniqueOrThrow({
      where: { bookingId_technicianId: { bookingId: booking.id, technicianId: tech.profile.id } },
    });
    expect(offer.status).toBe('OFFERED');
    expect(offer.round).toBe(1);

    const svc = new BookingService();
    const confirmed = await svc.accept(booking.id, tech.user.id);
    expect(confirmed.status).toBe('CONFIRMED');

    const finalOffer = await prisma.dispatchOffer.findUniqueOrThrow({ where: { id: offer.id } });
    expect(finalOffer.status).toBe('ACCEPTED');
    const ev = await prisma.outboxEvent.findFirst({ where: { bookingId: booking.id, eventType: 'booking.confirmed' } });
    expect(ev).not.toBeNull();
  });

  it('reject-vs-sweep: concurrent advances are serialised by dispatch_lock (idempotent, no double round)', async () => {
    const customer = await makeCustomer(`${String(tag).slice(-7)}4`);
    await makeApprovedTech(`${String(tag).slice(-7)}4`);
    const booking = await makeAuthorizedBooking(customer.id);

    const dispatch = new DispatchService(ioStub);
    await dispatch.startDispatch(booking.id); // round 1

    // Fire two advances at once (mimics reject-triggered advance racing the sweep).
    await Promise.all([dispatch.advanceRound(booking.id), dispatch.advanceRound(booking.id)]);

    const fresh = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    // The redis dispatch_lock serialises them: at most ONE advance opened a round,
    // so the round counter advanced by exactly one (to 2), not two.
    expect(fresh.dispatchRound).toBe(2);
  });
});
