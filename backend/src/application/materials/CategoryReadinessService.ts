import { BookingStatus, QuoteStatus, VerificationStatus, ReadinessState } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma';
import { BPS_DENOMINATOR } from './constants';

/**
 * §17.5.15 — the quantitative L1→L2 promotion trigger. A quote_first category
 * (e.g. Painting) may switch on only once quotesClosed/disputeBps/
 * priceDeviationBps all clear their thresholds simultaneously — replacing
 * "the founder feels ready" with a number recomputed after every closed quote.
 */
export class CategoryReadinessService {
  async get(serviceId: string) {
    return prisma.categoryReadinessGate.findUnique({ where: { serviceId } });
  }

  async list(limit = 50, offset = 0) {
    const [items, total] = await prisma.$transaction([
      prisma.categoryReadinessGate.findMany({
        orderBy: { updatedAt: 'desc' },
        take: limit,
        skip: offset,
        include: { service: { select: { nameAr: true, nameEn: true, pricingModel: true } } },
      }),
      prisma.categoryReadinessGate.count(),
    ]);
    return { items, total };
  }

  /**
   * Recomputes the three metrics for `serviceId` from every executed
   * (ACCEPTED quote -> COMPLETED booking) quote_first quote, and flips
   * COLLECTING -> READY once all three thresholds hold. Never auto-demotes
   * READY back to COLLECTING and never touches BLOCKED (a manual override,
   * outside this method's scope — there is deliberately no write endpoint for
   * it here; §17.5.15 frames this as a one-way promotion trigger, not a
   * continuously-flapping status).
   *
   * "Disputed", for the dispute-rate metric: a quote's booking counts as
   * disputed if it ever reached BookingStatus.DISPUTED, or if any of its
   * BookingMaterial lines has a material-verification request that actually
   * DEDUCTED money (§17.5.14) — i.e. a confirmed overcharge, not merely an
   * opened-then-cleared (UPHELD) request.
   *
   * "Final vs estimated", for the price-deviation metric: estimated = the
   * accepted quote's frozen labourFils+materialsFils (quote_lines are
   * immutable after acceptance, §17.5.11, so this is stable); final =
   * Booking.totalJod. Extra-work approved post-acceptance (AdditionalWorkItem)
   * is intentionally excluded — it is a distinct, customer-approved gate
   * (§0.2 #3), not a failure of the original estimate's accuracy.
   */
  async recomputeForService(serviceId: string) {
    const executed = await prisma.bookingQuote.findMany({
      where: { serviceId, status: QuoteStatus.ACCEPTED, booking: { status: BookingStatus.COMPLETED } },
      select: {
        labourFils: true,
        materialsFils: true,
        booking: {
          select: {
            status: true,
            totalJod: true,
            verificationRequests: { select: { status: true } },
          },
        },
      },
    });

    const executedTotal = executed.length;
    let disputedCount = 0;
    let deviationSumBps = 0;
    let deviationSamples = 0;

    for (const quote of executed) {
      const booking = quote.booking;
      if (!booking) continue;

      const confirmedOvercharge = booking.verificationRequests.some((v) => v.status === VerificationStatus.DEDUCTED);
      if (booking.status === BookingStatus.DISPUTED || confirmedOvercharge) disputedCount++;

      const estimatedFils = (quote.labourFils ?? 0) + (quote.materialsFils ?? 0);
      if (estimatedFils > 0) {
        const finalFils = Math.round(Number(booking.totalJod) * 1000);
        const deviationBps = Math.round((Math.abs(finalFils - estimatedFils) / estimatedFils) * BPS_DENOMINATOR);
        deviationSumBps += deviationBps;
        deviationSamples++;
      }
    }

    const quotesClosed = executedTotal - disputedCount;
    const disputeBps = executedTotal > 0 ? Math.round((disputedCount / executedTotal) * BPS_DENOMINATOR) : 0;
    const priceDeviationBps = deviationSamples > 0 ? Math.round(deviationSumBps / deviationSamples) : 0;

    const existing = await prisma.categoryReadinessGate.findUnique({ where: { serviceId } });
    const quotesRequired = existing?.quotesRequired ?? 50;
    const maxDisputeBps = existing?.maxDisputeBps ?? 800;
    const maxPriceDeviationBps = existing?.maxPriceDeviationBps ?? 1500;
    const thresholdsMet = quotesClosed >= quotesRequired && disputeBps < maxDisputeBps && priceDeviationBps < maxPriceDeviationBps;

    // One-way promotion only: READY and BLOCKED are sticky; COLLECTING
    // promotes to READY the first time thresholds are met simultaneously.
    const nextState =
      existing?.state === ReadinessState.READY || existing?.state === ReadinessState.BLOCKED
        ? existing.state
        : thresholdsMet
          ? ReadinessState.READY
          : ReadinessState.COLLECTING;
    const justPromoted = nextState === ReadinessState.READY && existing?.openedAt == null;

    return prisma.categoryReadinessGate.upsert({
      where: { serviceId },
      create: {
        serviceId,
        quotesClosed,
        disputeBps,
        priceDeviationBps,
        state: nextState,
        openedAt: justPromoted ? new Date() : null,
        lastEvaluatedAt: new Date(),
      },
      update: {
        quotesClosed,
        disputeBps,
        priceDeviationBps,
        state: nextState,
        ...(justPromoted ? { openedAt: new Date() } : {}),
        lastEvaluatedAt: new Date(),
      },
    });
  }
}
