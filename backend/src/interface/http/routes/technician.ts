import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate, requireActiveUser } from '../middleware/auth';
import { asyncHandler } from '../asyncHandler';
import { validate } from '../validate';
import { TechnicianService } from '../../../application/technician/TechnicianService';

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
    body('hourlyRateJod').isFloat({ min: 40, max: 60 }).toFloat(),
    body('vehicle').optional({ nullable: true }).isString().trim().isLength({ max: 120 }),
    body('bio').optional({ nullable: true }).isString().trim().isLength({ max: 1000 }),
    body('idDocUrl').optional({ nullable: true }).isURL({ protocols: ['https'], require_protocol: true }).isLength({ max: 500 }),
    body('certificateUrl').optional({ nullable: true }).isURL({ protocols: ['https'], require_protocol: true }).isLength({ max: 500 }),
    body('selfieUrl').optional({ nullable: true }).isURL({ protocols: ['https'], require_protocol: true }).isLength({ max: 500 }),
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
  validate([body('lat').isFloat({ min: -90, max: 90 }), body('lng').isFloat({ min: -180, max: 180 })]),
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
    body('amountJod').isFloat({ min: 20 }).toFloat(),
    body('iban').optional({ nullable: true }).isString().trim().isLength({ max: 40 }),
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
