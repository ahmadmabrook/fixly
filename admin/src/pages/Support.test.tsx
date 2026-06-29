import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { useAuth } from '../lib/store';
import Support from './Support';

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
  useAuth.getState().setAuth('tok', { id: 'a1', name: 'A', email: 'a@b.c' });
});

function mockFetchWith(payloads: Array<{ status?: number; payload: unknown }>) {
  let i = 0;
  const fn = vi.fn(async (_url: string, _init?: RequestInit) => {
    const r = payloads[i++] ?? payloads[payloads.length - 1];
    return {
      ok: (r.status ?? 200) >= 200 && (r.status ?? 200) < 300,
      status: r.status ?? 200,
      json: async () => r.payload,
    } as Response;
  });
  Object.defineProperty(globalThis, 'fetch', { value: fn as unknown as typeof fetch, writable: true, configurable: true });
  return fn;
}

const listPayload = {
  data: [
    {
      id: 't1', subject: 'مشكلة بالحجز', status: 'OPEN',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      user: { name: 'أحمد', phone: '0790000000' },
      _count: { messages: 2 },
    },
  ],
  meta: { total: 1, limit: 50, offset: 0 },
};

const ticketPayload = {
  data: {
    id: 't1', subject: 'مشكلة بالحجز', status: 'OPEN',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    user: { name: 'أحمد', phone: '0790000000' },
    messages: [{ id: 'm1', senderRole: 'USER', body: 'لدي مشكلة', createdAt: new Date().toISOString() }],
  },
};

const UUID_IN_MSG = '11111111-2222-4333-8444-555555555555';
const ticketWithUuidPayload = {
  data: {
    id: 't1', subject: 'مشكلة بالحجز', status: 'OPEN',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    user: { name: 'أحمد', phone: '0790000000' },
    messages: [{ id: 'm1', senderRole: 'USER', body: `رقم حجزي هو ${UUID_IN_MSG}`, createdAt: new Date().toISOString() }],
  },
};

describe('Support page (refund is confirm-gated)', () => {
  it('does NOT fire the refund mutation on a single click — confirm dialog required', async () => {
    const seq = mockFetchWith([
      { payload: listPayload },
      { payload: ticketPayload },
      { payload: ticketPayload },
    ]);
    const user = userEvent.setup();
    renderWithProviders(<Support />);
    await waitFor(() => expect(screen.getByText('أحمد')).toBeInTheDocument());

    // Open the conversation drawer
    await user.click(screen.getByText('فتح'));
    // The drawer heading renders the subject as an h2
    await waitFor(() => expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('مشكلة بالحجز'));

    // Open the refund form
    await user.click(screen.getByText('استرداد'));

    // Fill in booking id and amount
    const bookingInput = screen.getByPlaceholderText('معرّف الحجز');
    const amountInput = screen.getByPlaceholderText('المبلغ (دينار)');
    await user.type(bookingInput, 'b123');
    await user.type(amountInput, '25.00');

    // Click the confirm button within the refund form (this should open the confirm dialog, NOT fire the mutation)
    await user.click(screen.getByTestId('refund-confirm-btn'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/تأكيد إصدار مبلغ مسترد/)).toBeInTheDocument();

    // Cancel — the refund endpoint should NOT have been called
    await user.click(within(dialog).getByRole('button', { name: /إلغاء/ }));
    const refundCall = seq.mock.calls.find(([url]) => typeof url === 'string' && url.includes('/bookings/b123/refund'));
    expect(refundCall).toBeUndefined();
  });

  it('fires the refund mutation only after confirming', async () => {
    const seq = mockFetchWith([
      { payload: listPayload },
      { payload: ticketPayload },
      { payload: ticketPayload },
      { payload: { data: {} } },
      { payload: listPayload },
    ]);
    const user = userEvent.setup();
    renderWithProviders(<Support />);
    await waitFor(() => expect(screen.getByText('أحمد')).toBeInTheDocument());

    await user.click(screen.getByText('فتح'));
    await waitFor(() => expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('مشكلة بالحجز'));
    await user.click(screen.getByText('استرداد'));

    const bookingInput = screen.getByPlaceholderText('معرّف الحجز');
    const amountInput = screen.getByPlaceholderText('المبلغ (دينار)');
    await user.type(bookingInput, 'b123');
    await user.type(amountInput, '25.00');

    await user.click(screen.getByTestId('refund-confirm-btn'));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /استرداد/ }));

    await waitFor(() => {
      const refundCall = seq.mock.calls.find(([url]) => typeof url === 'string' && url.includes('/bookings/b123/refund'));
      expect(refundCall).toBeTruthy();
      const init = refundCall?.[1] as RequestInit | undefined;
      expect(init?.method).toBe('POST');
    });
  });

  it('validates that the refund amount must be greater than 0', async () => {
    mockFetchWith([
      { payload: listPayload },
      { payload: ticketPayload },
      { payload: ticketPayload },
    ]);
    const user = userEvent.setup();
    renderWithProviders(<Support />);
    await waitFor(() => expect(screen.getByText('أحمد')).toBeInTheDocument());

    await user.click(screen.getByText('فتح'));
    await waitFor(() => expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('مشكلة بالحجز'));
    await user.click(screen.getByText('استرداد'));

    const bookingInput = screen.getByPlaceholderText('معرّف الحجز');
    const amountInput = screen.getByPlaceholderText('المبلغ (دينار)');
    await user.type(bookingInput, 'b123');
    await user.type(amountInput, '0');

    // The confirm button should be disabled when amount <= 0
    expect(screen.getByTestId('refund-confirm-btn')).toBeDisabled();
    // Validation message should be shown
    expect(screen.getByText('أدخل مبلغاً أكبر من صفر.')).toBeInTheDocument();
  });
});

describe('Support page (refund booking-id auto-extract)', () => {
  it('prefills bookingId from a UUID in the messages and shows a verify warning', async () => {
    mockFetchWith([
      { payload: listPayload },
      { payload: ticketWithUuidPayload },
      { payload: ticketWithUuidPayload },
    ]);
    const user = userEvent.setup();
    renderWithProviders(<Support />);
    await waitFor(() => expect(screen.getByText('أحمد')).toBeInTheDocument());

    await user.click(screen.getByText('فتح'));
    await waitFor(() => expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('مشكلة بالحجز'));
    await user.click(screen.getByText('استرداد'));

    const bookingInput = screen.getByPlaceholderText('معرّف الحجز') as HTMLInputElement;
    await waitFor(() => expect(bookingInput.value).toBe(UUID_IN_MSG));
    // The auto-fill safety warning must be visible on this money action.
    expect(screen.getByTestId('refund-autofill-warning')).toBeInTheDocument();
  });

  it('clears the auto-fill warning once the admin edits the bookingId', async () => {
    mockFetchWith([
      { payload: listPayload },
      { payload: ticketWithUuidPayload },
      { payload: ticketWithUuidPayload },
    ]);
    const user = userEvent.setup();
    renderWithProviders(<Support />);
    await waitFor(() => expect(screen.getByText('أحمد')).toBeInTheDocument());

    await user.click(screen.getByText('فتح'));
    await waitFor(() => expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('مشكلة بالحجز'));
    await user.click(screen.getByText('استرداد'));

    const bookingInput = screen.getByPlaceholderText('معرّف الحجز') as HTMLInputElement;
    await waitFor(() => expect(bookingInput.value).toBe(UUID_IN_MSG));
    expect(screen.getByTestId('refund-autofill-warning')).toBeInTheDocument();

    // Admin edits the field → it's no longer "auto-filled untouched".
    await user.type(bookingInput, 'X');
    expect(screen.queryByTestId('refund-autofill-warning')).not.toBeInTheDocument();
  });

  it('does NOT prefill when no UUID is present in the messages', async () => {
    mockFetchWith([
      { payload: listPayload },
      { payload: ticketPayload },
      { payload: ticketPayload },
    ]);
    const user = userEvent.setup();
    renderWithProviders(<Support />);
    await waitFor(() => expect(screen.getByText('أحمد')).toBeInTheDocument());

    await user.click(screen.getByText('فتح'));
    await waitFor(() => expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('مشكلة بالحجز'));
    await user.click(screen.getByText('استرداد'));

    const bookingInput = screen.getByPlaceholderText('معرّف الحجز') as HTMLInputElement;
    expect(bookingInput.value).toBe('');
    expect(screen.queryByTestId('refund-autofill-warning')).not.toBeInTheDocument();
  });
});
