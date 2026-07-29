import express, { type Express } from 'express';
import request from 'supertest';
import { errorHandler } from '../middleware/errorHandler';

/**
 * Focused router test for GET /technicians/:id — the public-safe technician
 * card the customer's tracking page renders (name/rating/vehicle/verified +
 * the intro video, when the technician has uploaded one).
 */

jest.mock('../middleware/auth', () => ({
  authenticate: (req: { user?: unknown }, _res: unknown, next: () => void) => {
    req.user = { userId: 'user-1', role: 'CUSTOMER', typ: 'user' };
    next();
  },
}));

const findUniqueMock = jest.fn();
jest.mock('../../../infrastructure/database/prisma', () => ({
  prisma: { technicianProfile: { findUnique: (...args: unknown[]) => findUniqueMock(...args) } },
}));

const { techniciansRouter } = require('./technicians');

function makeApp(): Express {
  const app = express();
  app.use('/technicians', techniciansRouter);
  app.use(errorHandler);
  return app;
}

describe('GET /api/v1/technicians/:id', () => {
  let app: Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = makeApp();
  });

  it('includes introVideoUrl in the public card when the technician has uploaded one', async () => {
    findUniqueMock.mockResolvedValue({
      id: 't1',
      rating: '4.8',
      totalReviews: 12,
      vehicle: 'هيونداي إلنترا',
      isVerified: true,
      introVideoUrl: 'https://cdn.example.com/intro.mp4',
      user: { name: 'خالد المومني', avatarUrl: null },
    });

    const res = await request(app).get('/technicians/11111111-1111-4111-a111-111111111111').expect(200);

    expect(res.body.data.introVideoUrl).toBe('https://cdn.example.com/intro.mp4');
    expect(findUniqueMock).toHaveBeenCalledWith(
      expect.objectContaining({ select: expect.objectContaining({ introVideoUrl: true }) }),
    );
  });

  it('returns introVideoUrl: null when the technician has not uploaded one', async () => {
    findUniqueMock.mockResolvedValue({
      id: 't2', rating: '4.5', totalReviews: 3, vehicle: null, isVerified: false,
      introVideoUrl: null, user: { name: 'فني جديد', avatarUrl: null },
    });

    const res = await request(app).get('/technicians/22222222-2222-4222-a222-222222222222').expect(200);
    expect(res.body.data.introVideoUrl).toBeNull();
  });

  it('404s for an unknown technician id', async () => {
    findUniqueMock.mockResolvedValue(null);
    await request(app).get('/technicians/00000000-0000-0000-0000-000000000000').expect(404);
  });
});
