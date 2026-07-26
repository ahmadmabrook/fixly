import { useAuth, type AdminRole } from './store';

const BASE = '/api/v1/admin';

/** Hard ceiling on any single API request so a stalled connection surfaces as
 *  an error instead of a spinner that never resolves. */
const REQUEST_TIMEOUT_MS = 15_000;

/** Default page size for admin list/table views (bookings, technicians,
 *  payouts, withdrawals, etc.) — a single shared default so every page's
 *  pagination behaves the same unless a page has an explicit reason not to. */
export const DEFAULT_PAGE_SIZE = 50;

// Public hook so the UI can react to 401s (the standard pattern is to
// clear the local session and bounce the user back to /login). The store
// is updated by this module; components just observe the new state.
export const onAuthExpired: Array<() => void> = [];

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

function fireAuthExpired(): void {
  onAuthExpired.forEach((cb) => {
    try { cb(); } catch { /* swallow listener errors */ }
  });
}

let refreshInFlight: Promise<boolean> | null = null;

/**
 * Rotate the admin session using the httpOnly refresh cookie (single-flight).
 * Returns true if a fresh access token was obtained. The refresh token is never
 * JS-readable; it rides in the cookie sent via credentials:'include'.
 */
async function tryRefresh(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const res = await fetch(BASE + '/auth/refresh', {
        method: 'POST',
        credentials: 'include',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) return false;
      const body = (await res.json()) as { data?: { accessToken?: string; admin?: { id: string; name: string; email: string; role?: AdminRole } } };
      const access = body.data?.accessToken;
      if (!access) return false;
      const admin = body.data?.admin ?? useAuth.getState().admin ?? { id: '', name: '', email: '' };
      useAuth.getState().setAuth(access, admin);
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

/** Restore the admin session on load from the refresh cookie. */
export async function restoreSession(): Promise<boolean> {
  return tryRefresh();
}

/** Admin login. Throws ApiError on bad credentials (caller shows the message). */
export async function login(
  email: string,
  password: string,
): Promise<{ accessToken: string; admin: { id: string; name: string; email: string; role?: AdminRole } }> {
  return request('/login', { method: 'POST', body: JSON.stringify({ email, password }) });
}

/** Revoke the admin session server-side (clears the cookie) + drop local state. */
export async function logout(): Promise<void> {
  try {
    await fetch(BASE + '/auth/logout', {
      method: 'POST',
      credentials: 'include',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } finally {
    useAuth.getState().logout();
    fireAuthExpired();
  }
}

/** Single fetch + auth-header + cookie + 401-handling (one silent refresh). */
async function rawRequest(path: string, opts: RequestInit = {}, retried = false): Promise<Response> {
  const token = useAuth.getState().accessToken;
  const res = await fetch(BASE + path, {
    ...opts,
    credentials: 'include', // send/receive the httpOnly refresh cookie
    signal: opts.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts.headers,
    },
  });

  if (res.status === 401 && !retried) {
    // Try one silent refresh before giving up.
    if (await tryRefresh()) return rawRequest(path, opts, true);
    useAuth.getState().logout();
    fireAuthExpired();
  } else if (res.status === 401) {
    useAuth.getState().logout();
    fireAuthExpired();
  }
  return res;
}

function errorFrom(res: Response, body: unknown): ApiError {
  const payload = body as { error?: { message?: string; code?: string } } | null;
  return new ApiError(
    payload?.error?.message ?? res.statusText,
    res.status,
    payload?.error?.code,
  );
}

/** Standard request: 4xx/5xx throw an ApiError; 2xx auto-unwrap the envelope. */
async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await rawRequest(path, opts);
  if (!res.ok) throw errorFrom(res, await res.json().catch(() => null));
  if (res.status === 204) return undefined as T;
  const body = (await res.json()) as T | Envelope<unknown>;
  if (body && typeof body === 'object' && 'data' in (body as Record<string, unknown>)) {
    return (body as Envelope<T>).data;
  }
  return body as T;
}

/**
 * List endpoint that also exposes the pagination meta envelope. Use this for
 * paginated list endpoints; for non-paginated endpoints use `api.get` which
 * auto-unwraps `data`.
 */
async function listWithMeta<T>(
  path: string,
  opts: RequestInit = {},
): Promise<{ items: T[]; total: number; limit: number; offset: number }> {
  const res = await rawRequest(path, opts);
  if (!res.ok) throw errorFrom(res, await res.json().catch(() => null));
  const body = (await res.json()) as { data: T[]; meta?: { total: number; limit: number; offset: number } };
  return {
    items: body.data ?? [],
    total: body.meta?.total ?? body.data?.length ?? 0,
    limit: body.meta?.limit ?? 0,
    offset: body.meta?.offset ?? 0,
  };
}

/** Fetch a file (with auth + refresh) and trigger a browser download. Used for
 *  CSV exports where a plain <a href> can't send the Authorization header. */
async function download(path: string, filename: string): Promise<void> {
  const res = await rawRequest(path);
  if (!res.ok) throw errorFrom(res, await res.json().catch(() => null));
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  download,
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body !== undefined ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  /** List with meta envelope (use for paginated list endpoints). */
  list: <T>(path: string) => listWithMeta<T>(path),
};

// ── Types ──────────────────────────────────────────────────────────────────

export interface AdminStats {
  totalBookings: number;
  pendingBookings: number;
  completedBookings: number;
  totalTechnicians: number;
  verifiedTechnicians: number;
  activeTechnicians: number;
  totalRevenueJod: number;
  todayRevenueJod: number;
  avgRating: number;
  openGuarantees: number;
  pendingPayouts: number;
  bookingsByService?: Array<{ serviceId: string; nameAr: string; count: number }>;
  bookingsByStatus?: { inProgress: number; arriving: number; completed: number; cancelled: number };
}

export interface OperationalStats {
  windowDays: number;
  acceptanceRate: number;
  // null when the window has no matching rows (no assignments / no late arrivals).
  avgTimeToAssignSeconds: number | null;
  avgArrivalDelaySeconds: number | null;
  cancellationRate: number;
  complaintRate: number;
  repeatBookingRate: number;
  sampleSizes: Record<string, number>;
}

/** A single entry in the admin dashboard's live-activity feed (GET /admin/activity-feed). */
export interface ActivityFeedItem {
  type: 'booking_status' | 'payment_captured' | 'guarantee_opened' | 'new_customer';
  message: string;
  at: string;
}

/** An open booking that is late (past SLA arrival, tech assigned) or unassigned
 *  for too long (GET /admin/orders/at-risk). */
export interface AtRiskOrder {
  id: string;
  status: string;
  addressLine: string | null;
  totalJod: string | number;
  createdAt: string;
  slaArriveBy: string | null;
  riskType: 'late' | 'unassigned';
  customer: { id: string; name: string; phone?: string | null } | null;
  technician: { id: string; user?: { name: string; phone?: string | null } | null } | null;
}

export interface BookingItem {
  id: string;
  status: string;
  scheduledAt: string | null;
  totalJod: string | number;
  addressLat?: number | null;
  addressLng?: number | null;
  customer?: { id: string; name: string; phone?: string } | null;
  service?: { nameAr: string; nameEn: string } | null;
  technician?: { user?: { name: string } } | null;
}

/** One entry in a booking's append-only status-change audit trail
 *  (GET /admin/bookings/:id -> data.statusHistory), oldest first. */
export interface BookingStatusHistoryItem {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  changedAt: string;
  changedBy: string | null;
}

/** A technician-proposed extra work item on a booking (GET /admin/bookings/:id -> data.additionalWork). */
export interface AdditionalWorkItem {
  id: string;
  description: string;
  amountJod: string | number;
  status: string;
  createdAt: string;
}

/** Payment row for a booking (GET /admin/bookings/:id -> data.payment), or null if
 *  no payment has been created yet (e.g. a still-pending mock-provider booking). */
export interface PaymentSummary {
  id: string;
  status: string;
  provider: string;
  method?: string | null;
  currency: string;
  amountJod: string | number;
  capturedAmountJod?: string | number | null;
  refundedAmountJod: string | number;
  feeJod?: string | number | null;
  preAuthorizedAt?: string | null;
  capturedAt?: string | null;
  refundedAt?: string | null;
  disputedAt?: string | null;
}

/** Full booking detail for the admin drawer (GET /admin/bookings/:id). */
export interface BookingDetail {
  booking: {
    id: string;
    status: string;
    addressLine: string;
    addressLat?: number | null;
    addressLng?: number | null;
    scheduledAt: string | null;
    startedAt: string | null;
    completedAt: string | null;
    cancelledAt: string | null;
    cancelReason: string | null;
    discountJod: string | number;
    totalJod: string | number;
    lateCompJod: string | number;
    createdAt: string;
    customer?: { id: string; name: string; phone?: string } | null;
    technician?: {
      id: string;
      rating?: string | number | null;
      hourlyRateJod?: string | number | null;
      user?: { id: string; name: string; phone?: string } | null;
    } | null;
    service?: { nameAr: string; nameEn: string; priceJod: string | number; calloutFeeJod?: string | number; durationMin?: number } | null;
  };
  statusHistory: BookingStatusHistoryItem[];
  additionalWork: AdditionalWorkItem[];
  payment: PaymentSummary | null;
}

export interface TechnicianItem {
  id: string;
  isVerified: boolean;
  status?: string;
  hourlyRateJod?: string | number | null;
  user: { id: string; name: string | null; phone?: string };
  rating?: string | number | null;
  totalReviews?: number;
}

export interface TechnicianDetail extends TechnicianItem {
  bio?: string | null;
  vehicle?: string | null;
  idDocUrl?: string | null;
  certificateUrl?: string | null;
  selfieUrl?: string | null;
  introVideoUrl?: string | null;
  rejectionReason?: string | null;
  jobsCompleted?: number;
  offPlatformFlags?: number;
  services: Array<{ id: string; nameAr: string; nameEn?: string }>;
  recentReviews: Array<{ id: string; rating: number; comment: string | null; reviewer: { name: string | null } }>;
}

export interface TechnicianScorecard {
  onTimeRate: number;
  redoRate: number;
  complaintRate: number;
  acceptanceRate: number;
  sampleSizes: Record<string, number>;
}

export interface GuaranteeAdminItem {
  id: string;
  status: string;
  description: string | null;
  mediaUrls: string[];
  adminNote: string | null;
  scheduledVisitAt: string | null;
  expiresAt: string;
  createdAt: string;
  booking?: { customer?: { name: string } | null; service?: { nameAr: string } | null } | null;
}

export interface SupportAdminMessage { id: string; senderRole: string; body: string; createdAt: string }
export interface SupportAdminItem {
  id: string;
  subject: string;
  status: string;
  category: string | null;
  escalatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  user?: { name: string | null; phone: string } | null;
  _count?: { messages: number };
  messages?: SupportAdminMessage[];
}

export interface BroadcastItem {
  id: string;
  titleAr: string;
  bodyAr: string;
  segment: string;
  recipientCount: number;
  createdAt: string;
  sentBy?: { name: string } | null;
}

export interface FinancialReport {
  series: Array<{ period: string; bookings: number; grossJod: number; platformFeeJod: number; technicianNetJod: number }>;
  totals: { bookings: number; grossJod: number; platformFeeJod: number; technicianNetJod: number };
}

export interface AdminUserItem {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  isActive: boolean;
  createdAt: string;
}

export interface WithdrawalItem {
  id: string;
  amountJod: string | number;
  status: string;
  iban: string | null;
  bankName: string | null;
  createdAt: string;
  technician?: { user?: { name: string; phone: string } } | null;
}

export interface PayoutItem {
  id: string;
  status: string;
  amountJod: string | number;
  createdAt: string;
  processedAt?: string | null;
  technician?: { user?: { name: string } } | null;
}

export interface CustomerItem {
  id: string;
  name: string | null;
  phone?: string;
  isActive?: boolean;
  createdAt: string;
}

export interface CustomerBookingItem {
  id: string;
  status: string;
  totalJod: string | number;
  createdAt: string;
  service?: { nameAr: string } | null;
}

// ── Materials & pricing engine (§17.5) ──────────────────────────────────────

export type QuoteLineKind = 'LABOUR' | 'MATERIAL' | 'PREP' | 'FEE';
export type MaterialSource = 'TECHNICIAN_PROCURED' | 'CUSTOMER_SUPPLIED' | 'PLATFORM_ARRANGED';
export type MaterialTier = 'ECONOMY' | 'STANDARD' | 'PREMIUM';

export interface QuoteLineItem {
  id: string;
  kind: QuoteLineKind;
  materialId: string | null;
  description: string;
  qty: string | number;
  unit: string | null;
  unitPriceFils: number;
  totalFils: number;
  source: MaterialSource;
}

/** Admin quote-queue item — video pre-check (siteMediaUrls empty) or itemized
 *  quote-first (siteMediaUrls populated at creation, lines drafted by ops). */
export interface AdminQuoteItem {
  id: string;
  status: 'PENDING' | 'QUOTED' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';
  videoUrl: string | null;
  siteMediaUrls: string[];
  dimensionsNote: string | null;
  requestedTier: MaterialTier | null;
  description: string | null;
  quotedJod: string | number | null;
  labourFils: number | null;
  materialsFils: number | null;
  opsReviewedById: string | null;
  opsReviewedAt: string | null;
  lines: QuoteLineItem[];
  createdAt: string;
  service?: { nameAr?: string | null } | null;
  customer?: { name?: string | null; phone?: string | null } | null;
}

export interface MaterialCatalogItem {
  id: string;
  serviceId: string | null;
  supplierId: string | null;
  slug: string;
  nameAr: string;
  nameEn: string;
  brand: string | null;
  tier: MaterialTier;
  unit: string;
  unitPriceFils: number;
  priceMinFils: number;
  priceMaxFils: number;
  varianceAlertBps: number;
  coverageNote: string | null;
  priceConfidence: 'CONFIRMED' | 'ESTIMATED' | 'UNDER_REVIEW';
  lastPricedAt: string | null;
  refreshCadence: 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL';
  isActive: boolean;
}

export interface SupplierItem {
  id: string;
  name: string;
  contactPhone: string | null;
  categories: string[];
  isPilot: boolean;
  referralCommissionBps: number | null;
  agreementKind: string;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  commissionPaidOk: boolean | null;
  priceManipulationObserved: boolean | null;
  isActive: boolean;
}

export interface PriceIndexReadingItem {
  id: number;
  kind: 'dos_cpi' | 'dos_cpi_maintenance' | 'memr_fuel' | 'chamber_of_industry';
  periodMonth: string;
  valueNumeric: string | number;
  unit: string | null;
  sourceUrl: string | null;
  recordedAt: string;
}

export interface CategoryReadinessItem {
  serviceId: string;
  state: 'COLLECTING' | 'READY' | 'BLOCKED';
  quotesRequired: number;
  quotesClosed: number;
  maxDisputeBps: number;
  disputeBps: number;
  maxPriceDeviationBps: number;
  priceDeviationBps: number;
  service?: { nameAr?: string | null } | null;
}

export interface BookingMaterialAdminItem {
  id: string;
  bookingId: string;
  materialId: string | null;
  source: 'TECHNICIAN_PROCURED' | 'CUSTOMER_SUPPLIED' | 'PLATFORM_ARRANGED';
  status: 'PENDING' | 'PENDING_REVIEW' | 'APPROVED' | 'DECLINED' | 'REPLACED' | 'UNUSED' | 'LOCKED';
  description: string;
  brand: string | null;
  qty: string | number;
  unitPriceFils: number;
  totalFils: number;
  referencePriceFils: number | null;
  varianceBps: number | null;
  varianceReason: 'SPECIAL_TYPE' | 'IMPORTED_BRAND' | 'ACCESS_DIFFICULTY' | 'OTHER' | null;
  varianceReasonNote: string | null;
  supplierInvoiceUrl: string | null;
  createdAt: string;
  booking?: { id: string; customerId: string; addressLine: string } | null;
}

export interface MaterialVerificationAdminItem {
  id: string;
  bookingId: string;
  technicianId: string;
  status: 'OPEN' | 'INVOICE_PROVIDED' | 'UPHELD' | 'DEDUCTED' | 'WITHDRAWN';
  referencePriceFils: number;
  chargedPriceFils: number;
  deltaFils: number;
  invoiceUrl: string | null;
  deadlineAt: string;
}
