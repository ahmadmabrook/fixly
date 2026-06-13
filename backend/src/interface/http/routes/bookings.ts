import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../asyncHandler';
import { validate } from '../validate';
import { BookingService, ADVANCEABLE_TO } from '../../../application/booking/BookingService';

export const bookingsRouter: Router = Router();

const bookingService = new BookingService();

bookingsRouter.use(authenticate);

bookingsRouter.post(
  '/',
  validate([
    // NOTE: not .isUUID() — seeded service IDs use a non-conformant version nibble (0).
    body('serviceId').isString().trim().notEmpty(),
    body('addressLine').isString().trim().notEmpty(),
    body('addressLat').isFloat({ min: -90, max: 90 }),
    body('addressLng').isFloat({ min: -180, max: 180 }),
    body('scheduledAt').optional({ nullable: true }).isISO8601(),
  ]),
  asyncHandler(async (req, res) => {
    const booking = await bookingService.createBooking({
      customerId: req.user!.userId,
      serviceId: req.body.serviceId,
      addressLine: req.body.addressLine,
      addressLat: req.body.addressLat,
      addressLng: req.body.addressLng,
      scheduledAt: req.body.scheduledAt ?? undefined,
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
  validate([param('id').isString().notEmpty()]),
  asyncHandler(async (req, res) => {
    const booking = await bookingService.accept(req.params.id, req.user!.userId);
    res.json({ data: booking });
  }),
);

bookingsRouter.get(
  '/:id',
  validate([param('id').isString().notEmpty()]),
  asyncHandler(async (req, res) => {
    const booking = await bookingService.getById(req.params.id, req.user!.userId);
    res.json({ data: booking });
  }),
);

// Technician advances an active booking: EN_ROUTE → ARRIVED → IN_PROGRESS.
bookingsRouter.post(
  '/:id/status',
  validate([
    param('id').isString().notEmpty(),
    body('to').isIn(ADVANCEABLE_TO),
  ]),
  asyncHandler(async (req, res) => {
    const booking = await bookingService.advanceStatus(req.params.id, req.user!.userId, req.body.to);
    res.json({ data: booking });
  }),
);

bookingsRouter.post(
  '/:id/complete',
  validate([param('id').isString().notEmpty()]),
  asyncHandler(async (req, res) => {
    const booking = await bookingService.complete(req.params.id, req.user!.userId);
    res.json({ data: booking });
  }),
);

bookingsRouter.post(
  '/:id/cancel',
  validate([
    param('id').isString().notEmpty(),
    body('reason').optional().isString().trim(),
  ]),
  asyncHandler(async (req, res) => {
    const booking = await bookingService.cancel(req.params.id, req.user!.userId, req.body.reason);
    res.json({ data: booking });
  }),
);
