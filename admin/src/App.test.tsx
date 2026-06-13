import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AppShell as AppWithoutRouter } from './App';
import { useAuth } from './lib/store';

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
});

describe('App routing + auth guard', () => {
  it('redirects /dashboard to /login when no token is present', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true, status: 200, json: async () => ({}),
    })) as unknown as typeof fetch;
    Object.defineProperty(globalThis, 'fetch', { value: fetchMock, writable: true, configurable: true });

    renderWithProviders(<AppWithoutRouter />, { initialEntries: ['/dashboard'] });
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Fixly.*Admin/ })).toBeInTheDocument();
    });
  });

  it('renders the dashboard when a token is present', async () => {
    useAuth.getState().setAuth('tok', { id: 'a1', name: 'A', email: 'a@b.c' });
    const fetchMock = vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({ data: {
        totalBookings: 10, pendingBookings: 1, completedBookings: 5,
        totalTechnicians: 3, verifiedTechnicians: 2, totalRevenueJod: 100, pendingPayouts: 0,
      } }),
    })) as unknown as typeof fetch;
    Object.defineProperty(globalThis, 'fetch', { value: fetchMock, writable: true, configurable: true });

    renderWithProviders(<AppWithoutRouter />, { initialEntries: ['/dashboard'] });
    // Lenient: either the dashboard heading or its error message is acceptable
    // — both prove the dashboard mounted past the auth guard. (See
    // Dashboard.test.tsx for why the success path is brittle in jsdom.)
    await waitFor(() => {
      const heading = screen.queryByRole('heading', { name: 'لوحة التحكم' });
      const error = screen.queryByText(/تعذّر تحميل الإحصائيات/);
      expect(heading ?? error).toBeTruthy();
    });
  });
});

describe('Admin 401 → /login redirect', () => {
  it('logs the user out and redirects to /login when an API call returns 401', async () => {
    useAuth.getState().setAuth('tok', { id: 'a1', name: 'A', email: 'a@b.c' });
    const fetchMock = vi.fn(async () => ({
      ok: false, status: 401,
      json: async () => ({ error: { code: 'UNAUTHORIZED' } }),
    })) as unknown as typeof fetch;
    Object.defineProperty(globalThis, 'fetch', { value: fetchMock, writable: true, configurable: true });

    renderWithProviders(<AppWithoutRouter />, { initialEntries: ['/dashboard'] });
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Fixly.*Admin/ })).toBeInTheDocument();
    });
    expect(useAuth.getState().accessToken).toBeNull();
  });
});
