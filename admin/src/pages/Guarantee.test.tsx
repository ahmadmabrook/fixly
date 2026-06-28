import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { useAuth } from '../lib/store';
import Guarantee from './Guarantee';

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
      id: 'g1', status: 'OPEN', description: 'عطل بعد يوم', mediaUrls: [],
      adminNote: null, scheduledVisitAt: null,
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      createdAt: new Date().toISOString(),
      booking: { customer: { name: 'سارة' }, service: { nameAr: 'تكييف' } },
    },
  ],
  meta: { total: 1, limit: 50, offset: 0 },
};

describe('Guarantee page (approve/reject are confirm-gated)', () => {
  it('does NOT fire the approve mutation on a single click — confirm dialog required', async () => {
    const seq = mockFetchWith([{ payload: listPayload }]);
    const user = userEvent.setup();
    renderWithProviders(<Guarantee />);
    await waitFor(() => expect(screen.getByText('سارة')).toBeInTheDocument());

    // Open the review drawer
    await user.click(screen.getByText('مراجعة'));
    await waitFor(() => expect(screen.getByText('مراجعة تذكرة الضمان')).toBeInTheDocument());

    // Click approve — should open confirm dialog, not fire mutation
    await user.click(screen.getByTestId('approve-guarantee-btn'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/تأكيد الموافقة على الضمان/)).toBeInTheDocument();

    // Cancel
    await user.click(within(dialog).getByRole('button', { name: /إلغاء/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    const reviewCall = seq.mock.calls.find(([url]) => typeof url === 'string' && url.includes('/guarantee/g1/review'));
    expect(reviewCall).toBeUndefined();
  });

  it('fires the approve mutation only after confirming', async () => {
    const seq = mockFetchWith([
      { payload: listPayload },
      { payload: { data: {} } },
      { payload: listPayload },
    ]);
    const user = userEvent.setup();
    renderWithProviders(<Guarantee />);
    await waitFor(() => expect(screen.getByText('سارة')).toBeInTheDocument());

    await user.click(screen.getByText('مراجعة'));
    await waitFor(() => expect(screen.getByText('مراجعة تذكرة الضمان')).toBeInTheDocument());

    await user.click(screen.getByTestId('approve-guarantee-btn'));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /موافقة/ }));

    await waitFor(() => {
      const reviewCall = seq.mock.calls.find(([url]) => typeof url === 'string' && url.includes('/guarantee/g1/review'));
      expect(reviewCall).toBeTruthy();
      const init = reviewCall?.[1] as RequestInit | undefined;
      expect(init?.method).toBe('POST');
      expect(JSON.parse(String(init?.body))).toMatchObject({ decision: 'APPROVED' });
    });
  });

  it('does NOT fire the reject mutation on a single click — confirm dialog required', async () => {
    const seq = mockFetchWith([{ payload: listPayload }]);
    const user = userEvent.setup();
    renderWithProviders(<Guarantee />);
    await waitFor(() => expect(screen.getByText('سارة')).toBeInTheDocument());

    await user.click(screen.getByText('مراجعة'));
    await waitFor(() => expect(screen.getByText('مراجعة تذكرة الضمان')).toBeInTheDocument());

    await user.click(screen.getByTestId('reject-guarantee-btn'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/تأكيد رفض الضمان/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /إلغاء/ }));

    const reviewCall = seq.mock.calls.find(([url]) => typeof url === 'string' && url.includes('/guarantee/g1/review'));
    expect(reviewCall).toBeUndefined();
  });

  it('fires the reject mutation only after confirming', async () => {
    const seq = mockFetchWith([
      { payload: listPayload },
      { payload: { data: {} } },
      { payload: listPayload },
    ]);
    const user = userEvent.setup();
    renderWithProviders(<Guarantee />);
    await waitFor(() => expect(screen.getByText('سارة')).toBeInTheDocument());

    await user.click(screen.getByText('مراجعة'));
    await waitFor(() => expect(screen.getByText('مراجعة تذكرة الضمان')).toBeInTheDocument());

    await user.click(screen.getByTestId('reject-guarantee-btn'));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /رفض/ }));

    await waitFor(() => {
      const reviewCall = seq.mock.calls.find(([url]) => typeof url === 'string' && url.includes('/guarantee/g1/review'));
      expect(reviewCall).toBeTruthy();
      const init = reviewCall?.[1] as RequestInit | undefined;
      expect(init?.method).toBe('POST');
      expect(JSON.parse(String(init?.body))).toMatchObject({ decision: 'REJECTED' });
    });
  });
});
