import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { Prisma } from '@prisma/client';
import { authenticate, requireActiveUser, requireRole } from '../middleware/auth';
import { idempotency } from '../middleware/idempotency';
import { asyncHandler } from '../asyncHandler';
import { validate } from '../validate';
import { BookingService, ADVANCEABLE_TO } from '../../../application/booking/BookingService';
import { ReviewService } from '../../../application/review/ReviewService';
import { PaymentService } from '../../../application/payment/PaymentService';
import { PaymentProviderFactory } from '../../../infrastructure/providers/PaymentProviderFactory';
import { MaskedCallService } from '../../../application/booking/MaskedCallService';
import { getDispatchService } from '../../../application/dispatch/DispatchService';
import { BookingMaterialService } from '../../../application/materials/BookingMaterialService';
import { VarianceReason, MaterialSource } from '@prisma/client';
import { ForbiddenError } from '../../../shared/errors';
import { env } from '../../../shared/env';
import { logger } from '../../../shared/logger';
import { MIN_LATITUDE, MAX_LATITUDE, MIN_LONGITUDE, MAX_LONGITUDE } from '../../../shared/geo';

export const bookingsRouter: Router = Router();

const bookingService = new BookingService();
const reviewService = new ReviewService();
const paymentService = new PaymentService(PaymentProviderFactory.create(), env().PAYMENT_PROVIDER);
const maskedCallService = new MaskedCallService();
const bookingMaterialService = new BookingMaterialService();

bookingsRouter.use(authenticate, requireActiveUser);

bookingsRouter.post(
  '/',
  // Money-moving, client-originated creation (§3.1/§3.2/§5.1): an optional
  // Idempotency-Key header dedupes retries so a network-level retry never
  // creates a second booking. No-op when the header is absent.
  idempotency('bookings.create'),
  validate([
    // NOTE: not .isUUID() — seeded service IDs use a non-conformant version nibble (0).
    body('serviceId').isString().trim().notEmpty(),
    // Cap address length so a client can't dump megabytes of text into the DB
    // (or trigger a slow sort in the future). 500 is more than enough for a
    // house/building/landmark description.
    body('addressLine').isString().trim().isLength({ min: 1, max: 500 }),
    body('addressLat').isFloat({ min: MIN_LATITUDE, max: MAX_LATITUDE }),
    body('addressLng').isFloat({ min: MIN_LONGITUDE, max: MAX_LONGITUDE }),
    body('notes').optional({ nullable: true }).isString().trim().isLength({ max: 300 }),
    // A scheduled booking must be in the future — mirrors reschedule()'s guard so
    // a client can't create a booking dated in the past (data anomaly / abuse).
    body('scheduledAt')
      .optional({ nullable: true })
      .isISO8601()
      .custom((v) => {
        if (new Date(v).getTime() <= Date.now()) throw new Error('scheduledAt must be a future time');
        return true;
      }),
    body('promoCode').optional({ nullable: true }).isString().trim().isLength({ min: 1, max: 40 }),
  ]),
  asyncHandler(async (req, res) => {
    const booking = await bookingService.createBooking({
      customerId: req.user!.userId,
      serviceId: req.body.serviceId,
      addressLine: req.body.addressLine,
      addressLat: req.body.addressLat,
      addressLng: req.body.addressLng,
      notes: req.body.notes ?? undefined,
      scheduledAt: req.body.scheduledAt ?? undefined,
      promoCode: req.body.promoCode ?? undefined,
    });

    // Hosted-checkout providers: open the payment session now so the client can mount
    // the widget immediately. `checkout` is null in instant (mock) mode, or if opening
    // the session fails (HyperPay unreachable) — the booking stays AWAITING_PAYMENT and
    // the client can retry via POST /:id/checkout.
    let checkout = null;
    if (PaymentProviderFactory.requiresHostedCheckout()) {
      try {
        checkout = await paymentService.prepareCheckout(booking.id);
      } catch (err) {
        logger.error({ err, bookingId: booking.id }, 'createBooking: failed to open checkout session (client may retry)');
      }
    }
    res.status(201).json({ data: { booking, checkout } });
  }),
);

// (Re-)open a hosted-checkout session for a booking still awaiting payment. Used to
// retry after a failed/abandoned attempt or when the initial create couldn't open one.
bookingsRouter.post(
  '/:id/checkout',
  requireRole('CUSTOMER'),
  validate([param('id').isUUID()]),
  asyncHandler(async (req, res) => {
    const booking = await bookingService.getById(req.params.id, req.user!.userId);
    if (booking.customerId !== req.user!.userId) throw new ForbiddenError('Only the customer can pay');
    const checkout = await paymentService.prepareCheckout(req.params.id);
    res.json({ data: checkout });
  }),
);

// Resolve the outcome of a hosted-checkout session (called from the customer's return
// page). Idempotent — reconciles the PSP result into our state and reports it.
bookingsRouter.get(
  '/:id/payment-status',
  validate([param('id').isUUID()]),
  asyncHandler(async (req, res) => {
    const booking = await bookingService.getById(req.params.id, req.user!.userId);
    if (booking.customerId !== req.user!.userId) throw new ForbiddenError('Only the customer can view payment status');
    const state = await paymentService.finalizeCheckout(req.params.id);
    res.json({ data: { state } });
  }),
);

bookingsRouter.get(
  '/',
  validate([
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt(),
  ]),
  asyncHandler(async (req, res) => {
    const limit = (req.query.limit as unknown as number | undefined) ?? 50;
    const offset = (req.query.offset as unknown as number | undefined) ?? 0;
    const { items, total } = await bookingService.listForUser(req.user!.userId, req.user!.role, limit, offset);
    res.json({ data: items, meta: { total, limit, offset } });
  }),
);

// Technician accepts a PENDING booking (assignment). Wires the existing,
// race-safe BookingService.accept() that had no route before.
bookingsRouter.post(
  '/:id/accept',
  requireRole('TECHNICIAN'),
  validate([param('id').isUUID()]),
  asyncHandler(async (req, res) => {
    const booking = await bookingService.accept(req.params.id, req.user!.userId);
    res.json({ data: booking });
  }),
);

// Technician rejects a dispatched offer. Triggers immediate re-broadcast if
// no OFFERED offers remain for the booking.
bookingsRouter.post(
  '/:id/reject',
  requireRole('TECHNICIAN'),
  validate([param('id').isUUID()]),
  asyncHandler(async (req, res) => {
    await getDispatchService().reject(req.params.id, req.user!.userId);
    res.json({ data: { bookingId: req.params.id, rejected: true } });
  }),
);

bookingsRouter.get(
  '/:id',
  validate([param('id').isUUID()]),
  asyncHandler(async (req, res) => {
    const booking = await bookingService.getById(req.params.id, req.user!.userId);
    res.json({ data: booking });
  }),
);

// Technician advances an active booking: EN_ROUTE → ARRIVED → IN_PROGRESS.
bookingsRouter.post(
  '/:id/status',
  requireRole('TECHNICIAN'),
  validate([
    param('id').isUUID(),
    body('to').isIn(ADVANCEABLE_TO),
  ]),
  asyncHandler(async (req, res) => {
    const booking = await bookingService.advanceStatus(req.params.id, req.user!.userId, req.body.to);
    res.json({ data: booking });
  }),
);

// Technician reports the customer as a no-show after arriving. Only valid from
// ARRIVED; charges the service's callout fee to the customer.
bookingsRouter.post(
  '/:id/no-show',
  requireRole('TECHNICIAN'),
  validate([param('id').isUUID()]),
  asyncHandler(async (req, res) => {
    const booking = await bookingService.noShow(req.params.id, req.user!.userId);
    res.json({ data: booking });
  }),
);

const photoUrlsValidator = body('photoUrls')
  .isArray({ min: 1, max: 10 })
  .withMessage('photoUrls must contain 1-10 items');
const photoUrlValidator = body('photoUrls.*')
  .isURL({ protocols: ['https'], require_protocol: true })
  .isLength({ max: 500 });

// Pre-start SOP checklist (server-enforced gate on ARRIVED → IN_PROGRESS).
bookingsRouter.post(
  '/:id/checklist/pre-start',
  requireRole('TECHNICIAN'),
  validate([param('id').isUUID(), photoUrlsValidator, photoUrlValidator]),
  asyncHandler(async (req, res) => {
    const booking = await bookingService.submitPreStartChecklist(req.params.id, req.user!.userId, req.body.photoUrls);
    res.json({ data: booking });
  }),
);

// Pre-close SOP checklist (server-enforced gate on completion).
bookingsRouter.post(
  '/:id/checklist/pre-close',
  requireRole('TECHNICIAN'),
  validate([param('id').isUUID(), photoUrlsValidator, photoUrlValidator]),
  asyncHandler(async (req, res) => {
    const booking = await bookingService.submitPreCloseChecklist(req.params.id, req.user!.userId, req.body.photoUrls);
    res.json({ data: booking });
  }),
);

bookingsRouter.post(
  '/:id/complete',
  validate([param('id').isUUID()]),
  asyncHandler(async (req, res) => {
    const booking = await bookingService.complete(req.params.id, req.user!.userId);
    res.json({ data: booking });
  }),
);

bookingsRouter.post(
  '/:id/cancel',
  validate([
    param('id').isUUID(),
    body('reason').optional().isString().trim(),
  ]),
  asyncHandler(async (req, res) => {
    const booking = await bookingService.cancel(req.params.id, req.user!.userId, req.body.reason);
    res.json({ data: booking });
  }),
);

// Reschedule a scheduled (not-yet-started) booking to a new time.
bookingsRouter.post(
  '/:id/reschedule',
  requireRole('CUSTOMER'),
  validate([
    param('id').isUUID(),
    body('scheduledAt').isISO8601(),
  ]),
  asyncHandler(async (req, res) => {
    const booking = await bookingService.reschedule(req.params.id, req.user!.userId, req.body.scheduledAt);
    res.json({ data: booking });
  }),
);

// Technician proposes additional work; customer approves/declines.
bookingsRouter.post(
  '/:id/additional-work',
  requireRole('TECHNICIAN'),
  validate([
    param('id').isUUID(),
    body('description').isString().trim().isLength({ min: 1, max: 500 }),
    body('amountJod').custom((v) => {
      let d: Prisma.Decimal;
      try { d = new Prisma.Decimal(String(v)); } catch { throw new Error('amountJod must be a number'); }
      if (!d.isFinite() || d.lessThanOrEqualTo(0)) throw new Error('amountJod must be greater than 0');
      if (d.decimalPlaces() > 3) throw new Error('amountJod supports at most 3 decimal places');
      return true;
    }),
  ]),
  asyncHandler(async (req, res) => {
    const item = await bookingService.proposeAdditionalWork(req.params.id, req.user!.userId, req.body.description, req.body.amountJod);
    res.status(201).json({ data: item });
  }),
);

bookingsRouter.post(
  '/:id/additional-work/:itemId/respond',
  requireRole('CUSTOMER'),
  validate([
    param('id').isUUID(),
    param('itemId').isUUID(),
    body('approve').isBoolean().toBoolean(),
  ]),
  asyncHandler(async (req, res) => {
    const item = await bookingService.respondAdditionalWork(req.params.id, req.params.itemId, req.user!.userId, req.body.approve);
    res.json({ data: item });
  }),
);

bookingsRouter.get(
  '/:id/additional-work',
  validate([param('id').isUUID()]),
  asyncHandler(async (req, res) => {
    const items = await bookingService.listAdditionalWork(req.params.id, req.user!.userId);
    res.json({ data: items });
  }),
);

// Masked calling (Twilio Proxy): either party (customer or the assigned technician)
// gets a proxy number to dial the other without either side seeing the real number.
bookingsRouter.post(
  '/:id/masked-call',
  validate([param('id').isUUID()]),
  asyncHandler(async (req, res) => {
    const result = await maskedCallService.createSession(req.params.id, req.user!.userId);
    res.json({ data: result });
  }),
);

// Rate the other party after completion (customer→technician or technician→customer).
bookingsRouter.post(
  '/:id/review',
  validate([
    param('id').isUUID(),
    body('rating').isInt({ min: 1, max: 5 }).toInt(),
    body('comment').optional({ nullable: true }).isString().trim().isLength({ max: 1000 }),
    body('photos').optional({ nullable: true }).isArray({ max: 6 }),
    body('photos.*').optional().isURL({ protocols: ['https'], require_protocol: true }).isLength({ max: 500 }),
  ]),
  asyncHandler(async (req, res) => {
    const review = await reviewService.submitReview({
      bookingId: req.params.id,
      reviewerId: req.user!.userId,
      rating: req.body.rating,
      comment: req.body.comment ?? undefined,
      photos: req.body.photos ?? undefined,
    });
    res.status(201).json({ data: review });
  }),
);

// ── Bill of Materials (§17.5.9) ─────────────────────────────────────────────
// Created and approved BEFORE execution; locked at ARRIVED->IN_PROGRESS (see
// BookingLifecycleFlow). Post-lock needs route through additional-work above.

const VARIANCE_REASONS = Object.values(VarianceReason);
const MATERIAL_SOURCES = Object.values(MaterialSource);

bookingsRouter.get(
  '/:id/materials',
  validate([param('id').isUUID()]),
  asyncHandler(async (req, res) => {
    res.json({ data: await bookingMaterialService.listForBooking(req.params.id, req.user!.userId) });
  }),
);

bookingsRouter.post(
  '/:id/materials',
  requireRole('TECHNICIAN'),
  validate([
    param('id').isUUID(),
    body('materialId').optional({ nullable: true }).isUUID(),
    body('description').isString().trim().isLength({ min: 1, max: 300 }),
    body('brand').optional({ nullable: true }).isString().trim().isLength({ max: 60 }),
    body('qty').optional().isFloat({ gt: 0 }),
    body('unit').optional({ nullable: true }).isString().trim().isLength({ max: 20 }),
    body('unitPriceFils').isInt({ min: 0 }).toInt(),
    body('source').optional().isIn(MATERIAL_SOURCES),
  ]),
  asyncHandler(async (req, res) => {
    const line = await bookingMaterialService.createLine(req.params.id, req.user!.userId, {
      materialId: req.body.materialId ?? undefined,
      description: req.body.description,
      brand: req.body.brand ?? undefined,
      qty: req.body.qty ?? undefined,
      unit: req.body.unit ?? undefined,
      unitPriceFils: req.body.unitPriceFils,
      source: req.body.source ?? undefined,
    });
    res.status(201).json({ data: line });
  }),
);

bookingsRouter.patch(
  '/:id/materials/:lineId',
  requireRole('TECHNICIAN'),
  validate([
    param('id').isUUID(),
    param('lineId').isUUID(),
    body('materialId').optional({ nullable: true }).isUUID(),
    body('description').optional().isString().trim().isLength({ min: 1, max: 300 }),
    body('brand').optional({ nullable: true }).isString().trim().isLength({ max: 60 }),
    body('qty').optional().isFloat({ gt: 0 }),
    body('unit').optional({ nullable: true }).isString().trim().isLength({ max: 20 }),
    body('unitPriceFils').optional().isInt({ min: 0 }).toInt(),
  ]),
  asyncHandler(async (req, res) => {
    const line = await bookingMaterialService.updateLine(req.params.id, req.params.lineId, req.user!.userId, {
      materialId: req.body.materialId,
      description: req.body.description,
      brand: req.body.brand,
      qty: req.body.qty,
      unit: req.body.unit,
      unitPriceFils: req.body.unitPriceFils,
    });
    res.json({ data: line });
  }),
);

// Technician uploads the required purchase-invoice photo for a BOM line
// (§17.5.9). Above VARIANCE_JUSTIFY_BPS this must include a variance reason.
bookingsRouter.post(
  '/:id/materials/:lineId/invoice',
  requireRole('TECHNICIAN'),
  validate([
    param('id').isUUID(),
    param('lineId').isUUID(),
    body('invoiceUrl').isURL({ protocols: ['https'], require_protocol: true }).isLength({ max: 500 }),
    body('varianceReasonKind').optional({ nullable: true }).isIn(VARIANCE_REASONS),
    body('varianceReasonNote').optional({ nullable: true }).isString().trim().isLength({ max: 500 }),
  ]),
  asyncHandler(async (req, res) => {
    const line = await bookingMaterialService.uploadInvoice(
      req.params.id,
      req.params.lineId,
      req.user!.userId,
      req.body.invoiceUrl,
      req.body.varianceReasonKind ? { reason: req.body.varianceReasonKind, note: req.body.varianceReasonNote } : undefined,
    );
    res.json({ data: line });
  }),
);

// Technician substitutes an already-recorded BOM line for a different
// material (§17.5.10 case 1) — creates a new linked line, never edits in place.
bookingsRouter.post(
  '/:id/materials/:lineId/substitute',
  requireRole('TECHNICIAN'),
  validate([
    param('id').isUUID(),
    param('lineId').isUUID(),
    body('materialId').optional({ nullable: true }).isUUID(),
    body('description').isString().trim().isLength({ min: 1, max: 300 }),
    body('brand').optional({ nullable: true }).isString().trim().isLength({ max: 60 }),
    body('qty').optional().isFloat({ gt: 0 }),
    body('unit').optional({ nullable: true }).isString().trim().isLength({ max: 20 }),
    body('unitPriceFils').isInt({ min: 0 }).toInt(),
    body('source').optional().isIn(MATERIAL_SOURCES),
  ]),
  asyncHandler(async (req, res) => {
    const line = await bookingMaterialService.substituteLine(req.params.id, req.params.lineId, req.user!.userId, {
      materialId: req.body.materialId ?? undefined,
      description: req.body.description,
      brand: req.body.brand ?? undefined,
      qty: req.body.qty ?? undefined,
      unit: req.body.unit ?? undefined,
      unitPriceFils: req.body.unitPriceFils,
      source: req.body.source ?? undefined,
    });
    res.status(201).json({ data: line });
  }),
);

// Customer digitally approves a normal BOM line (no open price dispute)
// before execution (§8.12) — gates the ARRIVED->IN_PROGRESS transition.
bookingsRouter.post(
  '/:id/materials/:lineId/approve',
  requireRole('CUSTOMER'),
  validate([param('id').isUUID(), param('lineId').isUUID()]),
  asyncHandler(async (req, res) => {
    res.json({ data: await bookingMaterialService.approveByCustomer(req.params.id, req.params.lineId, req.user!.userId) });
  }),
);

// Customer digitally acknowledges a justified over-reference line before
// execution (§17.5.14 step 2) — "silence is not consent."
bookingsRouter.post(
  '/:id/materials/:lineId/ack',
  requireRole('CUSTOMER'),
  validate([param('id').isUUID(), param('lineId').isUUID()]),
  asyncHandler(async (req, res) => {
    res.json({ data: await bookingMaterialService.ackByCustomer(req.params.id, req.params.lineId, req.user!.userId) });
  }),
);

// Customer declines a justified over-reference line -> opens a
// MaterialVerificationRequest (§17.5.14 step 3).
bookingsRouter.post(
  '/:id/materials/:lineId/decline',
  requireRole('CUSTOMER'),
  validate([param('id').isUUID(), param('lineId').isUUID()]),
  asyncHandler(async (req, res) => {
    res.json({ data: await bookingMaterialService.declineByCustomer(req.params.id, req.params.lineId, req.user!.userId) });
  }),
);
