import { useAuth } from './store';

const BASE = '/api/v1/admin';

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
      const res = await fetch(BASE + '/auth/refresh', { method: 'POST', credentials: 'include' });
      if (!res.ok) return false;
      const body = (await res.json()) as { data?: { accessToken?: string; admin?: { id: string; name: string; email: string } } };
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

/** Revoke the admin session server-side (clears the cookie) + drop local state. */
export async function logout(): Promise<void> {
  try {
    await fetch(BASE + '/auth/logout', { method: 'POST', credentials: 'include' });
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

export const api = {
  get: <T>(path: string) => request<T>(path),
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
  totalRevenueJod: number;
  pendingPayouts: number;
}

export interface BookingItem {
  id: string;
  status: string;
  scheduledAt: string | null;
  totalJod: string | number;
  customer?: { id: string; name: string; phone?: string } | null;
  service?: { nameAr: string; nameEn: string } | null;
  technician?: { user?: { name: string } } | null;
}

export interface TechnicianItem {
  id: string;
  isVerified: boolean;
  user: { id: string; name: string; phone?: string };
  rating?: string | number | null;
  totalReviews?: number;
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
  name: string;
  phone?: string;
  createdAt: string;
}
