# OUTBOX_SPEC — Transactional Outbox Worker

**Owner:** `outbox-dev`
**Status:** Ready to build
**Depends on:** nothing (this defines the seam everyone else plugs into)

---

## 1. Goal

`BookingService` already writes rows into `outbox_events` (status `PENDING`) inside the
same transaction as the business write (`booking.created`, `booking.cancelled`). Nothing
consumes them. Build a **worker** that drains those rows and dispatches each one — by
`eventType` — to a registered **handler**, with retry/backoff and durable status
transitions. Ship a **notification handler** as the first concrete handler.

The headline deliverable is the **integration seam** (`OutboxEventHandler` +
`OutboxHandlerRegistry`) so that `payment-dev` can register a payment handler **without
editing any file you own**.

---

## 2. File ownership (HARD BOUNDARY)

`outbox-dev` **creates and owns** everything under `application/outbox/` plus the worker
wiring in `main.ts`. You also own the notification handler.

```
backend/src/application/outbox/
  OutboxEventHandler.ts          # interface + HandlerContext type        (SEAM — frozen once published)
  OutboxHandlerRegistry.ts       # Map<string, OutboxEventHandler> wrapper (SEAM — frozen once published)
  OutboxWorker.ts                # the consumer/dispatcher
  handlers/
    NotificationHandler.ts       # booking.created / booking.cancelled -> Notification rows + socket emit
  OutboxWorker.test.ts
  OutboxHandlerRegistry.test.ts
  handlers/NotificationHandler.test.ts
```

`main.ts` — you add the worker bootstrap + handler registration block (see §8).

### Files you MUST NOT touch
- `application/payment/**` — owned by `payment-dev`.
- `application/booking/BookingService.ts` — owned by `payment-dev` (adds `completeBooking`).
- `web/**` — owned by `socket-dev`.
- `interface/socket/server.ts` — read it for the room/event contract; **do not edit it**.
- `prisma/schema.prisma` — the `OutboxEvent`, `Notification` models and `OutboxStatus`
  enum already exist. **No migration needed.**

### The one shared file: `main.ts`
Both you and `payment-dev` add lines here. To avoid a collision, **you own `main.ts`**.
`payment-dev` will hand you their handler's construction signature; you add the
`registry.register(...)` line for it in the block you write. See §8 and the coordination
note at the bottom.

---

## 3. Data contract (already in schema — do not change)

`OutboxEvent` (prisma model `OutboxEvent`, table `outbox_events`):

| field | type | notes |
|-------|------|-------|
| `id` | uuid | |
| `bookingId` | uuid | every event is booking-scoped |
| `eventType` | string | dispatch key, e.g. `booking.created` |
| `payload` | Json | handler-specific shape |
| `status` | `OutboxStatus` | `PENDING` → `PROCESSING` → `DONE` \| `FAILED` |
| `attempts` | Int | incremented on each failed try |
| `processedAt` | DateTime? | set when `DONE` |
| `failedAt` | DateTime? | set when terminal `FAILED` |
| `errorMsg` | String? | last error message (truncate to 500 chars) |
| `createdAt` | DateTime | poll order key |

Index already present: `@@index([status, createdAt])` — your poll query MUST be
`WHERE status = 'PENDING' ORDER BY createdAt ASC` to use it.

`OutboxStatus` enum: `PENDING | PROCESSING | DONE | FAILED`.

---

## 4. The SEAM — `OutboxEventHandler.ts` (FREEZE THIS FIRST)

This is the contract `payment-dev` codes against. Publish it before anything else, then
SendMessage `outbox-dev → architect → payment-dev` "registry ready" so payment can start.

```ts
// backend/src/application/outbox/OutboxEventHandler.ts
import type { Server as SocketServer } from 'socket.io';
import type { PrismaClient } from '@prisma/client';

/**
 * Dependencies a handler may use. Injected by the worker so handlers stay
 * unit-testable and never import singletons directly.
 */
export interface HandlerContext {
  prisma: PrismaClient;
  io: SocketServer;
}

/**
 * The shape of an outbox event as handed to a handler. Mirrors the
 * OutboxEvent row but typed for handler use (payload is opaque JSON;
 * each handler narrows it).
 */
export interface OutboxEventEnvelope {
  id: string;
  bookingId: string;
  eventType: string;
  payload: unknown;
  attempts: number;
}

/**
 * A handler processes exactly one eventType (1:1 with the registry key).
 *
 * Contract:
 * - MUST be idempotent. The worker guarantees at-least-once delivery; a row
 *   may be retried after a crash between side-effect and status write.
 * - Throw to signal failure -> worker records attempts++ / errorMsg and
 *   retries with backoff (see §6). Return normally to signal success -> DONE.
 * - MUST NOT mutate OutboxEvent.status itself; the worker owns lifecycle.
 */
export interface OutboxEventHandler {
  readonly eventType: string;
  handle(event: OutboxEventEnvelope, ctx: HandlerContext): Promise<void>;
}
```

> **Frozen surface:** `HandlerContext`, `OutboxEventEnvelope`, `OutboxEventHandler`.
> Once "registry ready" is sent, changing these requires re-coordinating with
> `payment-dev`. Add fields only additively.

---

## 5. The SEAM — `OutboxHandlerRegistry.ts` (FAN-OUT: many handlers per eventType)

A thin, typed wrapper over `Map<string, OutboxEventHandler[]>`. No business logic.

> **CRITICAL — fan-out, not 1:1.** Multiple features subscribe to the SAME eventType.
> Concretely: your `NotificationHandler` consumes `booking.created`, AND `payment-dev`'s
> payment handler **also** consumes `booking.created`. A 1-handler-per-key map would make
> the second `register()` throw and the two features would fight. So the registry stores an
> **array** per eventType and `register()` **appends**. The worker runs **all** handlers
> registered for an event (see §6 dispatch). This is the single most important decision in
> this spec — get it right before publishing.

```ts
// backend/src/application/outbox/OutboxHandlerRegistry.ts
import type { OutboxEventHandler } from './OutboxEventHandler';

export class OutboxHandlerRegistry {
  private readonly handlers = new Map<string, OutboxEventHandler[]>();

  /** Append a handler for its eventType. Multiple handlers per eventType are
   *  expected (e.g. notification + payment both consume booking.created). */
  register(handler: OutboxEventHandler): this {
    const list = this.handlers.get(handler.eventType) ?? [];
    list.push(handler);
    this.handlers.set(handler.eventType, list);
    return this;
  }

  /** All handlers registered for an eventType (empty array if none). */
  get(eventType: string): readonly OutboxEventHandler[] {
    return this.handlers.get(eventType) ?? [];
  }

  has(eventType: string): boolean {
    return (this.handlers.get(eventType)?.length ?? 0) > 0;
  }
}
```

**Why a registry, not a switch:** the worker dispatches via `registry.get(eventType)` and
runs every handler in the returned array. `payment-dev` adds payment behaviour by
constructing a handler and calling `registry.register(...)` in `main.ts` — they never open
`OutboxWorker.ts`. That is the decoupling this whole spec exists to create.

---

## 6. `OutboxWorker.ts` — the consumer

### Constructor

```ts
export interface OutboxWorkerOptions {
  pollIntervalMs?: number;   // default 1000
  batchSize?: number;        // default 20
  maxAttempts?: number;      // default 5
  backoffBaseMs?: number;    // default 1000 (exponential: base * 2^(attempts-1), capped)
  backoffCapMs?: number;     // default 60_000
}

export class OutboxWorker {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly io: SocketServer,
    private readonly registry: OutboxHandlerRegistry,
    private readonly opts?: OutboxWorkerOptions,
  ) {}

  start(): void   // begins the poll loop (setTimeout-driven, not setInterval — see below)
  stop(): Promise<void>  // stops the loop, awaits the in-flight tick, resolves clean
}
```

### Polling + claim (DB-backed, single-process safe by default)

Implement the simple **poll-and-claim** loop. BullMQ is available but **not required for
v1** — the DB already has the index and the claim can be made race-safe with a
conditional update. Keep it DB-backed; we can move to BullMQ later behind the same
registry without touching handlers.

Per tick:

1. **Claim a batch** atomically. Use `updateMany` to flip `PENDING → PROCESSING` for the
   oldest N rows, then read them back. Concretely:
   - `SELECT id FROM outbox_events WHERE status='PENDING' ORDER BY createdAt ASC LIMIT batchSize` (via `prisma.outboxEvent.findMany({ where:{status:'PENDING'}, orderBy:{createdAt:'asc'}, take: batchSize, select:{id:true} })`)
   - `prisma.outboxEvent.updateMany({ where:{ id:{ in: ids }, status:'PENDING' }, data:{ status:'PROCESSING' } })` — the `status:'PENDING'` guard makes the claim race-safe; only rows you won transition.
   - Re-read the rows you actually claimed (`updateMany` count vs ids) to get full payloads. Simplest correct approach: re-`findMany({ where:{ id:{ in: ids }, status:'PROCESSING' } })`. For single-process dev this is exact; for multi-process it is safe because losers were already flipped by the winner.
   > Note the race window between the two statements is acceptable for v1 (single backend process under `tsx watch`). Document it; do not over-engineer. A `SELECT ... FOR UPDATE SKIP LOCKED` raw query is a fine optional upgrade but not required.

2. **Dispatch each claimed row** (FAN-OUT — run ALL handlers for the eventType):
   - `const handlers = registry.get(row.eventType)` → a `readonly OutboxEventHandler[]`.
   - **Empty array (no handlers)?** Not an error — no feature consumes that event yet.
     Mark it `DONE` and log at `debug`. Rationale: an unconsumed event should not wedge the
     queue or accrue attempts. (Optionally gate behind `ignoreUnhandled: true`, default true.)
   - **Handlers present:** invoke each `handler.handle({ id, bookingId, eventType, payload, attempts }, { prisma, io })`
     **sequentially** (deterministic, and notification-before-payment ordering is fine since
     each is idempotent). Collect outcomes:
     - **All resolve** → `update status='DONE', processedAt=now()`.
     - **Any throws** → the whole row takes the **failure path** (§ below). Because the row
       is retried as a unit, individual handlers MUST be idempotent (already required by the
       seam) so the ones that already succeeded are safe to run again on replay. Capture the
       FIRST thrown error for `errorMsg`; let remaining handlers still run this pass (so one
       broken consumer doesn't starve the others), but mark the row failed if any threw.
   > Implementation note: wrap each handler call in its own try/catch, push any error into a
   > local array, and after the loop decide DONE vs failure based on whether the array is
   > non-empty. This guarantees at-least-once for every handler and a single row-level
   > retry decision.

3. **Failure path** when one or more handlers threw:
   - `attempts = row.attempts + 1`, `errorMsg = String(err).slice(0, 500)`.
   - If `attempts >= maxAttempts` → `status='FAILED', failedAt=now(), attempts, errorMsg` (terminal; alert-worthy, log at `error`).
   - Else → `status='PENDING', attempts, errorMsg` (re-queued). Apply backoff by **not
     re-claiming it until** `backoffBaseMs * 2^(attempts-1)` (capped at `backoffCapMs`)
     has elapsed. Simplest implementation: add a `nextAttemptAt`? The schema has no such
     column and **we are not migrating**. So implement backoff at the **tick level**: a
     row that just failed is set back to `PENDING`; to honour backoff without a column,
     track an **in-memory `Map<id, nextEligibleTs>`** in the worker and skip claimed rows
     whose `nextEligibleTs` is in the future (release them back to `PENDING` immediately
     without dispatch). This keeps backoff correct for the live process; after a restart
     the row simply retries immediately, which is acceptable (idempotent handlers).
   > Keep this honest in code comments: backoff is best-effort/in-memory by design to
   > avoid a schema change. Acceptable because handlers are idempotent.

4. **Loop control:** use a recursive `setTimeout(tick, pollIntervalMs)` (NOT
   `setInterval`) so a slow tick never overlaps itself. `stop()` clears the timer and
   awaits the in-flight tick promise.

5. **Crash recovery:** on `start()`, before the first tick, reset orphaned rows:
   `updateMany({ where:{ status:'PROCESSING' }, data:{ status:'PENDING' } })`. A row left
   `PROCESSING` means the process died mid-dispatch; idempotent handlers make replay safe.

6. **Error isolation:** one handler throwing must never kill the loop. Wrap each row's
   dispatch in try/catch; wrap the whole tick in try/catch and log; always re-arm the timer.

---

## 7. `handlers/NotificationHandler.ts` — first concrete handler

Handles **`booking.created`** and **`booking.cancelled`**. (Two eventTypes → register
**two instances**, or one instance registered under two keys. Since the registry key is
`handler.eventType` (single), the clean approach is **two small handler objects** sharing
a private helper, OR a factory `createNotificationHandlers(): OutboxEventHandler[]`
returning one per eventType. Use the factory — it keeps registration tidy in `main.ts`.)

### Behaviour per event

Resolve the recipient user, write a `Notification` row, then emit a socket event to that
user's personal room.

`booking.created` payload is `{ bookingId, customerId }` (see `BookingService.createBooking`).
`booking.cancelled` payload is `{ bookingId, reason }`.

For `booking.cancelled` you must resolve the recipient(s): load the booking to get
`customerId` (and `technicianId` → its `userId` if assigned). For v1, notify the
**customer**; optionally the technician if assigned. Keep it minimal and idempotent.

```ts
// Pseudocode for one event
async handle(event, { prisma, io }) {
  const booking = await prisma.booking.findUnique({
    where: { id: event.bookingId },
    select: { customerId: true, status: true },
  });
  if (!booking) return; // booking gone; nothing to notify (idempotent no-op)

  const { titleAr, bodyAr } = messageFor(event.eventType); // table below

  // Idempotency: Notification has no natural unique key for this; guard by
  // checking for an existing identical (userId, bookingId, titleAr) row this run,
  // OR accept duplicate-on-replay as benign. Prefer a findFirst guard.
  await prisma.notification.create({
    data: { userId: booking.customerId, bookingId: event.bookingId, titleAr, bodyAr },
  });

  // Live push to the user's personal room (socket/server.ts already joins `user:${userId}`).
  io.to(`user:${booking.customerId}`).emit('booking:status', {
    bookingId: event.bookingId,
    status: booking.status,
    at: Date.now(),
  });
}
```

### Arabic notification copy (the schema columns are `titleAr` / `bodyAr`)

| eventType | titleAr | bodyAr |
|-----------|---------|--------|
| `booking.created` | `تم استلام طلبك` | `طلبك قيد المعالجة، سنخطرك عند قبوله.` |
| `booking.cancelled` | `تم إلغاء الطلب` | `تم إلغاء طلبك.` |

### Socket emit contract (consumed by `socket-dev`)
- Room: `user:${userId}` (already joined in `interface/socket/server.ts`).
- Event name: **`booking:status`**.
- Payload: `{ bookingId: string, status: string, at: number }`.

> `socket-dev` listens for `booking:status` on the user's connection. This is the only
> new server→client event you introduce; document it so the frontend matches exactly.

---

## 8. `main.ts` wiring (you own this edit)

`main.ts` already constructs `prisma`, `redis`, and `io`. After `io` is created and before
`httpServer.listen`, build the registry, register handlers, and start the worker. Wire
shutdown to `worker.stop()`.

```ts
// after: const io = createSocketServer(httpServer);
import { OutboxHandlerRegistry } from './application/outbox/OutboxHandlerRegistry';
import { OutboxWorker } from './application/outbox/OutboxWorker';
import { createNotificationHandlers } from './application/outbox/handlers/NotificationHandler';
// import { createPaymentHandlers } from './application/payment/PaymentOutboxHandler'; // ADDED by payment-dev's signature, wired by you

const registry = new OutboxHandlerRegistry();
for (const h of createNotificationHandlers()) registry.register(h);
// for (const h of createPaymentHandlers({ prisma })) registry.register(h);  // §coordination

const outboxWorker = new OutboxWorker(prisma, io, registry);
outboxWorker.start();
logger.info('Outbox worker started');

// in registerShutdown(...): await outboxWorker.stop(); BEFORE prisma.$disconnect()
```

You will need to extend `registerShutdown` to also stop the worker. Pass it in (add a
param) and `await outboxWorker.stop()` first in the shutdown sequence, before
`httpServer.close`/`prisma.$disconnect`, so no tick is mid-flight when the DB closes.

---

## 9. Tests (Jest, `--runInBand`, mock prisma like `BookingService.test.ts`)

- **OutboxHandlerRegistry.test.ts**: register/get/has; **two handlers for the same
  eventType both register and both come back from `get()`** (fan-out); `get()` returns `[]`
  for an unknown eventType.
- **OutboxWorker.test.ts** (mock prisma + a fake registry + fake `io`):
  - claims PENDING in createdAt order, flips to PROCESSING.
  - success path → `DONE` + `processedAt`.
  - **fan-out: two handlers registered for one eventType are BOTH invoked**; all resolve → `DONE`.
  - one of several handlers throws → row takes failure path; the FIRST error is recorded in `errorMsg`.
  - throw path under maxAttempts → back to `PENDING`, `attempts++`, `errorMsg` set.
  - throw path at maxAttempts → `FAILED` + `failedAt`.
  - unknown eventType (no handlers) → marked `DONE` (or skipped per chosen option), loop survives.
  - `stop()` resolves and no further ticks run.
  - orphan recovery flips `PROCESSING → PENDING` on start.
- **NotificationHandler.test.ts**: creates a Notification row with correct Arabic copy and
  calls `io.to('user:<id>').emit('booking:status', …)`; missing booking → no throw.

Mock `io` as `{ to: jest.fn().mockReturnValue({ emit: jest.fn() }) }`.

---

## 10. Conventions checklist
- Hexagonal: worker + handlers live in `application/`; they depend on injected `prisma`/`io`
  (ports), never import the singletons inside handler logic (the worker passes them via
  `HandlerContext`). `main.ts` (composition root) is the only place singletons meet the worker.
- Every file < 500 lines (worker will be ~150; split helpers if it grows).
- Error envelope: N/A here (no HTTP), but throw real `Error`s; the worker stringifies.
- No secrets, no schema changes, no edits outside §2 ownership.

---

## 11. Definition of done
1. `OutboxEventHandler.ts` + `OutboxHandlerRegistry.ts` exist and compile → **send
   "registry ready"** so `payment-dev` unblocks.
2. Worker drains `booking.created` / `booking.cancelled`, notifications appear in DB, and
   `booking:status` is emitted to the user room.
3. Retry/backoff + terminal FAILED proven by tests.
4. `npm run build && npm test` green in `backend/`.
5. Worker starts on boot and stops cleanly on SIGTERM.
