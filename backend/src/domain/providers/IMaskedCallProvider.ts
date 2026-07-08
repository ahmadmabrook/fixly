/** Input to create (or reuse) a masked-calling session between a booking's two parties. */
export interface CreateMaskedCallSessionInput {
  /** Our booking id — used as the session's stable unique key so repeated calls
   *  within the same booking reuse the same proxy session/number. */
  bookingId: string;
  /** Real E.164 phone number of the customer. Never returned to the client. */
  customerPhone: string;
  /** Real E.164 phone number of the technician. Never returned to the client. */
  technicianPhone: string;
}

/** The proxy number the caller should dial to reach the other party. The provider
 *  (Twilio Proxy) matches the caller by their registered participant identifier
 *  (their real phone number) and bridges to the counterparty — neither party's
 *  real number is ever exposed to the other. */
export interface MaskedCallSessionResult {
  proxyNumber: string;
}

/**
 * Masked-calling port (mirrors IPaymentProvider / IOtpProvider's shape). Lets a
 * customer and technician call each other for the duration of a booking without
 * either seeing the other's real phone number.
 */
export interface IMaskedCallProvider {
  createOrReuseSession(input: CreateMaskedCallSessionInput): Promise<MaskedCallSessionResult>;
}
