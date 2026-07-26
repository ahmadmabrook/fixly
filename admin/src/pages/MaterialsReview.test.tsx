import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { useAuth } from '../lib/store';
import MaterialsReview from './MaterialsReview';

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
    id: 'bm1', bookingId: 'b1', materialId: null, source: 'TECHNICIAN_PROCURED', status: 'PENDING_REVIEW', description: 'أنبوب استيراد خاص',
    brand: null, qty: '1', unitPriceFils: 40_000, totalFils: 40_000, referencePriceFils: 30_000, varianceBps: 3333,
    varianceReason: null, varianceReasonNote: null, supplierInvoiceUrl: 'https://example.com/invoice.jpg', createdAt: '2026-07-26T10:00:00.000Z',
  }],
  meta: { total: 1, limit: 100, offset: 0 },
};

describe('MaterialsReview page (BOM review queue)', () => {
  it('renders a flagged line with its variance', async () => {
    mockFetchWith([{ payload: listPayload }]);
    renderWithProviders(<MaterialsReview />);
    await waitFor(() => expect(screen.getByText('أنبوب استيراد خاص')).toBeInTheDocument());
    expect(screen.getByText(/انحراف 33.3%/)).toBeInTheDocument();
  });

  it('disables approval for an off-catalogue line with no uploaded invoice yet (§17.5.9)', async () => {
    mockFetchWith([{
      payload: {
        data: [{ ...listPayload.data[0], supplierInvoiceUrl: null }],
        meta: { total: 1, limit: 100, offset: 0 },
      },
    }]);
    renderWithProviders(<MaterialsReview />);
    await waitFor(() => expect(screen.getByText('أنبوب استيراد خاص')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'موافقة' })).toBeDisabled();
    expect(screen.getByText(/بند خارج الكتالوج/)).toBeInTheDocument();
  });

  it('approves a line', async () => {
    const seq = mockFetchWith([{ payload: listPayload }, { payload: { data: {} } }, { payload: { data: [], meta: { total: 0, limit: 100, offset: 0 } } }]);
    const user = userEvent.setup();
    renderWithProviders(<MaterialsReview />);
    await waitFor(() => expect(screen.getByText('أنبوب استيراد خاص')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'موافقة' }));

    await waitFor(() => {
      const call = seq.mock.calls.find(([url]) => typeof url === 'string' && url.includes('/materials-review/bm1'));
      expect(call).toBeTruthy();
      expect(JSON.parse(String((call?.[1] as RequestInit | undefined)?.body))).toEqual({ decision: 'APPROVED' });
    });
  });
});
