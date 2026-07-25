import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { useAuth } from '../lib/store';
import Suppliers from './Suppliers';

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
    id: 's1', name: 'محل الأمانة للدهانات', contactPhone: '0790000000', categories: ['paint'],
    isPilot: true, referralCommissionBps: 600, agreementKind: 'verbal',
    trialStartedAt: null, trialEndsAt: null, commissionPaidOk: null, priceManipulationObserved: null, isActive: true,
  }],
  meta: { total: 1, limit: 50, offset: 0 },
};

describe('Suppliers page', () => {
  it('renders pilot suppliers with their trial verdict pills', async () => {
    mockFetchWith([{ payload: listPayload }]);
    renderWithProviders(<Suppliers />);
    await waitFor(() => expect(screen.getByText('محل الأمانة للدهانات')).toBeInTheDocument());
    expect(screen.getByText('لم تُدفع بعد')).toBeInTheDocument();
    expect(screen.getByText('لا تلاعب')).toBeInTheDocument();
  });

  it('toggles the commission-paid verdict on click', async () => {
    const seq = mockFetchWith([{ payload: listPayload }, { payload: { data: {} } }, { payload: listPayload }]);
    const user = userEvent.setup();
    renderWithProviders(<Suppliers />);
    await waitFor(() => expect(screen.getByText('محل الأمانة للدهانات')).toBeInTheDocument());

    await user.click(screen.getByText('لم تُدفع بعد'));

    await waitFor(() => {
      const call = seq.mock.calls.find(([url]) => typeof url === 'string' && url.includes('/suppliers/s1'));
      expect(call).toBeTruthy();
      expect(JSON.parse(String((call?.[1] as RequestInit | undefined)?.body))).toEqual({ commissionPaidOk: true });
    });
  });
});
