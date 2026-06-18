import { Router } from 'express';
import { body, param } from 'express-validator';
import { authenticate, requireActiveUser } from '../middleware/auth';
import { asyncHandler } from '../asyncHandler';
import { validate } from '../validate';
import { SupportService } from '../../../application/support/SupportService';

export const supportRouter: Router = Router();

const supportService = new SupportService();

supportRouter.use(authenticate, requireActiveUser);

// POST /support — open a ticket with the first message.
supportRouter.post(
  '/',
  validate([
    body('subject').isString().trim().isLength({ min: 1, max: 140 }),
    body('body').isString().trim().isLength({ min: 1, max: 2000 }),
  ]),
  asyncHandler(async (req, res) => {
    const ticket = await supportService.createTicket(req.user!.userId, req.body.subject, req.body.body);
    res.status(201).json({ data: ticket });
  }),
);

// GET /support — my tickets.
supportRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const items = await supportService.listForUser(req.user!.userId);
    res.json({ data: items });
  }),
);

// GET /support/:id — ticket with its message thread.
supportRouter.get(
  '/:id',
  validate([param('id').isUUID()]),
  asyncHandler(async (req, res) => {
    const ticket = await supportService.getForUser(req.params.id, req.user!.userId);
    res.json({ data: ticket });
  }),
);

// POST /support/:id/messages — reply to my own ticket.
supportRouter.post(
  '/:id/messages',
  validate([param('id').isUUID(), body('body').isString().trim().isLength({ min: 1, max: 2000 })]),
  asyncHandler(async (req, res) => {
    const ticket = await supportService.addCustomerMessage(req.params.id, req.user!.userId, req.body.body);
    res.status(201).json({ data: ticket });
  }),
);
