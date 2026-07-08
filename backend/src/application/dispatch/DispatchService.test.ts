import { DispatchService } from './DispatchService';
import { prisma } from '../../infrastructure/database/prisma';
import { redis, pruneStaleTechnicians } from '../../infrastructure/cache/redis';
import { ConflictError, NotFoundError } from '../../shared/errors';

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../infrastructure/cache/redis', () => ({
  redis: { set: jest.fn(), del: jest.fn(), geosearch: jest.fn() },
  pruneStaleTechnicians: jest.fn(),
  TECH_LOCATIONS_KEY: 'tech:locations',
}));

// Fixed, deterministic dispatch params so radius maths are predictable:
// round1 = 10km, step 5km, cap 50km, 5-min accept timeout.
jest.mock('../../shared/env', () => ({
  env: () => ({
    DISPATCH_ACCEPT_TIMEOUT_MS: 300000,
    DISPATCH_INITIAL_RADIUS_KM: 10,
    DISPATCH_RADIUS_STEP_KM: 5,
    DISPATCH_MAX_RADIUS_KM: 50,
    DISPATCH_SWEEP_INTERVAL_MS: 15000,
  }),
}));

jest.mock('../../infrastructure/database/prisma', () => ({
  prisma: {
    technicianProfile: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    booking: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    payment: { findUnique: jest.fn() },
    dispatchOffer: { findMany: jest.fn(), updateMany: jest.fn(), count: jest.fn(), create: jest.fn(), createMany: jest.fn() },
    notification: { create: jest.fn() },
    outboxEvent: { create: jest.fn() },
    $transaction: jest.fn(),
  },
}));

const mockedRedis = redis as jest.Mocked<typeof redis>;
const mockedPruneStaleTechnicians = pruneStaleTechnicians as jest.Mock;
const mockedPrisma = prisma as unknown as {
  technicianProfile: { findMany: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
  booking: { findUnique: jest.Mock; findMany: jest.Mock; update: jest.Mock };
  payment: { findUnique: jest.Mock };
  dispatchOffer: { findMany: jest.Mock; updateMany: jest.Mock; count: jest.Mock; create: jest.Mock; createMany: jest.Mock };
  notification: { create: jest.Mock };
  outboxEvent: { create: jest.Mock };
  $transaction: jest.Mock;
};

// Minimal socket.io stub — to(room).emit(event, payload) is the only call path.
function makeIo() {
  const emit = jest.fn();
  const to = jest.fn(() => ({ emit }));
  return { io: { to } as unknown as import('socket.io').Server, to, emit };
}

// Decimal-ish stub: only .toString() is read on totalJod.
const money = (v: string) => ({ toString: () => v });

// Amman city centre — distances below are computed from here.
const ORIGIN = { lat: 31.95, lng: 35.93 };
// ~2km east (well inside 10km).
const NEAR = { currentLat: 31.95, currentLng: 35.95 };
// ~13km east (outside 10km, inside 15km).
const MID = { currentLat: 31.95, currentLng: 36.07 };
// ~60km east (outside the 50km cap).
const FAR = { currentLat: 31.95, currentLng: 36.57 };

describe('DispatchService', () => {
  let svc: DispatchService;
  let io: ReturnType<typeof makeIo>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedRedis.set.mockResolvedValue('OK');
    mockedRedis.del.mockResolvedValue(1 as unknown as number);
    // Default: Redis GEO "unavailable" so qualifiedTechs falls back to the
    // Postgres+haversine scan — matches the pre-GEO behaviour the rest of this
    // suite (startDispatch/advanceRound/reject/exhaustion) was written against.
    // The dedicated 'qualifiedTechs — Redis GEO' block below overrides this to
    // exercise the Redis-available path instead.
    mockedPruneStaleTechnicians.mockResolvedValue(undefined);
    mockedRedis.geosearch.mockRejectedValue(new Error('ECONNREFUSED'));
    mockedPrisma.notification.create.mockResolvedValue({});
    mockedPrisma.dispatchOffer.create.mockResolvedValue({});
    mockedPrisma.dispatchOffer.updateMany.mockResolvedValue({ count: 0 });
    // Default: payment authorized so startDispatch reaches openRound; the
    // money-safety tests override this per-case.
    mockedPrisma.payment.findUnique.mockResolvedValue({ status: 'PRE_AUTHORIZED' });
    io = makeIo();
    svc = new DispatchService(io.io);
  });

  // ── 1. qualifiedTechs filter (Postgres fallback path — Redis GEO down) ──────
  describe('qualifiedTechs — Postgres fallback (Redis unavailable)', () => {
    it('queries APPROVED + isAvailable + offers serviceId + has location, then filters by radius', async () => {
      mockedPrisma.technicianProfile.findMany.mockResolvedValue([
        { id: 'tp-near', userId: 'u-near', ...NEAR },
        { id: 'tp-mid', userId: 'u-mid', ...MID },
      ]);

      const result = await svc.qualifiedTechs('svc-1', ORIGIN.lat, ORIGIN.lng, 10, []);

      // DB predicate enforces APPROVED/available/offers-service/has-location.
      expect(mockedPrisma.technicianProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'APPROVED',
            isAvailable: true,
            services: { some: { id: 'svc-1' } },
            currentLat: { not: null },
            currentLng: { not: null },
          }),
        }),
      );
      // Radius filter is applied in-memory: NEAR (~2km) kept, MID (~13km) dropped at 10km.
      expect(result.map((t) => t.id)).toEqual(['tp-near']);
    });

    it('excludes already-offered techs via id.notIn when the exclude list is non-empty', async () => {
      mockedPrisma.technicianProfile.findMany.mockResolvedValue([]);
      await svc.qualifiedTechs('svc-1', ORIGIN.lat, ORIGIN.lng, 50, ['tp-a', 'tp-b']);
      expect(mockedPrisma.technicianProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: { notIn: ['tp-a', 'tp-b'] } }) }),
      );
    });

    it('omits the id.notIn predicate entirely when no techs are excluded', async () => {
      mockedPrisma.technicianProfile.findMany.mockResolvedValue([]);
      await svc.qualifiedTechs('svc-1', ORIGIN.lat, ORIGIN.lng, 50, []);
      const where = mockedPrisma.technicianProfile.findMany.mock.calls[0][0].where;
      expect(where).not.toHaveProperty('id');
    });

    it('keeps a tech inside the radius and drops one outside it', async () => {
      mockedPrisma.technicianProfile.findMany.mockResolvedValue([
        { id: 'tp-mid', userId: 'u-mid', ...MID },
        { id: 'tp-far', userId: 'u-far', ...FAR },
      ]);
      const at15 = await svc.qualifiedTechs('svc-1', ORIGIN.lat, ORIGIN.lng, 15, []);
      expect(at15.map((t) => t.id)).toEqual(['tp-mid']); // FAR (~60km) excluded
    });
  });

  // ── 1b. qualifiedTechs — Redis GEO available (the live path per §2.4) ───────
  describe('qualifiedTechs — Redis GEO', () => {
    it('prunes stale technicians, GEOSEARCHes, then resolves candidates by id via Postgres', async () => {
      mockedRedis.geosearch.mockResolvedValue(['tp-near', 'tp-mid']);
      mockedPrisma.technicianProfile.findMany.mockResolvedValue([
        { id: 'tp-near', userId: 'u-near', trustTier: 'STANDARD', ...NEAR },
        { id: 'tp-mid', userId: 'u-mid', trustTier: 'STANDARD', ...MID },
      ]);

      // MID (~13km) needs the wider 15km radius to be in range; NEAR (~2km) is in range either way.
      const result = await svc.qualifiedTechs('svc-1', ORIGIN.lat, ORIGIN.lng, 15, []);

      // Stale technicians pruned before every GEOSEARCH.
      expect(mockedPruneStaleTechnicians).toHaveBeenCalled();
      expect(mockedRedis.geosearch).toHaveBeenCalledWith(
        'tech:locations', 'FROMLONLAT', ORIGIN.lng, ORIGIN.lat, 'BYRADIUS', 15, 'km', 'ASC',
      );
      // Cheap by-id lookup, not the old full-table scan.
      expect(mockedPrisma.technicianProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { in: ['tp-near', 'tp-mid'] },
            status: 'APPROVED',
            isAvailable: true,
            services: { some: { id: 'svc-1' } },
          }),
        }),
      );
      expect(result.map((t) => t.id)).toEqual(['tp-near', 'tp-mid']);
    });

    it('filters out already-offered technician ids from the GEO candidates before querying Postgres', async () => {
      mockedRedis.geosearch.mockResolvedValue(['tp-near', 'tp-offered']);
      mockedPrisma.technicianProfile.findMany.mockResolvedValue([
        { id: 'tp-near', userId: 'u-near', trustTier: 'STANDARD', ...NEAR },
      ]);

      await svc.qualifiedTechs('svc-1', ORIGIN.lat, ORIGIN.lng, 10, ['tp-offered']);

      expect(mockedPrisma.technicianProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: { in: ['tp-near'] } }) }),
      );
    });

    it('short-circuits without a Postgres query when every GEO candidate was already offered', async () => {
      mockedRedis.geosearch.mockResolvedValue(['tp-offered']);
      const result = await svc.qualifiedTechs('svc-1', ORIGIN.lat, ORIGIN.lng, 10, ['tp-offered']);
      expect(result).toEqual([]);
      expect(mockedPrisma.technicianProfile.findMany).not.toHaveBeenCalled();
    });

    it('still caps a PROBATION tech to the tighter radius even though GEOSEARCH already bounded by the wider radius', async () => {
      mockedRedis.geosearch.mockResolvedValue(['tp-mid']);
      // MID is ~13km out — inside the requested 20km GEOSEARCH radius, but
      // outside the PROBATION cap (5km, per TrustService.PROBATION_MAX_RADIUS_KM).
      mockedPrisma.technicianProfile.findMany.mockResolvedValue([
        { id: 'tp-mid', userId: 'u-mid', trustTier: 'PROBATION', ...MID },
      ]);
      const result = await svc.qualifiedTechs('svc-1', ORIGIN.lat, ORIGIN.lng, 20, []);
      expect(result).toEqual([]);
    });

    it('falls back to the Postgres scan when GEOSEARCH itself throws (Redis outage)', async () => {
      mockedRedis.geosearch.mockRejectedValue(new Error('connection lost'));
      mockedPrisma.technicianProfile.findMany.mockResolvedValue([
        { id: 'tp-near', userId: 'u-near', trustTier: 'STANDARD', ...NEAR },
      ]);

      const result = await svc.qualifiedTechs('svc-1', ORIGIN.lat, ORIGIN.lng, 10, []);

      // Fallback query shape: no id-in filter, full eligibility predicate instead.
      expect(mockedPrisma.technicianProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'APPROVED', isAvailable: true, currentLat: { not: null } }),
        }),
      );
      const where = mockedPrisma.technicianProfile.findMany.mock.calls[0][0].where;
      expect(where).not.toHaveProperty('id');
      expect(result.map((t) => t.id)).toEqual(['tp-near']);
    });

    it('falls back to the Postgres scan when pruneStaleTechnicians itself throws', async () => {
      mockedPruneStaleTechnicians.mockRejectedValue(new Error('redis down'));
      mockedPrisma.technicianProfile.findMany.mockResolvedValue([]);

      await svc.qualifiedTechs('svc-1', ORIGIN.lat, ORIGIN.lng, 10, []);

      expect(mockedRedis.geosearch).not.toHaveBeenCalled();
      const where = mockedPrisma.technicianProfile.findMany.mock.calls[0][0].where;
      expect(where).not.toHaveProperty('id');
    });
  });

  // ── 2. startDispatch ────────────────────────────────────────────────────────
  describe('startDispatch', () => {
    function txCapture() {
      const update = jest.fn().mockResolvedValue({});
      const createMany = jest.fn().mockResolvedValue({ count: 1 });
      mockedPrisma.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) =>
        fn({ booking: { update }, dispatchOffer: { createMany } }),
      );
      return { update, createMany };
    }

    it('opens round 1 at 10km, creates offers, broadcasts, and sets dispatchExpiresAt', async () => {
      mockedPrisma.booking.findUnique
        .mockResolvedValueOnce({ status: 'PENDING', dispatchRound: 0, serviceId: 'svc-1', addressLat: ORIGIN.lat, addressLng: ORIGIN.lng }) // startDispatch read
        .mockResolvedValueOnce({ serviceId: 'svc-1', addressLat: ORIGIN.lat, addressLng: ORIGIN.lng, totalJod: money('20.000') }); // openRound read
      mockedPrisma.dispatchOffer.findMany.mockResolvedValue([]); // no prior offers
      mockedPrisma.technicianProfile.findMany.mockResolvedValue([{ id: 'tp-near', userId: 'u-near', ...NEAR }]);
      const { update, createMany } = txCapture();

      await svc.startDispatch('b1');

      // Round 1 booking state with the 10km radius + an expiry timestamp.
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'b1' },
          data: expect.objectContaining({ dispatchRound: 1, dispatchRadiusKm: 10, dispatchExpiresAt: expect.any(Date) }),
        }),
      );
      // An OFFERED row for the in-range tech (batched createMany, skipDuplicates).
      expect(createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ bookingId: 'b1', technicianId: 'tp-near', round: 1, status: 'OFFERED' }),
          ]),
          skipDuplicates: true,
        }),
      );
      // Real-time broadcast to that tech's room.
      expect(io.to).toHaveBeenCalledWith('user:u-near');
      expect(io.emit).toHaveBeenCalledWith('booking:new', expect.objectContaining({ bookingId: 'b1', round: 1 }));
    });

    it('is a no-op when the booking is not PENDING (guard)', async () => {
      mockedPrisma.booking.findUnique.mockResolvedValueOnce({ status: 'CONFIRMED', dispatchRound: 0, serviceId: 'svc-1', addressLat: 0, addressLng: 0 });
      await svc.startDispatch('b1');
      expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('is a no-op when dispatchRound is already > 0 (already started)', async () => {
      mockedPrisma.booking.findUnique.mockResolvedValueOnce({ status: 'PENDING', dispatchRound: 2, serviceId: 'svc-1', addressLat: 0, addressLng: 0 });
      await svc.startDispatch('b1');
      expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('is a no-op when payment is not PRE_AUTHORIZED (money safety)', async () => {
      mockedPrisma.booking.findUnique.mockResolvedValueOnce({ status: 'PENDING', dispatchRound: 0, serviceId: 'svc-1', addressLat: 0, addressLng: 0 });
      mockedPrisma.payment.findUnique.mockResolvedValue({ status: 'PENDING' });
      await svc.startDispatch('b1');
      expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('is a no-op when there is no payment row at all', async () => {
      mockedPrisma.booking.findUnique.mockResolvedValueOnce({ status: 'PENDING', dispatchRound: 0, serviceId: 'svc-1', addressLat: 0, addressLng: 0 });
      mockedPrisma.payment.findUnique.mockResolvedValue(null);
      await svc.startDispatch('b1');
      expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  // ── 3 & 4. round expansion + timeout-driven advance ─────────────────────────
  describe('advanceRound (round expansion)', () => {
    function openRoundTx() {
      const update = jest.fn().mockResolvedValue({});
      const createMany = jest.fn().mockResolvedValue({ count: 1 });
      mockedPrisma.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) =>
        fn({ booking: { update }, dispatchOffer: { createMany } }),
      );
      return { update, createMany };
    }

    it('expands 10→15 on the next round, excludes prior-offered techs, and EXPIRES prior OFFERED rows', async () => {
      // Currently in round 1 @ 10km.
      mockedPrisma.booking.findUnique
        .mockResolvedValueOnce({ status: 'PENDING', dispatchRound: 1, dispatchRadiusKm: 10, serviceId: 'svc-1', addressLat: ORIGIN.lat, addressLng: ORIGIN.lng }) // advanceRound read
        .mockResolvedValueOnce({ serviceId: 'svc-1', addressLat: ORIGIN.lat, addressLng: ORIGIN.lng, totalJod: money('20.000') }); // openRound read
      // Prior offer to tp-near; candidate scan at 15km returns the MID tech.
      mockedPrisma.dispatchOffer.findMany
        .mockResolvedValueOnce([{ technicianId: 'tp-near' }]) // advanceRound candidate-exclude scan
        .mockResolvedValueOnce([{ technicianId: 'tp-near' }]); // openRound exclude scan
      mockedPrisma.technicianProfile.findMany.mockResolvedValue([{ id: 'tp-mid', userId: 'u-mid', ...MID }]);
      mockedPrisma.dispatchOffer.updateMany.mockResolvedValue({ count: 1 }); // 1 prior OFFERED expired
      const { update, createMany } = openRoundTx();

      await svc.advanceRound('b1');

      // Prior OFFERED rows moved to EXPIRED.
      expect(mockedPrisma.dispatchOffer.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { bookingId: 'b1', status: 'OFFERED' }, data: { status: 'EXPIRED' } }),
      );
      // New round 2 @ 15km.
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ dispatchRound: 2, dispatchRadiusKm: 15 }) }),
      );
      // Candidate scan excluded the already-offered tech.
      expect(mockedPrisma.technicianProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: { notIn: ['tp-near'] } }) }),
      );
      // New offer for the mid-range tech only (batched createMany).
      expect(createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ technicianId: 'tp-mid', round: 2, radiusKm: 15 }),
          ]),
        }),
      );
    });

    it('serialises on the redis dispatch_lock — does nothing if the lock is already held', async () => {
      mockedRedis.set.mockResolvedValue(null); // SETNX failed
      await svc.advanceRound('b1');
      expect(mockedPrisma.booking.findUnique).not.toHaveBeenCalled();
      expect(mockedRedis.del).not.toHaveBeenCalled(); // never acquired → never released
    });

    it('always releases the dispatch_lock (finally) even after opening a round', async () => {
      mockedPrisma.booking.findUnique
        .mockResolvedValueOnce({ status: 'PENDING', dispatchRound: 1, dispatchRadiusKm: 10, serviceId: 'svc-1', addressLat: ORIGIN.lat, addressLng: ORIGIN.lng })
        .mockResolvedValueOnce({ serviceId: 'svc-1', addressLat: ORIGIN.lat, addressLng: ORIGIN.lng, totalJod: money('20.000') });
      mockedPrisma.dispatchOffer.findMany.mockResolvedValue([]);
      mockedPrisma.technicianProfile.findMany.mockResolvedValue([{ id: 'tp-mid', userId: 'u-mid', ...MID }]);
      openRoundTx();
      await svc.advanceRound('b1');
      expect(mockedRedis.del).toHaveBeenCalledWith('dispatch_lock:b1');
    });

    it('is a no-op (but releases the lock) when the booking is no longer PENDING', async () => {
      mockedPrisma.booking.findUnique.mockResolvedValueOnce({ status: 'CONFIRMED', dispatchRound: 1, dispatchRadiusKm: 10, serviceId: 'svc-1', addressLat: 0, addressLng: 0 });
      await svc.advanceRound('b1');
      expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockedRedis.del).toHaveBeenCalledWith('dispatch_lock:b1');
    });
  });

  // ── 4. timeout sweep → advance ──────────────────────────────────────────────
  describe('expireRounds (sweep)', () => {
    it('advances every PENDING booking whose round has expired (drives advanceRound; no real wait)', async () => {
      // (a) expired-round scan returns two bookings; (b) bootstrap scan returns none.
      mockedPrisma.booking.findMany
        .mockResolvedValueOnce([{ id: 'b1' }, { id: 'b2' }]) // expired rounds
        .mockResolvedValueOnce([]); // unstarted bootstrap
      const advanceSpy = jest.spyOn(svc, 'advanceRound').mockResolvedValue();

      await svc.expireRounds();

      expect(mockedPrisma.booking.findMany).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ where: expect.objectContaining({ status: 'PENDING', dispatchExpiresAt: { lt: expect.any(Date) } }) }),
      );
      expect(advanceSpy).toHaveBeenCalledWith('b1');
      expect(advanceSpy).toHaveBeenCalledWith('b2');
    });

    it('bootstraps un-dispatched PENDING bookings via startDispatch (kickoff has no outbox event)', async () => {
      mockedPrisma.booking.findMany
        .mockResolvedValueOnce([]) // no expired rounds
        .mockResolvedValueOnce([{ id: 'b9' }]); // round-0 bootstrap candidate
      const startSpy = jest.spyOn(svc, 'startDispatch').mockResolvedValue();

      await svc.expireRounds();

      expect(mockedPrisma.booking.findMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ where: expect.objectContaining({ status: 'PENDING', dispatchRound: 0 }) }),
      );
      expect(startSpy).toHaveBeenCalledWith('b9');
      // No 'booking.created'/kickoff outbox is written by the sweep itself.
      expect(mockedPrisma.outboxEvent.create).not.toHaveBeenCalled();
    });

    it('keeps sweeping when one advanceRound throws (does not abort the batch)', async () => {
      mockedPrisma.booking.findMany
        .mockResolvedValueOnce([{ id: 'b1' }, { id: 'b2' }])
        .mockResolvedValueOnce([]);
      const advanceSpy = jest
        .spyOn(svc, 'advanceRound')
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce();
      await expect(svc.expireRounds()).resolves.toBeUndefined();
      expect(advanceSpy).toHaveBeenCalledTimes(2);
    });
  });

  // ── 3 (kickoff via sweep bootstrap, round 0 + PRE_AUTHORIZED) ────────────────
  describe('sweep bootstrap → startDispatch round 0 + PRE_AUTHORIZED', () => {
    it('starts round 0 → round 1 only for a PENDING+round0+PRE_AUTHORIZED booking', async () => {
      mockedPrisma.booking.findMany
        .mockResolvedValueOnce([]) // no expired
        .mockResolvedValueOnce([{ id: 'b-boot' }]); // bootstrap candidate
      // Real startDispatch path: round 0, PENDING, authorized → opens round 1.
      mockedPrisma.booking.findUnique
        .mockResolvedValueOnce({ status: 'PENDING', dispatchRound: 0, serviceId: 'svc-1', addressLat: ORIGIN.lat, addressLng: ORIGIN.lng })
        .mockResolvedValueOnce({ serviceId: 'svc-1', addressLat: ORIGIN.lat, addressLng: ORIGIN.lng, totalJod: money('20.000') });
      mockedPrisma.dispatchOffer.findMany.mockResolvedValue([]);
      mockedPrisma.technicianProfile.findMany.mockResolvedValue([{ id: 'tp-near', userId: 'u-near', ...NEAR }]);
      const update = jest.fn().mockResolvedValue({});
      mockedPrisma.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) =>
        fn({ booking: { update }, dispatchOffer: { create: jest.fn().mockResolvedValue({}) } }),
      );

      await svc.expireRounds();

      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ dispatchRound: 1, dispatchRadiusKm: 10 }) }),
      );
    });
  });

  // ── 5. reject → next round only when no OFFERED remain ───────────────────────
  describe('reject', () => {
    it('throws NotFoundError when the caller has no technician profile', async () => {
      mockedPrisma.technicianProfile.findUnique.mockResolvedValue(null);
      await expect(svc.reject('b1', 'no-such-user')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('throws ConflictError when the tech had no active OFFERED offer (nothing rejected)', async () => {
      mockedPrisma.technicianProfile.findUnique.mockResolvedValue({ id: 'tp-1' });
      mockedPrisma.dispatchOffer.updateMany.mockResolvedValue({ count: 0 });
      await expect(svc.reject('b1', 'u-1')).rejects.toBeInstanceOf(ConflictError);
    });

    it('does NOT advance when other OFFERED offers still remain (partial reject)', async () => {
      mockedPrisma.technicianProfile.findUnique.mockResolvedValue({ id: 'tp-1' });
      mockedPrisma.dispatchOffer.updateMany.mockResolvedValue({ count: 1 }); // this tech's offer → REJECTED
      mockedPrisma.dispatchOffer.count.mockResolvedValue(2); // two other techs still OFFERED
      const advanceSpy = jest.spyOn(svc, 'advanceRound').mockResolvedValue();

      await svc.reject('b1', 'u-1');

      expect(mockedPrisma.dispatchOffer.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ bookingId: 'b1', technicianId: 'tp-1', status: 'OFFERED' }),
          data: expect.objectContaining({ status: 'REJECTED' }),
        }),
      );
      expect(advanceSpy).not.toHaveBeenCalled();

      // Consecutive-rejection streak increments on every reject.
      expect(mockedPrisma.technicianProfile.update).toHaveBeenCalledWith({
        where: { id: 'tp-1' },
        data: { consecutiveRejections: { increment: 1 } },
      });
    });

    it('advances immediately when the last OFFERED offer is rejected (zero remain)', async () => {
      mockedPrisma.technicianProfile.findUnique.mockResolvedValue({ id: 'tp-1' });
      mockedPrisma.dispatchOffer.updateMany.mockResolvedValue({ count: 1 });
      mockedPrisma.dispatchOffer.count.mockResolvedValue(0); // none remain
      const advanceSpy = jest.spyOn(svc, 'advanceRound').mockResolvedValue();

      await svc.reject('b1', 'u-1');

      expect(advanceSpy).toHaveBeenCalledWith('b1');
    });
  });

  // ── 7. exhaustion at the 50km cap with no candidates ────────────────────────
  describe('exhaustion at max radius', () => {
    it('cancels the booking (no_technician_available) + emits booking.cancelled outbox', async () => {
      // Currently at the 50km cap; next scan finds nothing.
      mockedPrisma.booking.findUnique.mockResolvedValueOnce({
        status: 'PENDING', dispatchRound: 9, dispatchRadiusKm: 50, serviceId: 'svc-1', addressLat: ORIGIN.lat, addressLng: ORIGIN.lng,
      });
      mockedPrisma.dispatchOffer.findMany.mockResolvedValue([{ technicianId: 'tp-x' }]);
      mockedPrisma.technicianProfile.findMany.mockResolvedValue([]); // no qualified candidates

      const update = jest.fn().mockResolvedValue({});
      const create = jest.fn().mockResolvedValue({});
      mockedPrisma.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) =>
        fn({
          booking: { findUnique: jest.fn().mockResolvedValue({ id: 'b1', status: 'PENDING', version: 4 }), update },
          outboxEvent: { create },
        }),
      );

      await svc.advanceRound('b1');

      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'b1', version: 4 },
          data: expect.objectContaining({ status: 'CANCELLED', cancelReason: 'no_technician_available', version: { increment: 1 } }),
        }),
      );
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ eventType: 'booking.cancelled', payload: expect.objectContaining({ reason: 'no_technician_available' }) }) }),
      );
      // No new round/offer transaction was opened — the exhaust tx is the only one.
      expect(mockedPrisma.dispatchOffer.updateMany).not.toHaveBeenCalled();
      expect(mockedRedis.del).toHaveBeenCalledWith('dispatch_lock:b1'); // lock still released
    });

    it('does NOT exhaust while below the cap even with no candidates this round (keeps trying)', async () => {
      // Round 1 @ 10km, no candidates at 15km, but radius < 50 cap → open the next round anyway.
      mockedPrisma.booking.findUnique
        .mockResolvedValueOnce({ status: 'PENDING', dispatchRound: 1, dispatchRadiusKm: 10, serviceId: 'svc-1', addressLat: ORIGIN.lat, addressLng: ORIGIN.lng })
        .mockResolvedValueOnce({ serviceId: 'svc-1', addressLat: ORIGIN.lat, addressLng: ORIGIN.lng, totalJod: money('20.000') });
      mockedPrisma.dispatchOffer.findMany.mockResolvedValue([]);
      mockedPrisma.technicianProfile.findMany.mockResolvedValue([]); // none this round
      const update = jest.fn().mockResolvedValue({});
      mockedPrisma.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) =>
        fn({ booking: { update }, dispatchOffer: { createMany: jest.fn() } }),
      );

      await svc.advanceRound('b1');

      // Advanced to round 2 @ 15km rather than cancelling.
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ dispatchRound: 2, dispatchRadiusKm: 15 }) }),
      );
      expect(mockedPrisma.outboxEvent.create).not.toHaveBeenCalled(); // not cancelled
    });

    it('exhaust is a no-op if the booking was already taken (status changed under the tx)', async () => {
      mockedPrisma.booking.findUnique.mockResolvedValueOnce({
        status: 'PENDING', dispatchRound: 9, dispatchRadiusKm: 50, serviceId: 'svc-1', addressLat: ORIGIN.lat, addressLng: ORIGIN.lng,
      });
      mockedPrisma.dispatchOffer.findMany.mockResolvedValue([]);
      mockedPrisma.technicianProfile.findMany.mockResolvedValue([]);
      const update = jest.fn();
      const create = jest.fn();
      mockedPrisma.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) =>
        fn({ booking: { findUnique: jest.fn().mockResolvedValue({ id: 'b1', status: 'CONFIRMED', version: 4 }), update }, outboxEvent: { create } }),
      );

      await svc.advanceRound('b1');

      expect(update).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
    });
  });
});
