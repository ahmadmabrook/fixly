import type { IOtpProvider } from '../../domain/providers/IOtpProvider';
import { logger } from '../../shared/logger';

export interface WhatsAppOtpConfig {
  accessToken: string;
  phoneNumberId: string;
  templateName: string;
  baseUrl: string;
  /** Per-request timeout (ms). */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * WhatsApp Cloud API OTP provider (Meta Graph API `/messages`, template message type).
 * Mirrors HyperPayProvider's real-vs-mock split: config is entirely env-driven
 * (WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_OTP_TEMPLATE_NAME),
 * selected via OTP_PROVIDER=whatsapp in OtpProviderFactory.
 *
 * The OTP code is sent as the template's single body variable, matching Meta's
 * documented "authentication" template category shape. The template itself (its
 * approval, language, and button config) is provisioned once in the WhatsApp
 * Business Manager — this class only fills in the variable and fires the send.
 *
 * Cannot be exercised end-to-end without a real Meta Business/WhatsApp Cloud API
 * account; unit-tested here against a mocked HTTP client (fetch). Live verification
 * needs real credentials (same situation as this repo's HyperPay integration).
 */
export class WhatsAppOtpProvider implements IOtpProvider {
  private readonly timeoutMs: number;

  constructor(private readonly config: WhatsAppOtpConfig) {
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async send(phone: string, code: string): Promise<void> {
    const url = `${this.config.baseUrl}/${encodeURIComponent(this.config.phoneNumberId)}/messages`;
    const body = {
      messaging_product: 'whatsapp',
      to: this.toE164(phone),
      type: 'template',
      template: {
        name: this.config.templateName,
        language: { code: 'en_US' },
        components: [
          {
            type: 'body',
            parameters: [{ type: 'text', text: code }],
          },
          // Meta's authentication templates typically also carry a "copy code"
          // quick-reply button whose payload must echo the code.
          {
            type: 'button',
            sub_type: 'url',
            index: '0',
            parameters: [{ type: 'text', text: code }],
          },
        ],
      },
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await res.text();
      if (!res.ok) {
        // Never log the OTP code itself (a live credential) — only status/response.
        logger.error({ phone, status: res.status, response: text.slice(0, 500) }, 'WhatsApp OTP send failed');
        throw new Error(`WhatsApp OTP send failed: ${res.status}`);
      }
      logger.info({ phone }, 'WhatsApp OTP sent');
    } finally {
      clearTimeout(timer);
    }
  }

  /** WhatsApp expects an E.164 number without a leading '+'. Jordan numbers in this
   *  codebase are stored/validated as E.164 (+9627XXXXXXXX) — strip the '+' only. */
  private toE164(phone: string): string {
    return phone.startsWith('+') ? phone.slice(1) : phone;
  }
}
