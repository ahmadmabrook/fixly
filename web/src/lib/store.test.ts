import { describe, it, expect, beforeEach } from 'vitest';
import { useAuth } from './store';

beforeEach(() => {
  localStorage.clear();
  useAuth.getState().logout();
});

describe('useAuth store', () => {
  it('persists tokens to localStorage on setTokens', () => {
    useAuth.getState().setTokens('abc', 'CUSTOMER');
    expect(localStorage.getItem('access_token')).toBe('abc');
    expect(localStorage.getItem('role')).toBe('CUSTOMER');
    expect(useAuth.getState().accessToken).toBe('abc');
  });

  it('clears tokens and the refresh token on logout', () => {
    useAuth.getState().setTokens('abc', 'CUSTOMER');
    localStorage.setItem('refresh_token', 'r1');
    useAuth.getState().logout();
    expect(useAuth.getState().accessToken).toBeNull();
    expect(useAuth.getState().role).toBeNull();
    expect(localStorage.getItem('access_token')).toBeNull();
    expect(localStorage.getItem('role')).toBeNull();
    expect(localStorage.getItem('refresh_token')).toBeNull();
  });
});
