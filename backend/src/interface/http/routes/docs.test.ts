import request from 'supertest';
import { createApp } from '../app';

describe('GET /docs', () => {
  it('serves the Swagger UI page', async () => {
    const { app } = createApp();
    const res = await request(app).get('/docs/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('swagger-ui');
  });
});
