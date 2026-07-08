// Mock the ioredis client constructor itself so pruneStaleTechnicians' Redis
// calls can be asserted without a real Redis instance.
const mockClient = {
  on: jest.fn(),
  zrangebyscore: jest.fn(),
  zrem: jest.fn(),
};
jest.mock('ioredis', () => jest.fn().mockImplementation(() => mockClient));
jest.mock('../../shared/logger', () => ({ logger: { error: jest.fn(), debug: jest.fn(), warn: jest.fn() } }));

import { pruneStaleTechnicians, TECH_LOCATIONS_KEY, TECH_HEARTBEAT_KEY, HEARTBEAT_STALE_MS } from './redis';

describe('pruneStaleTechnicians', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('removes technicians with no heartbeat in the staleness window from both the heartbeat and GEO sets', async () => {
    mockClient.zrangebyscore.mockResolvedValue(['tp-stale-1', 'tp-stale-2']);

    await pruneStaleTechnicians();

    expect(mockClient.zrangebyscore).toHaveBeenCalledWith(TECH_HEARTBEAT_KEY, '-inf', expect.any(Number));
    // Cutoff is "now - 30s" — sanity-check it's in the past by roughly that much.
    const cutoff = mockClient.zrangebyscore.mock.calls[0][2] as number;
    expect(Date.now() - cutoff).toBeGreaterThanOrEqual(HEARTBEAT_STALE_MS);

    expect(mockClient.zrem).toHaveBeenCalledWith(TECH_HEARTBEAT_KEY, 'tp-stale-1', 'tp-stale-2');
    // GEOADD is backed by a ZSET, so removing stale members from the GEO key
    // uses the same ZREM (there is no GEODEL).
    expect(mockClient.zrem).toHaveBeenCalledWith(TECH_LOCATIONS_KEY, 'tp-stale-1', 'tp-stale-2');
  });

  it('does nothing when there are no stale technicians', async () => {
    mockClient.zrangebyscore.mockResolvedValue([]);

    await pruneStaleTechnicians();

    expect(mockClient.zrem).not.toHaveBeenCalled();
  });
});
