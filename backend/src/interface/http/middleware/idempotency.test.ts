import type { Request, Response, NextFunction } from 'express';

// In-memory Redis stand-in supporting the exact call shapes the middleware uses:
//   set(key, val, 'EX', ttl, 'NX')  -> 'OK' | null (atomic claim)
//   set(key, val, 'EX', ttl)        -> 'OK'        (overwrite)
//   get(key) / del(key)
const store = new Map<string, string>();
const redisMock = {
  set: jest.fn(async (key: string, val: string, _ex?: string, _ttl?: number, nx?: string) => {
    if (nx === 'NX') {
      if (store.has(key)) return null;
      store.set(key, val);
      return 'OK';
    }
    store.set(key, val);
    return 'OK';
  }),
  get: jest.fn(async (key: string) => store.get(key) ?? null),
  del: jest.fn(async (key: string) => (store.delete(key) ? 1 : 0)),
};

jest.mock('../../../infrastructure/cache/redis', () => ({ redis: redisMock }));
jest.mock('../../../shared/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() } }));

import { idempotency } from './idempotency';

function makeRes() {
  const res = {
    statusCode: 200,
    jsonBody: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.jsonBody = body; return this; },
  };
  return res as unknown as Response & { jsonBody: unknown };
}

function makeReq(key: string | undefined, userId: string): Request {
  return {
    headers: key === undefined ? {} : { 'idempotency-key': key },
    user: { userId, role: 'CUSTOMER' },
  } as unknown as Request;
}

describe('idempotency middleware', () => {
  beforeEach(() => {
    store.clear();
    jest.clearAllMocks();
  });

  it('is a no-op when no Idempotency-Key header is present', async () => {
    const mw = idempotency('bookings.create');
    const next = jest.fn() as NextFunction;
    await mw(makeReq(undefined, 'user-1'), makeRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(redisMock.set).not.toHaveBeenCalled();
  });

  it('runs the handler and caches a 2xx response on the first request', async () => {
    const mw = idempotency('bookings.create');
    const res = makeRes();
    const next = jest.fn() as NextFunction;
    await mw(makeReq('k1', 'user-1'), res, next);
    expect(next).toHaveBeenCalledTimes(1);

    // Handler responds 201 -> cached.
    res.status(201).json({ data: { id: 'b1' } });
    const cached = JSON.parse(store.get('idempotency:bookings.create:user-1:k1')!);
    expect(cached).toEqual({ status: 201, body: { data: { id: 'b1' } } });
  });

  it('replays a cached completed response without running the handler', async () => {
    store.set('idempotency:bookings.create:user-1:k1', JSON.stringify({ status: 201, body: { data: { id: 'b1' } } }));
    const mw = idempotency('bookings.create');
    const res = makeRes();
    const next = jest.fn() as NextFunction;
    await mw(makeReq('k1', 'user-1'), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(201);
    expect(res.jsonBody).toEqual({ data: { id: 'b1' } });
  });

  it('returns 409 while the original request is still in flight', async () => {
    store.set('idempotency:bookings.create:user-1:k1', JSON.stringify({ status: 'processing' }));
    const mw = idempotency('bookings.create');
    const res = makeRes();
    const next = jest.fn() as NextFunction;
    await mw(makeReq('k1', 'user-1'), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(409);
    expect((res.jsonBody as { error: { code: string } }).error.code).toBe('CONFLICT');
  });

  it('isolates cache entries per authenticated user (no cross-user replay)', async () => {
    // user-1 completes with key "shared".
    store.set('idempotency:bookings.create:user-1:shared', JSON.stringify({ status: 201, body: { secret: 'user-1-booking' } }));

    // user-2 sends the SAME key -> must NOT see user-1's cached response; handler runs.
    const mw = idempotency('bookings.create');
    const res = makeRes();
    const next = jest.fn() as NextFunction;
    await mw(makeReq('shared', 'user-2'), res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.jsonBody).toBeUndefined(); // no replay of user-1's data
    expect(store.has('idempotency:bookings.create:user-2:shared')).toBe(true);
  });

  it('does NOT cache a 5xx response (avoids poisoning retries) and frees the key', async () => {
    const mw = idempotency('bookings.create');
    const res = makeRes();
    const next = jest.fn() as NextFunction;
    await mw(makeReq('k1', 'user-1'), res, next);
    // Placeholder claimed.
    expect(store.get('idempotency:bookings.create:user-1:k1')).toBe(JSON.stringify({ status: 'processing' }));

    // Handler fails transiently.
    res.status(500).json({ error: { code: 'INTERNAL_ERROR' } });

    // Placeholder removed -> a retry can re-run instead of replaying the 500.
    expect(store.has('idempotency:bookings.create:user-1:k1')).toBe(false);
    expect(redisMock.del).toHaveBeenCalledWith('idempotency:bookings.create:user-1:k1');
  });

  it('caches a deterministic 4xx response (client error replays safely)', async () => {
    const mw = idempotency('bookings.create');
    const res = makeRes();
    const next = jest.fn() as NextFunction;
    await mw(makeReq('k1', 'user-1'), res, next);
    res.status(422).json({ error: { code: 'VALIDATION' } });

    const cached = JSON.parse(store.get('idempotency:bookings.create:user-1:k1')!);
    expect(cached).toEqual({ status: 422, body: { error: { code: 'VALIDATION' } } });
  });

  it('proceeds without dedupe if Redis is unavailable (fail-open)', async () => {
    redisMock.set.mockRejectedValueOnce(new Error('redis down'));
    const mw = idempotency('bookings.create');
    const next = jest.fn() as NextFunction;
    await mw(makeReq('k1', 'user-1'), makeRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
