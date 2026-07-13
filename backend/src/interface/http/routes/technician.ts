import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate, requireActiveUser } from '../middleware/auth';
import { asyncHandler } from '../asyncHandler';
import { validate } from '../validate';
import {
  TechnicianService,
  MIN_HOURLY_RATE_JOD,
  MAX_HOURLY_RATE_JOD,
  MIN_WITHDRAWAL_JOD,
} from '../../../application/technician/TechnicianService';
import { MIN_LATITUDE, MAX_LATITUDE, MIN_LONGITUDE, MAX_LONGITUDE } from '../../../shared/geo';

/** Technician self-service (the technician portal). Distinct from the public
 *  /technicians router (customer-facing tech cards + reviews). */
export const technicianRouter: Router = Router();

const technicianService = new TechnicianService();

technicianRouter.use(authenticate, requireActiveUser);

// POST /technician/onboarding — apply / resubmit (services, rate, documents).
technicianRouter.post(
  '/onboarding',
  validate([
    body('serviceIds').isArray({ min: 1, max: 10 }),
    body('serviceIds.*').isString().trim().notEmpty(),
    body('hourlyRateJod').isFloat({ min: MIN_HOURLY_RATE_JOD, max: MAX_HOURLY_RATE_JOD }).toFloat(),
    body('vehicle').optional({ nullable: true }).isString().trim().isLength({ max: 120 }),
    body('bio').optional({ nullable: true }).isString().trim().isLength({ max: 1000 }),
    body('idDocUrl').optional({ nullable: true }).isURL({ protocols: ['https'], require_protocol: true }).isLength({ max: 500 }),
    body('certificateUrl').optional({ nullable: true }).isURL({ protocols: ['https'], require_protocol: true }).isLength({ max: 500 }),
    body('selfieUrl').optional({ nullable: true }).isURL({ protocols: ['https'], require_protocol: true }).isLength({ max: 500 }),
    body('introVideoUrl').optional({ nullable: true }).isURL({ protocols: ['https'], require_protocol: true }).isLength({ max: 500 }),
    // Onboarding consent (ToS/SOP agreement) — must be explicitly accepted.
    body('agreementAccepted').isBoolean().toBoolean(),
    // Jordanian national ID: digits only. Encrypted at rest (TechnicianProfile.nationalIdEnc);
    // never returned by any read path.
    body('nationalId').optional({ nullable: true }).isString().trim().isLength({ min: 5, max: 20 }).matches(/^\d+$/),
  ]),
  asyncHandler(async (req, res) => {
    const profile = await technicianService.apply(req.user!.userId, {
      serviceIds: req.body.serviceIds,
      hourlyRateJod: req.body.hourlyRateJod,
      vehicle: req.body.vehicle ?? undefined,
      bio: req.body.bio ?? undefined,
      idDocUrl: req.body.idDocUrl ?? undefined,
      certificateUrl: req.body.certificateUrl ?? undefined,
      selfieUrl: req.body.selfieUrl ?? undefined,
      introVideoUrl: req.body.introVideoUrl ?? undefined,
      agreementAccepted: req.body.agreementAccepted,
      nationalId: req.body.nationalId ?? undefined,
    });
    res.status(201).json({ data: profile });
  }),
);

// GET /technician/me — profile + approval status.
technicianRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    res.json({ data: await technicianService.getMe(req.user!.userId) });
  }),
);

// PATCH /technician/availability — go online/offline.
technicianRouter.patch(
  '/availability',
  validate([body('isAvailable').isBoolean().toBoolean()]),
  asyncHandler(async (req, res) => {
    res.json({ data: await technicianService.setAvailability(req.user!.userId, req.body.isAvailable) });
  }),
);

// POST /technician/location — push current location (also broadcast live via socket).
technicianRouter.post(
  '/location',
  validate([body('lat').isFloat({ min: MIN_LATITUDE, max: MAX_LATITUDE }), body('lng').isFloat({ min: MIN_LONGITUDE, max: MAX_LONGITUDE })]),
  asyncHandler(async (req, res) => {
    res.json({ data: await technicianService.updateLocation(req.user!.userId, req.body.lat, req.body.lng) });
  }),
);

// GET /technician/jobs — nearby unassigned job requests.
technicianRouter.get(
  '/jobs',
  asyncHandler(async (req, res) => {
    res.json({ data: await technicianService.nearbyJobs(req.user!.userId) });
  }),
);

// GET /technician/earnings — today / month / total + withdrawable balance.
technicianRouter.get(
  '/earnings',
  asyncHandler(async (req, res) => {
    res.json({ data: await technicianService.earnings(req.user!.userId) });
  }),
);

// POST /technician/withdrawals — request a cash-out (min 20 JOD, once / 24h).
technicianRouter.post(
  '/withdrawals',
  validate([
    body('amountJod').isFloat({ min: MIN_WITHDRAWAL_JOD }).toFloat(),
    // Optional here (falls back to the saved profile IBAN), but when supplied it
    // must be a valid Jordan IBAN — same money-destination check as bank-account.
    body('iban')
      .optional({ nullable: true })
      .isString()
      .customSanitizer((v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, '').toUpperCase() : v))
      .isIBAN({ whitelist: ['JO'] })
      .withMessage('رقم IBAN غير صالح'),
    body('bankName').optional({ nullable: true }).isString().trim().isLength({ max: 120 }),
  ]),
  asyncHandler(async (req, res) => {
    const withdrawal = await technicianService.requestWithdrawal(req.user!.userId, req.body.amountJod, req.body.iban ?? undefined, req.body.bankName ?? undefined);
    res.status(201).json({ data: withdrawal });
  }),
);

// GET /technician/withdrawals — my withdrawal history.
technicianRouter.get(
  '/withdrawals',
  asyncHandler(async (req, res) => {
    res.json({ data: await technicianService.listWithdrawals(req.user!.userId) });
  }),
);

// POST /technician/intro-video — set the profile trust video (§0.3).
technicianRouter.post(
  '/intro-video',
  validate([body('videoUrl').isURL({ protocols: ['https'], require_protocol: true }).isLength({ max: 500 })]),
  asyncHandler(async (req, res) => {
    res.json({ data: await technicianService.setIntroVideo(req.user!.userId, req.body.videoUrl) });
  }),
);

// GET /technician/scorecard — self quality metrics (on-time/redo/complaint/acceptance rates).
technicianRouter.get(
  '/scorecard',
  asyncHandler(async (req, res) => {
    res.json({ data: await technicianService.getMyScorecard(req.user!.userId) });
  }),
);

// GET /technician/notification-preferences — 4 toggles (Figma TechNotifications).
technicianRouter.get(
  '/notification-preferences',
  asyncHandler(async (req, res) => {
    res.json({ data: await technicianService.getOrCreateNotificationPrefs(req.user!.userId) });
  }),
);

// PATCH /technician/notification-preferences — partial update.
technicianRouter.patch(
  '/notification-preferences',
  validate([
    body('newJobRequests').optional().isBoolean().toBoolean(),
    body('reminders').optional().isBoolean().toBoolean(),
    body('earningsUpdates').optional().isBoolean().toBoolean(),
    body('promotions').optional().isBoolean().toBoolean(),
  ]),
  asyncHandler(async (req, res) => {
    const input: Partial<{ newJobRequests: boolean; reminders: boolean; earningsUpdates: boolean; promotions: boolean }> = {};
    if (req.body.newJobRequests !== undefined) input.newJobRequests = req.body.newJobRequests;
    if (req.body.reminders !== undefined) input.reminders = req.body.reminders;
    if (req.body.earningsUpdates !== undefined) input.earningsUpdates = req.body.earningsUpdates;
    if (req.body.promotions !== undefined) input.promotions = req.body.promotions;
    res.json({ data: await technicianService.updateNotificationPrefs(req.user!.userId, input) });
  }),
);

// GET /technician/bank-account — saved payout bank details.
technicianRouter.get(
  '/bank-account',
  asyncHandler(async (req, res) => {
    res.json({ data: await technicianService.getBankAccount(req.user!.userId) });
  }),
);

// PATCH /technician/bank-account — persist bank details independent of a withdrawal.
technicianRouter.patch(
  '/bank-account',
  validate([
    // Real payout destination — validate format + mod-97 checksum (not just a
    // non-empty string), restricted to Jordan IBANs (JO + 28 chars). Normalise
    // whitespace/case first so the persisted value is canonical regardless of
    // how the technician typed it (e.g. spaced groups, lowercase).
    body('iban')
      .isString()
      .customSanitizer((v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, '').toUpperCase() : v))
      .notEmpty()
      .isIBAN({ whitelist: ['JO'] })
      .withMessage('رقم IBAN غير صالح'),
    body('bankName').isString().trim().notEmpty().isLength({ max: 120 }),
  ]),
  asyncHandler(async (req, res) => {
    res.json({ data: await technicianService.updateBankAccount(req.user!.userId, req.body.iban, req.body.bankName) });
  }),
);

// PATCH /technician/services-pricing — post-approval edit of services + hourly rate.
// Onboarding's apply() locks once APPROVED; this is the separate, additive path.
technicianRouter.patch(
  '/services-pricing',
  validate([
    body('serviceIds').isArray({ min: 1, max: 10 }),
    body('serviceIds.*').isString().trim().notEmpty(),
    body('hourlyRateJod').isFloat({ min: MIN_HOURLY_RATE_JOD, max: MAX_HOURLY_RATE_JOD }).toFloat(),
  ]),
  asyncHandler(async (req, res) => {
    const profile = await technicianService.updateServicesPricing(req.user!.userId, req.body.serviceIds, req.body.hourlyRateJod);
    res.json({ data: profile });
  }),
);
