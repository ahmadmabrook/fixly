import { useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, BookingListItem, CreateBookingInput, CreateBookingResult } from '../lib/api';
import { useAuth } from '../lib/store';
import { IDEMPOTENCY_KEY_HEADER } from '../lib/constants';

/** Current user's bookings; only runs when authenticated. */
export function useBookings() {
  const accessToken = useAuth((s) => s.accessToken);
  return useQuery({
    queryKey: ['bookings'],
    queryFn: () => api.get<BookingListItem[]>('/bookings'),
    enabled: !!accessToken,
  });
}

/**
 * Creates a booking and invalidates the list so "My Bookings" stays fresh. Returns the
 * booking plus an optional hosted-checkout session (present when a real PSP is configured).
 *
 * Sends a stable Idempotency-Key (one per hook instance, i.e. one per checkout-page visit)
 * so a client-side timeout/retry of the *same* submission replays the original booking
 * instead of creating a duplicate (see backend's `idempotency('bookings.create')`). A fresh
 * key is generated only when the component remounts — i.e. a genuinely new attempt.
 */
export function useCreateBooking() {
  const queryClient = useQueryClient();
  const idempotencyKeyRef = useRef<string>();
  if (!idempotencyKeyRef.current) idempotencyKeyRef.current = crypto.randomUUID();

  return useMutation({
    mutationFn: (input: CreateBookingInput) =>
      api.post<CreateBookingResult>('/bookings', input, {
        [IDEMPOTENCY_KEY_HEADER]: idempotencyKeyRef.current!,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bookings'] }),
  });
}
