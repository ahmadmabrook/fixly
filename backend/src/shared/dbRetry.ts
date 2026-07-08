/** Postgres SQLSTATEs that mean "abort and retry the whole transaction" — the
 *  transaction did nothing wrong, it lost a race Postgres itself broke. */
function isRetryablePgError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.includes('40P01') || // deadlock_detected
    message.includes('40001') || // serialization_failure
    /deadlock detected/i.test(message) ||
    /could not serialize access/i.test(message) ||
    // Prisma's own interactive-transaction timeout firing while a transaction
    // was queued waiting on a row lock (not a deadlock, but the same "this
    // attempt lost a race, retry it" situation).
    /transaction already closed/i.test(message) ||
    /transaction .* timed? ?out/i.test(message)
  );
}

/**
 * Retry a transaction on Postgres deadlock/serialization failure — these are
 * expected under concurrent writers racing the same row lock (e.g. promo-code
 * redemption's `SELECT ... FOR UPDATE`); Postgres kills one side of the cycle
 * to break it, and the correct response is to retry the loser, not surface a
 * 500. Not a business-logic change: the retried transaction re-runs the exact
 * same logic from scratch and only ever commits once.
 */
export async function withDeadlockRetry<T>(fn: () => Promise<T>, maxAttempts = 8): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetryablePgError(err) || attempt === maxAttempts) throw err;
      // Exponential-ish jittered backoff so N concurrent retriers spread out
      // instead of re-colliding on the same tick every time.
      const base = Math.min(20 * 2 ** (attempt - 1), 300);
      await new Promise((resolve) => setTimeout(resolve, base + Math.random() * base));
    }
  }
  throw lastErr;
}
