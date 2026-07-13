import { Prisma, TechnicianStatus, TrustTier, BookingStatus, PaymentStatus, DispatchOfferStatus } from '@prisma/client';
import type { Server as SocketServer } from 'socket.io';
import { prisma } from '../../infrastructure/database/prisma';
import { redis, pruneStaleTechnicians, TECH_LOCATIONS_KEY } from '../../infrastructure/cache/redis';
import { env } from '../../shared/env';
import { logger } from '../../shared/logger';
import { haversineKm } from '../../shared/geo';
import { PROBATION_MAX_RADIUS_KM } from '../technician/TrustService';
import { ConflictError, NotFoundError, PrismaErrorCode } from '../../shared/errors';
import { OutboxEventType } from '../../shared/outboxEvents';
import {
  dispatchOffersTotal, dispatchRoundsTotal,
  dispatchExhaustedTotal,
} from '../../shared/metrics';

const LOCK_TTL_SECONDS = 10;

// ── Singleton accessor (route + sweep reach the io-bound instance) ──────────

let instance: DispatchService | null = null;

export function setDispatchService(svc: DispatchService): void { instance = svc; }
export function getDispatchService(): DispatchService {
  if (!instance) throw new Error('DispatchService not initialised');
  return instance;
}

// ── Service ─────────────────────────────────────────────────────────────────

export class DispatchService {
  constructor(private readonly io: SocketServer) {}

  /** APPROVED + available techs offering the service within radiusKm, excluding already-offered.
   *  PROBATION techs (§0.2 #1) are gated to a tighter radius so unproven technicians only
   *  take nearby jobs while they build a track record — bounding guarantee liability.
   *
   *  Live matching reads Redis GEO (§2.4) — candidate IDs from GEOSEARCH, resolved
   *  against Postgres by id (cheap) rather than the old full-table distance scan.
   *  Falls back to the Postgres+haversine scan if Redis is unavailable so a Redis
   *  outage degrades dispatch instead of hard-failing it (mirrors the idempotency
   *  middleware's fail-open convention). */
  async qualifiedTechs(
    serviceId: string, lat: number, lng: number,
    radiusKm: number, excludeTechIds: string[],
  ) {
    const redisIds = await this.redisNearbyTechIds(lat, lng, radiusKm);
    if (redisIds === null) {
      return this.qualifiedTechsFallback(serviceId, lat, lng, radiusKm, excludeTechIds);
    }

    const candidateIds = redisIds.filter((id) => !excludeTechIds.includes(id));
    if (candidateIds.length === 0) return [];

    const techs = await prisma.technicianProfile.findMany({
      where: {
        id: { in: candidateIds },
        status: TechnicianStatus.APPROVED,
        isAvailable: true,
        services: { some: { id: serviceId } },
        currentLat: { not: null },
        currentLng: { not: null },
      },
      select: { id: true, userId: true, currentLat: true, currentLng: true, trustTier: true },
    });
    // GEOSEARCH already bounded candidates by radiusKm; PROBATION still needs
    // the tighter cap, which requires the actual distance.
    return techs.filter((t) => {
      const cap = t.trustTier === TrustTier.PROBATION ? Math.min(radiusKm, PROBATION_MAX_RADIUS_KM) : radiusKm;
      return haversineKm(lat, lng, t.currentLat!, t.currentLng!) <= cap;
    });
  }

  /** Pre-Redis-GEO implementation — full Postgres scan + in-memory haversine
   *  filter. Kept as the fallback path for when Redis GEO is unavailable. */
  private async qualifiedTechsFallback(
    serviceId: string, lat: number, lng: number,
    radiusKm: number, excludeTechIds: string[],
  ) {
    const techs = await prisma.technicianProfile.findMany({
      where: {
        status: TechnicianStatus.APPROVED,
        isAvailable: true,
        services: { some: { id: serviceId } },
        currentLat: { not: null },
        currentLng: { not: null },
        ...(excludeTechIds.length > 0 ? { id: { notIn: excludeTechIds } } : {}),
      },
      select: { id: true, userId: true, currentLat: true, currentLng: true, trustTier: true },
    });
    return techs.filter((t) => {
      const cap = t.trustTier === TrustTier.PROBATION ? Math.min(radiusKm, PROBATION_MAX_RADIUS_KM) : radiusKm;
      return haversineKm(lat, lng, t.currentLat!, t.currentLng!) <= cap;
    });
  }

  /** GEOSEARCH candidate technician ids within radiusKm of (lat,lng), after
   *  pruning stale (missing heartbeat >30s) technicians (§2.4). Returns null
   *  if Redis is unavailable so the caller can fall back to Postgres. */
  private async redisNearbyTechIds(lat: number, lng: number, radiusKm: number): Promise<string[] | null> {
    try {
      await pruneStaleTechnicians();
      const ids = await redis.geosearch(
        TECH_LOCATIONS_KEY,
        'FROMLONLAT', lng, lat,
        'BYRADIUS', radiusKm, 'km',
        'ASC',
      );
      return ids as string[];
    } catch (err) {
      logger.warn({ err }, 'qualifiedTechs: Redis GEO search unavailable, falling back to Postgres scan');
      return null;
    }
  }

  /** Kick off dispatching for a freshly-authorized PENDING booking. */
  async startDispatch(bookingId: string): Promise<void> {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { status: true, dispatchRound: true, serviceId: true, addressLat: true, addressLng: true },
    });
    if (!booking) return;
    if (booking.status !== BookingStatus.PENDING || booking.dispatchRound !== 0) return;

    // Only dispatch if payment is authorized (money safety).
    const payment = await prisma.payment.findUnique({
      where: { bookingId },
      select: { status: true },
    });
    if (!payment || payment.status !== PaymentStatus.PRE_AUTHORIZED) return;

    await this.openRound(bookingId, 1, env().DISPATCH_INITIAL_RADIUS_KM);
  }

  /** Open a new dispatch round: create offers for qualified techs + broadcast.
   *  When called from advanceRound, pass knownExcludeIds to skip the redundant
   *  priorOffers query (advanceRound already fetched them). */
  private async openRound(bookingId: string, round: number, radiusKm: number, knownExcludeIds?: string[]): Promise<void> {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { serviceId: true, addressLat: true, addressLng: true, totalJod: true },
    });
    if (!booking) return;

    const excludeIds = knownExcludeIds ?? (
      await prisma.dispatchOffer.findMany({ where: { bookingId }, select: { technicianId: true } })
    ).map((o) => o.technicianId);

    const techs = await this.qualifiedTechs(
      booking.serviceId, booking.addressLat, booking.addressLng, radiusKm, excludeIds,
    );

    const expiresAt = new Date(Date.now() + env().DISPATCH_ACCEPT_TIMEOUT_MS);

    await prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: bookingId },
        data: { dispatchRound: round, dispatchRadiusKm: radiusKm, dispatchExpiresAt: expiresAt },
      });

      await tx.dispatchOffer.createMany({
        data: techs.map((t) => ({
          bookingId, technicianId: t.id, round, radiusKm, status: DispatchOfferStatus.OFFERED,
        })),
        skipDuplicates: true,
      });
    });

    dispatchRoundsTotal.inc();
    techs.forEach(() => dispatchOffersTotal.inc({ result: 'offered' }));

    // Broadcast to each tech (outside the tx — socket is side-effect).
    for (const t of techs) {
      const distanceKm = Number(
        haversineKm(booking.addressLat, booking.addressLng, t.currentLat!, t.currentLng!).toFixed(1),
      );
      this.broadcastOffer(t.userId, {
        bookingId,
        serviceId: booking.serviceId,
        distanceKm,
        priceJod: booking.totalJod.toString(),
        round,
        expiresAt: expiresAt.toISOString(),
      });
    }

    logger.info({ bookingId, round, radiusKm, techCount: techs.length }, 'Dispatch round opened');
  }

  /** Advance to the next wider radius (or exhaust if at cap with no candidates). */
  async advanceRound(bookingId: string): Promise<void> {
    const lockKey = `dispatch_lock:${bookingId}`;
    const acquired = await redis.set(lockKey, '1', 'EX', LOCK_TTL_SECONDS, 'NX');
    if (!acquired) return; // another process is advancing

    try {
      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        select: {
          status: true, dispatchRound: true, dispatchRadiusKm: true,
          serviceId: true, addressLat: true, addressLng: true,
        },
      });
      if (!booking || booking.status !== BookingStatus.PENDING) return;

      const { DISPATCH_INITIAL_RADIUS_KM, DISPATCH_RADIUS_STEP_KM, DISPATCH_MAX_RADIUS_KM } = env();
      const nextRadius = Math.min(
        DISPATCH_INITIAL_RADIUS_KM + DISPATCH_RADIUS_STEP_KM * booking.dispatchRound,
        DISPATCH_MAX_RADIUS_KM,
      );

      // Check if there are candidates at the new radius.
      const priorOffers = await prisma.dispatchOffer.findMany({
        where: { bookingId },
        select: { technicianId: true },
      });
      const excludeIds = priorOffers.map((o) => o.technicianId);
      const candidates = await this.qualifiedTechs(
        booking.serviceId, booking.addressLat, booking.addressLng, nextRadius, excludeIds,
      );

      // No candidates AND already at max radius — exhaust.
      if (candidates.length === 0 && (booking.dispatchRadiusKm ?? 0) >= DISPATCH_MAX_RADIUS_KM) {
        await this.exhaust(bookingId);
        return;
      }

      // Expire still-OFFERED offers from the previous round.
      const expired = await prisma.dispatchOffer.updateMany({
        where: { bookingId, status: DispatchOfferStatus.OFFERED },
        data: { status: DispatchOfferStatus.EXPIRED },
      });
      if (expired.count > 0) dispatchOffersTotal.inc({ result: 'expired' }, expired.count);

      await this.openRound(bookingId, booking.dispatchRound + 1, nextRadius, excludeIds);
    } finally {
      await redis.del(lockKey);
    }
  }

  /** Technician rejects an offer. If no OFFERED offers remain, advance immediately. */
  async reject(bookingId: string, techUserId: string): Promise<void> {
    const profile = await prisma.technicianProfile.findUnique({
      where: { userId: techUserId },
      select: { id: true },
    });
    if (!profile) throw new NotFoundError('TechnicianProfile');

    const updated = await prisma.dispatchOffer.updateMany({
      where: { bookingId, technicianId: profile.id, status: DispatchOfferStatus.OFFERED },
      data: { status: DispatchOfferStatus.REJECTED, respondedAt: new Date() },
    });
    if (updated.count === 0) throw new ConflictError('No active offer for this booking');
    dispatchOffersTotal.inc({ result: 'rejected' });

    // Consecutive-rejection streak (technician app warns at 3+ in a row);
    // reset to 0 on any accept in BookingService.accept().
    await prisma.technicianProfile.update({
      where: { id: profile.id },
      data: { consecutiveRejections: { increment: 1 } },
    });

    // If zero OFFERED offers remain, advance immediately.
    const remaining = await prisma.dispatchOffer.count({
      where: { bookingId, status: DispatchOfferStatus.OFFERED },
    });
    if (remaining === 0) await this.advanceRound(bookingId);
  }

  /**
   * Sweep: (a) expire timed-out rounds, (b) bootstrap PENDING bookings that
   * have an authorized payment but no dispatch round yet. Called by main.ts.
   */
  async expireRounds(): Promise<void> {
    const now = new Date();

    // (a) Bookings whose current round has expired.
    const expired = await prisma.booking.findMany({
      where: { status: BookingStatus.PENDING, dispatchExpiresAt: { lt: now } },
      select: { id: true },
    });
    for (const b of expired) {
      try { await this.advanceRound(b.id); }
      catch (err) { logger.warn({ err, bookingId: b.id }, 'Dispatch sweep: advanceRound failed'); }
    }

    // (b) Bootstrap: PENDING bookings with no dispatch yet + authorized payment.
    const unstarted = await prisma.booking.findMany({
      where: { status: BookingStatus.PENDING, dispatchRound: 0 },
      select: { id: true },
    });
    for (const b of unstarted) {
      try { await this.startDispatch(b.id); }
      catch (err) { logger.warn({ err, bookingId: b.id }, 'Dispatch sweep: startDispatch failed'); }
    }
  }

  /** Cancel the booking — no technician available at max radius. */
  private async exhaust(bookingId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const fresh = await tx.booking.findUnique({ where: { id: bookingId } });
      if (!fresh || fresh.status !== BookingStatus.PENDING) return;

      await tx.booking.update({
        where: { id: bookingId, version: fresh.version },
        data: {
          status: BookingStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelReason: 'no_technician_available',
          dispatchExpiresAt: null,
          version: { increment: 1 },
        },
      });

      // Close out any offers still OFFERED for this booking — otherwise they'd
      // linger forever and keep showing up in a technician's nearbyJobs list
      // for a booking that's now cancelled (mirrors advanceRound's cleanup).
      await tx.dispatchOffer.updateMany({
        where: { bookingId, status: DispatchOfferStatus.OFFERED },
        data: { status: DispatchOfferStatus.EXPIRED },
      });

      // Reuse existing 'booking.cancelled' outbox flow (void hold + notify).
      await tx.outboxEvent.create({
        data: {
          bookingId,
          eventType: OutboxEventType.BOOKING_CANCELLED,
          payload: { bookingId, reason: 'no_technician_available' },
        },
      });
    });

    dispatchExhaustedTotal.inc();
    logger.warn({ bookingId }, 'Dispatch exhausted — booking cancelled');
  }

  /** Push a real-time offer notification to a technician + persist it. */
  private broadcastOffer(
    techUserId: string,
    payload: { bookingId: string; serviceId: string; distanceKm: number; priceJod: string; round: number; expiresAt: string },
  ): void {
    this.io.to(`user:${techUserId}`).emit('booking:new', payload);

    // Idempotent notification row (swallow P2002 on re-delivery).
    const dedupeKey = `${payload.bookingId}:offer:${payload.round}:${techUserId}`;
    prisma.notification.create({
      data: {
        userId: techUserId,
        bookingId: payload.bookingId,
        dedupeKey,
        titleAr: 'طلب خدمة جديد',
        bodyAr: `طلب خدمة جديد على بعد ${payload.distanceKm} كم.`,
        sentAt: new Date(),
      },
    }).catch((err) => {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === PrismaErrorCode.UNIQUE_CONSTRAINT_VIOLATION) return;
      logger.warn({ err, dedupeKey }, 'broadcastOffer: notification insert failed');
    });
  }
}
