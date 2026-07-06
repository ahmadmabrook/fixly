import { Router } from 'express';
import { authenticate, requireActiveUser } from '../middleware/auth';
import { asyncHandler } from '../asyncHandler';
import { ServiceCreditService } from '../../../application/credit/ServiceCreditService';

/** Customer service-credit wallet (§0.3). */
export const creditsRouter: Router = Router();

const creditService = new ServiceCreditService();

creditsRouter.use(authenticate, requireActiveUser);

// GET /credits/me — wallet balance + history.
creditsRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    const [balanceJod, items] = await Promise.all([
      creditService.balance(req.user!.userId),
      creditService.list(req.user!.userId),
    ]);
    res.json({ data: { balanceJod, items } });
  }),
);
