import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { useAuth } from '../lib/store';
import Quotes from './Quotes';

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
      id: 'q1', status: 'PENDING', videoUrl: 'https://cdn.example.com/v.mp4', siteMediaUrls: [],
      dimensionsNote: null, requestedTier: null, labourFils: null, materialsFils: null,
      opsReviewedById: null, opsReviewedAt: null, lines: [],
      description: 'تسريب بالمغسلة', quotedJod: null, createdAt: new Date().toISOString(),
      service: { nameAr: 'سباكة' }, customer: { name: 'سارة', phone: '0790000000' },
    },
  ],
  meta: { total: 1, limit: 50, offset: 0 },
};

describe('Quotes page (list + error state)', () => {
  it('renders pending quote requests', async () => {
    mockFetchWith([{ payload: listPayload }]);
    renderWithProviders(<Quotes />);
    await waitFor(() => expect(screen.getByText('سارة')).toBeInTheDocument());
    expect(screen.getByText('سباكة')).toBeInTheDocument();
  });

  it('shows an error message when the list request fails', async () => {
    mockFetchWith([{ status: 500, payload: { error: { message: 'fail' } } }]);
    renderWithProviders(<Quotes />);
    await waitFor(() => expect(screen.getByText('تعذّر تحميل طلبات التسعير')).toBeInTheDocument());
  });
});

describe('Quotes page (pricing is confirm-gated)', () => {
  it('does NOT fire the quote mutation on a single click — confirm dialog required', async () => {
    const seq = mockFetchWith([{ payload: listPayload }]);
    const user = userEvent.setup();
    renderWithProviders(<Quotes />);
    await waitFor(() => expect(screen.getByText('سارة')).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText('دينار'), '45');
    await user.click(screen.getByTestId('quote-price-btn-q1'));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/تأكيد السعر الثابت/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /إلغاء/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    const quoteCall = seq.mock.calls.find(([url]) => typeof url === 'string' && url.includes('/quotes/q1/quote'));
    expect(quoteCall).toBeUndefined();
  });

  it('fires the quote mutation with the entered price only after confirming', async () => {
    const seq = mockFetchWith([
      { payload: listPayload },
      { payload: { data: { id: 'q1', status: 'QUOTED', quotedJod: '45' } } },
      { payload: listPayload },
    ]);
    const user = userEvent.setup();
    renderWithProviders(<Quotes />);
    await waitFor(() => expect(screen.getByText('سارة')).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText('دينار'), '45');
    await user.click(screen.getByTestId('quote-price-btn-q1'));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /تأكيد السعر/ }));

    await waitFor(() => {
      const quoteCall = seq.mock.calls.find(([url]) => typeof url === 'string' && url.includes('/quotes/q1/quote'));
      expect(quoteCall).toBeTruthy();
      const init = quoteCall?.[1] as RequestInit | undefined;
      expect(init?.method).toBe('POST');
      expect(JSON.parse(String(init?.body))).toEqual({ quotedJod: '45' });
    });
  });
});

const itemizedListPayload = {
  data: [
    {
      id: 'q2', status: 'PENDING', videoUrl: null, siteMediaUrls: ['https://cdn.example.com/wall1.jpg'],
      dimensionsNote: 'غرفة 4×5م', requestedTier: 'STANDARD', labourFils: 45_000, materialsFils: 60_000,
      opsReviewedById: null, opsReviewedAt: null,
      lines: [{ id: 'l1', kind: 'LABOUR', materialId: null, description: 'دهان غرفتين', qty: '1', unit: null, unitPriceFils: 45_000, totalFils: 45_000, source: 'TECHNICIAN_PROCURED' }],
      description: null, quotedJod: null, createdAt: new Date().toISOString(),
      service: { nameAr: 'دهان' }, customer: { name: 'خالد', phone: '0790000001' },
    },
  ],
  meta: { total: 1, limit: 50, offset: 0 },
};

describe('Quotes page (itemized quote-first path)', () => {
  it('renders the itemized badge, lines, and running total for a quote-first request', async () => {
    mockFetchWith([{ payload: itemizedListPayload }]);
    renderWithProviders(<Quotes />);
    await waitFor(() => expect(screen.getByText('خالد')).toBeInTheDocument());

    expect(screen.getByText('عرض مفصّل')).toBeInTheDocument();
    expect(screen.getByText(/دهان غرفتين/)).toBeInTheDocument();
    // Labour 45.00 + materials 60.00 = 105.00 JOD total row.
    expect(screen.getByText('105.00 د.أ')).toBeInTheDocument();
  });

  it('posts a new line with the entered fields', async () => {
    const seq = mockFetchWith([
      { payload: itemizedListPayload },
      { payload: { data: { id: 'q2' } } },
      { payload: itemizedListPayload },
    ]);
    const user = userEvent.setup();
    renderWithProviders(<Quotes />);
    await waitFor(() => expect(screen.getByText('خالد')).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText('الوصف'), 'دهان أساس');
    await user.type(screen.getByPlaceholderText('سعر الوحدة (د.أ)'), '12');
    await user.click(screen.getByRole('button', { name: /إضافة بند/ }));

    await waitFor(() => {
      const lineCall = seq.mock.calls.find(([url]) => typeof url === 'string' && url.includes('/quotes/q2/lines'));
      expect(lineCall).toBeTruthy();
      const body = JSON.parse(String((lineCall?.[1] as RequestInit | undefined)?.body));
      expect(body).toEqual(expect.objectContaining({ kind: 'LABOUR', description: 'دهان أساس', unitPriceFils: 12_000 }));
    });
  });
});

const catalogueItem = {
  id: 'mat1', serviceId: 'svc1', supplierId: null, slug: 'pipe', nameAr: 'أنبوب PVC', nameEn: 'PVC Pipe',
  brand: null, tier: 'STANDARD', unit: 'قطعة', unitPriceFils: 2500, priceMinFils: 2000, priceMaxFils: 3000,
  varianceAlertBps: 1500, coverageNote: null, priceConfidence: 'CONFIRMED', lastPricedAt: null,
  refreshCadence: 'QUARTERLY', isActive: true,
};

const itemizedWithValidityPayload = {
  data: [
    {
      ...itemizedListPayload.data[0],
      id: 'q3', serviceId: 'svc1',
      // +5min buffer over the exact 3 days so Math.floor(hours/24) reliably
      // reads 3 regardless of a few seconds of test execution delay.
      expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000 + 5 * 60 * 1000).toISOString(),
      lines: [],
      labourFils: 0, materialsFils: 0,
    },
  ],
  meta: { total: 1, limit: 50, offset: 0 },
};

describe('Quotes page — validity control + catalogue picker (§2.6/§17.5.6)', () => {
  it('shows a validity countdown derived from expiresAt', async () => {
    mockFetchWith([{ payload: itemizedWithValidityPayload }]);
    renderWithProviders(<Quotes />);
    expect(await screen.findByText(/صالح 3 يوم/)).toBeInTheDocument();
  });

  it('lets ops pick a material from the catalogue, prefilling description and price', async () => {
    const seq = mockFetchWith([
      { payload: itemizedWithValidityPayload },
      { payload: { data: [catalogueItem], meta: { total: 1, limit: 200, offset: 0 } } },
      { payload: { data: { id: 'q3' } } },
      { payload: itemizedWithValidityPayload },
    ]);
    const user = userEvent.setup();
    renderWithProviders(<Quotes />);
    await waitFor(() => expect(screen.getByText(/صالح 3 يوم/)).toBeInTheDocument());

    const kindSelect = screen.getByDisplayValue('أجور عمل');
    await user.selectOptions(kindSelect, 'مادة');

    const picker = await screen.findByLabelText('اختر مادة من الكتالوج');
    await user.selectOptions(picker, 'mat1');

    expect(screen.getByPlaceholderText('الوصف')).toHaveValue('أنبوب PVC');
    expect(screen.getByPlaceholderText('سعر الوحدة (د.أ)')).toHaveValue('2.500');

    await user.click(screen.getByRole('button', { name: /إضافة بند/ }));

    await waitFor(() => {
      const lineCall = seq.mock.calls.find(([url]) => typeof url === 'string' && url.includes('/quotes/q3/lines'));
      expect(lineCall).toBeTruthy();
      const body = JSON.parse(String((lineCall?.[1] as RequestInit | undefined)?.body));
      expect(body).toEqual(expect.objectContaining({ kind: 'MATERIAL', materialId: 'mat1', description: 'أنبوب PVC', unitPriceFils: 2500 }));
    });
  });
});
