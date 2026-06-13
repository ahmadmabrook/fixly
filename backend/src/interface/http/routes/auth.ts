import { Router } from 'express';
import { body } from 'express-validator';
import { AuthService } from '../../../application/auth/AuthService';
import { OtpProviderFactory } from '../../../infrastructure/providers/OtpProviderFactory';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../asyncHandler';
import { validate } from '../validate';

export const authRouter: Router = Router();

const authService = new AuthService(OtpProviderFactory.create());

authRouter.post(
  '/otp/request',
  validate([body('phone').isMobilePhone('any')]),
  asyncHandler(async (req, res) => {
    await authService.requestOtp(req.body.phone);
    res.json({ data: { sent: true } });
  }),
);

authRouter.post(
  '/otp/verify',
  validate([
    body('phone').isMobilePhone('any'),
    body('code').isLength({ min: 6, max: 6 }).isNumeric(),
  ]),
  asyncHandler(async (req, res) => {
    const tokens = await authService.verifyOtp(req.body.phone, req.body.code);
    res.json({ data: tokens });
  }),
);

authRouter.post(
  '/refresh',
  validate([body('refreshToken').isString().notEmpty()]),
  asyncHandler(async (req, res) => {
    const tokens = await authService.refresh(req.body.refreshToken);
    res.json({ data: tokens });
  }),
);

authRouter.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await authService.getMe(req.user!.userId);
    res.json({ data: user });
  }),
);
