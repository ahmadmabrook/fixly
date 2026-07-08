import { Prisma, LedgerType, LedgerDirection } from '@prisma/client';
import { env } from '../../shared/env';
import { toDecimal } from '../../shared/money';
import { AppError } from '../../shared/errors';
import { logger } from '../../shared/logger';

type Tx = Prisma.TransactionClient;

/** Cash-direction of each ledger type (CREDIT = into platform, DEBIT = out). */
const LEDGER_DIRECTION: Record<LedgerType, LedgerDirection> = {
  CHARGE: 'CREDIT',
  CAPTURE: 'CREDIT',
  FEE: 'CREDIT',
  REFUND: 'DEBIT',
  PAYOUT: 'DEBIT',
  DISPUTE: 'DEBIT',
  CHARGEBACK: 'DEBIT',
  ADJUSTMENT: 'CREDIT',
};

/** Shared ledger-posting helper for the payment flows below. */
export async function postLedgerEntry(
  tx: Tx,
  paymentId: string,
  type: LedgerType,
  amount: Prisma.Decimal,
  description: string,
): Promise<void> {
  await tx.ledgerEntry.create({
    data: { paymentId, type, direction: LEDGER_DIRECTION[type], amountJod: amount, currency: env().CURRENCY, description },
  });
}

/**
 * Captured amount for a payment that should be CAPTURED/PARTIALLY_REFUNDED. The column is
 * always written by `finalizeCapture`, so a null here is data corruption. We return 0
 * rather than falling back to the (larger) authorized hold `amountJod` — that fallback
 * could over-refund a partial capture (F4). 0 makes any refund a safe no-op + alerts.
 */
export function getCapturedAmount(payment: { capturedAmountJod: Prisma.Decimal | null; amountJod: Prisma.Decimal; bookingId: string; status: string }): Prisma.Decimal {
  if (payment.capturedAmountJod == null) {
    logger.error({ bookingId: payment.bookingId, status: payment.status }, 'captured amount missing on a captured payment — data anomaly, manual review required');
    throw new AppError('Payment data anomaly: captured amount missing. Manual review required.', 500, 'DATA_ANOMALY');
  }
  return toDecimal(payment.capturedAmountJod);
}
