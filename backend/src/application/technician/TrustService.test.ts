import { computeTier } from './TrustService';

// Pure tier policy (§0.2 #1). No DB — just the promotion/demotion rules.
describe('computeTier', () => {
  const vetted = { bgCheckStatus: 'PASSED' as const, skillsTestPassedAt: new Date() };
  const unvetted = { bgCheckStatus: 'PENDING' as const, skillsTestPassedAt: null };

  it('holds an unvetted technician at PROBATION regardless of rating/volume', () => {
    expect(computeTier({ rating: 5, jobsCompleted: 500, offPlatformFlags: 0, ...unvetted })).toBe('PROBATION');
  });

  it('promotes a vetted, unflagged technician to VERIFIED', () => {
    expect(computeTier({ rating: 4.0, jobsCompleted: 3, offPlatformFlags: 0, ...vetted })).toBe('VERIFIED');
  });

  it('promotes to PRO at ≥4.7 rating and ≥30 jobs', () => {
    expect(computeTier({ rating: 4.7, jobsCompleted: 30, offPlatformFlags: 0, ...vetted })).toBe('PRO');
  });

  it('promotes to ELITE at ≥4.8 rating and ≥100 jobs', () => {
    expect(computeTier({ rating: 4.9, jobsCompleted: 120, offPlatformFlags: 0, ...vetted })).toBe('ELITE');
  });

  it('one flag blocks PRO/ELITE (needs 0) but still allows VERIFIED (needs <2)', () => {
    expect(computeTier({ rating: 4.9, jobsCompleted: 120, offPlatformFlags: 1, ...vetted })).toBe('VERIFIED');
  });

  it('two flags drop even a vetted technician below VERIFIED', () => {
    expect(computeTier({ rating: 4.9, jobsCompleted: 120, offPlatformFlags: 2, ...vetted })).toBe('PROBATION');
  });

  it('flags at/above the suspend threshold force PROBATION', () => {
    expect(computeTier({ rating: 4.9, jobsCompleted: 120, offPlatformFlags: 3, ...vetted })).toBe('PROBATION');
  });

  it('accepts a Decimal-like rating (toString)', () => {
    const rating = { toString: () => '4.75' };
    expect(computeTier({ rating, jobsCompleted: 40, offPlatformFlags: 0, ...vetted })).toBe('PRO');
  });
});
