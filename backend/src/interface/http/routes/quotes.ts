import { Router } from 'express';
import { body, param } from 'express-validator';
import { authenticate, requireActiveUser } from '../middleware/auth';
import { asyncHandler } from '../asyncHandler';
import { validate } from '../validate';
import { getBookingQuoteService } from '../../../application/quote/BookingQuoteService';
import { MIN_LATITUDE, MAX_LATITUDE, MIN_LONGITUDE, MAX_LONGITUDE } from '../../../shared/geo';

/** Customer video pre-check quotes (§0.3). Ops pricing lives on the admin router. */
export const quotesRouter: Router = Router();


quotesRouter.use(authenticate, requireActiveUser);

// POST /quotes — request a firm quote: video pre-check (fixed_scope
// convenience) OR quote-first assessment (mandatory for quote_first
// services). Which fields are required depends on the target service's
// pricingModel — enforced in BookingQuoteService.create, not here, so the
// same rule applies regardless of caller.
quotesRouter.post(
  '/',
  validate([
    // NOTE: not .isUUID() — seeded service IDs use a non-conformant version
    // nibble (0), same reasoning as POST /bookings (bookings.ts).
    body('serviceId').isString().trim().notEmpty(),
    body('videoUrl').optional({ nullable: true }).isURL({ protocols: ['https'], require_protocol: true }).isLength({ max: 500 }),
    body('siteMediaUrls').optional({ nullable: true }).isArray({ min: 1, max: 20 }),
    body('siteMediaUrls.*').optional().isURL({ protocols: ['https'], require_protocol: true }).isLength({ max: 500 }),
    body('dimensionsNote').optional({ nullable: true }).isString().trim().isLength({ max: 1000 }),
    body('requestedTier').optional({ nullable: true }).isIn(['ECONOMY', 'STANDARD', 'PREMIUM']),
    body('description').optional({ nullable: true }).isString().trim().isLength({ max: 1000 }),
    body('addressLine').optional({ nullable: true }).isString().trim().isLength({ max: 500 }),
    body('addressLat').optional({ nullable: true }).isFloat({ min: MIN_LATITUDE, max: MAX_LATITUDE }).toFloat(),
    body('addressLng').optional({ nullable: true }).isFloat({ min: MIN_LONGITUDE, max: MAX_LONGITUDE }).toFloat(),
  ]),
  asyncHandler(async (req, res) => {
    const quote = await getBookingQuoteService().create(req.user!.userId, {
      serviceId: req.body.serviceId,
      videoUrl: req.body.videoUrl ?? undefined,
      siteMediaUrls: req.body.siteMediaUrls ?? undefined,
      dimensionsNote: req.body.dimensionsNote ?? undefined,
      requestedTier: req.body.requestedTier ?? undefined,
      description: req.body.description ?? undefined,
      addressLine: req.body.addressLine ?? undefined,
      addressLat: req.body.addressLat ?? undefined,
      addressLng: req.body.addressLng ?? undefined,
    });
    res.status(201).json({ data: quote });
  }),
);

// GET /quotes — my quotes.
quotesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ data: await getBookingQuoteService().listForCustomer(req.user!.userId) });
  }),
);

// GET /quotes/:id
quotesRouter.get(
  '/:id',
  validate([param('id').isUUID()]),
  asyncHandler(async (req, res) => {
    res.json({ data: await getBookingQuoteService().getForCustomer(req.params.id, req.user!.userId) });
  }),
);

// POST /quotes/:id/accept — convert a firm quote into a booking at the quoted price.
quotesRouter.post(
  '/:id/accept',
  validate([param('id').isUUID()]),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await getBookingQuoteService().accept(req.params.id, req.user!.userId) });
  }),
);
