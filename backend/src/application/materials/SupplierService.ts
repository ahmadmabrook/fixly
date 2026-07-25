import { prisma } from '../../infrastructure/database/prisma';
import { NotFoundError, ValidationError } from '../../shared/errors';

export interface UpsertSupplierInput {
  name?: string;
  contactPhone?: string | null;
  categories?: string[];
  contractRef?: string | null;
  isPilot?: boolean;
  referralCommissionBps?: number | null;
  agreementKind?: string;
  trialStartedAt?: Date | string | null;
  trialEndsAt?: Date | string | null;
  commissionPaidOk?: boolean | null;
  priceManipulationObserved?: boolean | null;
  trialNotes?: string | null;
  isActive?: boolean;
}

/**
 * Wholesale/referral partners (§17.5.6). Day-one suppliers are 2-3 small
 * retail shops on a zero-risk 30-day referral trial (`isPilot`, no
 * contract) — not the wholesale-contract model, which is Stage B / L3 and
 * post-MVP.
 */
export class SupplierService {
  async list(filters: { isActive?: boolean; isPilot?: boolean } = {}, limit = 100, offset = 0) {
    const where = {
      ...(filters.isActive !== undefined ? { isActive: filters.isActive } : {}),
      ...(filters.isPilot !== undefined ? { isPilot: filters.isPilot } : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.supplier.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit, skip: offset }),
      prisma.supplier.count({ where }),
    ]);
    return { items, total };
  }

  async get(id: string) {
    const supplier = await prisma.supplier.findUnique({ where: { id } });
    if (!supplier) throw new NotFoundError('Supplier');
    return supplier;
  }

  async create(input: UpsertSupplierInput) {
    if (!input.name) throw new ValidationError('name is required');
    return prisma.supplier.create({
      data: {
        name: input.name,
        contactPhone: input.contactPhone ?? null,
        categories: input.categories ?? [],
        contractRef: input.contractRef ?? null,
        isPilot: input.isPilot ?? undefined,
        referralCommissionBps: input.referralCommissionBps ?? null,
        agreementKind: input.agreementKind ?? undefined,
        trialStartedAt: input.trialStartedAt ? new Date(input.trialStartedAt) : null,
        trialEndsAt: input.trialEndsAt ? new Date(input.trialEndsAt) : null,
        trialNotes: input.trialNotes ?? null,
        isActive: input.isActive ?? undefined,
      },
    });
  }

  /** Records the §17.5.16 30-day field-test verdict (`commissionPaidOk` /
   *  `priceManipulationObserved`) alongside ordinary field edits. */
  async update(id: string, input: UpsertSupplierInput) {
    const existing = await prisma.supplier.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Supplier');
    return prisma.supplier.update({
      where: { id },
      data: {
        name: input.name,
        contactPhone: input.contactPhone === undefined ? undefined : input.contactPhone,
        categories: input.categories,
        contractRef: input.contractRef === undefined ? undefined : input.contractRef,
        isPilot: input.isPilot,
        referralCommissionBps: input.referralCommissionBps === undefined ? undefined : input.referralCommissionBps,
        agreementKind: input.agreementKind,
        trialStartedAt: input.trialStartedAt === undefined ? undefined : input.trialStartedAt ? new Date(input.trialStartedAt) : null,
        trialEndsAt: input.trialEndsAt === undefined ? undefined : input.trialEndsAt ? new Date(input.trialEndsAt) : null,
        commissionPaidOk: input.commissionPaidOk === undefined ? undefined : input.commissionPaidOk,
        priceManipulationObserved: input.priceManipulationObserved === undefined ? undefined : input.priceManipulationObserved,
        trialNotes: input.trialNotes === undefined ? undefined : input.trialNotes,
        isActive: input.isActive,
      },
    });
  }
}
