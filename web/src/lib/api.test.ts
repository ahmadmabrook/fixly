import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { api, ApiError } from './api';
import { useAuth } from './store';

const NEW_ACCESS = 'new-access';
const NEW_REFRESH = 'new-refresh';

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

describe('api single-flight refresh', () => {
  it('refreshes the access token on 401 and replays the request', async () => {
    useAuth.getState().setTokens('expired', 'CUSTOMER');
    localStorage.setItem('refresh_token', 'old-refresh');

    const calls: Array<{ url: string; method: string }> = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toString();
      calls.push({ url, method });
      if (url.endsWith('/auth/refresh') && method === 'POST') {
        return jsonResponse(200, { data: { accessToken: NEW_ACCESS, refreshToken: NEW_REFRESH } });
      }
      if (url.endsWith('/services') && calls.filter((c) => c.url.endsWith('/services')).length === 1) {
        return jsonResponse(401, { error: { code: 'UNAUTHORIZED' } });
      }
      return jsonResponse(200, { data: [{ id: 's1' }] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await api.get<Array<{ id: string }>>('/services');
    expect(result).toEqual([{ id: 's1' }]);
    expect(calls.map((c) => c.url)).toEqual([
      expect.stringContaining('/services'),
      expect.stringContaining('/auth/refresh'),
      expect.stringContaining('/services'),
    ]);
    expect(useAuth.getState().accessToken).toBe(NEW_ACCESS);
    expect(localStorage.getItem('refresh_token')).toBe(NEW_REFRESH);
  });

  it('logs the user out when refresh fails', async () => {
    useAuth.getState().setTokens('expired', 'CUSTOMER');
    localStorage.setItem('refresh_token', 'old-refresh');

    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/auth/refresh')) {
        return jsonResponse(401, { error: { code: 'INVALID' } });
      }
      return jsonResponse(401, { error: { code: 'UNAUTHORIZED' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.get('/services')).rejects.toBeInstanceOf(ApiError);
    expect(useAuth.getState().accessToken).toBeNull();
    expect(localStorage.getItem('refresh_token')).toBeNull();
  });

  it('does not loop refresh forever on persistent 401', async () => {
    useAuth.getState().setTokens('expired', 'CUSTOMER');
    localStorage.setItem('refresh_token', 'old-refresh');

    const fetchMock = vi.fn(async (url: string) => {
      // Refresh succeeds but the replayed request still 401s — should not retry again.
      if (url.endsWith('/auth/refresh')) {
        return jsonResponse(200, { data: { accessToken: NEW_ACCESS, refreshToken: NEW_REFRESH } });
      }
      return jsonResponse(401, { error: { code: 'BANNED' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.get('/services')).rejects.toBeInstanceOf(ApiError);
    // Exactly one refresh attempt, not a refresh loop.
    const refreshCalls = (fetchMock.mock.calls as Array<[string]>).filter(([u]) => u.endsWith('/auth/refresh'));
    expect(refreshCalls).toHaveLength(1);
  });
});

describe('api envelope auto-unwrap', () => {
  it('returns the inner data field when the backend sends { data: ... }', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { data: { id: 'svc-1' } })));
    const result = await api.get<{ id: string }>('/services/svc-1');
    expect(result).toEqual({ id: 'svc-1' });
  });

  it('passes through plain JSON for legacy endpoints that do not use the envelope', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { id: 'svc-1' })));
    const result = await api.get<{ id: string }>('/legacy/endpoint');
    expect(result).toEqual({ id: 'svc-1' });
  });
});
