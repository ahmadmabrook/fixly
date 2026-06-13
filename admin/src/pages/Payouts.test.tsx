import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { useAuth } from '../lib/store';
import Payouts from './Payouts';

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

describe('Payouts page (process flow with confirm)', () => {
  it('opens a confirm dialog before calling the process endpoint', async () => {
    useAuth.getState().setAuth('tok', { id: 'a1', name: 'A', email: 'a@b.c' });
    const list = {
      data: [
        { id: 'p1', status: 'PENDING', amountJod: 50, createdAt: new Date().toISOString(),
          technician: { user: { name: 'محمد' } } },
      ],
      meta: { total: 1, limit: 50, offset: 0 },
    };
    const process = { data: { id: 'p1', status: 'COMPLETED', amountJod: 50 } };
    const seq = mockFetchWith([{ payload: list }, { payload: process }, { payload: list }]);

    const user = userEvent.setup();
    renderWithProviders(<Payouts />);
    await waitFor(() => expect(screen.getByText('محمد')).toBeInTheDocument());

    await user.click(screen.getByTestId('process-btn-p1'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/تأكيد معالجة الدفعة/)).toBeInTheDocument();
    expect(within(dialog).getByText(/50\.00 JD/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /معالجة وتحويل/ }));
    await waitFor(() => {
      const processCall = seq.mock.calls.find(([url]) => typeof url === 'string' && url.includes('/payouts/p1/process'));
      expect(processCall).toBeTruthy();
      const init = processCall?.[1] as RequestInit | undefined;
      expect(init?.method).toBe('POST');
    });
  });
});
