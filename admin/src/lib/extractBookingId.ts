/**
 * Best-effort extraction of a booking UUID from free-text support messages.
 *
 * This is a CONVENIENCE HINT only. Customers often paste their booking id into
 * the chat, so we offer to prefill the refund form — but the value is never
 * trusted: the admin edits the field and must pass the (irreversible) refund
 * confirm dialog, which warns when the id was auto-extracted.
 *
 * Returns the FIRST UUID found scanning messages in order, or null when none.
 */

// Standard 8-4-4-4-12 hex UUID, case-insensitive, word-bounded so it isn't
// pulled out of the middle of a longer token.
const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;

export interface ExtractableMessage {
  body?: string | null;
}

export function extractBookingId(
  messages: ReadonlyArray<ExtractableMessage> | null | undefined,
): string | null {
  if (!messages?.length) return null;
  for (const m of messages) {
    if (typeof m?.body !== 'string') continue;
    const match = m.body.match(UUID_RE);
    if (match) return match[0];
  }
  return null;
}
