import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import BookingPage from './BookingPage';


// Quiet the socket provider — no real server here.
vi.mock('../lib/socket-provider', () => ({
  BookingSocketProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const svc = { id: 'elec', nameAr: 'كهرباء', nameEn: 'Electricity', descriptionAr: null, priceJod: '50', durationMin: 45, isActive: true };

function renderWithProviders(initialPath: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route
            path="/services/:id/book"
            element={<BookingPage serviceId="elec" onBack={vi.fn()} onDone={vi.fn()} />}
          />
          <Route path="/my-bookings" element={<div>MY BOOKINGS</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
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

describe('BookingPage', () => {
  it('renders the editable lat/lng inputs prefilled with Amman defaults', async () => {
    renderWithProviders('/services/elec/book');
    await waitFor(() => {
      expect(screen.getByLabelText('خط العرض')).toHaveValue(31.9522);
      expect(screen.getByLabelText('خط الطول')).toHaveValue(35.9331);
    });
  });

  it('rejects an invalid latitude on submit and never POSTs', async () => {
    const user = userEvent.setup();
    const postSpy = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && url.endsWith('/bookings')) {
        postSpy(JSON.parse(init.body as string));
        return { ok: true, status: 200, json: async () => ({ id: 'b-new', status: 'PENDING', scheduledAt: null, totalJod: '50', service: svc }) } as Response;
      }
      if (url.endsWith('/services')) {
        return { ok: true, status: 200, json: async () => ({ data: [svc] }) } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    }) as unknown as typeof fetch);
    renderWithProviders('/services/elec/book');
    await screen.findByLabelText('خط العرض');
    const lat = screen.getByLabelText('خط العرض');
    await user.clear(lat);
    await user.type(lat, '999');
    await user.click(screen.getByRole('button', { name: 'تأكيد الحجز' }));
    await user.click(await screen.findByRole('button', { name: 'تأكيد والدفع' }));
    // Give the microtask queue a chance to run the createBooking mutation.
    await new Promise((r) => setTimeout(r, 50));
    expect(postSpy).not.toHaveBeenCalled();
  });

  it('rejects an invalid longitude on submit and never POSTs', async () => {
    const user = userEvent.setup();
    const postSpy = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && url.endsWith('/bookings')) {
        postSpy(JSON.parse(init.body as string));
        return { ok: true, status: 200, json: async () => ({ id: 'b-new', status: 'PENDING', scheduledAt: null, totalJod: '50', service: svc }) } as Response;
      }
      if (url.endsWith('/services')) {
        return { ok: true, status: 200, json: async () => ({ data: [svc] }) } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    }) as unknown as typeof fetch);
    renderWithProviders('/services/elec/book');
    await screen.findByLabelText('خط الطول');
    const lng = screen.getByLabelText('خط الطول');
    await user.clear(lng);
    await user.type(lng, '-200');
    await user.click(screen.getByRole('button', { name: 'تأكيد الحجز' }));
    await user.click(await screen.findByRole('button', { name: 'تأكيد والدفع' }));
    await new Promise((r) => setTimeout(r, 50));
    expect(postSpy).not.toHaveBeenCalled();
  });

  it('submits the booking with the edited coordinates when valid', async () => {
    const user = userEvent.setup();
    const postSpy = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && url.endsWith('/bookings')) {
        postSpy(JSON.parse(init.body as string));
        return { ok: true, status: 200, json: async () => ({ id: 'b-new', status: 'PENDING', scheduledAt: null, totalJod: '50', service: svc }) } as Response;
      }
      if (url.endsWith('/services')) {
        return { ok: true, status: 200, json: async () => ({ data: [svc] }) } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    }) as unknown as typeof fetch);

    renderWithProviders('/services/elec/book');
    await screen.findByLabelText('خط العرض');

    const lat = screen.getByLabelText('خط العرض');
    const lng = screen.getByLabelText('خط الطول');
    await user.clear(lat);
    await user.type(lat, '32.0');
    await user.clear(lng);
    await user.type(lng, '36.0');

    await user.click(screen.getByRole('button', { name: 'تأكيد الحجز' }));
    await user.click(await screen.findByRole('button', { name: 'تأكيد والدفع' }));

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalled();
    });
    expect(postSpy.mock.calls[0][0]).toMatchObject({
      serviceId: 'elec',
      addressLat: 32.0,
      addressLng: 36.0,
    });
  });
});
