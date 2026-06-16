import { Prisma } from '@prisma/client';

/**
 * Money helpers. All monetary values are exact base-10 decimals (Prisma.Decimal),
 * NEVER JS floats — JOD has 3 decimal places (fils) and float arithmetic
 * (0.1 + 0.2 !== 0.3) silently corrupts balances at scale.
 *
 * `toMinorUnits` is the only place we cross into a JS integer, and it asserts
 * the value has no sub-fils precision, so a bad amount fails loudly instead of
 * being silently rounded before it reaches the PSP.
 */
export type Decimal = Prisma.Decimal;
export const Decimal = Prisma.Decimal;

const FILS_PER_JOD = 1000;

export function toDecimal(v: Prisma.Decimal | number | string): Prisma.Decimal {
  return new Prisma.Decimal(v);
}

/** Exact integer minor units (fils) for the PSP boundary. Throws on sub-fils input. */
export function toMinorUnits(v: Prisma.Decimal | number | string): number {
  const minor = new Prisma.Decimal(v).times(FILS_PER_JOD);
  if (!minor.isInteger()) {
    throw new Error(`Amount ${v.toString()} has sub-fils precision (not representable in minor units)`);
  }
  return minor.toNumber();
}

export function isPositive(v: Prisma.Decimal | number | string): boolean {
  return new Prisma.Decimal(v).greaterThan(0);
}

/** Split a gross amount into platform fee + technician net, fils-exact (fee rounds down). */
export function splitCommission(gross: Prisma.Decimal | number | string, commissionPct: number): { fee: Prisma.Decimal; net: Prisma.Decimal } {
  const grossD = new Prisma.Decimal(gross);
  // Compute in fils to guarantee an exact 3-dp result; fee rounds DOWN so the
  // technician is never short-changed by rounding and fee+net === gross exactly.
  const feeFils = grossD.times(FILS_PER_JOD).times(commissionPct).dividedBy(100).floor();
  const fee = feeFils.dividedBy(FILS_PER_JOD);
  const net = grossD.minus(fee);
  return { fee, net };
}
