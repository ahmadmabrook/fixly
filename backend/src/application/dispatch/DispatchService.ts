import { Prisma } from '@prisma/client';
import type { Server as SocketServer } from 'socket.io';
import { prisma } from '../../infrastructure/database/prisma';
import { redis } from '../../infrastructure/cache/redis';
import { env } from '../../shared/env';
import { logger } from '../../shared/logger';
import { haversineKm } from '../../shared/geo';
import { ConflictError, NotFoundError } from '../../shared/errors';
import {
  dispatchOffersTotal, dispatchRoundsTotal,
  dispatchExhaustedTotal, dispatchAcceptLatencySeconds,
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

  /** APPROVED + available techs offering the service within radiusKm, excluding already-offered. */
  async qualifiedTechs(
    serviceId: string, lat: number, lng: number,
    radiusKm: number, excludeTechIds: string[],
  ) {
    const techs = await prisma.technicianProfile.findMany({
      where: {
        status: 'APPROVED',
        isAvailable: true,
        services: { some: { id: serviceId } },
        currentLat: { not: null },
        currentLng: { not: null },
        ...(excludeTechIds.length > 0 ? { id: { notIn: excludeTechIds } } : {}),
      },
      select: { id: true, userId: true, currentLat: true, currentLng: true },
    });
    return techs.filter(
      (t) => haversineKm(lat, lng, t.currentLat!, t.currentLng!) <= radiusKm,
    );
  }

  /** Kick off dispatching for a freshly-authorized PENDING booking. */
  async startDispatch(bookingId: string): Promise<void> {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { status: true, dispatchRound: true, serviceId: true, addressLat: true, addressLng: true },
    });
    if (!booking) return;
    if (booking.status !== 'PENDING' || booking.dispatchRound !== 0) return;

    // Only dispatch if payment is authorized (money safety).
    const payment = await prisma.payment.findUnique({
      where: { bookingId },
      select: { status: true },
    });
    if (!payment || payment.status !== 'PRE_AUTHORIZED') return;

    await this.openRound(bookingId, 1, env().DISPATCH_INITIAL_RADIUS_KM);
  }

  /** Open a new dispatch round: create offers for qualified techs + broadcast. */
  private async openRound(bookingId: string, round: number, radiusKm: number): Promise<void> {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { serviceId: true, addressLat: true, addressLng: true, totalJod: true },
    });
    if (!booking) return;

    // Exclude techs already offered for this booking (any prior round).
    const priorOffers = await prisma.dispatchOffer.findMany({
      where: { bookingId },
      select: { technicianId: true },
    });
    const excludeIds = priorOffers.map((o) => o.technicianId);

    const techs = await this.qualifiedTechs(
      booking.serviceId, booking.addressLat, booking.addressLng, radiusKm, excludeIds,
    );

    const expiresAt = new Date(Date.now() + env().DISPATCH_ACCEPT_TIMEOUT_MS);

    await prisma.$transaction(async (tx) => {
      // Upsert booking dispatch state.
      await tx.booking.update({
        where: { id: bookingId },
        data: { dispatchRound: round, dispatchRadiusKm: radiusKm, dispatchExpiresAt: expiresAt },
      });

      // Create OFFERED rows (skip duplicates via onConflict — idempotent).
      if (techs.length > 0) {
        await Promise.all(techs.map((t) =>
          tx.dispatchOffer.create({
            data: { bookingId, technicianId: t.id, round, radiusKm, status: 'OFFERED' },
          }).catch((err) => {
            // Swallow unique-violation (tech already offered in earlier round).
            if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return;
            throw err;
          }),
        ));
      }
    });

    dispatchRoundsTotal.inc();
    for (const t of techs) dispatchOffersTotal.inc({ result: 'offered' });

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
      if (!booking || booking.status !== 'PENDING') return;

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
        where: { bookingId, status: 'OFFERED' },
        data: { status: 'EXPIRED' },
      });
      if (expired.count > 0) dispatchOffersTotal.inc({ result: 'expired' }, expired.count);

      await this.openRound(bookingId, booking.dispatchRound + 1, nextRadius);
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
      where: { bookingId, technicianId: profile.id, status: 'OFFERED' },
      data: { status: 'REJECTED', respondedAt: new Date() },
    });
    if (updated.count === 0) throw new ConflictError('No active offer for this booking');
    dispatchOffersTotal.inc({ result: 'rejected' });

    // If zero OFFERED offers remain, advance immediately.
    const remaining = await prisma.dispatchOffer.count({
      where: { bookingId, status: 'OFFERED' },
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
      where: { status: 'PENDING', dispatchExpiresAt: { lt: now } },
      select: { id: true },
    });
    for (const b of expired) {
      try { await this.advanceRound(b.id); }
      catch (err) { logger.warn({ err, bookingId: b.id }, 'Dispatch sweep: advanceRound failed'); }
    }

    // (b) Bootstrap: PENDING bookings with no dispatch yet + authorized payment.
    const unstarted = await prisma.booking.findMany({
      where: { status: 'PENDING', dispatchRound: 0 },
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
      if (!fresh || fresh.status !== 'PENDING') return;

      await tx.booking.update({
        where: { id: bookingId, version: fresh.version },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelReason: 'no_technician_available',
          dispatchExpiresAt: null,
          version: { increment: 1 },
        },
      });

      // Reuse existing 'booking.cancelled' outbox flow (void hold + notify).
      await tx.outboxEvent.create({
        data: {
          bookingId,
          eventType: 'booking.cancelled',
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
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return;
      logger.warn({ err, dedupeKey }, 'broadcastOffer: notification insert failed');
    });
  }
}
