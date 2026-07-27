import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CustomerMaterialsSection } from './BookingMaterials';

const pendingLine = {
  id: 'm1',
  bookingId: 'b1',
  materialId: null,
  source: 'TECHNICIAN_PROCURED',
  status: 'PENDING',
  description: 'أنبوب PVC',
  brand: null,
  qty: '2',
  unit: 'قطعة',
  unitPriceFils: 2500,
  totalFils: 5000,
  referencePriceFils: 2500,
  varianceBps: 0,
  varianceReason: null,
  varianceReasonNote: null,
  customerAckAt: null,
  supplierInvoiceUrl: null,
};

const disputedLine = {
  ...pendingLine,
  id: 'm2',
  status: 'PENDING_REVIEW',
  description: 'مضخة مياه مستوردة',
  unitPriceFils: 40000,
  totalFils: 40000,
  varianceBps: 3000,
  varianceReason: 'IMPORTED_BRAND',
  varianceReasonNote: 'ماركة أوروبية غير متوفرة محلياً بسعر أقل',
};

function renderSection(lines: unknown[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, opts?: RequestInit) => {
      const method = opts?.method ?? 'GET';
      if (url.endsWith('/bookings/b1/materials') && method === 'GET') {
        return { ok: true, status: 200, json: async () => ({ data: lines }) } as Response;
      }
      if (url.includes('/materials/m1/approve') && method === 'POST') {
        return { ok: true, status: 200, json: async () => ({ data: { ...pendingLine, customerAckAt: new Date().toISOString() } }) } as Response;
      }
      if (url.includes('/materials/m2/ack') && method === 'POST') {
        return { ok: true, status: 200, json: async () => ({ data: { ...disputedLine, customerAckAt: new Date().toISOString() } }) } as Response;
      }
      if (url.includes('/materials/m2/decline') && method === 'POST') {
        return { ok: true, status: 200, json: async () => ({ data: { ...disputedLine } }) } as Response;
      }
      return { ok: true, status: 200, json: async () => ({ data: {} }) } as Response;
    }) as unknown as typeof fetch,
  );

  return render(
    <QueryClientProvider client={qc}>
      <CustomerMaterialsSection bookingId="b1" />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('CustomerMaterialsSection', () => {
  it('renders nothing when the booking has no BOM lines', async () => {
    const { container } = renderSection([]);
    await waitFor(() => expect(container.querySelector('h3')).toBeNull());
  });

  it('lets the customer approve a plain PENDING line, gating ARRIVED→IN_PROGRESS', async () => {
    const user = userEvent.setup();
    renderSection([pendingLine]);

    expect(await screen.findByText('أنبوب PVC')).toBeInTheDocument();
    const approveBtn = screen.getByRole('button', { name: 'موافقة' });
    await user.click(approveBtn);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/materials/m1/approve'), expect.objectContaining({ method: 'POST' }));
    });
  });

  it('shows the variance reason and lets the customer ack a justified price-dispute line', async () => {
    renderSection([disputedLine]);

    expect(await screen.findByText(/سعر أعلى من المرجع/)).toBeInTheDocument();
    expect(screen.getByText(/ماركة مستوردة/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /موافقة على الفرق/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /رفض والتحقق/ })).toBeInTheDocument();
  });

  it('declining opens a verification request and locally hides the buttons (server state is unchanged either way)', async () => {
    const user = userEvent.setup();
    renderSection([disputedLine]);

    const declineBtn = await screen.findByRole('button', { name: /رفض والتحقق/ });
    await user.click(declineBtn);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/materials/m2/decline'), expect.objectContaining({ method: 'POST' }));
    });
    await waitFor(() => {
      expect(screen.getByText(/تم إرسال طلب التحقق/)).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /موافقة على الفرق/ })).not.toBeInTheDocument();
  });
});
