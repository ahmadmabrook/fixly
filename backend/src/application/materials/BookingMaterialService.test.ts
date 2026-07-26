import { Prisma, BookingStatus, MaterialLineStatus, VarianceReason } from '@prisma/client';
import { BookingMaterialService, lockBookingMaterials } from './BookingMaterialService';
import { prisma } from '../../infrastructure/database/prisma';
import { NotFoundError, ForbiddenError, ConflictError, ValidationError } from '../../shared/errors';
import type { MaterialCatalogService } from './MaterialCatalogService';

jest.mock('../../infrastructure/database/prisma', () => ({
  prisma: {
    booking: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), updateMany: jest.fn() },
    technicianProfile: { findUnique: jest.fn() },
    bookingMaterial: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
    serviceMaterialPolicy: { findUnique: jest.fn() },
    materialVerificationRequest: { create: jest.fn() },
    notification: { create: jest.fn() },
    $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(prisma)),
  },
}));

const mocked = prisma as unknown as {
  booking: { findUnique: jest.Mock; findUniqueOrThrow: jest.Mock; updateMany: jest.Mock };
  technicianProfile: { findUnique: jest.Mock };
  bookingMaterial: { create: jest.Mock; update: jest.Mock; findUnique: jest.Mock; updateMany: jest.Mock };
  serviceMaterialPolicy: { findUnique: jest.Mock };
  materialVerificationRequest: { create: jest.Mock };
};

function makeCatalogStub(overrides: Partial<{ get: jest.Mock }> = {}) {
  return {
    get: overrides.get ?? jest.fn(),
    assertPriceBand: jest.fn((unit: number, min: number, max: number) => {
      if (unit < min || unit > max) throw new ValidationError('out of band');
    }),
  } as unknown as MaterialCatalogService;
}

const TECH_USER = 'tech-user-1';
const TECH_PROFILE_ID = 'tech-profile-1';
const BOOKING_ID = 'booking-1';

describe('BookingMaterialService.createLine', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects creation once the booking has passed the lock point (IN_PROGRESS)', async () => {
    mocked.technicianProfile.findUnique.mockResolvedValue({ id: TECH_PROFILE_ID });
    mocked.booking.findUnique.mockResolvedValue({ id: BOOKING_ID, technicianId: TECH_PROFILE_ID, status: BookingStatus.IN_PROGRESS, serviceId: 's1' });
    const svc = new BookingMaterialService(makeCatalogStub());

    await expect(
      svc.createLine(BOOKING_ID, TECH_USER, { description: 'Extra paint', unitPriceFils: 4000 }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejects a non-assigned technician', async () => {
    mocked.technicianProfile.findUnique.mockResolvedValue({ id: 'someone-else' });
    mocked.booking.findUnique.mockResolvedValue({ id: BOOKING_ID, technicianId: TECH_PROFILE_ID, status: BookingStatus.ARRIVED, serviceId: 's1' });
    const svc = new BookingMaterialService(makeCatalogStub());

    await expect(
      svc.createLine(BOOKING_ID, TECH_USER, { description: 'Paint', unitPriceFils: 4000 }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('auto-flags an off-catalogue line as pending_review', async () => {
    mocked.technicianProfile.findUnique.mockResolvedValue({ id: TECH_PROFILE_ID });
    mocked.booking.findUnique.mockResolvedValue({ id: BOOKING_ID, technicianId: TECH_PROFILE_ID, status: BookingStatus.ARRIVED, serviceId: 's1' });
    mocked.serviceMaterialPolicy.findUnique.mockResolvedValue(null);
    mocked.bookingMaterial.create.mockResolvedValue({});
    const svc = new BookingMaterialService(makeCatalogStub());

    await svc.createLine(BOOKING_ID, TECH_USER, { description: 'Odd part from a specialty shop', unitPriceFils: 4000 });

    expect(mocked.bookingMaterial.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ materialId: null, status: MaterialLineStatus.PENDING_REVIEW, referencePriceFils: null }) }),
    );
  });

  it('prices a catalogue line within its band as PENDING when variance is low', async () => {
    mocked.technicianProfile.findUnique.mockResolvedValue({ id: TECH_PROFILE_ID });
    mocked.booking.findUnique.mockResolvedValue({ id: BOOKING_ID, technicianId: TECH_PROFILE_ID, status: BookingStatus.ARRIVED, serviceId: 's1' });
    mocked.serviceMaterialPolicy.findUnique.mockResolvedValue(null);
    mocked.bookingMaterial.create.mockResolvedValue({});
    const get = jest.fn().mockResolvedValue({ id: 'mat1', unitPriceFils: 5000, priceMinFils: 3000, priceMaxFils: 7000, varianceAlertBps: 1500 });
    const svc = new BookingMaterialService(makeCatalogStub({ get }));

    await svc.createLine(BOOKING_ID, TECH_USER, { materialId: 'mat1', description: 'Breaker 16A', unitPriceFils: 5100, qty: 2 });

    expect(mocked.bookingMaterial.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: MaterialLineStatus.PENDING, referencePriceFils: 5000, totalFils: 10200 }),
      }),
    );
  });

  it('auto-flags a catalogue line beyond its per-item varianceAlertBps as pending_review', async () => {
    mocked.technicianProfile.findUnique.mockResolvedValue({ id: TECH_PROFILE_ID });
    mocked.booking.findUnique.mockResolvedValue({ id: BOOKING_ID, technicianId: TECH_PROFILE_ID, status: BookingStatus.ARRIVED, serviceId: 's1' });
    mocked.serviceMaterialPolicy.findUnique.mockResolvedValue(null);
    mocked.bookingMaterial.create.mockResolvedValue({});
    // reference 5000, alert at 1500bps (15%) → 5750 is the ceiling before flagging
    const get = jest.fn().mockResolvedValue({ id: 'mat1', unitPriceFils: 5000, priceMinFils: 3000, priceMaxFils: 7000, varianceAlertBps: 1500 });
    const svc = new BookingMaterialService(makeCatalogStub({ get }));

    await svc.createLine(BOOKING_ID, TECH_USER, { materialId: 'mat1', description: 'Breaker 16A', unitPriceFils: 6500 });

    expect(mocked.bookingMaterial.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: MaterialLineStatus.PENDING_REVIEW }) }),
    );
  });

  it('rejects a catalogue price outside [priceMinFils, priceMaxFils]', async () => {
    mocked.technicianProfile.findUnique.mockResolvedValue({ id: TECH_PROFILE_ID });
    mocked.booking.findUnique.mockResolvedValue({ id: BOOKING_ID, technicianId: TECH_PROFILE_ID, status: BookingStatus.ARRIVED, serviceId: 's1' });
    const get = jest.fn().mockResolvedValue({ id: 'mat1', unitPriceFils: 5000, priceMinFils: 3000, priceMaxFils: 7000, varianceAlertBps: 1500 });
    const svc = new BookingMaterialService(makeCatalogStub({ get }));

    await expect(
      svc.createLine(BOOKING_ID, TECH_USER, { materialId: 'mat1', description: 'Breaker 16A', unitPriceFils: 9000 }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('BookingMaterialService.uploadInvoice', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects completing the invoice above VARIANCE_JUSTIFY_BPS without a reason', async () => {
    mocked.technicianProfile.findUnique.mockResolvedValue({ id: TECH_PROFILE_ID });
    mocked.booking.findUnique.mockResolvedValue({ id: BOOKING_ID, technicianId: TECH_PROFILE_ID, status: BookingStatus.ARRIVED });
    mocked.bookingMaterial.findUnique.mockResolvedValue({
      id: 'line1', bookingId: BOOKING_ID, status: MaterialLineStatus.PENDING_REVIEW, varianceBps: 2500, varianceReason: null,
    });
    const svc = new BookingMaterialService(makeCatalogStub());

    await expect(svc.uploadInvoice(BOOKING_ID, 'line1', TECH_USER, 'https://x/invoice.jpg')).rejects.toBeInstanceOf(ValidationError);
  });

  it('accepts the invoice when a reason is supplied for a high-variance line', async () => {
    mocked.technicianProfile.findUnique.mockResolvedValue({ id: TECH_PROFILE_ID });
    mocked.booking.findUnique.mockResolvedValue({ id: BOOKING_ID, technicianId: TECH_PROFILE_ID, status: BookingStatus.ARRIVED });
    mocked.bookingMaterial.findUnique.mockResolvedValue({
      id: 'line1', bookingId: BOOKING_ID, status: MaterialLineStatus.PENDING_REVIEW, varianceBps: 2500, varianceReason: null,
    });
    mocked.bookingMaterial.update.mockResolvedValue({});
    const svc = new BookingMaterialService(makeCatalogStub());

    await svc.uploadInvoice(BOOKING_ID, 'line1', TECH_USER, 'https://x/invoice.jpg', { reason: VarianceReason.IMPORTED_BRAND, note: 'Legrand import' });

    expect(mocked.bookingMaterial.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ varianceReason: VarianceReason.IMPORTED_BRAND, supplierInvoiceUrl: 'https://x/invoice.jpg' }) }),
    );
  });

  it('rejects uploading against a line that already left the editable state', async () => {
    mocked.technicianProfile.findUnique.mockResolvedValue({ id: TECH_PROFILE_ID });
    mocked.booking.findUnique.mockResolvedValue({ id: BOOKING_ID, technicianId: TECH_PROFILE_ID, status: BookingStatus.IN_PROGRESS });
    mocked.bookingMaterial.findUnique.mockResolvedValue({ id: 'line1', bookingId: BOOKING_ID, status: MaterialLineStatus.LOCKED });
    const svc = new BookingMaterialService(makeCatalogStub());

    await expect(svc.uploadInvoice(BOOKING_ID, 'line1', TECH_USER, 'https://x/invoice.jpg')).rejects.toBeInstanceOf(ConflictError);
  });
});

describe('BookingMaterialService.ackByCustomer / declineByCustomer', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects ack from a non-owner customer', async () => {
    mocked.booking.findUnique.mockResolvedValue({ customerId: 'owner-1' });
    const svc = new BookingMaterialService(makeCatalogStub());
    await expect(svc.ackByCustomer(BOOKING_ID, 'line1', 'someone-else')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects ack on a line with no recorded variance reason', async () => {
    mocked.booking.findUnique.mockResolvedValue({ customerId: 'owner-1' });
    mocked.bookingMaterial.findUnique.mockResolvedValue({ id: 'line1', bookingId: BOOKING_ID, status: MaterialLineStatus.PENDING_REVIEW, varianceReason: null });
    const svc = new BookingMaterialService(makeCatalogStub());
    await expect(svc.ackByCustomer(BOOKING_ID, 'line1', 'owner-1')).rejects.toBeInstanceOf(ValidationError);
  });

  it('opens a MaterialVerificationRequest with the correct delta and a 24h deadline on decline', async () => {
    mocked.booking.findUnique.mockResolvedValue({ customerId: 'owner-1' });
    mocked.bookingMaterial.findUnique.mockResolvedValue({
      id: 'line1', bookingId: BOOKING_ID, status: MaterialLineStatus.PENDING_REVIEW,
      varianceReason: VarianceReason.OTHER, referencePriceFils: 5000, unitPriceFils: 6500, qty: 1,
    });
    mocked.booking.findUniqueOrThrow.mockResolvedValue({ technician: { id: TECH_PROFILE_ID, userId: TECH_USER } });
    mocked.bookingMaterial.update.mockResolvedValue({});
    mocked.materialVerificationRequest.create.mockResolvedValue({ id: 'mvr1' });
    const svc = new BookingMaterialService(makeCatalogStub());

    const before = Date.now();
    const request = await svc.declineByCustomer(BOOKING_ID, 'line1', 'owner-1');
    const after = Date.now();

    expect(request).toEqual({ id: 'mvr1' });
    expect(mocked.materialVerificationRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ referencePriceFils: 5000, chargedPriceFils: 6500, deltaFils: 1500, technicianId: TECH_PROFILE_ID }),
      }),
    );
    const deadlineAt: Date = mocked.materialVerificationRequest.create.mock.calls[0][0].data.deadlineAt;
    const hoursOut = (deadlineAt.getTime() - before) / (60 * 60 * 1000);
    expect(hoursOut).toBeGreaterThanOrEqual(23.99);
    expect(hoursOut).toBeLessThanOrEqual(24.01);
    expect(deadlineAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(deadlineAt.getTime()).toBeLessThanOrEqual(after + 24 * 60 * 60 * 1000);
  });
});

describe('BookingMaterialService.adminReview', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects reviewing a line that is not pending_review', async () => {
    mocked.bookingMaterial.findUnique.mockResolvedValue({ id: 'line1', status: MaterialLineStatus.PENDING });
    const svc = new BookingMaterialService(makeCatalogStub());
    await expect(svc.adminReview('line1', 'APPROVED', 'admin1')).rejects.toBeInstanceOf(ConflictError);
  });

  it('throws NotFoundError for a missing line', async () => {
    mocked.bookingMaterial.findUnique.mockResolvedValue(null);
    const svc = new BookingMaterialService(makeCatalogStub());
    await expect(svc.adminReview('missing', 'APPROVED', 'admin1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('approves a pending_review line', async () => {
    // Catalogue-linked (materialId set): the off-catalogue "invoice required
    // before approval" guard is a separate rule, covered by its own test below.
    mocked.bookingMaterial.findUnique.mockResolvedValue({ id: 'line1', status: MaterialLineStatus.PENDING_REVIEW, materialId: 'mat1' });
    mocked.bookingMaterial.update.mockResolvedValue({ id: 'line1', status: MaterialLineStatus.APPROVED });
    const svc = new BookingMaterialService(makeCatalogStub());
    const result = await svc.adminReview('line1', 'APPROVED', 'admin1');
    expect(result.status).toBe(MaterialLineStatus.APPROVED);
    expect(mocked.bookingMaterial.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: MaterialLineStatus.APPROVED, reviewedById: 'admin1' }) }),
    );
  });

  it('rejects approving an off-catalogue line with no uploaded invoice', async () => {
    mocked.bookingMaterial.findUnique.mockResolvedValue({ id: 'line1', status: MaterialLineStatus.PENDING_REVIEW, materialId: null, supplierInvoiceUrl: null });
    const svc = new BookingMaterialService(makeCatalogStub());
    await expect(svc.adminReview('line1', 'APPROVED', 'admin1')).rejects.toBeInstanceOf(ValidationError);
    expect(mocked.bookingMaterial.update).not.toHaveBeenCalled();
  });

  it('approves an off-catalogue line once it has an uploaded invoice', async () => {
    mocked.bookingMaterial.findUnique.mockResolvedValue({ id: 'line1', status: MaterialLineStatus.PENDING_REVIEW, materialId: null, supplierInvoiceUrl: 'https://x/invoice.jpg' });
    mocked.bookingMaterial.update.mockResolvedValue({ id: 'line1', status: MaterialLineStatus.APPROVED });
    const svc = new BookingMaterialService(makeCatalogStub());
    const result = await svc.adminReview('line1', 'APPROVED', 'admin1');
    expect(result.status).toBe(MaterialLineStatus.APPROVED);
  });

  it('allows declining an off-catalogue line with no invoice (no approval guard on decline)', async () => {
    mocked.bookingMaterial.findUnique.mockResolvedValue({ id: 'line1', status: MaterialLineStatus.PENDING_REVIEW, materialId: null, supplierInvoiceUrl: null });
    mocked.bookingMaterial.update.mockResolvedValue({ id: 'line1', status: MaterialLineStatus.DECLINED });
    const svc = new BookingMaterialService(makeCatalogStub());
    const result = await svc.adminReview('line1', 'DECLINED', 'admin1');
    expect(result.status).toBe(MaterialLineStatus.DECLINED);
  });
});

describe('BookingMaterialService.substituteLine', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects substitution once the booking has locked the original line', async () => {
    mocked.technicianProfile.findUnique.mockResolvedValue({ id: TECH_PROFILE_ID });
    mocked.booking.findUnique.mockResolvedValue({ id: BOOKING_ID, technicianId: TECH_PROFILE_ID, status: BookingStatus.IN_PROGRESS, serviceId: 's1' });
    mocked.bookingMaterial.findUnique.mockResolvedValue({ id: 'line1', bookingId: BOOKING_ID, status: MaterialLineStatus.LOCKED, materialId: null, source: 'TECHNICIAN_PROCURED' });
    const svc = new BookingMaterialService(makeCatalogStub());

    await expect(
      svc.substituteLine(BOOKING_ID, 'line1', TECH_USER, { description: 'Different paint', unitPriceFils: 4000 }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejects any substitute (even off-catalogue) when the service policy is NOT_ALLOWED', async () => {
    mocked.technicianProfile.findUnique.mockResolvedValue({ id: TECH_PROFILE_ID });
    mocked.booking.findUnique.mockResolvedValue({ id: BOOKING_ID, technicianId: TECH_PROFILE_ID, status: BookingStatus.ARRIVED, serviceId: 's1' });
    mocked.bookingMaterial.findUnique.mockResolvedValue({ id: 'line1', bookingId: BOOKING_ID, status: MaterialLineStatus.PENDING, materialId: null, source: 'TECHNICIAN_PROCURED' });
    mocked.serviceMaterialPolicy.findUnique.mockResolvedValue({ substitution: 'NOT_ALLOWED' });
    const svc = new BookingMaterialService(makeCatalogStub());

    // No materialId — an off-catalogue substitute — must still be blocked.
    await expect(
      svc.substituteLine(BOOKING_ID, 'line1', TECH_USER, { description: 'Different paint', unitPriceFils: 4000 }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a lower-tier substitute material (SAME_OR_HIGHER_TIER default)', async () => {
    mocked.technicianProfile.findUnique.mockResolvedValue({ id: TECH_PROFILE_ID });
    mocked.booking.findUnique.mockResolvedValue({ id: BOOKING_ID, technicianId: TECH_PROFILE_ID, status: BookingStatus.ARRIVED, serviceId: 's1' });
    mocked.bookingMaterial.findUnique.mockResolvedValue({ id: 'line1', bookingId: BOOKING_ID, status: MaterialLineStatus.PENDING, materialId: 'old-mat', source: 'TECHNICIAN_PROCURED' });
    mocked.serviceMaterialPolicy.findUnique.mockResolvedValue(null);
    const get = jest.fn()
      .mockResolvedValueOnce({ id: 'old-mat', tier: 'PREMIUM', unitPriceFils: 5000, priceMinFils: 3000, priceMaxFils: 7000 })
      .mockResolvedValueOnce({ id: 'new-mat', tier: 'ECONOMY', unitPriceFils: 4000, priceMinFils: 2000, priceMaxFils: 6000 });
    const svc = new BookingMaterialService(makeCatalogStub({ get }));

    await expect(
      svc.substituteLine(BOOKING_ID, 'line1', TECH_USER, { materialId: 'new-mat', description: 'Cheaper paint', unitPriceFils: 4000 }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('creates a linked replacement line and marks the original REPLACED', async () => {
    mocked.technicianProfile.findUnique.mockResolvedValue({ id: TECH_PROFILE_ID });
    mocked.booking.findUnique.mockResolvedValue({ id: BOOKING_ID, technicianId: TECH_PROFILE_ID, status: BookingStatus.ARRIVED, serviceId: 's1' });
    mocked.bookingMaterial.findUnique.mockResolvedValue({ id: 'line1', bookingId: BOOKING_ID, status: MaterialLineStatus.PENDING, materialId: null, source: 'TECHNICIAN_PROCURED' });
    mocked.serviceMaterialPolicy.findUnique.mockResolvedValue(null);
    mocked.bookingMaterial.update.mockResolvedValue({});
    mocked.bookingMaterial.create.mockResolvedValue({ id: 'line2' });
    const svc = new BookingMaterialService(makeCatalogStub());

    const result = await svc.substituteLine(BOOKING_ID, 'line1', TECH_USER, { description: 'Different off-catalogue part', unitPriceFils: 4000 });

    expect(mocked.bookingMaterial.update).toHaveBeenCalledWith({ where: { id: 'line1' }, data: { status: MaterialLineStatus.REPLACED } });
    expect(mocked.bookingMaterial.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ replacesLineId: 'line1', status: MaterialLineStatus.PENDING_REVIEW }) }),
    );
    expect(result).toEqual({ id: 'line2' });
  });
});

describe('BookingMaterialService.approveByCustomer', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects approval of a line that is not plain PENDING (e.g. still under review)', async () => {
    mocked.booking.findUnique.mockResolvedValue({ customerId: 'owner-1' });
    mocked.bookingMaterial.findUnique.mockResolvedValue({ id: 'line1', bookingId: BOOKING_ID, status: MaterialLineStatus.PENDING_REVIEW });
    const svc = new BookingMaterialService(makeCatalogStub());

    await expect(svc.approveByCustomer(BOOKING_ID, 'line1', 'owner-1')).rejects.toBeInstanceOf(ConflictError);
  });

  it('sets customerAckAt and stamps the booking-level workmanship-only ack for a CUSTOMER_SUPPLIED line', async () => {
    mocked.booking.findUnique.mockResolvedValue({ customerId: 'owner-1' });
    mocked.bookingMaterial.findUnique.mockResolvedValue({ id: 'line1', bookingId: BOOKING_ID, status: MaterialLineStatus.PENDING, source: 'CUSTOMER_SUPPLIED' });
    mocked.bookingMaterial.update.mockResolvedValue({ id: 'line1', customerAckAt: new Date() });
    mocked.booking.updateMany.mockResolvedValue({ count: 1 });
    const svc = new BookingMaterialService(makeCatalogStub());

    await svc.approveByCustomer(BOOKING_ID, 'line1', 'owner-1');

    expect(mocked.bookingMaterial.update).toHaveBeenCalledWith({ where: { id: 'line1' }, data: { customerAckAt: expect.any(Date) } });
    expect(mocked.booking.updateMany).toHaveBeenCalledWith({
      where: { id: BOOKING_ID, customerSuppliedMaterialsAckAt: null },
      data: { customerSuppliedMaterialsAckAt: expect.any(Date) },
    });
  });

  it('does not touch the booking-level ack for a normal TECHNICIAN_PROCURED line', async () => {
    mocked.booking.findUnique.mockResolvedValue({ customerId: 'owner-1' });
    mocked.bookingMaterial.findUnique.mockResolvedValue({ id: 'line1', bookingId: BOOKING_ID, status: MaterialLineStatus.PENDING, source: 'TECHNICIAN_PROCURED' });
    mocked.bookingMaterial.update.mockResolvedValue({ id: 'line1' });
    const svc = new BookingMaterialService(makeCatalogStub());

    await svc.approveByCustomer(BOOKING_ID, 'line1', 'owner-1');

    expect(mocked.booking.updateMany).not.toHaveBeenCalled();
  });
});

describe('BookingMaterialService.settleExpiredBomReviews', () => {
  it('auto-approves overdue pending_review lines in a single bulk update (§0.6.2)', async () => {
    mocked.bookingMaterial.updateMany.mockResolvedValue({ count: 3 });
    const svc = new BookingMaterialService(makeCatalogStub());

    const settled = await svc.settleExpiredBomReviews();

    expect(settled).toBe(3);
    expect(mocked.bookingMaterial.updateMany).toHaveBeenCalledWith({
      where: { status: MaterialLineStatus.PENDING_REVIEW, createdAt: { lt: expect.any(Date) } },
      data: { status: MaterialLineStatus.APPROVED, reviewedAt: expect.any(Date) },
    });
  });
});

describe('lockBookingMaterials', () => {
  it('locks only PENDING/APPROVED lines, leaving PENDING_REVIEW untouched, and folds their total into materialsFils/totalJod', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 2 });
    const findMany = jest.fn().mockResolvedValue([{ totalFils: 3000 }, { totalFils: 2000 }]);
    const findUniqueOrThrow = jest.fn().mockResolvedValue({ totalJod: new Prisma.Decimal(20) });
    const update = jest.fn().mockResolvedValue({});
    const tx = {
      bookingMaterial: { updateMany, findMany },
      booking: { findUniqueOrThrow, update },
    } as unknown as Prisma.TransactionClient;

    await lockBookingMaterials(tx, BOOKING_ID);

    expect(updateMany).toHaveBeenCalledWith({
      where: { bookingId: BOOKING_ID, status: { in: [MaterialLineStatus.PENDING, MaterialLineStatus.APPROVED] } },
      data: { status: MaterialLineStatus.LOCKED },
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: BOOKING_ID },
      data: { materialsFils: { increment: 5000 }, totalJod: new Prisma.Decimal(25) },
    });
  });

  it('is a no-op when there are no execution-ready lines to lock', async () => {
    const updateMany = jest.fn();
    const findMany = jest.fn().mockResolvedValue([]);
    const tx = { bookingMaterial: { updateMany, findMany } } as unknown as Prisma.TransactionClient;

    await lockBookingMaterials(tx, BOOKING_ID);

    expect(updateMany).not.toHaveBeenCalled();
  });
});
