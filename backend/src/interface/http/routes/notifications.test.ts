import express, { type Express } from 'express';
import request from 'supertest';
import { errorHandler } from '../middleware/errorHandler';

/**
 * Focused router test for GET/PATCH /notifications/preferences — the 5
 * customer-facing notification toggles (Figma SettingsNotificationsPref
 * screen): bookings, arriving, completed, guarantee, promotions.
 */

jest.mock('../middleware/auth', () => ({
  authenticate: (req: { user?: unknown }, _res: unknown, next: () => void) => {
    req.user = { userId: 'user-1', role: 'CUSTOMER', typ: 'user' };
    next();
  },
  requireActiveUser: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const upsertMock = jest.fn();
jest.mock('../../../infrastructure/database/prisma', () => ({
  prisma: { customerNotificationPrefs: { upsert: (...args: unknown[]) => upsertMock(...args) } },
}));

const { notificationsRouter } = require('./notifications');

function makeApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/notifications', notificationsRouter);
  app.use(errorHandler);
  return app;
}

const defaults = { bookings: true, arriving: true, completed: true, guarantee: true, promotions: false };

describe('GET/PATCH /api/v1/notifications/preferences', () => {
  let app: Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = makeApp();
  });

  it('creates the row lazily with all-true-except-promotions defaults on first read', async () => {
    upsertMock.mockResolvedValue({ id: 'p1', customerId: 'user-1', ...defaults });

    const res = await request(app).get('/notifications/preferences').expect(200);

    expect(res.body.data).toEqual(defaults);
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { customerId: 'user-1' }, create: { customerId: 'user-1' } }),
    );
    // Only the 5 toggle fields are returned — no id/customerId/timestamp leak.
    expect(res.body.data).not.toHaveProperty('id');
    expect(res.body.data).not.toHaveProperty('customerId');
  });

  it('partially updates only the provided toggles', async () => {
    upsertMock.mockResolvedValue({ id: 'p1', customerId: 'user-1', ...defaults, promotions: true });

    const res = await request(app).patch('/notifications/preferences').send({ promotions: true }).expect(200);

    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { customerId: 'user-1' },
        update: { promotions: true },
        create: { customerId: 'user-1', promotions: true },
      }),
    );
    expect(res.body.data.promotions).toBe(true);
  });

  it('rejects a non-boolean toggle value', async () => {
    await request(app).patch('/notifications/preferences').send({ bookings: 'yes' }).expect(422);
    expect(upsertMock).not.toHaveBeenCalled();
  });
});
