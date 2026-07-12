import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { useAuth } from '../lib/store';
import Subscriptions from './Subscriptions';

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
      id: 's1', status: 'ACTIVE', priceJod: '5', currentPeriodEnd: new Date(Date.now() + 2592000000).toISOString(),
      cancelledAt: null, createdAt: new Date().toISOString(), customer: { name: 'نور', phone: '0790000001' },
    },
    {
      id: 's2', status: 'PAST_DUE', priceJod: '5', currentPeriodEnd: new Date(Date.now() - 86400000).toISOString(),
      cancelledAt: null, createdAt: new Date().toISOString(), customer: { name: 'فادي', phone: '0790000002' },
    },
  ],
  meta: { total: 2, limit: 50, offset: 0 },
};

describe('Subscriptions page (read-only report)', () => {
  it('renders subscribers and per-status pills', async () => {
    mockFetchWith([{ payload: listPayload }]);
    renderWithProviders(<Subscriptions />);
    await waitFor(() => expect(screen.getByText('نور')).toBeInTheDocument());
    expect(screen.getByText('فادي')).toBeInTheDocument();
    expect(screen.getByText('فعّال')).toBeInTheDocument();
    expect(screen.getByText('متأخر')).toBeInTheDocument();
  });

  it('shows an error message when the list request fails', async () => {
    mockFetchWith([{ status: 500, payload: { error: { message: 'fail' } } }]);
    renderWithProviders(<Subscriptions />);
    await waitFor(() => expect(screen.getByText('تعذّر تحميل الاشتراكات')).toBeInTheDocument());
  });

  it('shows an empty state when there are no subscriptions', async () => {
    mockFetchWith([{ payload: { data: [], meta: { total: 0, limit: 50, offset: 0 } } }]);
    renderWithProviders(<Subscriptions />);
    await waitFor(() => expect(screen.getByText('لا توجد اشتراكات')).toBeInTheDocument());
  });
});
