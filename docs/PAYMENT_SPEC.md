# PAYMENT_SPEC — Payment Integration via Outbox

**Owner:** `payment-dev`
**Status:** ⛔ BLOCKED — do not write code until `outbox-dev` sends **"registry ready"**.
**Depends on:** `OUTBOX_SPEC.md` §4–§5 (the `OutboxEventHandler` interface + `OutboxHandlerRegistry`).

> **Why blocked:** your payment handler implements `OutboxEventHandler` from
> `application/outbox/OutboxEventHandler.ts`. That interface is owned by `outbox-dev` and
> "frozen on publish". Coding against it before it's published risks a mismatch. When you
> get "registry ready", read that file first, then build. You CAN read this whole spec and
> plan now — just don't create `application/payment/**` or edit `BookingService.ts` yet.

---

## 1. Goal

Drive the payment lifecycle off booking events, transactionally and idempotently:

| Trigger (outbox eventType) | Payment effect | Ledger effect |
|----------------------------|----------------|---------------|
| `booking.created` | create `Payment` (`PRE_AUTHORIZED`) via provider `preAuthorize` | `LedgerEntry` type `CHARGE` |
| `booking.completed` | provider `capture` → `Payment` (`CAPTURED`) | `LedgerEntry` type `CAPTURE` |

You build a `PaymentService` (pure application logic over `PaymentProviderFactory` +
Prisma) and a thin `PaymentOutboxHandler` that adapts it to the outbox seam. You also add
`BookingService.completeBooking()` which emits a new `booking.completed` outbox event.

**You do NOT edit the worker.** You register your handler in `main.ts` — but since
`outbox-dev` owns `main.ts`, you hand them a one-line construction signature (§7).

---

## 2. File ownership (HARD BOUNDARY)

`payment-dev` **creates and owns**:

```
backend/src/application/payment/
  PaymentService.ts              # preAuthorizeForBooking() / captureForBooking()
  PaymentOutboxHandler.ts        # adapts PaymentService to OutboxEventHandler (factory)
  PaymentService.test.ts
  PaymentOutboxHandler.test.ts
```

`payment-dev` **edits** (lifecycle additions only — surgical, additive):

```
backend/src/application/booking/BookingService.ts   # ADD completeBooking() only — see §6
backend/src/application/booking/BookingService.test.ts  # ADD completeBooking tests
backend/src/interface/http/routes/bookings.ts       # ADD POST /:id/complete route (§6.3)
```

### Files you MUST NOT touch
- `application/outbox/**` — owned by `outbox-dev`. You **import** `OutboxEventHandler`,
  `OutboxEventEnvelope`, `HandlerContext` from `OutboxEventHandler.ts`; you do not modify them.
- `application/outbox/OutboxWorker.ts` — never open it. Registration is your only contact point.
- `main.ts` — owned by `outbox-dev`. Give them your factory signature (§7); they add the line.
- `web/**`, `interface/socket/server.ts` — not yours.
- `prisma/schema.prisma` — `Payment`, `LedgerEntry`, enums `PaymentStatus`/`LedgerType`
  already exist. **No migration.**
- `infrastructure/providers/*` — `IPaymentProvider`, `MockPaymentProvider`,
  `PaymentProviderFactory` already exist exactly as you need. **Do not change them.**

### Avoiding a collision in `BookingService.ts`
`outbox-dev` does NOT edit `BookingService.ts` (their spec forbids it). So you are the
**sole editor** of that file. Add `completeBooking()` as a new method; do not refactor
existing methods. Keep the existing outbox-write pattern identical (write inside the
`$transaction`).

---

## 3. Existing contracts you build on (do not change)

`IPaymentProvider` (`domain/providers/IPaymentProvider.ts`):
```ts
preAuthorize(bookingId: string, amountJod: number): Promise<{ providerRef: string; status: 'PRE_AUTHORIZED' }>;
capture(providerRef: string): Promise<{ providerRef: string; status: 'CAPTURED' }>;
refund(providerRef: string): Promise<void>;
```
Construct with `PaymentProviderFactory.create()` (reads `PAYMENT_PROVIDER` env, defaults `mock`).

`Payment` model: `bookingId @unique`, `status PaymentStatus`, `provider String`,
`providerRef String?`, `amountJod Decimal`, `preAuthorizedAt`, `capturedAt`, `refundedAt`.
`PaymentStatus`: `PENDING | PRE_AUTHORIZED | CAPTURED | REFUNDED | FAILED`.

`LedgerEntry` model: `paymentId`, `type LedgerType`, `amountJod`, `description?`.
`LedgerType`: `CHARGE | CAPTURE | REFUND | PAYOUT | FEE`.

`Booking` model: `totalJod Decimal`, `status BookingStatus`, `completedAt`, `version`.
`BookingStatus` includes `IN_PROGRESS`, `COMPLETED`.

---

## 4. `PaymentService.ts`

Pure application logic. Holds an `IPaymentProvider` (injected, defaulting to the factory)
so it's unit-testable with a fake provider. **Idempotent** — both methods may be invoked
more than once by the at-least-once outbox worker.

```ts
import { PrismaClient } from '@prisma/client';
import type { IPaymentProvider } from '../../domain/providers/IPaymentProvider';
import { PaymentProviderFactory } from '../../infrastructure/providers/PaymentProviderFactory';

export class PaymentService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly provider: IPaymentProvider = PaymentProviderFactory.create(),
  ) {}

  /** Pre-authorize for a freshly created booking. Idempotent on Payment.bookingId. */
  async preAuthorizeForBooking(bookingId: string): Promise<void> { /* §4.1 */ }

  /** Capture the pre-authorized amount when a booking completes. Idempotent. */
  async captureForBooking(bookingId: string): Promise<void> { /* §4.2 */ }
}
```

### 4.1 `preAuthorizeForBooking(bookingId)`
1. **Idempotency guard:** `payment = prisma.payment.findUnique({ where:{ bookingId } })`.
   If it exists and `status !== 'PENDING'` (i.e. already PRE_AUTHORIZED/CAPTURED), **return** (no-op).
2. Load the booking for the amount: `booking = findUnique({ where:{ id: bookingId }, select:{ totalJod:true, status:true } })`. If missing → throw `NotFoundError('Booking')` (worker will retry then mark FAILED).
3. Call the provider **outside** the DB transaction (it's an external side effect):
   `const res = await this.provider.preAuthorize(bookingId, Number(booking.totalJod));`
4. **In a `$transaction`** persist atomically:
   - `upsert` the `Payment` row keyed on `bookingId`:
     - create: `{ bookingId, provider: <name>, providerRef: res.providerRef, amountJod: booking.totalJod, status: 'PRE_AUTHORIZED', preAuthorizedAt: now }`
     - update: same fields (covers the create-then-crash replay where a PENDING row exists).
   - `prisma.ledgerEntry.create({ data:{ paymentId, type:'CHARGE', amountJod: booking.totalJod, description:'Pre-authorization' } })`.
   > Provider name: read from `process.env.PAYMENT_PROVIDER ?? 'mock'` (or expose a `name`
   > on the provider — but do NOT modify the provider interface; env read is fine).
5. On provider error: let it throw. The outbox worker records `attempts++`; after
   `maxAttempts` the event is `FAILED`. Optionally set `Payment.status='FAILED'` if a
   PENDING row exists — keep it simple; failing the outbox event is sufficient for v1.

> **Ledger idempotency:** to avoid duplicate `CHARGE` rows on replay, before creating the
> ledger entry check there is no existing `CHARGE` for that `paymentId`
> (`findFirst({ where:{ paymentId, type:'CHARGE' } })`), or only create the ledger entry on
> the **create** branch of the upsert. Prefer the latter: create the CHARGE entry only when
> the Payment row is newly created. Document the choice in a comment.

### 4.2 `captureForBooking(bookingId)`
1. `payment = findUnique({ where:{ bookingId } })`. If missing → throw `NotFoundError('Payment')`
   (a completed booking with no pre-auth is an anomaly worth retrying/alerting).
2. **Idempotency:** if `payment.status === 'CAPTURED'` → return (no-op). If
   `payment.status !== 'PRE_AUTHORIZED'` (e.g. PENDING/FAILED/REFUNDED) → throw
   `ConflictError('Payment not in a capturable state')`.
3. `const res = await this.provider.capture(payment.providerRef!);` (outside tx).
4. **In a `$transaction`:**
   - `prisma.payment.update({ where:{ bookingId }, data:{ status:'CAPTURED', capturedAt: now } })`.
   - `prisma.ledgerEntry.create({ data:{ paymentId: payment.id, type:'CAPTURE', amountJod: payment.amountJod, description:'Capture on completion' } })`
     — again guard against a duplicate CAPTURE on replay (only-on-transition, i.e. update
     `where:{ bookingId, status:'PRE_AUTHORIZED' }` and create the ledger entry only if the
     update affected a row).

Throw `NotFoundError`/`ConflictError` from `shared/errors`.

---

## 5. `PaymentOutboxHandler.ts` — the adapter into the seam

A factory returning one `OutboxEventHandler` per eventType this feature consumes. This is
the **only** integration point with `outbox-dev`'s code.

```ts
import type { PrismaClient } from '@prisma/client';
import type { OutboxEventHandler } from '../outbox/OutboxEventHandler'; // SEAM (owned by outbox-dev)
import { PaymentService } from './PaymentService';

/**
 * Build payment handlers for the outbox registry. main.ts (owned by outbox-dev)
 * calls this and registers each returned handler.
 */
export function createPaymentHandlers(deps: { prisma: PrismaClient }): OutboxEventHandler[] {
  const service = new PaymentService(deps.prisma);

  return [
    {
      eventType: 'booking.created',
      async handle(event) {
        await service.preAuthorizeForBooking(event.bookingId);
      },
    },
    {
      eventType: 'booking.completed',
      async handle(event) {
        await service.captureForBooking(event.bookingId);
      },
    },
  ];
}
```

> **⚠️ eventType collision with NotificationHandler:** `outbox-dev`'s notification handler
> ALSO consumes `booking.created` (and `booking.cancelled`). The `OutboxHandlerRegistry`
> is **1 handler per eventType** and `register()` THROWS on a duplicate key. **Two handlers
> cannot both own `booking.created`.** This must be resolved at the registry level, not by
> either handler. **Resolution (coordinate via architect):**
>
> The registry needs to support **multiple handlers per eventType**, OR a single composite.
> The chosen design: **`outbox-dev` upgrades `OutboxHandlerRegistry` to fan-out** — store
> `Map<string, OutboxEventHandler[]>`, `register()` appends, and the worker invokes **all**
> handlers for an eventType (each independently success/fail-tracked, or all-must-succeed).
> This is a small change to the seam and is the architect-approved approach.
>
> **Action for `payment-dev`:** assume fan-out registration is available (multiple handlers
> per eventType). Your factory above is already written for it (you just return handlers;
> registration semantics are the registry's job). Do not work around this in your handler.
> If, when you start, the published registry is still single-handler, STOP and SendMessage
> `architect` — do not hack a composite into your code.

Handlers stay thin: they translate an envelope into a `PaymentService` call. All logic,
idempotency, and persistence live in `PaymentService`.

---

## 6. `BookingService.completeBooking()` (you add this)

Mirror the existing `cancel()` pattern exactly: update the booking inside a `$transaction`
and write the outbox event in the **same** transaction.

### 6.1 Signature
```ts
async completeBooking(bookingId: string, userId: string): Promise<Booking>
```

### 6.2 Behaviour
1. `booking = await this.getById(bookingId, userId)` — reuses existing authz (customer or
   assigned technician). Completion is typically technician-driven; `getById` already
   allows the assigned technician.
2. Guard state: only `IN_PROGRESS` (and optionally `ARRIVED`) bookings may complete. If
   `status` is `COMPLETED`/`CANCELLED` → throw `ConflictError('Booking already finalized')`.
   If not yet in a completable state → `ConflictError('Booking cannot be completed yet')`.
3. `$transaction`:
   ```ts
   const updated = await tx.booking.update({
     where: { id: bookingId },
     data: { status: 'COMPLETED', completedAt: new Date() },
   });
   await tx.outboxEvent.create({
     data: { bookingId, eventType: 'booking.completed', payload: { bookingId } },
   });
   return updated;
   ```
4. Return `updated`.

> Keep imports as-is (`prisma`, errors already imported). Do NOT import `PaymentService`
> into `BookingService` — completion only **emits an event**; payment happens
> asynchronously in the handler. This preserves the transactional-outbox decoupling and
> keeps `BookingService` free of payment concerns.

### 6.3 Route `POST /api/v1/bookings/:id/complete`
Add to `interface/http/routes/bookings.ts`, mirroring `/:id/cancel`:
```ts
bookingsRouter.post(
  '/:id/complete',
  validate([param('id').isString().notEmpty()]),
  asyncHandler(async (req, res) => {
    const booking = await bookingService.completeBooking(req.params.id, req.user!.userId);
    res.json({ data: booking });
  }),
);
```
(Optionally gate with `requireRole('TECHNICIAN')` from `middleware/auth` — discuss; `getById`
authz already restricts to participants, so role gating is optional for v1.)

---

## 7. `main.ts` registration (hand to `outbox-dev`)

You do **not** edit `main.ts`. Send `outbox-dev` (via architect) exactly this so they wire it:

> Register payment handlers after notification handlers:
> ```ts
> import { createPaymentHandlers } from './application/payment/PaymentOutboxHandler';
> for (const h of createPaymentHandlers({ prisma })) registry.register(h);
> ```
> Requires fan-out registration (multiple handlers per eventType) — see PAYMENT_SPEC §5.

---

## 8. Tests (Jest, mock prisma + a fake `IPaymentProvider`)

Follow `BookingService.test.ts` style (mock `prisma`, mock `$transaction` to invoke its callback with a `tx` stub).

- **PaymentService.test.ts**
  - `preAuthorizeForBooking`: calls `provider.preAuthorize(bookingId, amount)`, upserts
    Payment `PRE_AUTHORIZED`, writes `CHARGE` ledger entry.
  - pre-auth idempotency: existing PRE_AUTHORIZED payment → no provider call, no dup ledger.
  - missing booking → `NotFoundError`.
  - `captureForBooking`: PRE_AUTHORIZED → calls `provider.capture(ref)`, sets `CAPTURED`,
    writes `CAPTURE` ledger entry.
  - capture idempotency: already CAPTURED → no-op, no provider call.
  - capture on non-capturable state → `ConflictError`.
  - Inject a fake provider: `{ preAuthorize: jest.fn().mockResolvedValue({ providerRef:'r', status:'PRE_AUTHORIZED' }), capture: jest.fn().mockResolvedValue({ providerRef:'r', status:'CAPTURED' }), refund: jest.fn() }`.
- **PaymentOutboxHandler.test.ts**: each returned handler has the right `eventType` and
  delegates to the service method with `event.bookingId`. (Spy on PaymentService prototype
  or inject.)
- **BookingService.test.ts** (additions): `completeBooking` writes booking `COMPLETED` +
  `booking.completed` outbox event atomically (assert `tx.outboxEvent.create` called with
  `eventType:'booking.completed'`); rejects on already-finalized booking.

Update the prisma mock in `BookingService.test.ts` only if needed (it already mocks
`booking.update`, `outboxEvent.create`, `$transaction`).

---

## 9. Conventions checklist
- Hexagonal: `PaymentService` (application) depends on the `IPaymentProvider` **port** and
  injected `prisma`; the concrete provider comes from the factory (infrastructure). The
  handler (application) depends only on the seam interface. No HTTP/socket knowledge in either.
- Provider call is OUTSIDE the DB transaction; persistence is INSIDE. Never hold a DB tx open
  across a network call to the provider.
- Idempotent everywhere (at-least-once delivery).
- Files < 500 lines. Error envelope via `shared/errors` (`NotFoundError`/`ConflictError`).
- No schema changes, no provider changes, no edits outside §2 ownership.

---

## 10. Definition of done
1. Booking creation → (async) a `Payment` `PRE_AUTHORIZED` + `CHARGE` ledger row appear.
2. `POST /bookings/:id/complete` → booking `COMPLETED`, emits `booking.completed`, and
   (async) the payment becomes `CAPTURED` + a `CAPTURE` ledger row appears.
3. Re-delivery of either event produces no duplicate Payments/ledger rows (idempotency tests green).
4. `npm run build && npm test` green in `backend/`.
5. Handler registered via the factory in `main.ts` (wired by `outbox-dev`) — no edits to the worker.

---

## 11. ⚠️ START CONDITION (read again)
Do not create `application/payment/**` or edit `BookingService.ts` until **"registry ready"**
arrives from `outbox-dev`. On that signal:
1. Open `application/outbox/OutboxEventHandler.ts` and confirm `OutboxEventHandler` /
   `OutboxEventEnvelope` / `HandlerContext` match §4/§5 assumptions.
2. Confirm the registry supports **fan-out** (multiple handlers per eventType). If not,
   SendMessage `architect` before writing the handler — do not self-resolve the collision.
3. Then build in order: `PaymentService` → tests → `PaymentOutboxHandler` →
   `BookingService.completeBooking` + route → tests → send `main.ts` registration line to `outbox-dev`.
