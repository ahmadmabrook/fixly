import { BookingStatus, Prisma } from '@prisma/client';

/** Append-only audit row for a booking status transition (§ booking_status_history).
 *  Called alongside every status write below — never updated/deleted afterwards.
 *  Shared by every BookingService flow. */
export async function recordBookingStatusHistory(
  tx: Prisma.TransactionClient,
  bookingId: string,
  fromStatus: BookingStatus | null,
  toStatus: BookingStatus,
  changedBy?: string,
): Promise<void> {
  await tx.bookingStatusHistory.create({
    data: { bookingId, fromStatus, toStatus, changedBy: changedBy ?? null },
  });
}
