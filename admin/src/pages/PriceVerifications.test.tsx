import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { useAuth } from '../lib/store';
import PriceVerifications from './PriceVerifications';

function renderWithProviders(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
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
    return { ok: (r.status ?? 200) >= 200 && (r.status ?? 200) < 300, status: r.status ?? 200, json: async () => r.payload } as Response;
  });
  Object.defineProperty(globalThis, 'fetch', { value: fn as unknown as typeof fetch, writable: true, configurable: true });
  return fn;
}

const listPayload = {
  data: [{
    id: 'v1', bookingId: 'b1', technicianId: 't1', status: 'OPEN',
    referencePriceFils: 30_000, chargedPriceFils: 40_000, deltaFils: 10_000,
    invoiceUrl: null, deadlineAt: new Date(Date.now() + 3_600_000 * 5).toISOString(),
  }],
  meta: { total: 1, limit: 100, offset: 0 },
};

describe('PriceVerifications page', () => {
  it('renders an open dispute with the delta and a countdown', async () => {
    mockFetchWith([{ payload: listPayload }]);
    renderWithProviders(<PriceVerifications />);
    await waitFor(() => expect(screen.getByText('بانتظار الفاتورة')).toBeInTheDocument());
    expect(screen.getByText(/الفرق: 10.00 د.أ/)).toBeInTheDocument();
  });

  it('resolves a dispute as deducted', async () => {
    const seq = mockFetchWith([{ payload: listPayload }, { payload: { data: {} } }, { payload: { data: [], meta: { total: 0, limit: 100, offset: 0 } } }]);
    const user = userEvent.setup();
    renderWithProviders(<PriceVerifications />);
    await waitFor(() => expect(screen.getByText('بانتظار الفاتورة')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'خصم الفرق' }));

    await waitFor(() => {
      const call = seq.mock.calls.find(([url]) => typeof url === 'string' && url.includes('/verifications/v1/resolve'));
      expect(call).toBeTruthy();
      expect(JSON.parse(String((call?.[1] as RequestInit | undefined)?.body))).toEqual({ decision: 'DEDUCTED' });
    });
  });
});
