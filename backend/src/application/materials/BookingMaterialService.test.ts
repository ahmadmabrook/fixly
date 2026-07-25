import { Prisma, BookingStatus, MaterialLineStatus, VarianceReason } from '@prisma/client';
import { BookingMaterialService, lockBookingMaterials } from './BookingMaterialService';
import { prisma } from '../../infrastructure/database/prisma';
import { NotFoundError, ForbiddenError, ConflictError, ValidationError } from '../../shared/errors';
import type { MaterialCatalogService } from './MaterialCatalogService';

jest.mock('../../infrastructure/database/prisma', () => ({
  prisma: {
    booking: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn() },
    technicianProfile: { findUnique: jest.fn() },
    bookingMaterial: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
    serviceMaterialPolicy: { findUnique: jest.fn() },
    materialVerificationRequest: { create: jest.fn() },
    notification: { create: jest.fn() },
    $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(prisma)),
  },
}));

const mocked = prisma as unknown as {
  booking: { findUnique: jest.Mock; findUniqueOrThrow: jest.Mock };
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
      varianceReason: VarianceReason.OTHER, referencePriceFils: 5000, unitPriceFils: 6500,
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
    mocked.bookingMaterial.findUnique.mockResolvedValue({ id: 'line1', status: MaterialLineStatus.PENDING_REVIEW });
    mocked.bookingMaterial.update.mockResolvedValue({ id: 'line1', status: MaterialLineStatus.APPROVED });
    const svc = new BookingMaterialService(makeCatalogStub());
    const result = await svc.adminReview('line1', 'APPROVED', 'admin1');
    expect(result.status).toBe(MaterialLineStatus.APPROVED);
    expect(mocked.bookingMaterial.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: MaterialLineStatus.APPROVED, reviewedById: 'admin1' }) }),
    );
  });
});

describe('lockBookingMaterials', () => {
  it('locks only PENDING/APPROVED lines, leaving PENDING_REVIEW untouched', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 2 });
    const tx = { bookingMaterial: { updateMany } } as unknown as Prisma.TransactionClient;

    await lockBookingMaterials(tx, BOOKING_ID);

    expect(updateMany).toHaveBeenCalledWith({
      where: { bookingId: BOOKING_ID, status: { in: [MaterialLineStatus.PENDING, MaterialLineStatus.APPROVED] } },
      data: { status: MaterialLineStatus.LOCKED },
    });
  });
});
