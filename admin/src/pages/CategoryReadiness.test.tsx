import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { useAuth } from '../lib/store';
import CategoryReadiness from './CategoryReadiness';

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

function mockFetchWith(payload: unknown, status = 200) {
  const fn = vi.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => payload }) as Response);
  Object.defineProperty(globalThis, 'fetch', { value: fn as unknown as typeof fetch, writable: true, configurable: true });
  return fn;
}

describe('CategoryReadiness page (read-only)', () => {
  it('renders the three thresholds for a not-ready category', async () => {
    mockFetchWith({
      data: [{
        serviceId: 'svc1', state: 'COLLECTING', quotesRequired: 50, quotesClosed: 32,
        maxDisputeBps: 800, disputeBps: 500, maxPriceDeviationBps: 1500, priceDeviationBps: 1100,
        service: { nameAr: 'دهان' },
      }],
      meta: { total: 1, limit: 100, offset: 0 },
    });
    renderWithProviders(<CategoryReadiness />);
    await waitFor(() => expect(screen.getByText('دهان')).toBeInTheDocument());
    expect(screen.getByText('قيد التجميع')).toBeInTheDocument();
    expect(screen.getByText('32 / ≥ 50')).toBeInTheDocument();
  });

  it('shows an empty state when no quote_first categories exist yet', async () => {
    mockFetchWith({ data: [], meta: { total: 0, limit: 100, offset: 0 } });
    renderWithProviders(<CategoryReadiness />);
    await waitFor(() => expect(screen.getByText('لا توجد فئات قائمة على العرض بعد')).toBeInTheDocument());
  });
});
