import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, BookingListItem, CreateBookingInput } from '../lib/api';
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

/** Creates a booking and invalidates the list so "My Bookings" stays fresh. */
export function useCreateBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBookingInput) =>
      api.post<BookingListItem>('/bookings', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bookings'] }),
  });
}
