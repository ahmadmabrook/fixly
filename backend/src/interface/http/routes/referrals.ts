import { Router } from 'express';
import { authenticate, requireActiveUser } from '../middleware/auth';
import { asyncHandler } from '../asyncHandler';
import { ReferralService } from '../../../application/referral/ReferralService';

/** Customer referral program (§ referrals): invite code + stats. */
export const referralsRouter: Router = Router();

const referralService = new ReferralService();

referralsRouter.use(authenticate, requireActiveUser);

// GET /referrals/me — the caller's own referral code + stats (total referred,
// total credit earned). Generates the code on first access.
referralsRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    res.json({ data: await referralService.getMyStats(req.user!.userId) });
  }),
);
