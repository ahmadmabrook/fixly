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
          <Route path="/quotes" element={<div>QUOTES PAGE</div>} />
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

  it('navigates to /quotes when the video-quote ("الفحص المرئي") tab is clicked', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('tab', { name: 'الفحص المرئي' }));
    expect(await screen.findByText('QUOTES PAGE')).toBeInTheDocument();
  });

  it('shows the wallet balance and ledger under the "رصيدي" tab', async () => {
    useAuth.getState().setTokens('tok', 'CUSTOMER');
    const user = userEvent.setup();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/credits/me')) {
        return {
          ok: true, status: 200, json: async () => ({
            data: { balanceJod: '20', items: [{ id: 'c1', amountJod: '20', reason: 'LATE_COMPENSATION', createdAt: new Date().toISOString() }] },
          }),
        } as Response;
      }
      return { ok: true, status: 200, json: async () => ({ data: [] }) } as Response;
    }) as unknown as typeof fetch);
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/account']}>
          <Routes><Route path="/account" element={<Account />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole('tab', { name: 'رصيدي' }));
    // "20" also appears in the account header's wallet-balance pill, so this
    // scopes to the wallet card specifically rather than the raw text.
    expect(await screen.findByText('الرصيد الحالي')).toBeInTheDocument();
    expect(screen.getAllByText('20').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('تعويض تأخير')).toBeInTheDocument();
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
      // Receipt rows are collapsed by default — expand it first to reveal the download button.
      await user.click(await screen.findByText('كهرباء'));
      await user.click(await screen.findByRole('button', { name: 'تنزيل الإيصال' }));

      await vi.waitFor(() => expect(printWindow.print).toHaveBeenCalled());
      expect(printWindow.document.write).toHaveBeenCalledWith(expect.stringContaining('إيصال Fixly'));
    });

    it('expands to show the three-line breakdown and the full-warranty label by default', async () => {
      useAuth.getState().setTokens('tok', 'CUSTOMER');
      const user = userEvent.setup();
      renderPage([{
        id: 'b1', status: 'COMPLETED', scheduledAt: null, totalJod: '35', service: svc,
        labourFils: 30000, materialsFils: 0, feesFils: 5000, customerSuppliedMaterialsAckAt: null,
      }]);
      await user.click(screen.getByRole('tab', { name: 'الفواتير' }));
      expect(await screen.findByText('ضمان كامل')).toBeInTheDocument();

      await user.click(screen.getByText('كهرباء'));
      expect(await screen.findByText('أجور العمل')).toBeInTheDocument();
      expect(screen.getByText('الرسوم')).toBeInTheDocument();
      expect(screen.getByText('الإجمالي')).toBeInTheDocument();
    });

    it('shows the labour-only warranty label once the customer acknowledged supplying materials', async () => {
      useAuth.getState().setTokens('tok', 'CUSTOMER');
      const user = userEvent.setup();
      renderPage([{
        id: 'b1', status: 'COMPLETED', scheduledAt: null, totalJod: '40', service: svc,
        customerSuppliedMaterialsAckAt: new Date().toISOString(),
      }]);
      await user.click(screen.getByRole('tab', { name: 'الفواتير' }));
      expect(await screen.findByText('الضمان على العمل فقط — مواد العميل')).toBeInTheDocument();
    });
  });
});
