import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate, requireActiveUser } from '../middleware/auth';
import { asyncHandler } from '../asyncHandler';
import { validate } from '../validate';
import { UploadsService } from '../../../application/uploads/UploadsService';
import { UploadsProviderFactory } from '../../../infrastructure/providers/UploadsProviderFactory';

/** Presigned-upload issuance for every media-upload field in the app (technician
 *  KYC docs/certificate/selfie, intro video, booking checklist photos, guarantee
 *  evidence). Any authenticated active user may request a presign — the real
 *  authorization boundary is what the resulting URL is submitted as, which is
 *  already validated per-field on the consuming endpoint (isURL, ownership checks). */
export const uploadsRouter: Router = Router();

const uploadsService = new UploadsService(UploadsProviderFactory.create());

uploadsRouter.use(authenticate, requireActiveUser);

// POST /uploads/presign — short-lived presigned PUT URL + the public URL to submit
// once the client PUTs the file bytes to it.
uploadsRouter.post(
  '/presign',
  validate([
    body('contentType')
      .isString()
      .trim()
      .isLength({ min: 3, max: 100 })
      .matches(/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i),
    body('purpose')
      .isString()
      .trim()
      .isIn(['kyc_doc', 'selfie', 'certificate', 'intro_video', 'checklist_photo', 'guarantee_evidence']),
  ]),
  asyncHandler(async (req, res) => {
    const result = await uploadsService.presign(req.user!.userId, {
      contentType: req.body.contentType,
      purpose: req.body.purpose,
    });
    res.json({ data: result });
  }),
);
