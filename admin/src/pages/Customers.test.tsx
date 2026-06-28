import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { useAuth } from '../lib/store';
import Customers from './Customers';

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
  data: [{ id: 'c1', name: 'ريم', phone: '0791111111', isActive: true, createdAt: new Date().toISOString() }],
  meta: { total: 1, limit: 50, offset: 0 },
};

describe('Customers page (block is confirm-gated)', () => {
  it('does NOT block on a single click — a confirm dialog appears first', async () => {
    const seq = mockFetchWith([{ payload: listPayload }]);
    const user = userEvent.setup();
    renderWithProviders(<Customers />);
    await waitFor(() => expect(screen.getByText('ريم')).toBeInTheDocument());

    await user.click(screen.getByTestId('block-btn-c1'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/تأكيد حظر العميل/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /إلغاء/ }));
    const blockCall = seq.mock.calls.find(([url]) => typeof url === 'string' && url.includes('/customers/c1/block'));
    expect(blockCall).toBeUndefined();
  });

  it('calls the block endpoint only after confirm', async () => {
    const seq = mockFetchWith([{ payload: listPayload }, { payload: { data: {} } }, { payload: listPayload }]);
    const user = userEvent.setup();
    renderWithProviders(<Customers />);
    await waitFor(() => expect(screen.getByText('ريم')).toBeInTheDocument());

    await user.click(screen.getByTestId('block-btn-c1'));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /^حظر$/ }));

    await waitFor(() => {
      const blockCall = seq.mock.calls.find(([url]) => typeof url === 'string' && url.includes('/customers/c1/block'));
      expect(blockCall).toBeTruthy();
      expect((blockCall?.[1] as RequestInit | undefined)?.method).toBe('POST');
    });
  });
});
