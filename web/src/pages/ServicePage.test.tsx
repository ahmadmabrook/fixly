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

  it('shows the callout-fee banner with the exact fee amount', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText(/رسوم كشف/)).toBeInTheDocument());
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('links the video pre-check CTA to /quotes', async () => {
    renderPage();
    const link = await screen.findByRole('link', { name: /اطلب فحصاً مرئياً/ });
    expect(link).toHaveAttribute('href', '/quotes');
  });
});
