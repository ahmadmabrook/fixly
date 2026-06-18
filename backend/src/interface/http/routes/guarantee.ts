import { Router } from 'express';
import { body, param } from 'express-validator';
import { authenticate, requireActiveUser } from '../middleware/auth';
import { asyncHandler } from '../asyncHandler';
import { validate } from '../validate';
import { GuaranteeService } from '../../../application/guarantee/GuaranteeService';

export const guaranteeRouter: Router = Router();

const guaranteeService = new GuaranteeService();

guaranteeRouter.use(authenticate, requireActiveUser);

// GET /guarantee/eligible — completed bookings still inside the 30-day window.
guaranteeRouter.get(
  '/eligible',
  asyncHandler(async (req, res) => {
    const items = await guaranteeService.eligibleBookings(req.user!.userId);
    res.json({ data: items });
  }),
);

// POST /guarantee — open a ticket for an eligible booking.
guaranteeRouter.post(
  '/',
  validate([
    body('bookingId').isUUID(),
    body('description').isString().trim().isLength({ min: 1, max: 2000 }),
    body('mediaUrls').optional({ nullable: true }).isArray({ max: 6 }),
    body('mediaUrls.*').optional().isURL({ protocols: ['https'], require_protocol: true }).isLength({ max: 500 }),
  ]),
  asyncHandler(async (req, res) => {
    const ticket = await guaranteeService.openTicket(
      req.body.bookingId,
      req.user!.userId,
      req.body.description,
      req.body.mediaUrls ?? [],
    );
    res.status(201).json({ data: ticket });
  }),
);

// GET /guarantee — my tickets.
guaranteeRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const items = await guaranteeService.listForCustomer(req.user!.userId);
    res.json({ data: items });
  }),
);

// GET /guarantee/:id
guaranteeRouter.get(
  '/:id',
  validate([param('id').isUUID()]),
  asyncHandler(async (req, res) => {
    const ticket = await guaranteeService.getForCustomer(req.params.id, req.user!.userId);
    res.json({ data: ticket });
  }),
);
