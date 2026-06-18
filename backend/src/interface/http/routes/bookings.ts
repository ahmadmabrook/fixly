import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { authenticate, requireActiveUser } from '../middleware/auth';
import { asyncHandler } from '../asyncHandler';
import { validate } from '../validate';
import { BookingService, ADVANCEABLE_TO } from '../../../application/booking/BookingService';
import { ReviewService } from '../../../application/review/ReviewService';

export const bookingsRouter: Router = Router();

const bookingService = new BookingService();
const reviewService = new ReviewService();

bookingsRouter.use(authenticate, requireActiveUser);

bookingsRouter.post(
  '/',
  validate([
    // NOTE: not .isUUID() — seeded service IDs use a non-conformant version nibble (0).
    body('serviceId').isString().trim().notEmpty(),
    // Cap address length so a client can't dump megabytes of text into the DB
    // (or trigger a slow sort in the future). 500 is more than enough for a
    // house/building/landmark description.
    body('addressLine').isString().trim().isLength({ min: 1, max: 500 }),
    body('addressLat').isFloat({ min: -90, max: 90 }),
    body('addressLng').isFloat({ min: -180, max: 180 }),
    body('scheduledAt').optional({ nullable: true }).isISO8601(),
    body('promoCode').optional({ nullable: true }).isString().trim().isLength({ min: 1, max: 40 }),
  ]),
  asyncHandler(async (req, res) => {
    const booking = await bookingService.createBooking({
      customerId: req.user!.userId,
      serviceId: req.body.serviceId,
      addressLine: req.body.addressLine,
      addressLat: req.body.addressLat,
      addressLng: req.body.addressLng,
      scheduledAt: req.body.scheduledAt ?? undefined,
      promoCode: req.body.promoCode ?? undefined,
    });
    res.status(201).json({ data: booking });
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
  validate([param('id').isUUID()]),
  asyncHandler(async (req, res) => {
    const booking = await bookingService.accept(req.params.id, req.user!.userId);
    res.json({ data: booking });
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
  validate([
    param('id').isUUID(),
    body('to').isIn(ADVANCEABLE_TO),
  ]),
  asyncHandler(async (req, res) => {
    const booking = await bookingService.advanceStatus(req.params.id, req.user!.userId, req.body.to);
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
  validate([
    param('id').isUUID(),
    body('description').isString().trim().isLength({ min: 1, max: 500 }),
    body('amountJod').custom((v) => {
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0) throw new Error('amountJod must be greater than 0');
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
