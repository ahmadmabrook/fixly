import express, { type Express } from 'express';
import request from 'supertest';
import { errorHandler } from '../middleware/errorHandler';

/**
 * Focused router test for POST /uploads/presign. Mocks auth (inject a user) and
 * the uploads provider (the I/O boundary — a real R2/mock call) so we exercise
 * auth + request validation + per-purpose contentType allowlisting + response
 * shape without any network or DB dependency.
 */

let authState: { authed: boolean; userId: string } = { authed: true, userId: 'user-1' };
jest.mock('../middleware/auth', () => ({
  authenticate: (req: { user?: unknown }, _res: unknown, next: (e?: unknown) => void) => {
    if (!authState.authed) {
      const { UnauthorizedError } = jest.requireActual('../../../shared/errors');
      return next(new UnauthorizedError());
    }
    req.user = { userId: authState.userId, role: 'CUSTOMER', typ: 'user' };
    next();
  },
  requireActiveUser: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const presignPutMock = jest.fn();
jest.mock('../../../infrastructure/providers/UploadsProviderFactory', () => ({
  UploadsProviderFactory: { create: () => ({ presignPut: presignPutMock }) },
}));

const { uploadsRouter } = require('./uploads');

function makeApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/uploads', uploadsRouter);
  app.use(errorHandler);
  return app;
}

describe('POST /uploads/presign', () => {
  let app: Express;

  beforeEach(() => {
    jest.clearAllMocks();
    authState = { authed: true, userId: 'user-1' };
    app = makeApp();
  });

  it('401s when the request is unauthenticated', async () => {
    authState = { authed: false, userId: '' };
    await request(app).post('/uploads/presign').send({ contentType: 'image/jpeg', purpose: 'selfie' }).expect(401);
    expect(presignPutMock).not.toHaveBeenCalled();
  });

  it('422s on an unknown purpose', async () => {
    const res = await request(app)
      .post('/uploads/presign')
      .send({ contentType: 'image/jpeg', purpose: 'not_a_real_purpose' })
      .expect(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(presignPutMock).not.toHaveBeenCalled();
  });

  it('422s on a malformed contentType', async () => {
    const res = await request(app)
      .post('/uploads/presign')
      .send({ contentType: 'not-a-mime-type', purpose: 'selfie' })
      .expect(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(presignPutMock).not.toHaveBeenCalled();
  });

  it('422s when the contentType is not allowed for the given purpose (video for an image field)', async () => {
    const res = await request(app)
      .post('/uploads/presign')
      .send({ contentType: 'video/mp4', purpose: 'selfie' })
      .expect(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(presignPutMock).not.toHaveBeenCalled();
  });

  it('422s when an image contentType is used for the intro_video purpose', async () => {
    await request(app)
      .post('/uploads/presign')
      .send({ contentType: 'image/jpeg', purpose: 'intro_video' })
      .expect(422);
    expect(presignPutMock).not.toHaveBeenCalled();
  });

  it('accepts video/mp4 for intro_video and image/jpeg for checklist_photo', async () => {
    presignPutMock.mockResolvedValue({ uploadUrl: 'https://mock/put', publicUrl: 'https://mock/public' });
    await request(app).post('/uploads/presign').send({ contentType: 'video/mp4', purpose: 'intro_video' }).expect(200);
    await request(app).post('/uploads/presign').send({ contentType: 'image/jpeg', purpose: 'checklist_photo' }).expect(200);
    expect(presignPutMock).toHaveBeenCalledTimes(2);
  });

  it('returns { uploadUrl, publicUrl, expiresAt } derived from the provider, with a key scoped to purpose/userId', async () => {
    presignPutMock.mockResolvedValue({ uploadUrl: 'https://mock/put-url', publicUrl: 'https://mock/public-url' });
    const res = await request(app)
      .post('/uploads/presign')
      .send({ contentType: 'image/png', purpose: 'kyc_doc' })
      .expect(200);

    expect(res.body.data).toEqual({
      uploadUrl: 'https://mock/put-url',
      publicUrl: 'https://mock/public-url',
      expiresAt: expect.any(String),
    });
    expect(new Date(res.body.data.expiresAt).getTime()).toBeGreaterThan(Date.now());

    const call = presignPutMock.mock.calls[0][0];
    expect(call.contentType).toBe('image/png');
    expect(call.key).toMatch(/^kyc_doc\/user-1\/[0-9a-f-]+\.png$/);
    expect(call.expirySeconds).toBe(10 * 60);
  });
});
