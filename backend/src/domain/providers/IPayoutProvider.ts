export interface DisburseResult {
  providerRef: string;
  status: 'DISBURSED';
}

/** Outcome of querying a payout's state at the provider, keyed by payoutId. */
export type PayoutProviderState = 'COMPLETED' | 'FAILED' | 'PENDING' | 'UNKNOWN';

export interface PayoutStatusResult {
  state: PayoutProviderState;
  providerRef?: string;
}

/** Sends money out to a technician (bank/wallet). Real impl swaps the mock. */
export interface IPayoutProvider {
  /** Disburse. `payoutId` doubles as the idempotency key so a retried call
   *  (e.g. after a crash) is de-duplicated by the provider, never double-paid. */
  disburse(payoutId: string, amountJod: number): Promise<DisburseResult>;
  /** Query the authoritative state for a payout (by id) — used by
   *  reconciliation to resolve rows stuck in PROCESSING after a crash. */
  getStatus(payoutId: string): Promise<PayoutStatusResult>;
}
