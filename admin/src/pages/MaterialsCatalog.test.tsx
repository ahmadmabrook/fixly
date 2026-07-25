import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { useAuth } from '../lib/store';
import MaterialsCatalog from './MaterialsCatalog';

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
    id: 'm1', serviceId: null, supplierId: null, slug: 'paint-standard-interior', nameAr: 'دهان قياسي', nameEn: 'Standard paint',
    brand: null, tier: 'STANDARD', unit: 'm2', unitPriceFils: 3000, priceMinFils: 2500, priceMaxFils: 4000,
    varianceAlertBps: 1500, coverageNote: null, priceConfidence: 'CONFIRMED', isActive: true,
  }],
  meta: { total: 1, limit: 50, offset: 0 },
};

describe('MaterialsCatalog page', () => {
  it('renders catalog items with their price band', async () => {
    mockFetchWith([{ payload: listPayload }]);
    renderWithProviders(<MaterialsCatalog />);
    await waitFor(() => expect(screen.getByText('دهان قياسي')).toBeInTheDocument());
    expect(screen.getByText('2.50 – 4.00')).toBeInTheDocument();
  });

  it('opens the create drawer and posts a new item', async () => {
    const seq = mockFetchWith([
      { payload: listPayload },
      { payload: { data: { id: 'm2' } } },
      { payload: listPayload },
    ]);
    const user = userEvent.setup();
    renderWithProviders(<MaterialsCatalog />);
    await waitFor(() => expect(screen.getByText('دهان قياسي')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /إضافة بند/ }));
    fireEvent.change(screen.getByLabelText('المعرّف (slug)'), { target: { value: 'primer-white' } });
    fireEvent.change(screen.getByLabelText('الاسم (عربي)'), { target: { value: 'برايمر أبيض' } });
    fireEvent.change(screen.getByLabelText('الاسم (إنجليزي)'), { target: { value: 'White primer' } });
    fireEvent.change(screen.getByLabelText('الوحدة'), { target: { value: 'bucket' } });
    fireEvent.change(screen.getByLabelText('الحد الأدنى (د.أ)'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('السعر المرجعي (د.أ)'), { target: { value: '6' } });
    fireEvent.change(screen.getByLabelText('الحد الأقصى (د.أ)'), { target: { value: '8' } });
    await user.click(screen.getByRole('button', { name: 'حفظ' }));

    await waitFor(() => {
      const call = seq.mock.calls.find(([url]) => typeof url === 'string' && url.includes('/materials') && !url.includes('?'));
      expect(call).toBeTruthy();
      const body = JSON.parse(String((call?.[1] as RequestInit | undefined)?.body));
      expect(body).toEqual(expect.objectContaining({ slug: 'primer-white', unitPriceFils: 6000, priceMinFils: 5000, priceMaxFils: 8000 }));
    });
  });
});
