import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { useAuth } from '../lib/store';
import PriceIndex from './PriceIndex';

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
  data: [{ id: 1, kind: 'dos_cpi', periodMonth: '2026-04-01', valueNumeric: '113.42', unit: 'index', sourceUrl: null, recordedAt: new Date().toISOString() }],
  meta: { total: 1, limit: 50, offset: 0 },
};

describe('PriceIndex page', () => {
  it('renders the reading history', async () => {
    mockFetchWith([{ payload: listPayload }]);
    renderWithProviders(<PriceIndex />);
    await waitFor(() => expect(screen.getByText('113.42 index')).toBeInTheDocument());
    expect(screen.getByText('2026-04')).toBeInTheDocument();
  });

  it('records a new reading with the form values', async () => {
    const seq = mockFetchWith([{ payload: listPayload }, { payload: { data: {} } }, { payload: listPayload }]);
    const user = userEvent.setup();
    renderWithProviders(<PriceIndex />);
    await waitFor(() => expect(screen.getByText('113.42 index')).toBeInTheDocument());

    const monthInput = document.querySelector('input[type="month"]') as HTMLInputElement;
    fireEvent.change(monthInput, { target: { value: '2026-05' } });
    await user.type(screen.getByLabelText('القيمة'), '116.1');
    await user.click(screen.getByRole('button', { name: 'تسجيل القراءة' }));

    await waitFor(() => {
      const call = seq.mock.calls.find(([url]) => typeof url === 'string' && url.includes('/price-index') && !url.includes('?'));
      expect(call).toBeTruthy();
      const body = JSON.parse(String((call?.[1] as RequestInit | undefined)?.body));
      expect(body).toEqual(expect.objectContaining({ kind: 'dos_cpi', valueNumeric: 116.1 }));
    });
  });
});
