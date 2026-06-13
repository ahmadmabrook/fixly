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

function mockFetchWith(payloads: Array<{ status?: number; payload: unknown }>) {
  let i = 0;
  const fn = vi.fn(async () => {
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

describe('Bookings page (pagination via meta envelope)', () => {
  it('shows the total in the header when meta is present', async () => {
    useAuth.getState().setAuth('tok', { id: 'a1', name: 'A', email: 'a@b.c' });
    const payload = {
      data: [
        { id: 'b1', status: 'PENDING', scheduledAt: null, totalJod: 25,
          customer: { id: 'c1', name: 'سارة' },
          service: { nameAr: 'سباكة', nameEn: 'Plumbing' } },
      ],
      meta: { total: 1, limit: 50, offset: 0 },
    };
    mockFetchWith([{ payload }]);

    renderWithProviders(<Bookings />);
    await waitFor(() => expect(screen.getByText('سارة')).toBeInTheDocument());
    expect(screen.getByText(/1/)).toBeInTheDocument();
  });

  it('shows the empty state when the list is empty', async () => {
    useAuth.getState().setAuth('tok', { id: 'a1', name: 'A', email: 'a@b.c' });
    mockFetchWith([{ payload: { data: [], meta: { total: 0, limit: 50, offset: 0 } } }]);
    renderWithProviders(<Bookings />);
    await waitFor(() => expect(screen.getByText(/لا توجد حجوزات/)).toBeInTheDocument());
  });
});
