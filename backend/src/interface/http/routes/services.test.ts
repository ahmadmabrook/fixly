import express, { type Express } from 'express';
import request from 'supertest';
import { errorHandler } from '../middleware/errorHandler';

/**
 * Focused router test for GET /services (the public catalogue route).
 * Mocks Prisma so we exercise query-param validation + where/orderBy/meta
 * construction without a DB. The route is public (no auth), so the only
 * gatekeeping is the express-validator chain.
 */

// Prisma is mocked: findMany is the single call the route makes (twice: services
// then distinct categories). We capture args to assert the constructed query.
const findManyMock = jest.fn();
jest.mock('../../../infrastructure/database/prisma', () => ({
  prisma: { service: { findMany: (...args: unknown[]) => findManyMock(...args) } },
}));

const { servicesRouter } = require('./services');

function makeApp(): Express {
  const app = express();
  app.use('/services', servicesRouter);
  app.use(errorHandler);
  return app;
}

const SERVICE_ROW = {
  id: 's1',
  nameAr: 'كهرباء',
  nameEn: 'Electrician',
  category: 'electrical',
  priceJod: '10.000',
  durationMin: 60,
  isActive: true,
};

describe('GET /api/v1/services', () => {
  let app: Express;

  beforeEach(() => {
    jest.clearAllMocks();
    // First findMany → services list; second findMany → distinct categories.
    findManyMock
      .mockResolvedValueOnce([SERVICE_ROW])
      .mockResolvedValueOnce([{ category: 'electrical' }, { category: 'plumbing' }]);
    app = makeApp();
  });

  it('returns active services with a default category sort and category meta', async () => {
    const res = await request(app).get('/services').expect(200);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.categories).toEqual(['electrical', 'plumbing']);

    // First call: services query — active filter + default category sort, no OR.
    const [servicesArgs] = findManyMock.mock.calls[0];
    expect(servicesArgs.where).toEqual({ isActive: true });
    expect(servicesArgs.orderBy).toEqual({ category: 'asc' });
  });

  it('sets a public, briefly-cacheable Cache-Control header (public catalogue)', async () => {
    const res = await request(app).get('/services').expect(200);
    expect(res.headers['cache-control']).toBe('public, max-age=300');
  });

  it('filters by category (exact match) when ?category is given', async () => {
    await request(app).get('/services?category=plumbing').expect(200);
    const [servicesArgs] = findManyMock.mock.calls[0];
    expect(servicesArgs.where).toEqual({ isActive: true, category: 'plumbing' });
  });

  it('builds a case-insensitive OR contains filter when ?search is given', async () => {
    await request(app).get('/services?search=elec').expect(200);
    const [servicesArgs] = findManyMock.mock.calls[0];
    expect(servicesArgs.where).toEqual({
      isActive: true,
      OR: [
        { nameAr: { contains: 'elec', mode: 'insensitive' } },
        { nameEn: { contains: 'elec', mode: 'insensitive' } },
      ],
    });
  });

  it.each([
    ['price_asc', { priceJod: 'asc' }],
    ['price_desc', { priceJod: 'desc' }],
    ['duration_asc', { durationMin: 'asc' }],
    ['duration_desc', { durationMin: 'desc' }],
    ['category', { category: 'asc' }],
  ] as const)('maps ?sort=%s to the right orderBy', async (sort, expected) => {
    await request(app).get(`/services?sort=${sort}`).expect(200);
    const [servicesArgs] = findManyMock.mock.calls[0];
    expect(servicesArgs.orderBy).toEqual(expected);
  });

  it('422s on an unknown sort value (whitelist enforced)', async () => {
    const res = await request(app).get('/services?sort=price_asc;DROP').expect(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it('422s when ?search exceeds the 80-char cap (slow-LIKE abuse guard)', async () => {
    const res = await request(app).get(`/services?search=${'a'.repeat(81)}`).expect(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it('422s when ?category exceeds the 60-char cap', async () => {
    const res = await request(app).get(`/services?category=${'a'.repeat(61)}`).expect(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it('trims whitespace around ?search before querying', async () => {
    await request(app).get('/services?search=%20%20elec%20%20').expect(200);
    const [servicesArgs] = findManyMock.mock.calls[0];
    expect(servicesArgs.where.OR[0].nameAr.contains).toBe('elec');
  });
});
