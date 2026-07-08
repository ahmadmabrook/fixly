import { Router } from 'express';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';
import swaggerUi from 'swagger-ui-express';
import { logger } from '../../../shared/logger';

/**
 * Interactive API docs at GET /docs, served from docs/openapi.yaml.
 * `process.cwd()` is `/app/backend` both locally and in the Docker image, but
 * the spec file's location relative to that differs: in the built image the
 * Dockerfile copies it to `./docs/openapi.yaml` (alongside `dist`/`prisma`),
 * while in the real repo checkout it lives at the repo root, `../docs/openapi.yaml`
 * relative to `backend/`. Try both rather than hard-coding one layout.
 */
export const docsRouter: Router = Router();

let cachedSpec: object | null = null;

function loadSpec(): object {
  if (cachedSpec) return cachedSpec;
  const candidates = [
    join(process.cwd(), 'docs', 'openapi.yaml'),
    join(process.cwd(), '..', 'docs', 'openapi.yaml'),
  ];
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error(`openapi.yaml not found in any of: ${candidates.join(', ')}`);
  cachedSpec = yaml.load(readFileSync(found, 'utf8')) as object;
  return cachedSpec;
}

try {
  const spec = loadSpec();
  docsRouter.use('/', swaggerUi.serve, swaggerUi.setup(spec, { customSiteTitle: 'Fixly API docs' }));
} catch (err) {
  logger.error({ err }, 'Failed to load docs/openapi.yaml — /docs will 500');
  docsRouter.get('/', (_req, res) => {
    res.status(500).json({ error: { code: 'DOCS_UNAVAILABLE', message: 'OpenAPI spec failed to load' } });
  });
}
