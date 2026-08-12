import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { useAuth } from '../lib/store';
import FounderApprovals from './FounderApprovals';

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

/** Routes each fetch by URL substring instead of call order, since the four
 *  aggregator queries fire together and their resolution order isn't guaranteed. */
function mockFetchByUrl(routes: Record<string, unknown>) {
  const fn = vi.fn(async (url: string) => {
    const match = Object.keys(routes).find((k) => url.includes(k));
    return { ok: true, status: 200, json: async () => routes[match ?? ''] } as Response;
  });
  Object.defineProperty(globalThis, 'fetch', { value: fn as unknown as typeof fetch, writable: true, configurable: true });
  return fn;
}

const emptyList = { data: [], meta: { total: 0, limit: 100, offset: 0 } };

describe('FounderApprovals page (§19 aggregator — BOM + quote + tech-KYC + guarantee)', () => {
  it('renders one card per pending item across all four queues', async () => {
    useAuth.getState().setAuth('tok', { id: 'a1', name: 'A', email: 'a@b.c' });
    mockFetchByUrl({
      '/materials-review': { data: [{ id: 'm1', bookingId: 'b1', status: 'PENDING_REVIEW', description: 'أنبوب نحاس', totalFils: 25000, varianceBps: 2500 }], meta: { total: 1, limit: 100, offset: 0 } },
      '/quotes': { data: [{ id: 'q1', status: 'PENDING', description: 'دهان غرفتين', opsReviewedAt: null }], meta: { total: 1, limit: 100, offset: 0 } },
      '/technicians': { data: [{ id: 't1', isVerified: false, user: { id: 'u1', name: 'أحمد' } }], meta: { total: 1, limit: 100, offset: 0 } },
      '/guarantee': { data: [{ id: 'g1', status: 'OPEN', description: 'تسريب مياه', createdAt: new Date().toISOString(), booking: { service: { nameAr: 'سباكة' } } }], meta: { total: 1, limit: 100, offset: 0 } },
    });

    renderWithProviders(<FounderApprovals />);

    await waitFor(() => expect(screen.getByText('أنبوب نحاس')).toBeInTheDocument());
    expect(screen.getByText('دهان غرفتين')).toBeInTheDocument();
    expect(screen.getByText('أحمد')).toBeInTheDocument();
    expect(screen.getByText('سباكة')).toBeInTheDocument();
    expect(screen.getByText('4 بانتظار المراجعة')).toBeInTheDocument();
  });

  it('shows an empty state when nothing is pending anywhere', async () => {
    useAuth.getState().setAuth('tok', { id: 'a1', name: 'A', email: 'a@b.c' });
    mockFetchByUrl({ '/materials-review': emptyList, '/quotes': emptyList, '/technicians': emptyList, '/guarantee': emptyList });

    renderWithProviders(<FounderApprovals />);

    await waitFor(() => expect(screen.getByText('لا توجد بنود بانتظار المراجعة')).toBeInTheDocument());
  });

  it('requires a non-empty reason before confirming a technician rejection', async () => {
    useAuth.getState().setAuth('tok', { id: 'a1', name: 'A', email: 'a@b.c' });
    mockFetchByUrl({
      '/materials-review': emptyList,
      '/quotes': emptyList,
      '/technicians': { data: [{ id: 't1', isVerified: false, user: { id: 'u1', name: 'سامي' } }], meta: { total: 1, limit: 100, offset: 0 } },
      '/guarantee': emptyList,
    });

    renderWithProviders(<FounderApprovals />);
    await waitFor(() => expect(screen.getByText('سامي')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'رفض ✗' }));
    const confirmBtn = screen.getByRole('button', { name: 'تأكيد الرفض' });
    expect(confirmBtn).toBeDisabled();

    await userEvent.type(screen.getByPlaceholderText('سبب الرفض (مطلوب)'), 'مستندات غير واضحة');
    expect(confirmBtn).toBeEnabled();
  });
});
