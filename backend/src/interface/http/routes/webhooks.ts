import { Router, raw } from 'express';
import { Prisma } from '@prisma/client';
import { asyncHandler } from '../asyncHandler';
import { prisma } from '../../../infrastructure/database/prisma';
import { logger } from '../../../shared/logger';
import { pspWebhookTotal } from '../../../shared/metrics';
import type { PaymentService } from '../../../application/payment/PaymentService';
import type { IPaymentProvider } from '../../../domain/providers/IPaymentProvider';

/**
 * Inbound PSP webhooks (the PSP is the source of truth for async outcomes:
 * authorization, disputes, chargebacks, hold expiry, settlement). Hardened:
 *   - raw body + provider-specific verification (HMAC for the mock, AES-GCM
 *     decryption for HyperPay) — forgeries/tampered payloads are rejected,
 *   - dedupe by (provider, eventId) so at-least-once delivery is safe,
 *   - the handler itself is idempotent, so a crash mid-handle simply replays.
 * Returns 2xx fast so the PSP doesn't hammer retries on transient handler errors
 * (it still retries on 5xx).
 */
export function createWebhookRouter(payment: PaymentService, provider: IPaymentProvider, providerName: string): Router {
  const router: Router = Router();

  router.post(
    '/psp',
    raw({ type: '*/*', limit: '1mb' }),
    asyncHandler(async (req, res) => {
      const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

      // Verify + parse in one step (provider-specific). null = invalid signature/
      // decryption or unparseable body → reject without processing.
      const event = provider.decodeWebhook(rawBody, req.headers as Record<string, string | undefined>);
      if (!event) {
        pspWebhookTotal.inc({ type: 'unknown', result: 'invalid' });
        logger.warn('PSP webhook rejected: failed verification/decryption');
        res.status(400).json({ error: { code: 'INVALID_WEBHOOK', message: 'Invalid webhook signature or payload' } });
        return;
      }

      // Dedupe: if we've already recorded this event, ack without reprocessing.
      const seen = await prisma.pspWebhookEvent.findUnique({
        where: { provider_eventId: { provider: providerName, eventId: event.eventId } },
      });
      if (seen) {
        pspWebhookTotal.inc({ type: event.type, result: 'duplicate' });
        res.status(200).json({ data: { duplicate: true } });
        return;
      }

      // Handle first (idempotent), then record. If handling throws, no record is
      // written → the PSP's retry reprocesses safely.
      await payment.handleWebhookEvent(event);
      try {
        await prisma.pspWebhookEvent.create({
          // Store the normalised event (the raw body may be encrypted) for audit.
          data: { provider: providerName, eventId: event.eventId, eventType: event.type, payload: event as unknown as Prisma.InputJsonValue },
        });
      } catch (err) {
        // A concurrent delivery recorded it first — fine, handler was idempotent.
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
      }

      res.status(200).json({ data: { ok: true } });
    }),
  );

  return router;
}
