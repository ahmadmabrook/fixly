import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { useAuth } from '../lib/store';
import Reports from './Reports';

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
});

function mockFetchWith(payload: unknown) {
  const fn = vi.fn(async () => ({ ok: true, status: 200, json: async () => payload }) as Response);
  Object.defineProperty(globalThis, 'fetch', { value: fn as unknown as typeof fetch, writable: true, configurable: true });
  return fn;
}

describe('Reports page — GST + revenue-stream breakdown (§0.4b)', () => {
  it('renders the GST-net KPI and all four revenue streams from the financial report', async () => {
    useAuth.getState().setAuth('tok', { id: 'a1', name: 'A', email: 'a@b.c' });
    mockFetchWith({
      data: {
        series: [{ period: '2026-08-01T00:00:00.000Z', bookings: 10, grossJod: 500, platformFeeJod: 100, technicianNetJod: 400 }],
        totals: { bookings: 10, grossJod: 500, platformFeeJod: 100, technicianNetJod: 400, platformFeeGstJod: 16, platformFeeGstNetJod: 84 },
        streams: { jobCommissionJod: 100, protectionJod: 25, techProJod: 0, b2bJod: 0 },
      },
    });

    renderWithProviders(<Reports />);

    await waitFor(() => expect(screen.getByText(/نموذج الإيراد حسب المصدر/)).toBeInTheDocument());
    expect(screen.getByText(/ضريبة المبيعات المحصّلة/)).toBeInTheDocument();
    expect(screen.getByText('16.00 JD')).toBeInTheDocument();
    expect(screen.getByText('84.00 JD')).toBeInTheDocument();
    expect(screen.getByText('عمولة الحجوزات')).toBeInTheDocument();
    expect(screen.getByText('اشتراك الحماية')).toBeInTheDocument();
    expect(screen.getByText('اشتراك Tech Pro')).toBeInTheDocument();
    expect(screen.getByText('إعلانات B2B')).toBeInTheDocument();
    expect(screen.getAllByText(/JoFotara/).length).toBeGreaterThan(0);
  });
});
