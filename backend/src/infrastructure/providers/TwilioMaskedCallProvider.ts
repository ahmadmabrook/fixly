import type {
  IMaskedCallProvider,
  CreateMaskedCallSessionInput,
  MaskedCallSessionResult,
} from '../../domain/providers/IMaskedCallProvider';
import { logger } from '../../shared/logger';

export interface TwilioMaskedCallConfig {
  accountSid: string;
  authToken: string;
  proxyServiceSid: string;
  baseUrl: string;
  /** Per-request timeout (ms). */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;

interface TwilioSession {
  sid: string;
  unique_name?: string;
  status?: string;
}

interface TwilioParticipant {
  sid: string;
  identifier?: string;
  proxy_identifier?: string;
}

interface TwilioPhoneNumber {
  phone_number?: string;
}

interface TwilioListResponse<T> {
  // Twilio's list endpoints wrap the array under a resource-specific key
  // (e.g. "participants", "phone_numbers"); callers pass the expected key.
  [key: string]: T[] | unknown;
}

/**
 * Twilio Proxy masked-calling provider. Creates (or reuses, keyed by the booking id
 * as the Session's `UniqueName`) a Proxy Session between the booking's customer and
 * technician, ensures both are registered as Participants (their real numbers are
 * given to Twilio as the Participant's `Identifier` — Twilio uses it to recognise
 * the caller and bridge to the counterparty; the real number is never returned to
 * either party), and returns the session's assigned proxy phone number for the
 * caller to dial.
 *
 * Idempotent: `UniqueName` makes session creation safe to retry, and participant
 * lookups are done by identifier before creating, so re-calling this for the same
 * booking never creates duplicate sessions/participants.
 *
 * Cannot be exercised end-to-end without a real Twilio account; unit-tested here
 * against a mocked HTTP client (fetch). Live verification needs real credentials
 * (same situation as this repo's HyperPay integration).
 */
export class TwilioMaskedCallProvider implements IMaskedCallProvider {
  private readonly timeoutMs: number;

  constructor(private readonly config: TwilioMaskedCallConfig) {
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async createOrReuseSession(input: CreateMaskedCallSessionInput): Promise<MaskedCallSessionResult> {
    const uniqueName = `booking-${input.bookingId}`;
    const session = await this.getOrCreateSession(uniqueName);

    await this.ensureParticipant(session.sid, input.customerPhone);
    await this.ensureParticipant(session.sid, input.technicianPhone);

    const proxyNumber = await this.getProxyNumber(session.sid);
    logger.info({ bookingId: input.bookingId, sessionSid: session.sid }, 'Twilio masked-call session ready');
    return { proxyNumber };
  }

  private async getOrCreateSession(uniqueName: string): Promise<TwilioSession> {
    // Twilio allows referencing a Session by its UniqueName in place of the SID.
    const existing = await this.get(`/Sessions/${encodeURIComponent(uniqueName)}`, /* okOn404 */ true);
    if (existing) return existing as TwilioSession;

    const body = new URLSearchParams({ UniqueName: uniqueName });
    return (await this.post('/Sessions', body)) as TwilioSession;
  }

  private async ensureParticipant(sessionSid: string, identifier: string): Promise<void> {
    const list = (await this.get(`/Sessions/${sessionSid}/Participants`)) as TwilioListResponse<TwilioParticipant>;
    const participants = (list.participants as TwilioParticipant[] | undefined) ?? [];
    if (participants.some((p) => p.identifier === identifier)) return;

    const body = new URLSearchParams({ Identifier: identifier });
    await this.post(`/Sessions/${sessionSid}/Participants`, body);
  }

  private async getProxyNumber(sessionSid: string): Promise<string> {
    const list = (await this.get(`/Sessions/${sessionSid}/PhoneNumbers`)) as TwilioListResponse<TwilioPhoneNumber>;
    const numbers = (list.phone_numbers as TwilioPhoneNumber[] | undefined) ?? [];
    const assigned = numbers[0]?.phone_number;
    if (!assigned) throw new Error(`Twilio Proxy session ${sessionSid} has no assigned phone number`);
    return assigned;
  }

  private baseUrl(): string {
    return `${this.config.baseUrl}/Services/${this.config.proxyServiceSid}`;
  }

  private authHeader(): string {
    return `Basic ${Buffer.from(`${this.config.accountSid}:${this.config.authToken}`).toString('base64')}`;
  }

  private async post(path: string, body: URLSearchParams): Promise<unknown> {
    return this.send(path, {
      method: 'POST',
      headers: { Authorization: this.authHeader(), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
  }

  private async get(path: string, okOn404 = false): Promise<unknown> {
    return this.send(path, { method: 'GET', headers: { Authorization: this.authHeader() } }, okOn404);
  }

  private async send(path: string, init: RequestInit, okOn404 = false): Promise<unknown> {
    const url = `${this.baseUrl()}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      if (res.status === 404 && okOn404) return null;
      const text = await res.text();
      let parsed: unknown = null;
      try { parsed = JSON.parse(text); } catch { /* non-JSON body */ }
      if (!res.ok) {
        throw new Error(`Twilio Proxy ${init.method} ${path} failed: ${res.status} ${text.slice(0, 300)}`);
      }
      return parsed;
    } finally {
      clearTimeout(timer);
    }
  }
}
