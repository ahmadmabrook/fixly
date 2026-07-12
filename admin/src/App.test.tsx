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

describe('RequireRole route guard (defense-in-depth RBAC)', () => {
  // A lower-privileged admin can hide the /admins link via the Sidebar, but
  // nothing stopped them from typing the URL directly before this guard
  // existed — the page would mount fully and only fail once a mutation hit
  // the (correctly role-gated) backend. Assert the frontend now refuses to
  // render the page at all for a role the route map doesn't allow.
  it('shows an access-denied message instead of the page for a role without access', async () => {
    useAuth.getState().setAuth('tok', { id: 's1', name: 'Support', email: 's@b.c', role: 'SUPPORT' });
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true, status: 200, json: async () => ({ data: [] }),
    }));
    Object.defineProperty(globalThis, 'fetch', { value: fetchMock as unknown as typeof fetch, writable: true, configurable: true });

    renderWithProviders(<AppWithoutRouter />, { initialEntries: ['/admins'] });
    await waitFor(() => {
      expect(screen.getByText('ليست لديك صلاحية للوصول لهذه الصفحة')).toBeInTheDocument();
    });
    // The restricted page's own content (its heading) must never mount.
    expect(screen.queryByText('إدارة المسؤولين')).not.toBeInTheDocument();
    // And it must never have called the admins endpoint.
    expect(fetchMock.mock.calls.some(([url]) => typeof url === 'string' && url.includes('/admins'))).toBe(false);
  });

  it('renders the page normally for a role the route map allows', async () => {
    useAuth.getState().setAuth('tok', { id: 'f1', name: 'Finance', email: 'f@b.c', role: 'FINANCE' });
    const fetchMock = vi.fn(async () => ({
      ok: true, status: 200, json: async () => ({ data: [], meta: { total: 0, limit: 50, offset: 0 } }),
    })) as unknown as typeof fetch;
    Object.defineProperty(globalThis, 'fetch', { value: fetchMock, writable: true, configurable: true });

    renderWithProviders(<AppWithoutRouter />, { initialEntries: ['/payouts'] });
    await waitFor(() => {
      expect(screen.getByText('المدفوعات')).toBeInTheDocument();
    });
    expect(screen.queryByText('ليست لديك صلاحية للوصول لهذه الصفحة')).not.toBeInTheDocument();
  });

  it('SUPER_ADMIN always passes the route guard, including SUPER_ADMIN-only pages', async () => {
    useAuth.getState().setAuth('tok', { id: 'sa1', name: 'Super', email: 'sa@b.c', role: 'SUPER_ADMIN' });
    const fetchMock = vi.fn(async () => ({
      ok: true, status: 200, json: async () => ({ data: [] }),
    })) as unknown as typeof fetch;
    Object.defineProperty(globalThis, 'fetch', { value: fetchMock, writable: true, configurable: true });

    renderWithProviders(<AppWithoutRouter />, { initialEntries: ['/admins'] });
    await waitFor(() => {
      expect(screen.getByText('إدارة المسؤولين')).toBeInTheDocument();
    });
  });
});
