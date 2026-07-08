import { useAuth } from './store';

const BASE = '/api/v1';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface Envelope<T> {
  data: T;
  meta?: { total: number; limit: number; offset: number };
}

let refreshInFlight: Promise<string | null> | null = null;

/** Decode the (unverified) `role` claim from a JWT for UI defaults only. */
function roleFromJwt(token: string): string {
  try {
    const part = token.split('.')[1] ?? '';
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '=');
    return (JSON.parse(atob(padded)) as { role?: string }).role ?? 'CUSTOMER';
  } catch {
    return 'CUSTOMER';
  }
}

/**
 * Single-flight refresh: parallel 401s share the same in-progress refresh
 * instead of firing N requests. The refresh token rides in the httpOnly cookie
 * (sent because credentials:'include'), never JS-readable. Returns the new
 * access token, or null on failure (the caller then signs the user out).
 */
async function tryRefresh(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const res = await fetch(BASE + '/auth/refresh', { method: 'POST', credentials: 'include' });
      if (!res.ok) return null;
      const body = (await res.json()) as { data: { accessToken: string } };
      const access = body.data.accessToken;
      useAuth.getState().setTokens(access, useAuth.getState().role ?? roleFromJwt(access));
      return access;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

/** Restore an authenticated session on app load from the refresh cookie.
 *  Returns true if a session was re-established. */
export async function restoreSession(): Promise<boolean> {
  return (await tryRefresh()) !== null;
}

/** Revoke the session server-side (clears the cookie) and drop local state. */
export async function logout(): Promise<void> {
  try {
    await fetch(BASE + '/auth/logout', { method: 'POST', credentials: 'include' });
  } finally {
    useAuth.getState().logout();
  }
}

async function request<T>(path: string, opts: RequestInit = {}, retried = false): Promise<T> {
  const token = useAuth.getState().accessToken;
  const res = await fetch(BASE + path, {
    ...opts,
    credentials: 'include', // send/receive the httpOnly refresh cookie
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts.headers,
    },
  });

  if (res.status === 401 && !retried) {
    const newToken = await tryRefresh();
    if (newToken) return request<T>(path, opts, true);
    // Refresh failed — drop the session so the UI reflects logged-out state.
    useAuth.getState().logout();
  } else if (res.status === 401) {
    useAuth.getState().logout();
  }

  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    const message = payload?.error?.message ?? payload?.message ?? res.statusText;
    throw new ApiError(message, res.status, payload?.error?.code);
  }

  if (res.status === 204) return undefined as T;
  // Auto-unwrap the standard envelope. Legacy endpoints that don't use the
  // envelope return plain JSON — we tolerate both by passing through any
  // body that doesn't have a `data` key.
  const body = (await res.json()) as T | Envelope<unknown>;
  if (body && typeof body === 'object' && 'data' in (body as Record<string, unknown>)) {
    return (body as Envelope<T>).data;
  }
  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

export interface Service {
  id: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string | null;
  priceJod: string | number;
  durationMin: number;
  durationMinutes?: number;
  isActive: boolean;
  category?: string;
  /** What the fixed price covers / excludes, shown on the service detail page. */
  sopIncludes?: string[];
  sopExcludes?: string[];
  /** Charged if a technician dispatches out but the job doesn't proceed (no-show, refusal, etc). */
  calloutFeeJod?: string | number;
}

export interface Booking {
  id: string;
  status: string;
  scheduledAt: string | null;
  totalJod: string | number;
  service: Service;
}

/** Booking row as returned by GET /bookings (service included). */
export interface BookingListItem {
  id: string;
  status: string;
  scheduledAt: string | null;
  totalJod: string | number;
  service?: Pick<Service, 'nameAr' | 'nameEn'> | null;
}

export interface CreateBookingInput {
  serviceId: string;
  addressLine: string;
  addressLat: number;
  addressLng: number;
  scheduledAt: string | null;
  promoCode?: string | null;
}

/** A hosted-checkout session (HyperPay COPYandPAY widget) returned by the backend. */
export interface CheckoutSession {
  checkoutId: string;
  scriptUrl: string;
  brands: string[];
}

/**
 * POST /bookings response. `checkout` is null in mock/dev mode (no hosted payment) or
 * when the booking was created but opening the session failed (retry via POST
 * /bookings/:id/checkout). When present, the client mounts the payment widget.
 */
export interface CreateBookingResult {
  booking: Booking;
  checkout: CheckoutSession | null;
}

export type CheckoutState = 'authorized' | 'pending' | 'rejected';

export interface PromoQuote {
  code: string;
  discountJod: string;
  finalJod: string;
  originalJod: string;
}

export interface Notification {
  id: string;
  titleAr: string;
  bodyAr: string;
  isRead: boolean;
  bookingId: string | null;
  createdAt: string;
}

export interface Address {
  id: string;
  label: string;
  line: string;
  lat: number;
  lng: number;
  building: string | null;
  apartment: string | null;
  notes: string | null;
  isDefault: boolean;
}

export interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
}

export interface TechReview {
  id: string;
  rating: number;
  comment: string | null;
  photos: string[];
  reviewerName: string | null;
  createdAt: string;
}

export interface TechnicianCard {
  id: string;
  name: string | null;
  avatarUrl: string | null;
  rating: string | number;
  totalReviews: number;
  vehicle: string | null;
  isVerified: boolean;
}

export interface GuaranteeTicketItem {
  id: string;
  status: string;
  description: string | null;
  mediaUrls: string[];
  adminNote: string | null;
  scheduledVisitAt: string | null;
  expiresAt: string;
  resolvedAt: string | null;
  createdAt: string;
  booking?: { id: string; service?: { nameAr: string } | null } | null;
}

export interface EligibleBooking {
  id: string;
  completedAt: string | null;
  service?: { nameAr: string; nameEn: string } | null;
}

export interface SupportMessage {
  id: string;
  senderRole: string;
  body: string;
  createdAt: string;
}

export interface SupportTicketItem {
  id: string;
  subject: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  messages?: SupportMessage[];
}

export interface AdditionalWorkItem {
  id: string;
  description: string;
  amountJod: string | number;
  status: string;
  createdAt: string;
}

export type TrustTier = 'PROBATION' | 'VERIFIED' | 'PRO' | 'ELITE';

export interface TechnicianProfileMe {
  id: string;
  status: string;
  isVerified: boolean;
  isAvailable: boolean;
  rejectionReason: string | null;
  hourlyRateJod: string | number | null;
  vehicle: string | null;
  bio: string | null;
  rating: string | number;
  totalReviews: number;
  trustTier: TrustTier;
  services: Array<{ id: string; nameAr: string; nameEn?: string }>;
  /** Consecutive DispatchOffer rejections; resets to 0 on accept. Used to warn
   *  the technician before repeated rejections affect their acceptance rate / tier. */
  consecutiveRejections: number;
}

/** GET /technician/scorecard — rates are percentages (0-100), not 0-1 decimals. */
export interface TechnicianScorecard {
  onTimeRate: number;
  redoRate: number;
  complaintRate: number;
  acceptanceRate: number;
  sampleSizes: {
    arrivedBookings: number;
    completedBookings: number;
    totalBookings: number;
    dispatchOffers: number;
  };
}

/** GET/PATCH /technician/notification-preferences. */
export interface NotificationPreferences {
  newJobRequests: boolean;
  reminders: boolean;
  earningsUpdates: boolean;
  promotions: boolean;
}

/** GET/PATCH /technician/bank-account — payout details, independent of a withdrawal. */
export interface BankAccount {
  iban: string | null;
  bankName: string | null;
}

export interface TechEarnings {
  todayJod: string;
  monthJod: string;
  totalJod: string;
  balanceJod: string;
  lastWithdrawalAt: string | null;
  savedIban: string | null;
  savedBankName: string | null;
}

export interface Withdrawal {
  id: string;
  amountJod: string | number;
  status: string;
  iban: string | null;
  bankName: string | null;
  createdAt: string;
}

/** GET /referrals/me — the caller's own referral code + stats. */
export interface ReferralStats {
  referralCode: string;
  totalReferred: number;
  totalCreditEarnedJod: number;
}

/** POST /conduct-reports `kind` enum. */
export type ConductReportKind = 'OFF_PLATFORM_SOLICIT' | 'NO_SHOW' | 'QUALITY' | 'SAFETY' | 'OTHER';

export interface NearbyJob {
  id: string;
  totalJod: string | number;
  // Coarse distance only — the customer's exact address is withheld until the
  // job is accepted (then GET /bookings/:id reveals it to the assigned tech).
  distanceKm: number | null;
  /** ISO timestamp when this offer expires (broadcast-and-accept model). */
  expiresAt: string | null;
  /** Dispatch round number (radius expands each round). */
  round: number;
  service?: { nameAr: string; nameEn: string; priceJod: string | number; durationMin: number } | null;
}
