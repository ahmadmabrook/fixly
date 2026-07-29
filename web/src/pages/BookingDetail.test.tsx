import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import BookingDetail from './BookingDetail';

const svc = { id: 'elec', nameAr: 'كهرباء', nameEn: 'Electricity', descriptionAr: null, priceJod: '50', durationMin: 45, isActive: true };

function renderPage(booking: Record<string, unknown>) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('/bookings/b1')) {
      return { ok: true, status: 200, json: async () => ({ data: booking }) } as Response;
    }
    if (url.endsWith('/bookings/b1/additional-work')) {
      return { ok: true, status: 200, json: async () => ({ data: [] }) } as Response;
    }
    return { ok: true, status: 200, json: async () => ({}) } as Response;
  }) as unknown as typeof fetch);

  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/bookings/b1']}>
        <Routes>
          <Route path="/bookings/:id" element={<BookingDetail />} />
          <Route path="/account" element={<div>ACCOUNT PAGE</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('BookingDetail', () => {
  it('shows a report-technician action for completed bookings', async () => {
    renderPage({ id: 'b1', status: 'COMPLETED', scheduledAt: null, totalJod: '50', service: svc, technicianId: 't1', completedAt: new Date().toISOString() });
    expect(await screen.findByRole('button', { name: /الإبلاغ عن الفني/ })).toBeInTheDocument();
  });

  it('links to support from the order screen regardless of status', async () => {
    const user = userEvent.setup();
    renderPage({ id: 'b1', status: 'PENDING', scheduledAt: new Date(Date.now() + 86_400_000).toISOString(), totalJod: '50', discountJod: '0', service: svc, technicianId: null });

    await user.click(await screen.findByRole('button', { name: 'تواصل مع الدعم' }));
    expect(await screen.findByText('ACCOUNT PAGE')).toBeInTheDocument();
  });

  it('does not show a cancel option once completed', async () => {
    renderPage({ id: 'b1', status: 'COMPLETED', scheduledAt: null, totalJod: '50', service: svc, technicianId: 't1', completedAt: new Date().toISOString() });
    await screen.findByText('الإيصال');
    expect(screen.queryByRole('button', { name: 'إلغاء الحجز' })).not.toBeInTheDocument();
  });

  it('runs the reason-picker cancellation flow for a scheduled booking', async () => {
    const user = userEvent.setup();
    renderPage({ id: 'b1', status: 'PENDING', scheduledAt: new Date(Date.now() + 86_400_000).toISOString(), totalJod: '50', discountJod: '0', service: svc, technicianId: null });

    await user.click(await screen.findByRole('button', { name: 'إلغاء الحجز' }));
    await user.click(await screen.findByRole('radio', { name: 'غيّرت رأيي' }));

    expect(screen.getByText('المبلغ المسترد')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'تأكيد الإلغاء' })).toBeInTheDocument();
  });
});
