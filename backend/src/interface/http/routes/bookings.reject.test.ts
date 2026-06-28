import express, { type Express } from 'express';
import request from 'supertest';
import { errorHandler } from '../middleware/errorHandler';
import { ConflictError, NotFoundError } from '../../../shared/errors';

/**
 * Focused router test for POST /bookings/:id/reject (the dispatch-reject route).
 * Mocks auth (inject a user), the DispatchService singleton, and the other heavy
 * service deps the router imports — so we exercise auth + validation + delegation
 * without a DB. Behaviour of reject() itself is unit-tested in DispatchService.test.ts.
 */

// A well-formed v4 UUID (variant nibble 'a' — passes express-validator isUUID()).
const VALID_ID = '11111111-1111-4111-a111-111111111111';

// Controllable auth: `authState` decides whether the request is authenticated.
let authState: { authed: boolean; userId: string } = { authed: true, userId: 'tech-user-1' };
jest.mock('../middleware/auth', () => ({
  authenticate: (req: { user?: unknown }, _res: unknown, next: (e?: unknown) => void) => {
    if (!authState.authed) {
      const { UnauthorizedError } = jest.requireActual('../../../shared/errors');
      return next(new UnauthorizedError());
    }
    req.user = { userId: authState.userId, role: 'TECHNICIAN', typ: 'user' };
    next();
  },
  requireActiveUser: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// The DispatchService singleton — reject() is the call under test.
const rejectMock = jest.fn();
jest.mock('../../../application/dispatch/DispatchService', () => ({
  getDispatchService: () => ({ reject: rejectMock }),
}));

// Keep the router's other service imports cheap (they instantiate at module load).
jest.mock('../../../application/booking/BookingService', () => ({
  BookingService: jest.fn().mockImplementation(() => ({})),
  ADVANCEABLE_TO: ['EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'],
}));
jest.mock('../../../application/review/ReviewService', () => ({ ReviewService: jest.fn().mockImplementation(() => ({})) }));
jest.mock('../../../application/payment/PaymentService', () => ({ PaymentService: jest.fn().mockImplementation(() => ({})) }));
jest.mock('../../../infrastructure/providers/PaymentProviderFactory', () => ({
  PaymentProviderFactory: { create: jest.fn(() => ({})), requiresHostedCheckout: jest.fn(() => false) },
}));
jest.mock('../../../shared/env', () => ({ env: () => ({ PAYMENT_PROVIDER: 'mock' }) }));

const { bookingsRouter } = require('./bookings');

function makeApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/bookings', bookingsRouter);
  app.use(errorHandler);
  return app;
}

describe('POST /bookings/:id/reject', () => {
  let app: Express;

  beforeEach(() => {
    jest.clearAllMocks();
    authState = { authed: true, userId: 'tech-user-1' };
    app = makeApp();
  });

  it('401s when the request is unauthenticated', async () => {
    authState = { authed: false, userId: '' };
    await request(app).post(`/bookings/${VALID_ID}/reject`).expect(401);
    expect(rejectMock).not.toHaveBeenCalled();
  });

  it('422s when the booking id is not a UUID (validation)', async () => {
    const res = await request(app).post('/bookings/not-a-uuid/reject').expect(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(rejectMock).not.toHaveBeenCalled();
  });

  it('delegates to DispatchService.reject(bookingId, userId) and returns the ack envelope', async () => {
    rejectMock.mockResolvedValue(undefined);
    const res = await request(app).post(`/bookings/${VALID_ID}/reject`).expect(200);
    expect(rejectMock).toHaveBeenCalledWith(VALID_ID, 'tech-user-1');
    expect(res.body).toEqual({ data: { bookingId: VALID_ID, rejected: true } });
  });

  it('propagates a ConflictError (no active offer) as a 409', async () => {
    rejectMock.mockRejectedValue(new ConflictError('No active offer for this booking'));
    const res = await request(app).post(`/bookings/${VALID_ID}/reject`).expect(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('propagates a NotFoundError (no tech profile) as a 404', async () => {
    rejectMock.mockRejectedValue(new NotFoundError('TechnicianProfile'));
    await request(app).post(`/bookings/${VALID_ID}/reject`).expect(404);
  });
});
