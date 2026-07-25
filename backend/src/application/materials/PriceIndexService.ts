import { Prisma, PriceIndexKind } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma';
import { logger } from '../../shared/logger';
import { ConflictError, PrismaErrorCode } from '../../shared/errors';

export interface RecordPriceIndexReadingInput {
  kind: PriceIndexKind;
  periodMonth: Date | string;
  valueNumeric: number | string;
  unit?: string | null;
  sourceUrl?: string | null;
  recordedById?: string | null;
  note?: string | null;
}

/**
 * §17.5.13 — Automated Index-Linked Pricing. A human records this month's
 * official index reading (`price_index_readings`) once, via the monthly
 * ritual; the formula does the rest:
 *
 *   new_reference_price = base_reference_price × (1 + officially announced monthly CPI change)
 *
 * Deliberately manual entry (not a scraper/API integration) per §17.5.13(a) —
 * the founder's constraint is attention, not code.
 */
export class PriceIndexService {
  async list(kind?: PriceIndexKind, limit = 50, offset = 0) {
    const where = kind ? { kind } : {};
    const [items, total] = await prisma.$transaction([
      prisma.priceIndexReading.findMany({ where, orderBy: { periodMonth: 'desc' }, take: limit, skip: offset }),
      prisma.priceIndexReading.count({ where }),
    ]);
    return { items, total };
  }

  /**
   * Records a new monthly reading and re-bases every catalog item bound to
   * this index kind (`MaterialCatalog.indexKind`). `[kind, periodMonth]` is
   * unique — recording the same month twice is a conflict, not silently
   * overwritten (a mis-entered figure must be corrected deliberately).
   */
  async recordReading(input: RecordPriceIndexReadingInput) {
    const periodMonth = new Date(input.periodMonth);
    let reading;
    try {
      reading = await prisma.priceIndexReading.create({
        data: {
          kind: input.kind,
          periodMonth,
          valueNumeric: new Prisma.Decimal(input.valueNumeric),
          unit: input.unit ?? null,
          sourceUrl: input.sourceUrl ?? null,
          recordedById: input.recordedById ?? null,
          note: input.note ?? null,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === PrismaErrorCode.UNIQUE_CONSTRAINT_VIOLATION) {
        throw new ConflictError(`A reading for ${input.kind} in ${periodMonth.toISOString().slice(0, 7)} already exists`);
      }
      throw e;
    }

    const rebasedCount = await this.rebaseCatalogForKind(input.kind, reading.periodMonth);
    return { reading, rebasedCount };
  }

  /**
   * Re-bases every active MaterialCatalog item bound to `kind` against the
   * percentage change between the new reading and the immediately preceding
   * one for the same kind. The very first reading of a kind has nothing to
   * compare against, so it sets a baseline only (0 items re-based) — never
   * fabricates a "change" from nothing.
   */
  async rebaseCatalogForKind(kind: PriceIndexKind, periodMonth: Date): Promise<number> {
    const [current, previous] = await Promise.all([
      prisma.priceIndexReading.findUnique({ where: { kind_periodMonth: { kind, periodMonth } } }),
      prisma.priceIndexReading.findFirst({
        where: { kind, periodMonth: { lt: periodMonth } },
        orderBy: { periodMonth: 'desc' },
      }),
    ]);
    if (!current || !previous || previous.valueNumeric.isZero()) return 0;

    const cpiPctChange = current.valueNumeric.minus(previous.valueNumeric).dividedBy(previous.valueNumeric);

    const items = await prisma.materialCatalog.findMany({
      where: { indexKind: kind, baseReferenceFils: { not: null }, isActive: true },
    });

    let rebasedCount = 0;
    for (const item of items) {
      if (item.baseReferenceFils == null) continue;
      const newReferenceFils = rebasePrice(item.baseReferenceFils, cpiPctChange);
      // The price-band invariant (§17.5.5 q4) always holds on write, even for
      // an automated re-basing — clamp into the existing band and log loudly
      // rather than silently publishing an out-of-band customer-facing price.
      const clamped = Math.min(Math.max(newReferenceFils, item.priceMinFils), item.priceMaxFils);
      if (clamped !== newReferenceFils) {
        logger.warn(
          { materialId: item.id, slug: item.slug, newReferenceFils, priceMinFils: item.priceMinFils, priceMaxFils: item.priceMaxFils },
          'materials: index re-basing landed outside the catalog band — clamped, band needs review',
        );
      }
      await prisma.materialCatalog.update({
        where: { id: item.id },
        data: { unitPriceFils: clamped, indexedAt: new Date(), priceRefreshedAt: new Date() },
      });
      rebasedCount++;
    }
    return rebasedCount;
  }
}

/**
 * Pure re-basing formula (§17.5.13): `newReferencePrice = baseReferenceFils *
 * (1 + cpiPctChange)`, rounded to the nearest fils. Exported standalone (not
 * only as a private method) so it's directly unit-testable without a
 * database, per the design doc framing it as "implement as a plain function".
 */
export function rebasePrice(baseReferenceFils: number, cpiPctChange: Prisma.Decimal | number | string): number {
  const factor = new Prisma.Decimal(1).plus(cpiPctChange);
  return new Prisma.Decimal(baseReferenceFils).times(factor).toDecimalPlaces(0).toNumber();
}
