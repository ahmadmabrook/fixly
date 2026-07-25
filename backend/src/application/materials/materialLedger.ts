import { Prisma, PayoutStatus, LedgerType, LedgerDirection } from '@prisma/client';
import { env } from '../../shared/env';
import { logger } from '../../shared/logger';
import { fromMinorUnits } from '../../shared/money';
import { PrismaErrorCode } from '../../shared/errors';

type Tx = Prisma.TransactionClient;

export type VarianceDeductionResult =
  | { applied: true }
  | { applied: false; reason: 'insufficient_pending_payout' };

/** Thrown internally when the refKey uniqueness guard shows this exact
 *  deduction already landed (concurrent/retried settlement). Callers should
 *  treat this as success-already-happened, not as a failure. */
export class DeductionAlreadyAppliedError extends Error {
  constructor() {
    super('Variance deduction already posted for this verification request');
  }
}

/**
 * §17.5.14 step 4 — deduct a material-price variance from the technician's
 * dues. Deliberately NOT routed through `PaymentService.ledger`'s
 * `postLedgerEntry`: that helper is hardwired to a required `paymentId` and
 * its `LEDGER_DIRECTION` map has `ADJUSTMENT` → CREDIT, neither of which fits
 * this posting (tied to neither a Payment nor a Payout by default, and a
 * DEBIT from the technician's perspective, not the platform's).
 *
 * HOW "THE TECHNICIAN'S DUES" MAPS ONTO THIS SCHEMA (read before changing
 * this function): `Payout` rows are NOT a running balance. Each is minted 1:1
 * with a captured `Payment` at capture time
 * (`PaymentService.captureRefund.ts::finalizeCapture`), holding the
 * commission-split net for THAT booking only (`Payout.paymentId` is
 * `@unique`). `TechnicianService.earnings()` computes `balanceJod` as
 * `SUM(Payout.amountJod) − withdrawn − pendingWithdraw`, clamped at 0 — it is
 * NOT ledger-derived. So a deduction only actually reduces what the
 * technician can withdraw if it shrinks a real, still-PENDING
 * `Payout.amountJod` row; writing a LedgerEntry alone (a literal reading of
 * the design doc's "a ledger_entries adjustment") would be exactly the
 * orphaned audit row this was built to avoid.
 *
 * This function decrements the technician's OLDEST still-PENDING Payout by
 * the delta (CAS-guarded: PENDING status + amountJod >= delta, so it can
 * never race a concurrent `AdminPayoutFlow.processPayout` claim or
 * double-apply), and posts a paired LedgerEntry (payoutId set, type
 * ADJUSTMENT, direction DEBIT, refKey `matverif:{id}` for exactly-once —
 * mirrors the `ServiceCredit.refKey` / other `LedgerEntry.refKey` idiom).
 *
 * KNOWN GAP (flagged to the lead rather than guessed at — see the
 * SendMessage sent alongside this code): if the technician currently has NO
 * pending payout covering the delta — either because the disputed booking's
 * payment hasn't been captured yet (BOM variance disputes typically surface
 * WHILE a job is IN_PROGRESS, before completion/capture even creates a
 * Payout), or because their existing payouts have already been disbursed —
 * there is no schema-supported way to carry the debt forward.
 * `Payout.amountJod` is implicitly non-negative everywhere it's read (the
 * payout provider's `disburse(amountJod)` call, `earnings()`'s
 * clamp-at-zero, admin reporting). Closing that gap for real means either
 * allowing negative Payout rows (auditing every reader of
 * `Payout.amountJod`) or adding a proper technician running-balance ledger —
 * both are payment-logic restructuring, not a "dedicated posting function".
 * Apply when possible; when not, return `insufficient_pending_payout` so the
 * caller leaves the request OPEN (never marks DEDUCTED without having
 * actually reduced payable funds) for a later run — or a human — to resolve.
 */
export async function postVarianceDeduction(
  tx: Tx,
  params: { verificationRequestId: string; technicianId: string; bookingId: string; deltaFils: number; description: string },
): Promise<VarianceDeductionResult> {
  const { verificationRequestId, technicianId, bookingId, deltaFils, description } = params;
  const refKey = `matverif:${verificationRequestId}`;
  const delta = fromMinorUnits(deltaFils);

  if (!delta.greaterThan(0)) return { applied: true }; // nothing owed — nothing to deduct

  const candidate = await tx.payout.findFirst({
    where: { technicianId, status: PayoutStatus.PENDING, amountJod: { gte: delta } },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (!candidate) {
    logger.error(
      { technicianId, bookingId, verificationRequestId, deltaFils },
      'materials: no PENDING payout covers the variance deduction — manual review required',
    );
    return { applied: false, reason: 'insufficient_pending_payout' };
  }

  // CAS-guarded decrement: re-checks PENDING + amountJod >= delta atomically
  // (Postgres row-locks the UPDATE) so a concurrent processPayout claim or a
  // second deduction attempt against the same payout can't both apply.
  const claim = await tx.payout.updateMany({
    where: { id: candidate.id, status: PayoutStatus.PENDING, amountJod: { gte: delta } },
    data: { amountJod: { decrement: delta } },
  });
  if (claim.count === 0) {
    logger.warn(
      { technicianId, bookingId, verificationRequestId, payoutId: candidate.id },
      'materials: payout raced during variance deduction, will retry next run',
    );
    return { applied: false, reason: 'insufficient_pending_payout' };
  }

  try {
    await tx.ledgerEntry.create({
      data: {
        payoutId: candidate.id,
        type: LedgerType.ADJUSTMENT,
        direction: LedgerDirection.DEBIT,
        currency: env().CURRENCY,
        amountJod: delta,
        description,
        refKey,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === PrismaErrorCode.UNIQUE_CONSTRAINT_VIOLATION) {
      // A concurrent/retried settlement already posted this exact refKey.
      // Throw so the transaction rolls back — including the decrement we just
      // made above — leaving state exactly as if this call never ran; the
      // caller treats this as "already applied", not a failure.
      throw new DeductionAlreadyAppliedError();
    }
    throw e;
  }

  return { applied: true };
}
