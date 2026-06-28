import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { useAuth } from '../lib/store';
import Withdrawals from './Withdrawals';

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
      id: 'w1', amountJod: 120.5, status: 'REQUESTED',
      iban: 'JO94CBJO0010000000000131000302', bankName: 'CBJ',
      createdAt: new Date().toISOString(),
      technician: { user: { name: 'سامي', phone: '0790000000' } },
    },
  ],
  meta: { total: 1, limit: 50, offset: 0 },
};

describe('Withdrawals page (money movement is confirm-gated)', () => {
  it('masks the IBAN — full account number is never shown', async () => {
    mockFetchWith([{ payload: listPayload }]);
    renderWithProviders(<Withdrawals />);
    await waitFor(() => expect(screen.getByText('سامي')).toBeInTheDocument());
    // Masked form present, raw IBAN absent.
    expect(screen.getByText(/JO94 •••• 0302/)).toBeInTheDocument();
    expect(screen.queryByText('JO94CBJO0010000000000131000302')).not.toBeInTheDocument();
  });

  it('does NOT call the pay endpoint on a single click (confirm required)', async () => {
    const seq = mockFetchWith([{ payload: listPayload }]);
    const user = userEvent.setup();
    renderWithProviders(<Withdrawals />);
    await waitFor(() => expect(screen.getByText('سامي')).toBeInTheDocument());

    await user.click(screen.getByTestId('pay-btn-w1'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/تأكيد دفع طلب السحب/)).toBeInTheDocument();
    // Amount echoed for verification.
    expect(within(dialog).getByText(/120\.50 د/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /إلغاء/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    const payCall = seq.mock.calls.find(([url]) => typeof url === 'string' && url.includes('/withdrawals/w1/process'));
    expect(payCall).toBeUndefined();
  });

  it('calls the pay endpoint with decision=PAID only after confirm', async () => {
    const seq = mockFetchWith([{ payload: listPayload }, { payload: { data: {} } }, { payload: listPayload }]);
    const user = userEvent.setup();
    renderWithProviders(<Withdrawals />);
    await waitFor(() => expect(screen.getByText('سامي')).toBeInTheDocument());

    await user.click(screen.getByTestId('pay-btn-w1'));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /دفع وتحويل/ }));

    await waitFor(() => {
      const payCall = seq.mock.calls.find(([url]) => typeof url === 'string' && url.includes('/withdrawals/w1/process'));
      expect(payCall).toBeTruthy();
      const init = payCall?.[1] as RequestInit | undefined;
      expect(init?.method).toBe('POST');
      expect(JSON.parse(String(init?.body))).toEqual({ decision: 'PAID' });
    });
  });

  it('reject is also confirm-gated', async () => {
    const seq = mockFetchWith([{ payload: listPayload }]);
    const user = userEvent.setup();
    renderWithProviders(<Withdrawals />);
    await waitFor(() => expect(screen.getByText('سامي')).toBeInTheDocument());

    await user.click(screen.getByTestId('reject-btn-w1'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/تأكيد رفض طلب السحب/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /إلغاء/ }));

    const rejectCall = seq.mock.calls.find(([url]) => typeof url === 'string' && url.includes('/withdrawals/w1/process'));
    expect(rejectCall).toBeUndefined();
  });
});
