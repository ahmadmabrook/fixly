export interface PreAuthResult {
  providerRef: string;
  status: 'PRE_AUTHORIZED';
}

export interface CaptureResult {
  providerRef: string;
  status: 'CAPTURED';
}

export interface IPaymentProvider {
  preAuthorize(bookingId: string, amountJod: number): Promise<PreAuthResult>;
  capture(providerRef: string): Promise<CaptureResult>;
  refund(providerRef: string): Promise<void>;
}
