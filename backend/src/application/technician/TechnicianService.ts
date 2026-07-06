import { Prisma } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma';
import { NotFoundError, ForbiddenError, ConflictError, ValidationError } from '../../shared/errors';
import { withdrawalsRequestedTotal } from '../../shared/metrics';
import { haversineKm } from '../../shared/geo';

const MIN_WITHDRAWAL_JOD = 20;
const WITHDRAWAL_COOLDOWN_MS = 24 * 60 * 60 * 1000;


interface OnboardingInput {
  serviceIds: string[];
  hourlyRateJod: number;
  vehicle?: string;
  bio?: string;
  idDocUrl?: string;
  certificateUrl?: string;
  selfieUrl?: string;
}

export class TechnicianService {
  /** Apply to become a technician (or resubmit). Creates/updates the profile in
   *  PENDING and flips the user's role to TECHNICIAN. */
  async apply(userId: string, input: OnboardingInput) {
    if (input.hourlyRateJod < 40 || input.hourlyRateJod > 60) {
      throw new ValidationError('السعر بالساعة يجب أن يكون بين 40 و60 ديناراً');
    }
    if (!input.serviceIds.length) throw new ValidationError('اختر خدمة واحدة على الأقل');

    const validServices = await prisma.service.findMany({ where: { id: { in: input.serviceIds }, isActive: true }, select: { id: true } });
    if (validServices.length !== input.serviceIds.length) throw new ValidationError('خدمة غير صالحة');

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
        services: { set: validServices.map((s) => ({ id: s.id })) },
      };
      return tx.technicianProfile.upsert({
        where: { userId },
        update: data,
        create: { userId, ...data, services: { connect: validServices.map((s) => ({ id: s.id })) } },
        include: { services: { select: { id: true, nameAr: true } } },
      });
    });
  }

  async getMe(userId: string) {
    const profile = await prisma.technicianProfile.findUnique({
      where: { userId },
      include: { services: { select: { id: true, nameAr: true, nameEn: true } } },
    });
    if (!profile) throw new NotFoundError('TechnicianProfile');
    return profile;
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
    return prisma.technicianProfile.update({ where: { id: profile.id }, data: { isAvailable } });
  }

  async updateLocation(userId: string, lat: number, lng: number) {
    const profile = await this.requireApproved(userId);
    return prisma.technicianProfile.update({
      where: { id: profile.id },
      data: { currentLat: lat, currentLng: lng, locationUpdatedAt: new Date() },
    });
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

    // The DB has a partial-unique index allowing at most ONE in-flight
    // (REQUESTED/PROCESSING) withdrawal per technician. That closes the
    // balance/cooldown TOCTOU race: two concurrent requests both pass the checks
    // above, but only one INSERT survives — the other hits a unique violation.
    try {
      const withdrawal = await prisma.$transaction(async (tx) => {
        const created = await tx.withdrawalRequest.create({
          data: { technicianId: profile.id, amountJod, iban: iban ?? null, bankName: bankName ?? null, status: 'REQUESTED' },
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
}
