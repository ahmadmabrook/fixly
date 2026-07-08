import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { useAuth } from '../lib/store';
import Bookings from './Bookings';

function renderWithProviders(ui: React.ReactNode, routerProps = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter {...routerProps}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useAuth.getState().logout();
  localStorage.clear();
});

/** Routes fetch calls by URL substring so a single test can mock both the
 *  list endpoint and the lazy-fetched detail endpoint. */
function mockFetchByUrl(routes: Array<{ match: string; status?: number; payload?: unknown; blob?: boolean }>) {
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    const route = routes.find((r) => url.includes(r.match));
    if (!route) throw new Error(`Unmocked fetch: ${url}`);
    return {
      ok: (route.status ?? 200) >= 200 && (route.status ?? 200) < 300,
      status: route.status ?? 200,
      json: async () => route.payload,
      blob: async () => new Blob(['csv']),
    } as Response;
  });
  Object.defineProperty(globalThis, 'fetch', { value: fn as unknown as typeof fetch, writable: true, configurable: true });
  return fn;
}

const listPayload = {
  data: [
    { id: 'b1234567-aaaa', status: 'PENDING', scheduledAt: null, totalJod: 25,
      customer: { id: 'c1', name: 'سارة' },
      service: { nameAr: 'سباكة', nameEn: 'Plumbing' },
      technician: { user: { name: 'خالد' } } },
  ],
  meta: { total: 1, limit: 50, offset: 0 },
};

describe('Bookings page (pagination via meta envelope)', () => {
  it('shows the total in the header when meta is present', async () => {
    useAuth.getState().setAuth('tok', { id: 'a1', name: 'A', email: 'a@b.c' });
    mockFetchByUrl([{ match: '/bookings?', payload: listPayload }]);

    renderWithProviders(<Bookings />);
    await waitFor(() => expect(screen.getByText('سارة')).toBeInTheDocument());
    expect(screen.getByText(/1/)).toBeInTheDocument();
  });

  it('shows the empty state when the list is empty', async () => {
    useAuth.getState().setAuth('tok', { id: 'a1', name: 'A', email: 'a@b.c' });
    mockFetchByUrl([{ match: '/bookings?', payload: { data: [], meta: { total: 0, limit: 50, offset: 0 } } }]);
    renderWithProviders(<Bookings />);
    await waitFor(() => expect(screen.getByText(/لا توجد حجوزات/)).toBeInTheDocument());
  });
});

describe('Bookings page (detail drawer wired to GET /admin/bookings/:id)', () => {
  const detailPayload = {
    data: {
      booking: {
        id: 'b1234567-aaaa',
        status: 'COMPLETED',
        addressLine: 'شارع الجامعة، عمّان',
        scheduledAt: null,
        startedAt: null,
        completedAt: '2026-06-01T10:00:00.000Z',
        cancelledAt: null,
        cancelReason: null,
        discountJod: 2,
        totalJod: 25,
        lateCompJod: 0,
        createdAt: '2026-05-30T08:00:00.000Z',
        customer: { id: 'c1', name: 'سارة' },
        technician: { id: 't1', user: { name: 'خالد' } },
        service: { nameAr: 'سباكة', nameEn: 'Plumbing', priceJod: 27 },
      },
      statusHistory: [
        { id: 'h1', fromStatus: null, toStatus: 'PENDING', changedAt: '2026-05-30T08:00:00.000Z', changedBy: null },
        { id: 'h2', fromStatus: 'PENDING', toStatus: 'COMPLETED', changedAt: '2026-06-01T10:00:00.000Z', changedBy: 'u1' },
      ],
      additionalWork: [
        { id: 'w1', description: 'استبدال أنبوب إضافي', amountJod: 5, status: 'APPROVED', createdAt: '2026-05-31T08:00:00.000Z' },
      ],
      payment: {
        id: 'p1', status: 'CAPTURED', provider: 'hyperpay', currency: 'JOD',
        amountJod: 25, capturedAmountJod: 25, refundedAmountJod: 0,
      },
    },
  };

  it('lazily fetches and renders the real detail endpoint on row click', async () => {
    useAuth.getState().setAuth('tok', { id: 'a1', name: 'A', email: 'a@b.c' });
    const fetchMock = mockFetchByUrl([
      { match: '/bookings?', payload: listPayload },
      { match: '/bookings/b1234567-aaaa', payload: detailPayload },
    ]);

    const user = userEvent.setup();
    renderWithProviders(<Bookings />);
    await waitFor(() => expect(screen.getByText('سارة')).toBeInTheDocument());

    await user.click(screen.getByTestId('booking-row-b1234567-aaaa'));

    // Detail endpoint fetched lazily, on drawer open.
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/bookings/b1234567-aaaa'))).toBe(true));

    // Status history timeline.
    await waitFor(() => expect(screen.getByText('سجل الحالات')).toBeInTheDocument());
    expect(screen.getByText('العنوان')).toBeInTheDocument();
    expect(screen.getByText('شارع الجامعة، عمّان')).toBeInTheDocument();

    // Payment breakdown.
    expect(screen.getByText('الدفع')).toBeInTheDocument();
    expect(screen.getByText('محصّل')).toBeInTheDocument();

    // Additional work items.
    expect(screen.getByText('أعمال إضافية')).toBeInTheDocument();
    expect(screen.getByText('استبدال أنبوب إضافي')).toBeInTheDocument();
  });

  it('shows a "no payment yet" message when payment is null', async () => {
    useAuth.getState().setAuth('tok', { id: 'a1', name: 'A', email: 'a@b.c' });
    mockFetchByUrl([
      { match: '/bookings?', payload: listPayload },
      { match: '/bookings/b1234567-aaaa', payload: { data: { ...detailPayload.data, payment: null, additionalWork: [] } } },
    ]);

    const user = userEvent.setup();
    renderWithProviders(<Bookings />);
    await waitFor(() => expect(screen.getByText('سارة')).toBeInTheDocument());
    await user.click(screen.getByTestId('booking-row-b1234567-aaaa'));

    await waitFor(() => expect(screen.getByText('لا توجد عملية دفع بعد')).toBeInTheDocument());
  });
});

describe('Bookings page (server-side CSV export)', () => {
  it('downloads via GET /admin/bookings.csv with the selected status filter', async () => {
    useAuth.getState().setAuth('tok', { id: 'a1', name: 'A', email: 'a@b.c' });
    const fetchMock = mockFetchByUrl([
      { match: '/bookings?', payload: listPayload },
      { match: '/bookings.csv', blob: true },
    ]);
    const createObjectURL = vi.fn(() => 'blob:mock-url');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, writable: true, configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, writable: true, configurable: true });

    const user = userEvent.setup();
    renderWithProviders(<Bookings />);
    await waitFor(() => expect(screen.getByText('سارة')).toBeInTheDocument());

    await user.click(screen.getByText(/تصدير CSV/));

    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/bookings.csv'))).toBe(true);
  });

  it('includes the selected status filter in the CSV export URL', async () => {
    useAuth.getState().setAuth('tok', { id: 'a1', name: 'A', email: 'a@b.c' });
    const fetchMock = mockFetchByUrl([
      { match: '/bookings?', payload: listPayload },
      { match: '/bookings.csv', blob: true },
    ]);
    Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:mock-url'), writable: true, configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), writable: true, configurable: true });

    const user = userEvent.setup();
    renderWithProviders(<Bookings />);
    await waitFor(() => expect(screen.getByText('سارة')).toBeInTheDocument());

    await user.click(screen.getByText('مكتمل'));
    await waitFor(() => expect(screen.getAllByText('سارة').length).toBeGreaterThan(0));

    await user.click(screen.getByText(/تصدير CSV/));

    await waitFor(() =>
      expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/bookings.csv?status=COMPLETED'))).toBe(true),
    );
  });
});
