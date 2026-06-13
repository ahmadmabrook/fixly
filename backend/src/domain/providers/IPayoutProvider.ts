export interface DisburseResult {
  providerRef: string;
  status: 'DISBURSED';
}

/** Sends money out to a technician (bank/wallet). Real impl swaps the mock. */
export interface IPayoutProvider {
  disburse(payoutId: string, amountJod: number): Promise<DisburseResult>;
}
