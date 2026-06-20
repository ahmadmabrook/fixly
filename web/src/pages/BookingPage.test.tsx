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
  it('renders the address picker prefilled with the default Amman address', async () => {
    renderWithProviders('/services/elec/book');
    await waitFor(() => {
      expect(screen.getByLabelText('العنوان')).toHaveValue('خلدا، شارع وصفي التل');
    });
    // The map search box is present (manual lat/lng inputs are gone).
    expect(screen.getByLabelText('ابحث عن عنوان')).toBeInTheDocument();
  });

  it('submits the booking with the pin coordinates (default Amman) on confirm', async () => {
    const user = userEvent.setup();
    const postSpy = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && url.endsWith('/bookings')) {
        postSpy(JSON.parse(init.body as string));
        // Instant (mock) mode: no hosted-checkout session.
        return { ok: true, status: 200, json: async () => ({ data: { booking: { id: 'b-new', status: 'PENDING', scheduledAt: null, totalJod: '50', service: svc }, checkout: null } }) } as Response;
      }
      if (url.endsWith('/services')) {
        return { ok: true, status: 200, json: async () => ({ data: [svc] }) } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    }) as unknown as typeof fetch);

    renderWithProviders('/services/elec/book');
    await screen.findByLabelText('العنوان');

    await user.click(screen.getByRole('button', { name: 'تأكيد الحجز' }));
    await user.click(await screen.findByRole('button', { name: 'تأكيد والدفع' }));

    await waitFor(() => expect(postSpy).toHaveBeenCalled());
    expect(postSpy.mock.calls[0][0]).toMatchObject({
      serviceId: 'elec',
      addressLat: 31.9522,
      addressLng: 35.9331,
      addressLine: 'خلدا، شارع وصفي التل',
    });
  });

  it('hosted checkout: mounts the payment widget when the backend returns a checkout session', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && url.endsWith('/bookings')) {
        return { ok: true, status: 200, json: async () => ({ data: { booking: { id: 'b-pay', status: 'AWAITING_PAYMENT', scheduledAt: null, totalJod: '50', service: svc }, checkout: { checkoutId: 'co_1', scriptUrl: 'https://eu-test.oppwa.com/v1/paymentWidgets.js', brands: ['VISA', 'MASTER'] } } }) } as Response;
      }
      if (url.endsWith('/services')) {
        return { ok: true, status: 200, json: async () => ({ data: [svc] }) } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    }) as unknown as typeof fetch);

    renderWithProviders('/services/elec/book');
    await screen.findByLabelText('العنوان');
    await user.click(screen.getByRole('button', { name: 'تأكيد الحجز' }));
    await user.click(await screen.findByRole('button', { name: 'تأكيد والدفع' }));

    // The payment step replaces the form: the checkout heading + HyperPay widget form appear.
    expect(await screen.findByText('إتمام الدفع')).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector('form.paymentWidgets')).not.toBeNull());
  });
});
