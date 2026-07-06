import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate, requireActiveUser } from '../middleware/auth';
import { asyncHandler } from '../asyncHandler';
import { validate } from '../validate';
import { ConductReportService } from '../../../application/conduct/ConductReportService';

/** Customer conduct reports (§0.2 #2 — anti-disintermediation + quality). */
export const conductRouter: Router = Router();

const conductService = new ConductReportService();

conductRouter.use(authenticate, requireActiveUser);

// POST /conduct-reports — report off-platform solicitation, no-show, quality, safety.
conductRouter.post(
  '/',
  validate([
    body('kind').isIn(['OFF_PLATFORM_SOLICIT', 'NO_SHOW', 'QUALITY', 'SAFETY', 'OTHER']),
    body('subjectTechId').optional({ nullable: true }).isUUID(),
    body('bookingId').optional({ nullable: true }).isUUID(),
    body('details').optional({ nullable: true }).isString().trim().isLength({ max: 2000 }),
  ]),
  asyncHandler(async (req, res) => {
    const report = await conductService.create(req.user!.userId, {
      kind: req.body.kind,
      subjectTechId: req.body.subjectTechId ?? undefined,
      bookingId: req.body.bookingId ?? undefined,
      details: req.body.details ?? undefined,
    });
    res.status(201).json({ data: report });
  }),
);
