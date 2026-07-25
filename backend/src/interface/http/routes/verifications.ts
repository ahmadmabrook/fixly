import { Router } from 'express';
import { body, param } from 'express-validator';
import { authenticate, requireActiveUser, requireRole } from '../middleware/auth';
import { asyncHandler } from '../asyncHandler';
import { validate } from '../validate';
import { MaterialVerificationService } from '../../../application/materials/MaterialVerificationService';

/**
 * Technician side of the §17.5.14 price-variance dispute protocol: view own
 * open/resolved verification requests and upload the purchase invoice that
 * resolves one within its 24h deadline. Admin resolution lives in
 * adminMaterials.ts; the auto-settle-on-timeout job lives in main.ts.
 */
export const verificationsRouter: Router = Router();

const verificationService = new MaterialVerificationService();

verificationsRouter.use(authenticate, requireActiveUser);

verificationsRouter.get(
  '/',
  requireRole('TECHNICIAN'),
  asyncHandler(async (req, res) => {
    res.json({ data: await verificationService.listForTechnician(req.user!.userId) });
  }),
);

verificationsRouter.post(
  '/:id/invoice',
  requireRole('TECHNICIAN'),
  validate([
    param('id').isUUID(),
    body('invoiceUrl').isURL({ protocols: ['https'], require_protocol: true }).isLength({ max: 500 }),
  ]),
  asyncHandler(async (req, res) => {
    res.json({ data: await verificationService.uploadInvoice(req.params.id, req.user!.userId, req.body.invoiceUrl) });
  }),
);
