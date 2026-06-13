import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { api, ApiError } from './api';
import { useAuth } from './store';

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

beforeEach(() => {
  useAuth.getState().logout();
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('admin api (envelope + 401 handling)', () => {
  it('unwraps the data field from a paginated envelope', async () => {
    useAuth.getState().setAuth('t', { id: 'a1', name: 'A', email: 'a@b.c' });
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, {
      data: [{ id: 'b1' }, { id: 'b2' }],
      meta: { total: 2, limit: 50, offset: 0 },
    })));
    const result = await api.get<Array<{ id: string }>>('/bookings');
    expect(result).toEqual([{ id: 'b1' }, { id: 'b2' }]);
  });

  it('returns the items + meta from api.list', async () => {
    useAuth.getState().setAuth('t', { id: 'a1', name: 'A', email: 'a@b.c' });
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, {
      data: [{ id: 'p1' }],
      meta: { total: 7, limit: 50, offset: 0 },
    })));
    const result = await api.list<{ id: string }>('/payouts');
    expect(result.items).toEqual([{ id: 'p1' }]);
    expect(result.total).toBe(7);
  });

  it('logs the user out and fires onAuthExpired on a 401', async () => {
    useAuth.getState().setAuth('t', { id: 'a1', name: 'A', email: 'a@b.c' });
    let fired = false;
    const { onAuthExpired } = await import('./api');
    const cb = () => { fired = true; };
    onAuthExpired.push(cb);
    try {
      vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(401, { error: { code: 'UNAUTHORIZED' } })));
      await expect(api.get('/stats')).rejects.toBeInstanceOf(ApiError);
      expect(useAuth.getState().accessToken).toBeNull();
      expect(fired).toBe(true);
    } finally {
      const i = onAuthExpired.indexOf(cb);
      if (i >= 0) onAuthExpired.splice(i, 1);
    }
  });

  it('surfaces error.message and error.code on a 4xx', async () => {
    useAuth.getState().setAuth('t', { id: 'a1', name: 'A', email: 'a@b.c' });
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(422, {
      error: { code: 'FK_VIOLATION', message: 'bad ref' },
    })));
    try {
      await api.get('/whatever');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const e = err as ApiError;
      expect(e.status).toBe(422);
      expect(e.code).toBe('FK_VIOLATION');
      expect(e.message).toBe('bad ref');
    }
  });
});
