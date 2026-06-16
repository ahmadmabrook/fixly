import { Prisma } from '@prisma/client';
import { toDecimal, toMinorUnits, isPositive, splitCommission } from './money';

describe('money.toMinorUnits', () => {
  it('converts JOD to integer fils', () => {
    expect(toMinorUnits('1.234')).toBe(1234);
    expect(toMinorUnits(25)).toBe(25000);
    expect(toMinorUnits(new Prisma.Decimal('0.001'))).toBe(1);
  });

  it('throws on sub-fils precision (never silently rounds money)', () => {
    expect(() => toMinorUnits('1.2345')).toThrow(/sub-fils/);
  });
});

describe('money.isPositive', () => {
  it('is true only for amounts > 0', () => {
    expect(isPositive('0.001')).toBe(true);
    expect(isPositive(0)).toBe(false);
    expect(isPositive('-1')).toBe(false);
  });
});

describe('money.splitCommission', () => {
  it('splits exactly so fee + net === gross (no lost fils)', () => {
    for (const [gross, pct] of [['25', 15], ['18', 15], ['0.01', 15], ['22.222', 17.5]] as Array<[string, number]>) {
      const { fee, net } = splitCommission(gross, pct);
      expect(fee.plus(net).equals(new Prisma.Decimal(gross))).toBe(true);
      expect(fee.greaterThanOrEqualTo(0)).toBe(true);
      expect(net.greaterThanOrEqualTo(0)).toBe(true);
    }
  });

  it('rounds the fee DOWN so the technician is never short-changed', () => {
    // 0.01 JOD × 15% = 0.0015 → fee floored to 0.001, net 0.009
    const { fee, net } = splitCommission('0.01', 15);
    expect(fee.toString()).toBe('0.001');
    expect(net.toString()).toBe('0.009');
  });

  it('0% commission → whole amount to the technician', () => {
    const { fee, net } = splitCommission('25', 0);
    expect(fee.toString()).toBe('0');
    expect(net.equals(toDecimal('25'))).toBe(true);
  });

  it('100% commission → zero net (no payout will accrue)', () => {
    const { fee, net } = splitCommission('25', 100);
    expect(fee.toString()).toBe('25');
    expect(isPositive(net)).toBe(false);
  });
});
