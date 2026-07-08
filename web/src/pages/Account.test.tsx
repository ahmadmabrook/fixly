import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Account from './Account';
import { useAuth } from '../lib/store';

const svc = { id: 'elec', nameAr: 'كهرباء', nameEn: 'Electricity', descriptionAr: null, priceJod: '50', durationMin: 45, isActive: true };

function renderPage(bookings: Record<string, unknown>[] = []) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('/bookings')) {
      return { ok: true, status: 200, json: async () => ({ data: bookings }) } as Response;
    }
    if (url.endsWith('/bookings/b1')) {
      return { ok: true, status: 200, json: async () => ({ data: { id: 'b1', status: 'COMPLETED', scheduledAt: null, totalJod: '50', service: svc } }) } as Response;
    }
    if (url.endsWith('/bookings/b1/additional-work')) {
      return { ok: true, status: 200, json: async () => ({ data: [] }) } as Response;
    }
    return { ok: true, status: 200, json: async () => ({ data: [] }) } as Response;
  }) as unknown as typeof fetch);

  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/account']}>
        <Routes>
          <Route path="/account" element={<Account />} />
          <Route path="/referral" element={<div>REFERRAL PAGE</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  useAuth.getState().logout();
});

describe('Account', () => {
  it('navigates to /referral when the referral tab is clicked', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('tab', { name: 'الإحالة' }));
    expect(await screen.findByText('REFERRAL PAGE')).toBeInTheDocument();
  });

  it('shows the FAQ accordion under the support tab', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('tab', { name: 'الدعم' }));
    expect(await screen.findByText('الأسئلة الشائعة')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'كيف يتم الدفع؟' })).toBeInTheDocument();
  });

  describe('receipts tab', () => {
    it('lists only completed bookings', async () => {
      useAuth.getState().setTokens('tok', 'CUSTOMER');
      const user = userEvent.setup();
      renderPage([
        { id: 'b1', status: 'COMPLETED', scheduledAt: null, totalJod: '50', service: svc },
        { id: 'b2', status: 'PENDING', scheduledAt: null, totalJod: '30', service: { ...svc, id: 'plumb', nameAr: 'سباكة' } },
      ]);
      await user.click(screen.getByRole('tab', { name: 'الفواتير' }));
      expect(await screen.findByText('كهرباء')).toBeInTheDocument();
      expect(screen.queryByText('سباكة')).not.toBeInTheDocument();
    });

    it('shows an empty state when there are no completed bookings', async () => {
      useAuth.getState().setTokens('tok', 'CUSTOMER');
      const user = userEvent.setup();
      renderPage([{ id: 'b2', status: 'PENDING', scheduledAt: null, totalJod: '30', service: svc }]);
      await user.click(screen.getByRole('tab', { name: 'الفواتير' }));
      expect(await screen.findByText('لا توجد فواتير بعد.')).toBeInTheDocument();
    });

    it('downloads the receipt via the same generator used on the booking detail page', async () => {
      useAuth.getState().setTokens('tok', 'CUSTOMER');
      const user = userEvent.setup();
      const printWindow = { document: { write: vi.fn(), close: vi.fn() }, focus: vi.fn(), print: vi.fn() };
      vi.stubGlobal('open', vi.fn(() => printWindow as unknown as Window));

      renderPage([{ id: 'b1', status: 'COMPLETED', scheduledAt: null, totalJod: '50', service: svc }]);
      await user.click(screen.getByRole('tab', { name: 'الفواتير' }));
      await user.click(await screen.findByRole('button', { name: 'تنزيل الإيصال' }));

      await vi.waitFor(() => expect(printWindow.print).toHaveBeenCalled());
      expect(printWindow.document.write).toHaveBeenCalledWith(expect.stringContaining('إيصال Fixly'));
    });
  });
});
