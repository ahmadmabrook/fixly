import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, BookingListItem, CreateBookingInput, CreateBookingResult } from '../lib/api';
import { useAuth } from '../lib/store';

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
 */
export function useCreateBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBookingInput) =>
      api.post<CreateBookingResult>('/bookings', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bookings'] }),
  });
}
