import { Response } from 'express';
import { env } from '../../shared/env';

/**
 * Refresh tokens live in httpOnly cookies, never in JS-readable storage, so an
 * XSS payload can't exfiltrate them. Access tokens stay in the response body
 * (held in memory by the SPA) — short-lived and never persisted.
 *
 * Cookie hardening:
 *  - httpOnly: not readable by document.cookie / JS.
 *  - secure (prod): only sent over HTTPS.
 *  - sameSite=strict: never sent on cross-site requests → the refresh endpoint
 *    (the only cookie-authenticated action) is CSRF-safe without a CSRF token.
 *  - scoped path: the cookie is only sent to its own auth endpoints.
 */
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export const USER_REFRESH_COOKIE = 'refresh_token';
export const ADMIN_REFRESH_COOKIE = 'admin_refresh_token';

const USER_PATH = '/api/v1/auth';
const ADMIN_PATH = '/api/v1/admin/auth';

function attrs(path: string) {
  return {
    httpOnly: true,
    secure: env().NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path,
    maxAge: THIRTY_DAYS_MS,
  };
}

export function setUserRefreshCookie(res: Response, token: string): void {
  res.cookie(USER_REFRESH_COOKIE, token, attrs(USER_PATH));
}
export function clearUserRefreshCookie(res: Response): void {
  res.clearCookie(USER_REFRESH_COOKIE, { path: USER_PATH });
}
export function setAdminRefreshCookie(res: Response, token: string): void {
  res.cookie(ADMIN_REFRESH_COOKIE, token, attrs(ADMIN_PATH));
}
export function clearAdminRefreshCookie(res: Response): void {
  res.clearCookie(ADMIN_REFRESH_COOKIE, { path: ADMIN_PATH });
}
