import { Router } from 'express';
import { body } from 'express-validator';
import { AuthService } from '../../../application/auth/AuthService';
import { OtpProviderFactory } from '../../../infrastructure/providers/OtpProviderFactory';
import { authenticate, requireActiveUser } from '../middleware/auth';
import { asyncHandler } from '../asyncHandler';
import { validate } from '../validate';
import { USER_REFRESH_COOKIE, setUserRefreshCookie, clearUserRefreshCookie } from '../cookies';

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
    const { accessToken, refreshToken } = await authService.verifyOtp(req.body.phone, req.body.code);
    // Refresh token → httpOnly cookie (never exposed to JS); access token → body.
    setUserRefreshCookie(res, refreshToken);
    res.json({ data: { accessToken } });
  }),
);

authRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    // Refresh token comes from the httpOnly cookie, not the body.
    const { accessToken, refreshToken } = await authService.refresh(req.cookies?.[USER_REFRESH_COOKIE]);
    setUserRefreshCookie(res, refreshToken);
    res.json({ data: { accessToken } });
  }),
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    await authService.logout(req.cookies?.[USER_REFRESH_COOKIE]);
    clearUserRefreshCookie(res);
    res.json({ data: { ok: true } });
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

authRouter.patch(
  '/me',
  authenticate,
  requireActiveUser,
  validate([
    body('name').optional({ nullable: true }).isString().trim().isLength({ min: 1, max: 80 }),
    body('avatarUrl').optional({ nullable: true }).isString().trim().isURL({ protocols: ['https'], require_protocol: true }).isLength({ max: 500 }),
  ]),
  asyncHandler(async (req, res) => {
    const user = await authService.updateProfile(req.user!.userId, {
      name: req.body.name ?? undefined,
      avatarUrl: req.body.avatarUrl ?? undefined,
    });
    res.json({ data: user });
  }),
);

// DELETE /auth/me — customer-initiated account deletion (soft-delete + revoke).
authRouter.delete(
  '/me',
  authenticate,
  requireActiveUser,
  asyncHandler(async (req, res) => {
    await authService.deleteAccount(req.user!.userId);
    clearUserRefreshCookie(res);
    res.json({ data: { ok: true } });
  }),
);
