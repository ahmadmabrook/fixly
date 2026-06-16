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
}
