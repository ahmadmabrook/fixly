import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import QuotesPage from './QuotesPage';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <QuotesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const services = [
  { id: 'svc-fixed', nameAr: 'سباكة', pricingModel: 'FIXED_SCOPE' },
  { id: 'svc-quote-first', nameAr: 'دهان', pricingModel: 'QUOTE_FIRST', inspectionFeeFils: 5_000 },
];

function mockFetch(overrides: Record<string, unknown> = {}) {
  return vi.fn(async (url: string, _init?: RequestInit) => {
    if (url.endsWith('/services')) return { ok: true, status: 200, json: async () => services } as Response;
    if (url.endsWith('/quotes')) return { ok: true, status: 200, json: async () => (overrides.quotes ?? []) } as Response;
    if (url.includes('/quotes') && !url.includes('/accept')) {
      return { ok: true, status: 201, json: async () => ({ data: { id: 'q1' } }) } as Response;
    }
    return { ok: false, status: 404, json: async () => ({ error: { message: 'nope' } }) } as Response;
  });
}

beforeEach(() => vi.stubGlobal('fetch', mockFetch()));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('QuotesPage — fixed_scope video pre-check (unchanged path)', () => {
  it('shows the video-url field and submits a video pre-check request', async () => {
    const fetchMock = mockFetch();
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('option', { name: 'سباكة' });
    await user.selectOptions(screen.getByLabelText('اختر الخدمة'), 'svc-fixed');
    expect(screen.getByLabelText('رابط فيديو المشكلة')).toBeInTheDocument();
    expect(screen.queryByText(/رسم المعاينة/)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('رابط فيديو المشكلة'), 'https://cdn.example.com/v.mp4');
    await user.click(screen.getByRole('button', { name: 'إرسال طلب التسعير' }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url, init]) => typeof url === 'string' && url.endsWith('/quotes') && (init as RequestInit | undefined)?.method === 'POST');
      expect(call).toBeTruthy();
      const body = JSON.parse(String((call?.[1] as RequestInit | undefined)?.body));
      expect(body).toEqual(expect.objectContaining({ serviceId: 'svc-fixed', videoUrl: 'https://cdn.example.com/v.mp4' }));
    });
  });
});

describe('QuotesPage — quote_first assessment intake', () => {
  it('shows the inspection fee and site-media fields instead of a video url', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('option', { name: 'دهان' });
    await user.selectOptions(screen.getByLabelText('اختر الخدمة'), 'svc-quote-first');
    expect(screen.getByText(/رسم المعاينة 5.00 دينار/)).toBeInTheDocument();
    expect(screen.getByLabelText('رابط وسائط الموقع 1')).toBeInTheDocument();
    expect(screen.queryByLabelText('رابط فيديو المشكلة')).not.toBeInTheDocument();
  });

  it('submits siteMediaUrls, dimensionsNote, and requestedTier', async () => {
    const fetchMock = mockFetch();
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('option', { name: 'دهان' });
    await user.selectOptions(screen.getByLabelText('اختر الخدمة'), 'svc-quote-first');
    await user.type(screen.getByLabelText('رابط وسائط الموقع 1'), 'https://cdn.example.com/wall.jpg');
    await user.type(screen.getByPlaceholderText('مثال: غرفة 4×5 متر'), 'غرفة 4×5م');
    await user.selectOptions(screen.getByDisplayValue('بدون تفضيل'), 'STANDARD');
    await user.click(screen.getByRole('button', { name: 'إرسال طلب المعاينة' }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url, init]) => typeof url === 'string' && url.endsWith('/quotes') && (init as RequestInit | undefined)?.method === 'POST');
      expect(call).toBeTruthy();
      const body = JSON.parse(String((call?.[1] as RequestInit | undefined)?.body));
      expect(body).toEqual(expect.objectContaining({
        serviceId: 'svc-quote-first',
        siteMediaUrls: ['https://cdn.example.com/wall.jpg'],
        dimensionsNote: 'غرفة 4×5م',
        requestedTier: 'STANDARD',
      }));
    });
  });
});

describe('QuotesPage — itemized quote list rendering', () => {
  it('renders the labour/materials line breakdown for a quote_first quote', async () => {
    vi.stubGlobal('fetch', mockFetch({
      quotes: [{
        id: 'q1', status: 'QUOTED', videoUrl: null, siteMediaUrls: ['https://cdn.example.com/wall.jpg'],
        dimensionsNote: null, requestedTier: 'STANDARD', description: null, quotedJod: '105.000',
        labourFils: 45_000, materialsFils: 60_000,
        lines: [
          { id: 'l1', kind: 'LABOUR', description: 'دهان غرفتين', qty: '1', unit: null, totalFils: 45_000 },
          { id: 'l2', kind: 'MATERIAL', description: 'دهان قياسي', qty: '2', unit: 'bucket', totalFils: 60_000 },
        ],
        service: { nameAr: 'دهان' }, createdAt: new Date().toISOString(),
      }],
    }));
    renderPage();

    await waitFor(() => expect(screen.getByText(/دهان غرفتين/)).toBeInTheDocument());
    expect(screen.getByText(/دهان قياسي/)).toBeInTheDocument();
    expect(screen.getByText('105.00 دينار')).toBeInTheDocument();
  });
});
