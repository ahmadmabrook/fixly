import express, { type Express } from 'express';
import request from 'supertest';
import { errorHandler } from '../middleware/errorHandler';

/**
 * Regression test for the audit-trail gap found in code review: five
 * privileged OPS actions (trust-tier override, bg-check, skills-test,
 * conduct-report resolve, quote pricing) previously wrote no admin_audit_logs
 * row at all. Mocks auth (inject an OPS admin) and every service this router
 * imports, then asserts `audit()` fires with the right action/target for each.
 */

const VALID_ID = '11111111-1111-4111-a111-111111111111';

jest.mock('../middleware/auth', () => ({
  authenticate: (req: { user?: unknown }, _res: unknown, next: (e?: unknown) => void) => {
    req.user = { userId: 'admin-1', role: 'ADMIN', typ: 'admin', adminRole: 'OPS' };
    next();
  },
  requireAdminRole: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const auditMock = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../application/admin/adminAudit', () => ({ audit: (...args: unknown[]) => auditMock(...args) }));
jest.mock('../../../infrastructure/database/prisma', () => ({ prisma: {} }));

const setTrustTierMock = jest.fn().mockResolvedValue({ id: VALID_ID, trustTier: 'PRO' });
const recordBgCheckMock = jest.fn().mockResolvedValue({ id: VALID_ID, bgCheckStatus: 'PASSED' });
const markSkillsTestPassedMock = jest.fn().mockResolvedValue({ id: VALID_ID, skillsTestPassedAt: new Date() });
jest.mock('../../../application/technician/TrustService', () => ({
  TrustService: jest.fn().mockImplementation(() => ({
    setTrustTier: setTrustTierMock,
    recordBgCheck: recordBgCheckMock,
    markSkillsTestPassed: markSkillsTestPassedMock,
    qualityBoard: jest.fn(),
  })),
}));

const resolveMock = jest.fn().mockResolvedValue({ id: VALID_ID, status: 'UPHELD' });
jest.mock('../../../application/conduct/ConductReportService', () => ({
  ConductReportService: jest.fn().mockImplementation(() => ({ resolve: resolveMock, listForAdmin: jest.fn() })),
}));

jest.mock('../../../application/subscription/SubscriptionService', () => ({
  SubscriptionService: jest.fn().mockImplementation(() => ({ adminSummary: jest.fn() })),
}));

const setQuoteMock = jest.fn().mockResolvedValue({ id: VALID_ID, status: 'QUOTED', quotedJod: '25.000' });
jest.mock('../../../application/quote/BookingQuoteService', () => ({
  // adminBusiness.ts calls the lazy singleton getter (io-bound instance set up
  // in main.ts), not `new BookingQuoteService()` — mock that entry point.
  getBookingQuoteService: () => ({ setQuote: setQuoteMock, listForAdmin: jest.fn() }),
}));

const { adminBusinessRouter } = require('./adminBusiness');
const { authenticate } = require('../middleware/auth');

// adminBusinessRouter is mounted (in production) AFTER the parent adminRouter's
// own `authenticate` — it has no auth of its own, so the isolated test app must
// apply the same mocked authenticate first, or req.user is never populated.
function makeApp(): Express {
  const app = express();
  app.use(express.json());
  app.use(authenticate);
  app.use('/admin', adminBusinessRouter);
  app.use(errorHandler);
  return app;
}

describe('adminBusiness audit trail', () => {
  afterEach(() => jest.clearAllMocks());

  it('audits trust-tier override', async () => {
    const app = makeApp();
    await request(app).post(`/admin/technicians/${VALID_ID}/trust-tier`).send({ tier: 'PRO' }).expect(200);
    expect(auditMock).toHaveBeenCalledWith(
      {}, 'admin-1', 'technician.trust_tier',
      { type: 'TechnicianProfile', id: VALID_ID }, { tier: 'PRO' }, expect.any(String),
    );
  });

  it('audits bg-check result', async () => {
    const app = makeApp();
    await request(app).post(`/admin/technicians/${VALID_ID}/bg-check`).send({ result: 'PASSED' }).expect(200);
    expect(auditMock).toHaveBeenCalledWith(
      {}, 'admin-1', 'technician.bg_check',
      { type: 'TechnicianProfile', id: VALID_ID }, { result: 'PASSED' }, expect.any(String),
    );
  });

  it('audits skills-test pass', async () => {
    const app = makeApp();
    await request(app).post(`/admin/technicians/${VALID_ID}/skills-test`).send({}).expect(200);
    expect(auditMock).toHaveBeenCalledWith(
      {}, 'admin-1', 'technician.skills_test',
      { type: 'TechnicianProfile', id: VALID_ID }, undefined, expect.any(String),
    );
  });

  it('audits conduct-report resolution', async () => {
    const app = makeApp();
    await request(app).post(`/admin/conduct-reports/${VALID_ID}/resolve`).send({ decision: 'UPHELD' }).expect(200);
    expect(auditMock).toHaveBeenCalledWith(
      {}, 'admin-1', 'conduct.resolve',
      { type: 'ConductReport', id: VALID_ID }, { decision: 'UPHELD' }, expect.any(String),
    );
  });

  it('audits quote pricing', async () => {
    const app = makeApp();
    await request(app).post(`/admin/quotes/${VALID_ID}/quote`).send({ quotedJod: '25.000' }).expect(200);
    expect(auditMock).toHaveBeenCalledWith(
      {}, 'admin-1', 'quote.price',
      { type: 'BookingQuote', id: VALID_ID }, { quotedJod: '25.000' }, expect.any(String),
    );
  });
});
