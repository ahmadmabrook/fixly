import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import TrackingPage from './TrackingPage';

// Real socket.io-client would try to open a network connection — stub the
// live-update hooks the same way other page tests stub the socket provider.
vi.mock('../lib/socket', () => ({
  useBookingSocket: () => null,
  useBookingLocation: () => null,
}));

const svc = { id: 'elec', nameAr: 'كهرباء', nameEn: 'Electricity', descriptionAr: null, priceJod: '50', durationMin: 45, isActive: true };

function renderPage(booking: Record<string, unknown>) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('/bookings/b1')) {
      return { ok: true, status: 200, json: async () => ({ data: booking }) } as Response;
    }
    if (url.includes('/technicians/')) {
      return { ok: true, status: 200, json: async () => ({ data: { id: 't1', name: 'أحمد', avatarUrl: null, rating: '4.8', totalReviews: 12, vehicle: null, isVerified: true } }) } as Response;
    }
    return { ok: true, status: 200, json: async () => ({}) } as Response;
  }) as unknown as typeof fetch);

  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/bookings/b1/track']}>
        <Routes>
          <Route path="/bookings/:id/track" element={<TrackingPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('TrackingPage', () => {
  it('shows the "searching for technician" state when CONFIRMED with no technician assigned yet', async () => {
    renderPage({ id: 'b1', status: 'CONFIRMED', scheduledAt: null, totalJod: '50', service: svc, technicianId: null, addressLat: 31.9, addressLng: 35.9 });
    expect(await screen.findByText('نبحث عن أقرب فني…')).toBeInTheDocument();
  });

  it('shows the report-technician action once a technician is assigned', async () => {
    renderPage({ id: 'b1', status: 'EN_ROUTE', scheduledAt: null, totalJod: '50', service: svc, technicianId: 't1', addressLat: 31.9, addressLng: 35.9 });
    expect(await screen.findByRole('button', { name: /إبلاغ/ })).toBeInTheDocument();
  });

  it('runs the cancellation flow: pick a reason, then confirm shows the refund breakdown', async () => {
    const user = userEvent.setup();
    renderPage({ id: 'b1', status: 'CONFIRMED', scheduledAt: null, totalJod: '45', discountJod: '5', totalJodBeforeDiscount: '50', service: svc, technicianId: null, addressLat: 31.9, addressLng: 35.9 });

    await user.click(await screen.findByRole('button', { name: 'إلغاء الحجز' }));
    await user.click(await screen.findByRole('radio', { name: 'وجدت حلاً آخر' }));

    expect(screen.getByText('المبلغ المسترد')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'تأكيد الإلغاء' })).toBeInTheDocument();
  });

  it('opens the report-technician modal with the conduct reason picker', async () => {
    const user = userEvent.setup();
    renderPage({ id: 'b1', status: 'EN_ROUTE', scheduledAt: null, totalJod: '50', service: svc, technicianId: 't1', addressLat: 31.9, addressLng: 35.9 });

    await user.click(await screen.findByRole('button', { name: /إبلاغ/ }));
    expect(await screen.findByText('الإبلاغ عن الفني')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'محاولة التعامل خارج التطبيق' })).toBeInTheDocument();
  });
});
