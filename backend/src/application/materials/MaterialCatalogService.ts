import { Prisma, CatalogSource, MaterialTier, RefreshCadence, PriceConfidence } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma';
import { NotFoundError, ValidationError } from '../../shared/errors';

export interface RecordPriceObservationInput {
  materialId: string;
  supplierId?: string | null;
  shopName?: string | null;
  area?: string | null;
  observedFils: number;
  observedById?: string | null;
  note?: string | null;
}

/** refreshCadence → days before a catalogue row counts as overdue for its
 *  §17.5.6 retail-refresh ritual. */
const CADENCE_DAYS: Record<RefreshCadence, number> = {
  [RefreshCadence.MONTHLY]: 30,
  [RefreshCadence.QUARTERLY]: 90,
  [RefreshCadence.SEMIANNUAL]: 180,
};

export interface UpsertMaterialCatalogInput {
  serviceId?: string | null;
  supplierId?: string | null;
  catalogSource?: CatalogSource;
  refreshCadence?: RefreshCadence;
  priceConfidence?: PriceConfidence;
  slug?: string;
  subcategory?: string | null;
  allowedForServices?: string[];
  nameAr?: string;
  nameEn?: string;
  brand?: string | null;
  tier?: MaterialTier;
  unit?: string;
  wholesaleFils?: number | null;
  unitPriceFils?: number;
  priceMinFils?: number;
  priceMaxFils?: number;
  varianceAlertBps?: number;
  coverageNote?: string | null;
  isActive?: boolean;
}

/**
 * The Fixly materials price book (§17.5.6-§17.5.8, L2 maturity). The single
 * invariant every write must hold, per §17.5.5 question 4 ("materials are
 * priced ONLY against the material_catalog price book, within
 * [price_min, price_max]"): `priceMinFils <= unitPriceFils <= priceMaxFils`.
 * Enforced here — the single source of truth for this rule — rather than at
 * the route layer, so every writer (this CRUD, price-index re-basing) goes
 * through the same check.
 */
export class MaterialCatalogService {
  async list(filters: { serviceId?: string; isActive?: boolean } = {}, limit = 100, offset = 0) {
    const where: Prisma.MaterialCatalogWhereInput = {
      ...(filters.serviceId ? { serviceId: filters.serviceId } : {}),
      ...(filters.isActive !== undefined ? { isActive: filters.isActive } : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.materialCatalog.findMany({ where, orderBy: { updatedAt: 'desc' }, take: limit, skip: offset }),
      prisma.materialCatalog.count({ where }),
    ]);
    return { items, total };
  }

  async get(id: string) {
    const item = await prisma.materialCatalog.findUnique({ where: { id } });
    if (!item) throw new NotFoundError('MaterialCatalog');
    return item;
  }

  async create(input: UpsertMaterialCatalogInput) {
    if (input.slug == null || input.nameAr == null || input.nameEn == null || input.unit == null) {
      throw new ValidationError('slug, nameAr, nameEn and unit are required');
    }
    if (input.unitPriceFils == null || input.priceMinFils == null || input.priceMaxFils == null) {
      throw new ValidationError('unitPriceFils, priceMinFils and priceMaxFils are required');
    }
    this.assertPriceBand(input.unitPriceFils, input.priceMinFils, input.priceMaxFils);

    return prisma.materialCatalog.create({
      data: {
        serviceId: input.serviceId ?? null,
        supplierId: input.supplierId ?? null,
        catalogSource: input.catalogSource ?? undefined,
        refreshCadence: input.refreshCadence ?? undefined,
        priceConfidence: input.priceConfidence ?? undefined,
        slug: input.slug,
        subcategory: input.subcategory ?? null,
        allowedForServices: input.allowedForServices ?? [],
        nameAr: input.nameAr,
        nameEn: input.nameEn,
        brand: input.brand ?? null,
        tier: input.tier ?? undefined,
        unit: input.unit,
        wholesaleFils: input.wholesaleFils ?? null,
        unitPriceFils: input.unitPriceFils,
        priceMinFils: input.priceMinFils,
        priceMaxFils: input.priceMaxFils,
        varianceAlertBps: input.varianceAlertBps ?? undefined,
        coverageNote: input.coverageNote ?? null,
        isActive: input.isActive ?? undefined,
        priceRefreshedAt: new Date(),
      },
    });
  }

  async update(id: string, input: UpsertMaterialCatalogInput) {
    const existing = await prisma.materialCatalog.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('MaterialCatalog');

    // Re-validate the FULL resulting band, not just the touched fields — a
    // PATCH that only lowers priceMaxFils must still be checked against the
    // (unchanged) unitPriceFils, and vice versa.
    const unitPriceFils = input.unitPriceFils ?? existing.unitPriceFils;
    const priceMinFils = input.priceMinFils ?? existing.priceMinFils;
    const priceMaxFils = input.priceMaxFils ?? existing.priceMaxFils;
    this.assertPriceBand(unitPriceFils, priceMinFils, priceMaxFils);

    return prisma.materialCatalog.update({
      where: { id },
      data: {
        serviceId: input.serviceId === undefined ? undefined : input.serviceId,
        supplierId: input.supplierId === undefined ? undefined : input.supplierId,
        catalogSource: input.catalogSource,
        refreshCadence: input.refreshCadence,
        priceConfidence: input.priceConfidence,
        subcategory: input.subcategory === undefined ? undefined : input.subcategory,
        allowedForServices: input.allowedForServices,
        nameAr: input.nameAr,
        nameEn: input.nameEn,
        brand: input.brand === undefined ? undefined : input.brand,
        tier: input.tier,
        unit: input.unit,
        wholesaleFils: input.wholesaleFils === undefined ? undefined : input.wholesaleFils,
        unitPriceFils,
        priceMinFils,
        priceMaxFils,
        varianceAlertBps: input.varianceAlertBps,
        coverageNote: input.coverageNote === undefined ? undefined : input.coverageNote,
        isActive: input.isActive,
        priceRefreshedAt: input.unitPriceFils != null ? new Date() : undefined,
      },
    });
  }

  /** §17.5.6 stage A item 1 / §17.5.13(b2) "a price with no traceable source is
   *  not allowed to back a customer-facing figure" — the retail-observation log
   *  behind each catalogue row's price. */
  async listObservations(materialId: string, limit = 50, offset = 0) {
    const where = { materialId };
    const [items, total] = await prisma.$transaction([
      prisma.supplierPriceObservation.findMany({ where, orderBy: { observedAt: 'desc' }, take: limit, skip: offset }),
      prisma.supplierPriceObservation.count({ where }),
    ]);
    return { items, total };
  }

  async recordObservation(input: RecordPriceObservationInput) {
    await this.get(input.materialId); // 404s if the material doesn't exist
    return prisma.supplierPriceObservation.create({
      data: {
        materialId: input.materialId,
        supplierId: input.supplierId ?? null,
        shopName: input.shopName ?? null,
        area: input.area ?? null,
        observedFils: input.observedFils,
        observedById: input.observedById ?? null,
        note: input.note ?? null,
      },
    });
  }

  /** §3.4 `GET /admin/catalog/staleness` (v1.10) — active rows overdue for
   *  their refresh cadence, so an operator can see the freshness board without
   *  hand-computing it from lastPricedAt + refreshCadence on every row. */
  async listStale() {
    const items = await prisma.materialCatalog.findMany({ where: { isActive: true } });
    const now = Date.now();
    return items
      .filter((m) => {
        const lastPriced = m.lastPricedAt ?? m.createdAt;
        const overdueDays = (now - lastPriced.getTime()) / (24 * 60 * 60 * 1000);
        return overdueDays > CADENCE_DAYS[m.refreshCadence];
      })
      .sort((a, b) => (a.lastPricedAt ?? a.createdAt).getTime() - (b.lastPricedAt ?? b.createdAt).getTime());
  }

  /** Shared by `create`/`update` and `PriceIndexService`'s re-basing — the one
   *  place §17.5.5's price-band invariant is checked. */
  assertPriceBand(unitPriceFils: number, priceMinFils: number, priceMaxFils: number): void {
    if (priceMinFils > priceMaxFils) {
      throw new ValidationError('priceMinFils must be <= priceMaxFils');
    }
    if (unitPriceFils < priceMinFils || unitPriceFils > priceMaxFils) {
      throw new ValidationError(
        `unitPriceFils (${unitPriceFils}) must be within [priceMinFils=${priceMinFils}, priceMaxFils=${priceMaxFils}]`,
      );
    }
  }
}
