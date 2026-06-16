import { describe, it, expect, beforeEach } from 'vitest';
import { useAuth } from './store';

beforeEach(() => {
  localStorage.clear();
  useAuth.getState().logout();
});

describe('useAuth store', () => {
  it('keeps the access token in memory and persists only the (non-sensitive) role', () => {
    useAuth.getState().setTokens('abc', 'CUSTOMER');
    expect(useAuth.getState().accessToken).toBe('abc');
    // Access token must NOT be persisted (XSS exposure); role is a safe UI hint.
    expect(localStorage.getItem('access_token')).toBeNull();
    expect(localStorage.getItem('role')).toBe('CUSTOMER');
  });

  it('clears the session on logout', () => {
    useAuth.getState().setTokens('abc', 'CUSTOMER');
    useAuth.getState().logout();
    expect(useAuth.getState().accessToken).toBeNull();
    expect(useAuth.getState().role).toBeNull();
    expect(localStorage.getItem('role')).toBeNull();
  });
});
