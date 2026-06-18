import express, { Express } from 'express';
import http from 'http';
import { randomUUID } from 'crypto';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { logger } from '../../shared/logger';
import { env } from '../../shared/env';
import { registry, httpRequestDuration, httpRequestsTotal } from '../../shared/metrics';
import { errorHandler } from './middleware/errorHandler';
import { notFoundHandler } from './middleware/notFound';
import { globalLimiter, authLimiter, rateLimitEnabled } from './middleware/rateLimit';
import { healthRouter, livenessRouter, readinessRouter } from './routes/health';
import { authRouter } from './routes/auth';
import { servicesRouter } from './routes/services';
import { bookingsRouter } from './routes/bookings';
import { adminRouter } from './routes/admin';
import { promoRouter } from './routes/promo';
import { techniciansRouter } from './routes/technicians';
import { technicianRouter } from './routes/technician';
import { addressesRouter } from './routes/addresses';
import { paymentMethodsRouter } from './routes/paymentMethods';
import { notificationsRouter } from './routes/notifications';
import { devicesRouter } from './routes/devices';
import { guaranteeRouter } from './routes/guarantee';
import { supportRouter } from './routes/support';
import { reviewsPublicRouter } from './routes/reviewsPublic';
import { createWebhookRouter } from './routes/webhooks';
import { PaymentService } from '../../application/payment/PaymentService';
import { PaymentProviderFactory } from '../../infrastructure/providers/PaymentProviderFactory';

export function createApp(): { app: Express; httpServer: http.Server } {
  const app = express();

  // One reverse-proxy hop (Cloudflare/LB) so req.ip is the real client and
  // rate limits key correctly. Do NOT set to `true` — that trusts a spoofable
  // X-Forwarded-For and lets clients bypass the limiter.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // JSON API behind TLS: long HSTS, no CSP (serves no HTML), same-site CORP.
  app.use(helmet({
    hsts: { maxAge: 31_536_000, includeSubDomains: true, preload: true },
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-site' },
  }));
  // Compress JSON responses. threshold=1kb skips the small error envelopes
  // where the gzip header overhead dwarfs the body.
  app.use(compression({ threshold: 1024 }));
  // credentials:true so the browser sends the httpOnly refresh cookie on
  // cross-origin auth calls. Requires an explicit origin (not '*') in prod —
  // enforced by env validation.
  // credentials:true is incompatible with a literal '*' origin in browsers, so
  // when configured open (dev) we reflect the request origin (origin:true);
  // production always uses the explicit allowlist (env forbids '*' there).
  const corsOrigin = env().CORS_ORIGIN;
  app.use(cors({ origin: corsOrigin === '*' ? true : corsOrigin, credentials: true }));

  // PSP webhooks need the RAW body for signature verification, so they are
  // mounted before the JSON body parser (which would otherwise consume it).
  const paymentProvider = PaymentProviderFactory.create();
  const webhookPaymentService = new PaymentService(paymentProvider, env().PAYMENT_PROVIDER);
  app.use('/api/v1/webhooks', createWebhookRouter(webhookPaymentService, paymentProvider, env().PAYMENT_PROVIDER));

  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(pinoHttp({
    logger,
    // pino-http generates an `req.id` per request; expose it on res so the
    // error handler can echo it back to the client on 5xx. Falling back to
    // pino-http's default (a random id) is fine — we just want a string.
    genReqId: (req) => req.headers['x-request-id']?.toString() ?? cryptoRandomId(),
    customProps: (req) => ({ reqId: (req as { id?: string }).id }),
  }));

  // Per-request latency + count, labelled by matched route (not raw path, so
  // /services/:id collapses to one series instead of exploding cardinality).
  app.use((req, res, next) => {
    const stop = httpRequestDuration.startTimer();
    res.on('finish', () => {
      const route = req.route?.path ? `${req.baseUrl}${req.route.path}` : req.baseUrl || 'unmatched';
      const labels = { method: req.method, route, status: String(res.statusCode) };
      stop(labels);
      httpRequestsTotal.inc(labels);
    });
    next();
  });

  // Prometheus scrape endpoint. Guarded so it isn't a public recon surface:
  //  - if METRICS_TOKEN is set, require `Authorization: Bearer <token>`;
  //  - else allow in non-prod (dev convenience) but 404 in production, so an
  //    unconfigured deploy never silently exposes internal metrics.
  app.get(
    '/metrics',
    (req, res, next) => {
      const token = env().METRICS_TOKEN;
      if (token) {
        if (req.headers.authorization !== `Bearer ${token}`) {
          res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Metrics token required' } });
          return;
        }
      } else if (env().NODE_ENV === 'production') {
        res.status(404).end();
        return;
      }
      next();
    },
    async (_req, res) => {
      res.set('Content-Type', registry.contentType);
      res.end(await registry.metrics());
    },
  );

  // Liveness: cheap, dependency-free — must NOT depend on the DB.
  // A pod can keep running even when the DB is briefly unreachable.
  app.use('/live', livenessRouter);
  // Readiness: deep — pings DB + Redis. K8s stops sending traffic when this
  // fails but does NOT restart the pod (liveness stays up).
  app.use('/ready', readinessRouter);
  // Legacy `/health` keeps the old contract for clients that already poll it.
  // Health endpoints are unmetered so probes don't consume rate-limit budget.
  app.use('/health', healthRouter);

  const limited = rateLimitEnabled();
  if (limited) app.use('/api', globalLimiter);

  app.use('/api/v1/auth', ...(limited ? [authLimiter] : []), authRouter);
  app.use('/api/v1/services', servicesRouter);
  app.use('/api/v1/reviews', reviewsPublicRouter);
  app.use('/api/v1/bookings', bookingsRouter);
  app.use('/api/v1/technicians', techniciansRouter);
  app.use('/api/v1/technician', technicianRouter);
  app.use('/api/v1/promo', promoRouter);
  app.use('/api/v1/addresses', addressesRouter);
  app.use('/api/v1/payment-methods', paymentMethodsRouter);
  app.use('/api/v1/notifications', notificationsRouter);
  app.use('/api/v1/devices', devicesRouter);
  app.use('/api/v1/guarantee', guaranteeRouter);
  app.use('/api/v1/support', supportRouter);
  app.use('/api/v1/admin', adminRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  const httpServer = http.createServer(app);
  // Hard timeouts protect against slowloris-style attacks and hung upstream
  // proxies. keepAliveTimeout MUST be > the upstream LB's idle timeout (ALB
  // default 60s) so the LB — not the backend — closes idle keep-alive sockets;
  // otherwise the LB can reuse a socket the backend just closed → sporadic 502s.
  // headersTimeout must in turn be > keepAliveTimeout (Node requirement).
  httpServer.keepAliveTimeout = 65_000;   // > ALB 60s idle
  httpServer.headersTimeout = 66_000;     // > keepAliveTimeout
  httpServer.requestTimeout = 30_000;     // socket-level read/write budget
  httpServer.timeout = 30_000;            // full request lifecycle cap
  return { app, httpServer };
}

/** Tiny helper used as a fallback for pino-http's genReqId when the client
 *  doesn't send an X-Request-Id header. Returns a short random hex string. */
function cryptoRandomId(): string {
  return randomUUID().replace(/-/g, '').slice(0, 16);
}
