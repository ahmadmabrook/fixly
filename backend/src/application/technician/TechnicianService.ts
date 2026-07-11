import { Prisma } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma';
import { redis, TECH_LOCATIONS_KEY, TECH_HEARTBEAT_KEY, pruneStaleTechnicians } from '../../infrastructure/cache/redis';
import { NotFoundError, ForbiddenError, ConflictError, ValidationError } from '../../shared/errors';
import { withdrawalsRequestedTotal } from '../../shared/metrics';
import { haversineKm } from '../../shared/geo';
import { encryptField } from '../../shared/crypto';
import { env } from '../../shared/env';
import { logger } from '../../shared/logger';
import { omitFields } from '../../shared/sanitize';

const MIN_WITHDRAWAL_JOD = 20;
const WITHDRAWAL_COOLDOWN_MS = 24 * 60 * 60 * 1000;
// §2.4: Postgres is now just the fallback/admin-map snapshot — write-through
// at most this often per technician rather than on every live-location ping.
const LOCATION_WRITETHROUGH_COOLDOWN_SECONDS = 10;


interface OnboardingInput {
  serviceIds: string[];
  hourlyRateJod: number;
  vehicle?: string;
  bio?: string;
  idDocUrl?: string;
  certificateUrl?: string;
  selfieUrl?: string;
  introVideoUrl?: string;
  /** Must be true — onboarding requires explicit ToS/SOP consent. */
  agreementAccepted: boolean;
  /** Plaintext national ID (KYC). Encrypted at rest immediately; never stored or
   *  logged in plaintext, and never returned by any read path. */
  nationalId?: string;
}

export class TechnicianService {
  /** Apply to become a technician (or resubmit). Creates/updates the profile in
   *  PENDING and flips the user's role to TECHNICIAN. */
  async apply(userId: string, input: OnboardingInput) {
    if (input.hourlyRateJod < 40 || input.hourlyRateJod > 60) {
      throw new ValidationError('السعر بالساعة يجب أن يكون بين 40 و60 ديناراً');
    }
    if (!input.serviceIds.length) throw new ValidationError('اختر خدمة واحدة على الأقل');
    if (!input.agreementAccepted) throw new ValidationError('يجب الموافقة على الشروط والأحكام');

    const validServices = await prisma.service.findMany({ where: { id: { in: input.serviceIds }, isActive: true }, select: { id: true } });
    if (validServices.length !== input.serviceIds.length) throw new ValidationError('خدمة غير صالحة');

    // Encrypt before touching the DB — never persist (or leave sitting in a local
    // variable longer than necessary) the plaintext national ID.
    const nationalIdEnc = input.nationalId
      ? encryptField(input.nationalId, env().NATIONAL_ID_ENCRYPTION_KEY)
      : undefined;

    return prisma.$transaction(async (tx) => {
      const existing = await tx.technicianProfile.findUnique({ where: { userId } });
      if (existing && (existing.status === 'APPROVED' || existing.status === 'SUSPENDED')) {
        throw new ConflictError('لا يمكن تعديل الطلب بعد الموافقة أو الإيقاف');
      }
      await tx.user.update({ where: { id: userId }, data: { role: 'TECHNICIAN' } });
      const data = {
        status: 'PENDING' as const,
        isVerified: false,
        rejectionReason: null,
        hourlyRateJod: input.hourlyRateJod,
        vehicle: input.vehicle ?? null,
        bio: input.bio ?? null,
        idDocUrl: input.idDocUrl ?? null,
        certificateUrl: input.certificateUrl ?? null,
        selfieUrl: input.selfieUrl ?? null,
        introVideoUrl: input.introVideoUrl ?? null,
        // Preserve a prior acceptance timestamp on resubmit; only set it fresh
        // if not already recorded (consent, once given, doesn't need re-stamping).
        agreementAcceptedAt: existing?.agreementAcceptedAt ?? new Date(),
        services: { set: validServices.map((s) => ({ id: s.id })) },
        // Only overwrite on resubmit if a new value was actually provided —
        // otherwise keep whatever was encrypted on a prior submission.
        ...(nationalIdEnc ? { nationalIdEnc } : {}),
      };
      const profile = await tx.technicianProfile.upsert({
        where: { userId },
        update: data,
        create: { userId, ...data, services: { connect: validServices.map((s) => ({ id: s.id })) } },
        include: { services: { select: { id: true, nameAr: true } } },
      });
      // Never echo the encrypted KYC field back over the API — write-only.
      return omitFields(profile, 'nationalIdEnc');
    });
  }

  async getMe(userId: string) {
    const profile = await prisma.technicianProfile.findUnique({
      where: { userId },
      include: { services: { select: { id: true, nameAr: true, nameEn: true } } },
    });
    if (!profile) throw new NotFoundError('TechnicianProfile');
    return { ...omitFields(profile, 'nationalIdEnc'), platformCommissionPct: env().PLATFORM_COMMISSION_PCT };
  }

  /** Set the profile intro/trust video (§0.3). */
  async setIntroVideo(userId: string, videoUrl: string) {
    const profile = await prisma.technicianProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!profile) throw new NotFoundError('TechnicianProfile');
    return prisma.technicianProfile.update({ where: { userId }, data: { introVideoUrl: videoUrl } });
  }

  private async requireApproved(userId: string) {
    const profile = await prisma.technicianProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundError('TechnicianProfile');
    if (profile.status !== 'APPROVED') throw new ForbiddenError('Technician is not approved');
    return profile;
  }

  async setAvailability(userId: string, isAvailable: boolean) {
    const profile = await this.requireApproved(userId);
    const updated = await prisma.technicianProfile.update({ where: { id: profile.id }, data: { isAvailable } });

    // Going online: refresh the Redis GEO/heartbeat entry from the last-known
    // Postgres position so dispatch doesn't silently exclude this technician
    // just because their app hasn't sent a fresh location ping yet (§2.4).
    if (isAvailable && updated.currentLat != null && updated.currentLng != null) {
      try {
        await redis.geoadd(TECH_LOCATIONS_KEY, updated.currentLng, updated.currentLat, profile.id);
        await redis.zadd(TECH_HEARTBEAT_KEY, Date.now(), profile.id);
      } catch (err) {
        logger.warn({ err, technicianId: profile.id }, 'setAvailability: Redis GEO backfill failed');
      }
    }

    return updated;
  }

  /** Live-location ping (§2.4). Redis GEO + a companion heartbeat sorted set
   *  are written on every call (cheap) so dispatch matching always sees a
   *  fresh position and can prune technicians whose app stopped reporting.
   *  Postgres — now just the fallback/admin-map snapshot — is write-through
   *  at a reduced rate rather than on every ping. */
  async updateLocation(userId: string, lat: number, lng: number) {
    const profile = await this.requireApproved(userId);

    try {
      await redis.geoadd(TECH_LOCATIONS_KEY, lng, lat, profile.id);
      await redis.zadd(TECH_HEARTBEAT_KEY, Date.now(), profile.id);
    } catch (err) {
      logger.warn({ err, technicianId: profile.id }, 'updateLocation: Redis GEO write failed');
    }

    // Rate-limited write-through — same SET NX/EX cooldown convention as
    // AuthService's OTP request cooldown. Fail OPEN (write through anyway) if
    // the cooldown check itself errors, so Postgres doesn't silently go stale
    // for the whole duration of a Redis outage.
    const throttleKey = `loc_writethrough:${profile.id}`;
    let writeThrough = true;
    try {
      writeThrough = (await redis.set(
        throttleKey, '1', 'EX', LOCATION_WRITETHROUGH_COOLDOWN_SECONDS, 'NX',
      )) === 'OK';
    } catch (err) {
      logger.warn({ err, technicianId: profile.id }, 'updateLocation: write-through cooldown check failed, writing through');
    }

    if (writeThrough) {
      return prisma.technicianProfile.update({
        where: { id: profile.id },
        data: { currentLat: lat, currentLng: lng, locationUpdatedAt: new Date() },
      });
    }

    // Throttled — Postgres untouched this call, but the response still
    // reflects the just-submitted position (API contract unchanged).
    return { ...profile, currentLat: lat, currentLng: lng, locationUpdatedAt: new Date() };
  }

  /** Approximate positions of currently-available technicians near a point —
   *  powers the customer-facing "nearby technicians" map preview (Landing
   *  page), reading the same live Redis GEO index the dispatch algorithm
   *  matches against. Falls back to a radius-filtered Postgres scan (same
   *  haversine convention as DispatchService.qualifiedTechsFallback) not
   *  only when Redis errors, but also when it returns zero candidates —
   *  unlike DispatchService, a false "nobody's near you" here is a visible,
   *  confusing customer-facing gap (an empty map), not just a slower dispatch
   *  round, so it's worth the extra Postgres scan to double-check. */
  async nearbyAvailable(lat: number, lng: number, radiusKm = 15, limit = 20) {
    await pruneStaleTechnicians();

    let ids: string[] | null = null;
    try {
      ids = (await redis.geosearch(
        TECH_LOCATIONS_KEY,
        'FROMLONLAT', lng, lat,
        'BYRADIUS', radiusKm, 'km',
        'ASC',
        'COUNT', limit,
      )) as string[];
    } catch (err) {
      logger.warn({ err }, 'nearbyAvailable: Redis GEO search unavailable, falling back to Postgres scan');
    }

    if (ids && ids.length > 0) {
      const techs = await prisma.technicianProfile.findMany({
        where: { id: { in: ids }, status: 'APPROVED', isAvailable: true },
        select: {
          id: true,
          currentLat: true,
          currentLng: true,
          rating: true,
          isVerified: true,
          vehicle: true,
          user: { select: { name: true } },
        },
        take: limit,
      });
      const mapped = techs
        .filter((t) => t.currentLat != null && t.currentLng != null)
        .map((t) => ({
          id: t.id,
          name: t.user.name,
          lat: t.currentLat!,
          lng: t.currentLng!,
          rating: t.rating,
          isVerified: t.isVerified,
          vehicle: t.vehicle,
        }));
      // The GEO index can hold ids that are no longer available/approved
      // (§2.4 prunes on missed heartbeats, not on status/availability
      // changes) — if none of the candidate ids actually resolved to a
      // usable technician, fall through to the broader Postgres scan below
      // rather than reporting a false "nobody nearby".
      if (mapped.length > 0) return mapped;
    }

    const candidates = await prisma.technicianProfile.findMany({
      where: { status: 'APPROVED', isAvailable: true, currentLat: { not: null }, currentLng: { not: null } },
      select: {
        id: true,
        currentLat: true,
        currentLng: true,
        rating: true,
        isVerified: true,
        vehicle: true,
        user: { select: { name: true } },
      },
    });

    return candidates
      .filter((t) => haversineKm(lat, lng, t.currentLat!, t.currentLng!) <= radiusKm)
      .slice(0, limit)
      .map((t) => ({
        id: t.id,
        name: t.user.name,
        lat: t.currentLat!,
        lng: t.currentLng!,
        rating: t.rating,
        isVerified: t.isVerified,
        vehicle: t.vehicle,
      }));
  }

  /** Jobs actively offered to this technician via dispatch. Only bookings with an
   *  OFFERED DispatchOffer for this tech are returned (no longer a free-for-all).
   *  Coarse data only — exact address withheld until assigned. */
  async nearbyJobs(userId: string, limit = 20) {
    const profile = await prisma.technicianProfile.findUnique({
      where: { userId },
      include: { services: { select: { id: true } } },
    });
    if (!profile) throw new NotFoundError('TechnicianProfile');
    if (profile.status !== 'APPROVED') throw new ForbiddenError('Technician is not approved');

    // Only bookings with an active OFFERED dispatch offer for this tech.
    const offers = await prisma.dispatchOffer.findMany({
      where: { technicianId: profile.id, status: 'OFFERED' },
      select: {
        round: true,
        booking: {
          select: {
            id: true, totalJod: true, addressLat: true, addressLng: true, dispatchExpiresAt: true,
            service: { select: { nameAr: true, nameEn: true, priceJod: true, durationMin: true } },
          },
        },
      },
      take: 100,
    });

    return offers
      .map((o) => ({
        id: o.booking.id,
        totalJod: o.booking.totalJod,
        service: o.booking.service,
        round: o.round,
        expiresAt: o.booking.dispatchExpiresAt?.toISOString() ?? null,
        distanceKm:
          profile.currentLat != null && profile.currentLng != null
            ? Number(haversineKm(profile.currentLat, profile.currentLng, o.booking.addressLat, o.booking.addressLng).toFixed(1))
            : null,
      }))
      .sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9))
      .slice(0, limit);
  }

  /** Earnings summary (today / month / total) + withdrawable balance. Earnings
   *  accrue as Payout rows (technician net per captured payment); withdrawals
   *  are a separate cash-out ledger that doesn't touch payout accrual. */
  async earnings(userId: string) {
    const profile = await prisma.technicianProfile.findUnique({ where: { userId }, select: { id: true, lastWithdrawalAt: true } });
    if (!profile) throw new NotFoundError('TechnicianProfile');

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [total, today, month, withdrawnAgg, pendingWithdrawAgg, lastWithdrawal] = await Promise.all([
      prisma.payout.aggregate({ _sum: { amountJod: true }, where: { technicianId: profile.id } }),
      prisma.payout.aggregate({ _sum: { amountJod: true }, where: { technicianId: profile.id, createdAt: { gte: startOfToday } } }),
      prisma.payout.aggregate({ _sum: { amountJod: true }, where: { technicianId: profile.id, createdAt: { gte: startOfMonth } } }),
      prisma.withdrawalRequest.aggregate({ _sum: { amountJod: true }, where: { technicianId: profile.id, status: 'PAID' } }),
      prisma.withdrawalRequest.aggregate({ _sum: { amountJod: true }, where: { technicianId: profile.id, status: { in: ['REQUESTED', 'PROCESSING'] } } }),
      prisma.withdrawalRequest.findFirst({ where: { technicianId: profile.id, iban: { not: null } }, orderBy: { createdAt: 'desc' }, select: { iban: true, bankName: true } }),
    ]);

    const earned = new Prisma.Decimal(total._sum.amountJod ?? 0);
    const withdrawn = new Prisma.Decimal(withdrawnAgg._sum.amountJod ?? 0);
    const pendingWithdraw = new Prisma.Decimal(pendingWithdrawAgg._sum.amountJod ?? 0);
    const balance = earned.minus(withdrawn).minus(pendingWithdraw);

    return {
      todayJod: (today._sum.amountJod ?? new Prisma.Decimal(0)).toString(),
      monthJod: (month._sum.amountJod ?? new Prisma.Decimal(0)).toString(),
      totalJod: earned.toString(),
      balanceJod: (balance.isNegative() ? new Prisma.Decimal(0) : balance).toString(),
      lastWithdrawalAt: profile.lastWithdrawalAt,
      savedIban: lastWithdrawal?.iban ?? null,
      savedBankName: lastWithdrawal?.bankName ?? null,
    };
  }

  async requestWithdrawal(userId: string, amountJod: number, iban?: string, bankName?: string) {
    const profile = await this.requireApproved(userId);
    if (amountJod < MIN_WITHDRAWAL_JOD) throw new ValidationError(`الحد الأدنى للسحب ${MIN_WITHDRAWAL_JOD} ديناراً`);

    if (profile.lastWithdrawalAt && Date.now() - profile.lastWithdrawalAt.getTime() < WITHDRAWAL_COOLDOWN_MS) {
      throw new ConflictError('يمكنك السحب مرة واحدة كل 24 ساعة');
    }
    const { balanceJod } = await this.earnings(userId);
    if (new Prisma.Decimal(amountJod).greaterThan(balanceJod)) {
      throw new ValidationError('المبلغ يتجاوز رصيدك المتاح');
    }

    // Fall back to the saved profile bank details when the request omits them —
    // existing callers that always pass iban/bankName explicitly are unaffected.
    const resolvedIban = iban ?? profile.bankIban ?? undefined;
    const resolvedBankName = bankName ?? profile.bankName ?? undefined;

    // The DB has a partial-unique index allowing at most ONE in-flight
    // (REQUESTED/PROCESSING) withdrawal per technician. That closes the
    // balance/cooldown TOCTOU race: two concurrent requests both pass the checks
    // above, but only one INSERT survives — the other hits a unique violation.
    try {
      const withdrawal = await prisma.$transaction(async (tx) => {
        const created = await tx.withdrawalRequest.create({
          data: { technicianId: profile.id, amountJod, iban: resolvedIban ?? null, bankName: resolvedBankName ?? null, status: 'REQUESTED' },
        });
        await tx.technicianProfile.update({ where: { id: profile.id }, data: { lastWithdrawalAt: new Date() } });
        return created;
      });
      withdrawalsRequestedTotal.inc();
      return withdrawal;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictError('لديك طلب سحب قيد المعالجة بالفعل');
      }
      throw err;
    }
  }

  async listWithdrawals(userId: string) {
    const profile = await prisma.technicianProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!profile) throw new NotFoundError('TechnicianProfile');
    return prisma.withdrawalRequest.findMany({ where: { technicianId: profile.id }, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  /** Self-service scorecard (GET /technician/scorecard). Resolves the profile
   *  id from the authenticated user, then delegates to the shared computation. */
  async getMyScorecard(userId: string) {
    const profile = await prisma.technicianProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!profile) throw new NotFoundError('TechnicianProfile');
    return this.computeScorecard(profile.id);
  }

  /** Admin scorecard (GET /admin/technicians/:id/scorecard) — id is the
   *  TechnicianProfile id, not the userId. */
  async getScorecardById(technicianId: string) {
    const profile = await prisma.technicianProfile.findUnique({ where: { id: technicianId }, select: { id: true } });
    if (!profile) throw new NotFoundError('TechnicianProfile');
    return this.computeScorecard(technicianId);
  }

  /**
   * Computed quality metrics for a technician (never stored — always derived
   * from the source rows so they can't drift):
   *  - onTimeRate: % of ARRIVED+ bookings where arrivedAt <= slaArriveBy
   *  - redoRate: % of completed bookings with a resolved (non-open) guarantee ticket
   *  - complaintRate: % of bookings with an UPHELD conduct report against this tech
   *  - acceptanceRate: % of this tech's dispatch offers that were ACCEPTED
   */
  private async computeScorecard(technicianId: string) {
    const [
      arrivedTotal,
      onTimeRows,
      completedTotal,
      guaranteeCount,
      bookingsTotal,
      upheldComplaintCount,
      offersTotal,
      offersAccepted,
    ] = await Promise.all([
      prisma.booking.count({ where: { technicianId, arrivedAt: { not: null } } }),
      // Two-column comparison (arrivedAt <= slaArriveBy) isn't expressible in the
      // Prisma filter DSL — raw count, mirrors AdminOpsService's raw-query convention.
      prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count FROM bookings
        WHERE "technicianId" = ${technicianId}::uuid
          AND "arrivedAt" IS NOT NULL
          AND "slaArriveBy" IS NOT NULL
          AND "arrivedAt" <= "slaArriveBy"
      `,
      prisma.booking.count({ where: { technicianId, status: 'COMPLETED' } }),
      prisma.guaranteeTicket.count({ where: { status: { not: 'OPEN' }, booking: { technicianId } } }),
      prisma.booking.count({ where: { technicianId } }),
      prisma.conductReport.count({ where: { status: 'UPHELD', subjectTechId: technicianId } }),
      prisma.dispatchOffer.count({ where: { technicianId } }),
      prisma.dispatchOffer.count({ where: { technicianId, status: 'ACCEPTED' } }),
    ]);
    const onTimeCount = Number(onTimeRows[0]?.count ?? 0);

    const rate = (n: number, d: number) => (d > 0 ? Number(((n / d) * 100).toFixed(1)) : 0);

    return {
      onTimeRate: rate(onTimeCount, arrivedTotal),
      redoRate: rate(guaranteeCount, completedTotal),
      complaintRate: rate(upheldComplaintCount, bookingsTotal),
      acceptanceRate: rate(offersAccepted, offersTotal),
      sampleSizes: {
        arrivedBookings: arrivedTotal,
        completedBookings: completedTotal,
        totalBookings: bookingsTotal,
        dispatchOffers: offersTotal,
      },
    };
  }

  /** Notification toggles (Figma TechNotifications screen). Row is created
   *  lazily with all-true defaults on first read. */
  async getNotificationPrefs(userId: string) {
    const profile = await prisma.technicianProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!profile) throw new NotFoundError('TechnicianProfile');
    const prefs = await prisma.technicianNotificationPrefs.upsert({
      where: { technicianId: profile.id },
      update: {},
      create: { technicianId: profile.id },
    });
    return {
      newJobRequests: prefs.newJobRequests,
      reminders: prefs.reminders,
      earningsUpdates: prefs.earningsUpdates,
      promotions: prefs.promotions,
    };
  }

  /** Partial update of notification toggles — only the provided keys change. */
  async updateNotificationPrefs(userId: string, input: Partial<{
    newJobRequests: boolean;
    reminders: boolean;
    earningsUpdates: boolean;
    promotions: boolean;
  }>) {
    const profile = await prisma.technicianProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!profile) throw new NotFoundError('TechnicianProfile');
    const prefs = await prisma.technicianNotificationPrefs.upsert({
      where: { technicianId: profile.id },
      update: input,
      create: { technicianId: profile.id, ...input },
    });
    return {
      newJobRequests: prefs.newJobRequests,
      reminders: prefs.reminders,
      earningsUpdates: prefs.earningsUpdates,
      promotions: prefs.promotions,
    };
  }

  /** Saved payout bank details (profile-level, independent of any one
   *  withdrawal request). */
  async getBankAccount(userId: string) {
    const profile = await prisma.technicianProfile.findUnique({ where: { userId }, select: { bankIban: true, bankName: true } });
    if (!profile) throw new NotFoundError('TechnicianProfile');
    return { iban: profile.bankIban, bankName: profile.bankName };
  }

  async updateBankAccount(userId: string, iban: string, bankName: string) {
    const profile = await prisma.technicianProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!profile) throw new NotFoundError('TechnicianProfile');
    const updated = await prisma.technicianProfile.update({
      where: { id: profile.id },
      data: { bankIban: iban, bankName },
      select: { bankIban: true, bankName: true },
    });
    return { iban: updated.bankIban, bankName: updated.bankName };
  }

  /** Post-approval edit of services/hourly-rate — separate from onboarding's
   *  apply(), which locks once APPROVED. Only usable by already-APPROVED
   *  technicians (PENDING/REJECTED/SUSPENDED still go through onboarding). */
  async updateServicesPricing(userId: string, serviceIds: string[], hourlyRateJod: number) {
    if (hourlyRateJod < 40 || hourlyRateJod > 60) {
      throw new ValidationError('السعر بالساعة يجب أن يكون بين 40 و60 ديناراً');
    }
    if (!serviceIds.length) throw new ValidationError('اختر خدمة واحدة على الأقل');

    const profile = await prisma.technicianProfile.findUnique({ where: { userId }, select: { id: true, status: true } });
    if (!profile) throw new NotFoundError('TechnicianProfile');
    if (profile.status !== 'APPROVED') throw new ForbiddenError('Technician is not approved');

    const validServices = await prisma.service.findMany({ where: { id: { in: serviceIds }, isActive: true }, select: { id: true } });
    if (validServices.length !== serviceIds.length) throw new ValidationError('خدمة غير صالحة');

    const updated = await prisma.technicianProfile.update({
      where: { id: profile.id },
      data: { hourlyRateJod, services: { set: validServices.map((s) => ({ id: s.id })) } },
      include: { services: { select: { id: true, nameAr: true, nameEn: true } } },
    });
    return omitFields(updated, 'nationalIdEnc');
  }
}
