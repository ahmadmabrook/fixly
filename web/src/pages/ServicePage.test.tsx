import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import ServicePage from './ServicePage';

const svc = {
  id: 'elec',
  nameAr: 'كهرباء',
  nameEn: 'Electricity',
  descriptionAr: null,
  priceJod: '50',
  durationMin: 45,
  isActive: true,
  sopIncludes: ['فحص شامل', 'استبدال القطعة التالفة'],
  sopExcludes: ['أعمال السباكة'],
  calloutFeeJod: '5',
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ServicePage serviceId="elec" onBook={vi.fn()} onBack={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('/services')) {
      return { ok: true, status: 200, json: async () => ({ data: [svc] }) } as Response;
    }
    return { ok: true, status: 200, json: async () => ({}) } as Response;
  }) as unknown as typeof fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('ServicePage', () => {
  it('renders the real sopIncludes/sopExcludes instead of the static list', async () => {
    renderPage();
    expect(await screen.findByText('استبدال القطعة التالفة')).toBeInTheDocument();
    expect(screen.getByText('أعمال السباكة')).toBeInTheDocument();
    expect(screen.getByText('ماذا يشمل')).toBeInTheDocument();
    expect(screen.getByText('لا يشمل')).toBeInTheDocument();
  });

  it('shows the no-show fee banner with the exact fee amount (distinct from the quote_first inspection fee — §17.5.3)', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText(/رسوم عدم حضور/)).toBeInTheDocument());
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('links the video pre-check CTA to /quotes', async () => {
    renderPage();
    const link = await screen.findByRole('link', { name: /اطلب فحصاً مرئياً/ });
    expect(link).toHaveAttribute('href', '/quotes');
  });
});

describe('ServicePage — quote_first archetype (§0.2 #4: Painting never shows an instant flat price)', () => {
  const quoteFirstSvc = { ...svc, id: 'paint', nameAr: 'دهان', pricingModel: 'QUOTE_FIRST', inspectionFeeFils: 10000, priceJod: '70' };

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/services')) {
        return { ok: true, status: 200, json: async () => ({ data: [quoteFirstSvc] }) } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    }) as unknown as typeof fetch);
  });

  it('shows "حسب المعاينة" + the disclosed inspection fee instead of a flat price', async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <ServicePage serviceId="paint" onBook={vi.fn()} onBack={vi.fn()} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByText('حسب المعاينة')).toBeInTheDocument();
    expect(screen.getByText(/رسوم معاينة/)).toBeInTheDocument();
    expect(screen.getByText('10.00')).toBeInTheDocument();
    expect(screen.queryByText('السعر الثابت')).not.toBeInTheDocument();
    expect(screen.queryByText('فوراً خلال 30 دقيقة')).not.toBeInTheDocument();
  });
});
