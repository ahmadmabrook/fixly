import { prisma } from '../../infrastructure/database/prisma';
import { audit } from './adminAudit';
import { ConflictError, NotFoundError } from '../../shared/errors';
import { env } from '../../shared/env';
import { logger } from '../../shared/logger';
import { payoutReconciledTotal, payoutStuckGauge } from '../../shared/metrics';
import type { IPayoutProvider } from '../../domain/providers/IPayoutProvider';
import type { PaymentService } from '../payment/PaymentService';
import { PAYOUT_INCLUDE } from './AdminService.reads';

/**
 * Payout disbursement/reconciliation and admin-initiated refund flow,
 * extracted from AdminService (see that file for the full class overview).
 * Depends on the same payout provider + PaymentService AdminService is
 * constructed with.
 */
export class AdminPayoutFlow {
  constructor(
    private readonly payoutProvider: IPayoutProvider,
    private readonly paymentService: PaymentService,
  ) {}

  /**
   * Admin-initiated (partial or full) refund of a booking's captured payment,
   * with an audit trail. Delegates the money mechanics + guards to
   * PaymentService.refundBooking.
   */
  async refundBookingPayment(bookingId: string, amountJod: number | string, actorId: string, ip?: string) {
    const payment = await this.paymentService.refundBooking(bookingId, amountJod);
    await audit(prisma, actorId, 'payment.refund', { type: 'Booking', id: bookingId }, { amountJod: String(amountJod) }, ip);
    return payment;
  }

  /**
   * Disburse a payout to a technician. Three phases so the external transfer
   * never runs inside a DB transaction:
   *  1. atomically claim PENDING → PROCESSING (idempotent: a COMPLETED payout
   *     short-circuits, a re-entrant claim is a no-op),
   *  2. call the payout provider OUTSIDE any tx (FAILED on error),
   *  3. finalize COMPLETED + PAYOUT ledger entry + audit in one tx.
   */
  async processPayout(id: string, actorId: string, ip?: string) {
    const payout = await prisma.payout.findUnique({
      where: { id },
      include: { technician: { select: { user: { select: { isActive: true } } } } },
    });
    if (!payout) throw new NotFoundError('Payout');
    if (payout.status === 'COMPLETED') {
      return prisma.payout.findUniqueOrThrow({ where: { id }, include: PAYOUT_INCLUDE });
    }
    // N-6: never disburse to a deactivated technician — funds stay PENDING until
    // the account is restored (or the payout is handled manually).
    if (!payout.technician.user.isActive) {
      throw new ConflictError('Technician account is inactive — payout blocked');
    }

    // Phase 1 — atomic claim.
    const claimed = await prisma.payout.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'PROCESSING' },
    });
    if (claimed.count === 0) {
      const current = await prisma.payout.findUnique({ where: { id } });
      if (current?.status === 'COMPLETED') {
        return prisma.payout.findUniqueOrThrow({ where: { id }, include: PAYOUT_INCLUDE });
      }
      throw new ConflictError(`Payout is ${current?.status ?? 'unknown'}`);
    }

    // Phase 2 — external disbursement (outside any transaction).
    let providerRef: string;
    try {
      ({ providerRef } = await this.payoutProvider.disburse(id, Number(payout.amountJod)));
    } catch {
      // Provider rejected outright → no money moved → safe to mark FAILED.
      await prisma.payout.updateMany({ where: { id, status: 'PROCESSING' }, data: { status: 'FAILED' } });
      throw new ConflictError('Payout disbursement failed');
    }

    // Phase 3 — finalize (transition-guarded; idempotent vs. reconciliation).
    await this.finalizePayout(id, Number(payout.amountJod), providerRef, actorId, ip);
    return prisma.payout.findUniqueOrThrow({ where: { id }, include: PAYOUT_INCLUDE });
  }

  /**
   * Flip a PROCESSING payout → COMPLETED + write the PAYOUT ledger entry, under
   * a transition guard so a request finalize and a concurrent reconciliation
   * can never both apply it (no duplicate ledger / double accounting). The
   * ledger + audit are written ONLY by whichever caller wins the transition.
   * `actorId` is omitted for system reconciliation (no real admin actor).
   */
  private async finalizePayout(
    id: string,
    amountJod: number,
    providerRef: string,
    actorId?: string,
    ip?: string,
  ): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
      const claim = await tx.payout.updateMany({
        where: { id, status: 'PROCESSING' },
        data: { status: 'COMPLETED', processedAt: new Date() },
      });
      if (claim.count === 0) return false; // someone else already finalized it
      await tx.ledgerEntry.create({
        data: { payoutId: id, type: 'PAYOUT', direction: 'DEBIT', currency: env().CURRENCY, amountJod, description: `Payout ${id} (${providerRef})` },
      });
      if (actorId) {
        await audit(tx, actorId, 'payout.process', { type: 'Payout', id }, { amountJod, providerRef }, ip);
      }
      return true;
    });
  }

  /**
   * Reconcile payouts stuck in PROCESSING — the crash window between an external
   * disbursement and the finalize commit. For each, ask the provider for the
   * authoritative state (keyed by payoutId) and:
   *   COMPLETED → finalize (money was sent; complete + ledger),
   *   FAILED    → mark FAILED (safe to retry; no money moved),
   *   PENDING/UNKNOWN → leave for the next cycle (never auto-fail an unknown).
   * Runs on a timer from main.ts. Returns the number resolved.
   */
  async reconcileStuckPayouts(): Promise<number> {
    const stuck = await prisma.payout.findMany({ where: { status: 'PROCESSING' }, select: { id: true, amountJod: true } });
    payoutStuckGauge.set(stuck.length);
    let resolved = 0;

    for (const payout of stuck) {
      let state: 'COMPLETED' | 'FAILED' | 'PENDING' | 'UNKNOWN';
      let providerRef: string | undefined;
      try {
        ({ state, providerRef } = await this.payoutProvider.getStatus(payout.id));
      } catch (err) {
        logger.warn({ err, payoutId: payout.id }, 'reconcile: provider status query failed, leaving PROCESSING');
        continue;
      }

      if (state === 'COMPLETED') {
        const applied = await this.finalizePayout(payout.id, Number(payout.amountJod), providerRef ?? `reconciled_${payout.id}`);
        if (applied) {
          resolved++;
          payoutReconciledTotal.inc({ outcome: 'completed' });
          logger.warn({ payoutId: payout.id }, 'reconcile: finalized a stuck payout (provider COMPLETED)');
        }
      } else if (state === 'FAILED') {
        const failed = await prisma.payout.updateMany({ where: { id: payout.id, status: 'PROCESSING' }, data: { status: 'FAILED' } });
        if (failed.count > 0) {
          resolved++;
          payoutReconciledTotal.inc({ outcome: 'failed' });
          logger.warn({ payoutId: payout.id }, 'reconcile: marked a stuck payout FAILED (provider FAILED)');
        }
      } else {
        payoutReconciledTotal.inc({ outcome: 'unresolved' });
        logger.warn({ payoutId: payout.id, state }, 'reconcile: payout state still unresolved, will retry');
      }
    }

    payoutStuckGauge.set(stuck.length - resolved);
    return resolved;
  }
}
