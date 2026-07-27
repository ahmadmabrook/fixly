/**
 * Outbox event-type strings. `OutboxEvent.eventType` (see schema.prisma) is a
 * plain `String` column, not a Prisma enum, because the outbox is a generic
 * transport — but the actual set of event types producers write and handlers
 * register for is a closed, business-meaningful vocabulary. Named here once so
 * every producer/handler pair references the same constant instead of a
 * repeated literal that could silently drift (a typo'd producer literal would
 * create an event no handler is registered for, and vice versa).
 */
export const OutboxEventType = {
  BOOKING_CREATED: 'booking.created',
  BOOKING_CONFIRMED: 'booking.confirmed',
  BOOKING_EN_ROUTE: 'booking.en_route',
  BOOKING_ARRIVED: 'booking.arrived',
  BOOKING_IN_PROGRESS: 'booking.in_progress',
  BOOKING_COMPLETED: 'booking.completed',
  BOOKING_CANCELLED: 'booking.cancelled',
  BOOKING_NO_SHOW: 'booking.no_show',
  // §3.3 v1.5 events — booking-scoped (OutboxEvent.bookingId is required), so
  // a credit grant with no booking context (pure goodwill) skips the event
  // rather than emitting one with no room to route it to.
  EXTRA_WORK_PROPOSED: 'booking.extra_proposed',
  EXTRA_WORK_DECIDED: 'booking.extra_decided',
  QUOTE_READY: 'quote.ready',
  CREDIT_GRANTED: 'credit.granted',
} as const;

export type OutboxEventType = (typeof OutboxEventType)[keyof typeof OutboxEventType];
