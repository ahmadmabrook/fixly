import { AuthService } from './AuthService';
import { redis } from '../../infrastructure/cache/redis';
import { prisma } from '../../infrastructure/database/prisma';
import { UnauthorizedError, ValidationError } from '../../shared/errors';
import type { IOtpProvider } from '../../domain/providers/IOtpProvider';

jest.mock('../../infrastructure/cache/redis', () => ({
  redis: {
    set: jest.fn(),
    setex: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
    incr: jest.fn(),
    expire: jest.fn(),
  },
}));

jest.mock('../../infrastructure/database/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn(), create: jest.fn() },
    refreshToken: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('../../shared/env', () => {
  const { generateKeyPairSync } = require('crypto');
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
  });
  return {
    env: () => ({
      OTP_PROVIDER: 'mock',
      JWT_SECRET: 'test-secret-at-least-32-chars-long!!',
      JWT_ACCESS_EXPIRES_IN: '15m',
      JWT_KEYS: { current: { kid: 'test-kid', privateKey, publicKey } },
    }),
  };
});

const mockedRedis = redis as jest.Mocked<typeof redis>;
const mockedPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock; create: jest.Mock };
  refreshToken: { create: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
  $transaction: jest.Mock;
};

/** New-user signup path: no existing user, $transaction hands back a tx whose
 *  user.create resolves to the freshly created row. */
function mockNewUserSignup(user: { id: string; role: string; isActive: boolean }) {
  mockedPrisma.user.findUnique.mockResolvedValue(null);
  mockedPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({ user: { create: jest.fn().mockResolvedValue(user) } }),
  );
}

describe('AuthService', () => {
  let otp: jest.Mocked<IOtpProvider>;
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    otp = { send: jest.fn().mockResolvedValue(undefined) };
    service = new AuthService(otp);
  });

  describe('requestOtp', () => {
    it('issues a code and sends it when not on cooldown', async () => {
      mockedRedis.set.mockResolvedValue('OK'); // cooldown acquired
      await service.requestOtp('+962799000001');

      expect(mockedRedis.set).toHaveBeenCalledWith(
        'otp_cooldown:+962799000001', '1', 'EX', 60, 'NX',
      );
      expect(mockedRedis.setex).toHaveBeenCalledWith('otp:+962799000001', 300, '000000');
      expect(otp.send).toHaveBeenCalledWith('+962799000001', '000000');
    });

    it('rejects a second request within the cooldown window', async () => {
      mockedRedis.set.mockResolvedValue(null); // NX failed → on cooldown
      await expect(service.requestOtp('+962799000001')).rejects.toBeInstanceOf(ValidationError);
      expect(otp.send).not.toHaveBeenCalled();
    });
  });

  describe('verifyOtp', () => {
    it('locks out after exceeding max attempts and purges the code', async () => {
      mockedRedis.incr.mockResolvedValue(6); // over the cap of 5
      await expect(service.verifyOtp('+962799000001', '111111')).rejects.toThrow(
        /Too many attempts/,
      );
      expect(mockedRedis.del).toHaveBeenCalledWith('otp:+962799000001');
      expect(mockedRedis.get).not.toHaveBeenCalled(); // short-circuits before comparison
    });

    it('rejects an incorrect code', async () => {
      mockedRedis.incr.mockResolvedValue(1);
      mockedRedis.get.mockResolvedValue('000000');
      await expect(service.verifyOtp('+962799000001', '111111')).rejects.toBeInstanceOf(
        UnauthorizedError,
      );
    });

    it('sets attempt TTL only on the first attempt', async () => {
      mockedRedis.incr.mockResolvedValue(1);
      mockedRedis.get.mockResolvedValue('000000');
      mockNewUserSignup({ id: 'u1', role: 'CUSTOMER', isActive: true });
      mockedPrisma.refreshToken.create.mockResolvedValue({});

      await service.verifyOtp('+962799000001', '000000');
      expect(mockedRedis.expire).toHaveBeenCalledWith('otp_attempts:+962799000001', 300);
    });

    it('issues tokens and clears OTP state on success', async () => {
      mockedRedis.incr.mockResolvedValue(2);
      mockedRedis.get.mockResolvedValue('000000');
      mockNewUserSignup({ id: 'u1', role: 'CUSTOMER', isActive: true });
      mockedPrisma.refreshToken.create.mockResolvedValue({});

      const result = await service.verifyOtp('+962799000001', '000000');
      expect(result.accessToken).toEqual(expect.any(String));
      expect(result.refreshToken).toEqual(expect.any(String));
      expect(mockedRedis.del).toHaveBeenCalledWith('otp:+962799000001');
      expect(mockedRedis.del).toHaveBeenCalledWith('otp_attempts:+962799000001');
    });

    it('reuses an existing user (no $transaction) for a returning customer', async () => {
      mockedRedis.incr.mockResolvedValue(1);
      mockedRedis.get.mockResolvedValue('000000');
      mockedPrisma.user.findUnique.mockResolvedValue({ id: 'u1', role: 'CUSTOMER', isActive: true });
      mockedPrisma.refreshToken.create.mockResolvedValue({});

      const result = await service.verifyOtp('+962799000001', '000000');
      expect(result.accessToken).toEqual(expect.any(String));
      expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockedPrisma.user.create).not.toHaveBeenCalled();
    });

    it('normalizes a local-format phone (0799000001) to the same E.164 key as the canonical form, so it matches the existing account instead of creating a duplicate', async () => {
      mockedRedis.incr.mockResolvedValue(1);
      mockedRedis.get.mockResolvedValue('000000');
      mockedPrisma.user.findUnique.mockResolvedValue({ id: 'u1', role: 'CUSTOMER', isActive: true });
      mockedPrisma.refreshToken.create.mockResolvedValue({});

      await service.verifyOtp('0799000001', '000000');

      expect(mockedPrisma.user.findUnique).toHaveBeenCalledWith({ where: { phone: '+962799000001' } });
      expect(mockedPrisma.user.create).not.toHaveBeenCalled();
      expect(mockedRedis.get).toHaveBeenCalledWith('otp:+962799000001');
    });

    it('captures a referral code only for a brand-new signup', async () => {
      mockedRedis.incr.mockResolvedValue(1);
      mockedRedis.get.mockResolvedValue('000000');
      mockedPrisma.refreshToken.create.mockResolvedValue({});

      const referredUser = { id: 'u2', role: 'CUSTOMER', isActive: true };
      mockedPrisma.user.findUnique.mockResolvedValue(null);
      const txReferrerFindUnique = jest.fn().mockResolvedValue({ id: 'referrer-1' });
      const txReferralCreate = jest.fn().mockResolvedValue({});
      mockedPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
        fn({
          user: { create: jest.fn().mockResolvedValue(referredUser), findUnique: txReferrerFindUnique },
          referralRedemption: { create: txReferralCreate },
        }),
      );

      await service.verifyOtp('+962799000002', '000000', 'AHMED5');
      expect(txReferrerFindUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { referralCode: 'AHMED5' } }),
      );
      expect(txReferralCreate).toHaveBeenCalledWith({
        data: { referrerId: 'referrer-1', referredUserId: 'u2' },
      });
    });
  });

  describe('refresh', () => {
    const future = () => new Date(Date.now() + 86_400_000);

    it('rejects a missing token', async () => {
      await expect(service.refresh('')).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it('detects reuse of a revoked token and revokes the whole family', async () => {
      const updateMany = jest.fn().mockResolvedValue({ count: 2 });
      mockedPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
        fn({
          refreshToken: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'rt1', userId: 'u1', revokedAt: new Date(), expiresAt: future(), user: { id: 'u1', isActive: true },
            }),
            update: jest.fn(),
            updateMany,
            create: jest.fn(),
          },
        }),
      );
      await expect(service.refresh('tok')).rejects.toThrow(/reuse detected/i);
      expect(updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'u1', revokedAt: null } }),
      );
    });

    it('rejects when the user is disabled', async () => {
      mockedPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
        fn({
          refreshToken: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'rt1', userId: 'u1', revokedAt: null, expiresAt: future(), user: { id: 'u1', role: 'CUSTOMER', isActive: false },
            }),
            update: jest.fn(), updateMany: jest.fn(), create: jest.fn(),
          },
        }),
      );
      await expect(service.refresh('tok')).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it('rotates a valid token: revokes old, issues new', async () => {
      const update = jest.fn().mockResolvedValue({});
      const create = jest.fn().mockResolvedValue({});
      mockedPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
        fn({
          refreshToken: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'rt1',
              userId: 'u1',
              revokedAt: null,
              expiresAt: future(),
              user: { id: 'u1', role: 'CUSTOMER', isActive: true },
            }),
            update,
            updateMany: jest.fn(),
            create,
          },
        }),
      );

      const result = await service.refresh('tok');
      expect(update).toHaveBeenCalledWith({ where: { id: 'rt1' }, data: { revokedAt: expect.any(Date) } });
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ tokenHash: expect.any(String) }) }),
      );
      expect(result.accessToken).toEqual(expect.any(String));
    });
  });
});
