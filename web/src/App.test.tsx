import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';

// We don't need the real socket for routing tests; keep it quiet.
vi.mock('./lib/socket-provider', () => ({
  BookingSocketProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

function renderWithProviders(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const mockFetch = (services: Array<{ id: string; nameAr: string; nameEn: string; descriptionAr: string | null; priceJod: string; durationMin: number; isActive: boolean }> = [
  { id: 'elec', nameAr: 'كهرباء', nameEn: 'Electricity', descriptionAr: null, priceJod: '50', durationMin: 45, isActive: true },
  { id: 'plumb', nameAr: 'سباكة', nameEn: 'Plumbing', descriptionAr: null, priceJod: '40', durationMin: 60, isActive: true },
]) => {
  return vi.fn(async (url: string) => {
    if (url.endsWith('/services')) {
      return { ok: true, status: 200, json: async () => ({ data: services }) } as Response;
    }
    return { ok: false, status: 404, json: async () => ({ error: { message: 'nope' } }) } as Response;
  }) as unknown as typeof fetch;
};

beforeEach(() => {
  window.history.replaceState({}, '', '/');
  localStorage.clear();
  vi.stubGlobal('fetch', mockFetch());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('App routing', () => {
  it('lands on the home page on /', async () => {
    renderWithProviders(<App />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: /فني محترف/ })).toBeInTheDocument();
    });
  });

  it('navigates to /services when the hero CTA is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<App />);
    // Wait for landing to render
    await screen.findByRole('heading', { level: 1, name: /فني محترف/ });
    // Click the form submit (the search box button)
    const searchForm = screen.getByRole('search');
    const submitBtn = searchForm.querySelector('button[type="submit"]')!;
    await user.click(submitBtn);
    await waitFor(() => {
      expect(window.location.pathname).toBe('/services');
    });
  });

  it('navigates to a service detail page from the catalog', async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, '', '/services');
    renderWithProviders(<App />);
    const card = await screen.findByRole('button', { name: /عرض خدمة كهرباء/ });
    await user.click(card);
    await waitFor(() => {
      expect(window.location.pathname).toBe('/services/elec');
    });
  });
});
