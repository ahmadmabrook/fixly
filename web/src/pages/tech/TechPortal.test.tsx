import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TechPortal from './TechPortal';

const me = {
  id: 'tech-1',
  status: 'APPROVED',
  isVerified: true,
  isAvailable: true,
  rejectionReason: null,
  hourlyRateJod: '45',
  vehicle: null,
  bio: null,
  rating: '4.8',
  totalReviews: 12,
  trustTier: 'PROBATION' as const,
  services: [{ id: 'elec', nameAr: 'كهرباء' }],
  consecutiveRejections: 0,
};

const nearbyJob = {
  id: 'job-1',
  totalJod: '50',
  distanceKm: 1.2,
  expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  round: 1,
  service: { nameAr: 'كهرباء', nameEn: 'Electricity', priceJod: '50', durationMin: 45 },
};

const arrivedBooking = {
  id: 'b-1',
  status: 'ARRIVED',
  scheduledAt: null,
  totalJod: '50',
  service: { nameAr: 'كهرباء', nameEn: 'Electricity' },
};

const inProgressBooking = {
  id: 'b-2',
  status: 'IN_PROGRESS',
  scheduledAt: null,
  totalJod: '50',
  service: { nameAr: 'سباكة', nameEn: 'Plumbing' },
};

// Only a booking whose `service.id` is present mounts MaterialsSection
// (ActiveJobs.tsx guards on `b.service?.id`) — the two fixtures above
// deliberately omit it so the pre-existing checklist tests stay unaffected.
const arrivedBookingWithBom = {
  id: 'b-3',
  status: 'ARRIVED',
  scheduledAt: null,
  totalJod: '80',
  service: { id: 'elec', nameAr: 'كهرباء', nameEn: 'Electricity' },
};

const bomLine = {
  id: 'bm-1',
  bookingId: 'b-3',
  materialId: null,
  source: 'TECHNICIAN_PROCURED',
  status: 'PENDING',
  description: 'قاطع كهرباء',
  brand: null,
  qty: '1',
  unit: 'قطعة',
  unitPriceFils: 3000,
  totalFils: 3000,
  referencePriceFils: null,
  varianceBps: null,
  varianceReason: null,
  varianceReasonNote: null,
  customerAckAt: null,
  supplierInvoiceUrl: null,
};

const openVerification = {
  id: 'v-1',
  bookingId: 'b-3',
  technicianId: 'tech-1',
  status: 'OPEN',
  referencePriceFils: 3000,
  chargedPriceFils: 4200,
  deltaFils: 1200,
  invoiceUrl: null,
  deadlineAt: new Date(Date.now() + 20 * 60 * 60 * 1000).toISOString(),
};

const scorecard = {
  onTimeRate: 92.5,
  redoRate: 3.1,
  complaintRate: 0,
  acceptanceRate: 87,
  sampleSizes: { arrivedBookings: 10, completedBookings: 8, totalBookings: 10, dispatchOffers: 12 },
};

function renderPortal() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TechPortal />
    </QueryClientProvider>,
  );
}

function mockFetch(bookings: unknown[], overrides?: { me?: typeof me; jobs?: unknown[]; verifications?: unknown[] }) {
  const meResponse = overrides?.me ?? me;
  const jobs = overrides?.jobs ?? [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';

      if (url.endsWith('/technician/me')) {
        return { ok: true, status: 200, json: async () => ({ data: meResponse }) } as Response;
      }
      if (url.endsWith('/bookings') && method === 'GET') {
        return { ok: true, status: 200, json: async () => ({ data: bookings }) } as Response;
      }
      if (url.endsWith('/technician/jobs')) {
        return { ok: true, status: 200, json: async () => ({ data: jobs }) } as Response;
      }
      if (url.endsWith('/technician/scorecard')) {
        return { ok: true, status: 200, json: async () => ({ data: scorecard }) } as Response;
      }
      if (url.endsWith('/uploads/presign') && method === 'POST') {
        return {
          ok: true, status: 200, json: async () => ({
            data: { uploadUrl: 'https://mock-uploads.fixly.local/x?mock=1', publicUrl: 'https://mock-uploads.fixly.local/x.jpg', expiresAt: new Date().toISOString() },
          }),
        } as Response;
      }
      if (url.endsWith('/bookings/b-3/materials') && method === 'GET') {
        return { ok: true, status: 200, json: async () => ({ data: [bomLine] }) } as Response;
      }
      if (url.includes('/bookings/') && url.endsWith('/materials') && method === 'GET') {
        return { ok: true, status: 200, json: async () => ({ data: [] }) } as Response;
      }
      if (url.endsWith('/bookings/b-3/materials') && method === 'POST') {
        const body = JSON.parse(init!.body as string);
        return { ok: true, status: 201, json: async () => ({ data: { ...bomLine, id: 'bm-2', ...body } }) } as Response;
      }
      if (url.endsWith('/services/elec/materials') && method === 'GET') {
        return { ok: true, status: 200, json: async () => ({ data: [] }) } as Response;
      }
      if (url.endsWith('/verifications') && method === 'GET') {
        return { ok: true, status: 200, json: async () => ({ data: { items: overrides?.verifications ?? [], total: (overrides?.verifications ?? []).length } }) } as Response;
      }
      if (url.includes('/verifications/') && url.endsWith('/invoice') && method === 'POST') {
        return { ok: true, status: 200, json: async () => ({ data: { ...openVerification, status: 'INVOICE_PROVIDED' } }) } as Response;
      }
      if (url.endsWith('/no-show') && method === 'POST') {
        return { ok: true, status: 200, json: async () => ({ data: { ...arrivedBooking, status: 'CANCELLED' } }) } as Response;
      }
      if (url.includes('/checklist/pre-start') && method === 'POST') {
        return { ok: true, status: 200, json: async () => ({ data: { ...arrivedBooking, status: 'ARRIVED' } }) } as Response;
      }
      if (url.includes('/checklist/pre-close') && method === 'POST') {
        return { ok: true, status: 200, json: async () => ({ data: { ...inProgressBooking, status: 'IN_PROGRESS' } }) } as Response;
      }
      if (url.includes('/status') && method === 'POST') {
        return { ok: true, status: 200, json: async () => ({ data: { ...arrivedBooking, status: 'IN_PROGRESS' } }) } as Response;
      }
      if (url.includes('/complete') && method === 'POST') {
        return { ok: true, status: 200, json: async () => ({ data: { ...inProgressBooking, status: 'COMPLETED' } }) } as Response;
      }
      if (url.includes('/bookings/') && url.endsWith('/reject') && method === 'POST') {
        return { ok: true, status: 200, json: async () => ({ data: { rejected: true } }) } as Response;
      }
      if (url.endsWith('/auth/me') && method === 'GET') {
        return { ok: true, status: 200, json: async () => ({ data: { name: 'خالد المومني', phone: '+962795551234' } }) } as Response;
      }
      if (url.endsWith('/support') && method === 'GET') {
        return { ok: true, status: 200, json: async () => ({ data: [] }) } as Response;
      }
      if (url.endsWith('/services') && method === 'GET') {
        return { ok: true, status: 200, json: async () => ({ data: [{ id: 'elec', nameAr: 'كهرباء', nameEn: 'Electricity', descriptionAr: null, priceJod: '50', durationMin: 45, isActive: true }] }) } as Response;
      }
      if (url.endsWith('/technician/earnings')) {
        return { ok: true, status: 200, json: async () => ({ data: { todayJod: '0', monthJod: '0', totalJod: '0', balanceJod: '0', lastWithdrawalAt: null, savedIban: null, savedBankName: null } }) } as Response;
      }
      if (url.endsWith('/technician/bank-account') && method === 'GET') {
        return { ok: true, status: 200, json: async () => ({ data: { iban: null, bankName: null } }) } as Response;
      }
      if (url.endsWith('/technician/bank-account') && method === 'PATCH') {
        const body = JSON.parse(init!.body as string);
        return { ok: true, status: 200, json: async () => ({ data: body }) } as Response;
      }
      if (url.endsWith('/technician/notification-preferences') && method === 'GET') {
        return { ok: true, status: 200, json: async () => ({ data: { newJobRequests: true, reminders: true, earningsUpdates: true, promotions: true } }) } as Response;
      }
      if (url.endsWith('/technician/notification-preferences') && method === 'PATCH') {
        const body = JSON.parse(init!.body as string);
        return { ok: true, status: 200, json: async () => ({ data: { newJobRequests: true, reminders: true, earningsUpdates: true, promotions: true, ...body } }) } as Response;
      }
      if (url.endsWith('/technician/services-pricing') && method === 'PATCH') {
        const body = JSON.parse(init!.body as string);
        return { ok: true, status: 200, json: async () => ({ data: { ...me, services: body.serviceIds.map((id: string) => ({ id, nameAr: id })), hourlyRateJod: body.hourlyRateJod } }) } as Response;
      }
      return { ok: true, status: 200, json: async () => ({ data: null }) } as Response;
    }) as unknown as typeof fetch,
  );
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('TechPortal Dashboard header', () => {
  it('shows the probation trust-tier chip and banner', async () => {
    mockFetch([]);
    renderPortal();
    await screen.findByText('لوحة الفني');
    expect(screen.getByText('تحت التجربة')).toBeInTheDocument();
    expect(screen.getByText(/قيد التجربة/)).toBeInTheDocument();
  });
});

describe('TechPortal ActiveJobs — no-show', () => {
  it('reports a no-show after confirming the dialog', async () => {
    const user = userEvent.setup();
    mockFetch([arrivedBooking]);
    renderPortal();

    await screen.findByText('لوحة الفني');
    await user.click(screen.getByRole('button', { name: 'مهامي' }));

    const noShowBtn = await screen.findByRole('button', { name: 'العميل لم يحضر' });
    await user.click(noShowBtn);

    // Confirm dialog appears with callout-fee copy
    expect(await screen.findByText(/رسوم كشف/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'تأكيد' }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/bookings/b-1/no-show'),
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });
});

describe('TechPortal ActiveJobs — SOP checklist gating', () => {
  it('requires a pre-start photo URL before advancing ARRIVED -> IN_PROGRESS', async () => {
    const user = userEvent.setup();
    mockFetch([arrivedBooking]);
    renderPortal();

    await screen.findByText('لوحة الفني');
    await user.click(screen.getByRole('button', { name: 'مهامي' }));

    await user.click(await screen.findByRole('button', { name: 'بدء الخدمة' }));

    const modal = await screen.findByRole('dialog');
    expect(within(modal).getByText('قائمة تحقق ما قبل الخدمة')).toBeInTheDocument();

    const continueBtn = within(modal).getByRole('button', { name: 'متابعة' });
    expect(continueBtn).toBeDisabled();

    const fileInput = modal.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, new File(['abc'], 'before.jpg', { type: 'image/jpeg' }));
    await waitFor(() => expect(continueBtn).toBeEnabled());
    await user.click(continueBtn);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/bookings/b-1/checklist/pre-start'),
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ photoUrls: ['https://mock-uploads.fixly.local/x.jpg'] }) }),
      );
    });
    // Chains into the existing status transition after the checklist call.
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/bookings/b-1/status'),
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  it('requires a pre-close photo URL before completing an IN_PROGRESS booking', async () => {
    const user = userEvent.setup();
    mockFetch([inProgressBooking]);
    renderPortal();

    await screen.findByText('لوحة الفني');
    await user.click(screen.getByRole('button', { name: 'مهامي' }));

    await user.click(await screen.findByRole('button', { name: 'إنهاء الخدمة' }));

    const modal = await screen.findByRole('dialog');
    expect(within(modal).getByText('قائمة تحقق ما بعد الخدمة')).toBeInTheDocument();

    const fileInput = modal.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, new File(['abc'], 'after.jpg', { type: 'image/jpeg' }));
    await waitFor(() => expect(within(modal).getByRole('button', { name: 'متابعة' })).toBeEnabled());
    await user.click(within(modal).getByRole('button', { name: 'متابعة' }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/bookings/b-2/checklist/pre-close'),
        expect.objectContaining({ method: 'POST' }),
      );
    });
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/bookings/b-2/complete'),
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });
});

describe('TechPortal ActiveJobs — BOM drafting (§17.5.9)', () => {
  it('lists an existing BOM line and lets the technician add a new one', async () => {
    const user = userEvent.setup();
    mockFetch([arrivedBookingWithBom]);
    renderPortal();

    await screen.findByText('لوحة الفني');
    await user.click(screen.getByRole('button', { name: 'مهامي' }));

    expect(await screen.findByText('قاطع كهرباء')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'إضافة مادة' }));
    const modal = await screen.findByRole('dialog');
    await user.type(within(modal).getByLabelText('وصف المادة'), 'سلك كهرباء');
    await user.type(within(modal).getByLabelText('سعر الوحدة بالدينار'), '1.500');
    await user.click(within(modal).getByRole('button', { name: 'حفظ' }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/bookings/b-3/materials'),
        expect.objectContaining({ method: 'POST', body: expect.stringContaining('"unitPriceFils":1500') }),
      );
    });
  });
});

describe('TechPortal Verifications tab (§17.5.14)', () => {
  it('badges the tab with the open-request count and uploads an invoice for one', async () => {
    const user = userEvent.setup();
    mockFetch([], { verifications: [openVerification] });
    renderPortal();

    await screen.findByText('لوحة الفني');
    expect(await screen.findByText('1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /التحقق من الأسعار/ }));
    expect(await screen.findByText(/فرق سعر/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'رفع فاتورة الشراء' }));
    const modal = await screen.findByRole('dialog');
    const fileInput = modal.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, new File(['abc'], 'invoice.jpg', { type: 'image/jpeg' }));

    const sendBtn = within(modal).getByRole('button', { name: 'إرسال' });
    await waitFor(() => expect(sendBtn).toBeEnabled());
    await user.click(sendBtn);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/verifications/v-1/invoice'),
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });
});

describe('TechPortal Scorecard tab', () => {
  it('renders the four quality metrics as percentages', async () => {
    const user = userEvent.setup();
    mockFetch([]);
    renderPortal();

    await screen.findByText('لوحة الفني');
    await user.click(screen.getByRole('button', { name: 'أدائي' }));

    expect(await screen.findByText('92.5%')).toBeInTheDocument();
    expect(screen.getByText('3.1%')).toBeInTheDocument();
    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(screen.getByText('87%')).toBeInTheDocument();
  });
});

describe('TechPortal reject-warning banner', () => {
  it('shows a warning banner once consecutiveRejections reaches 3', async () => {
    mockFetch([], { me: { ...me, consecutiveRejections: 3 } });
    renderPortal();

    await screen.findByText('لوحة الفني');
    expect(await screen.findByText(/رفضات متتالية/)).toBeInTheDocument();
  });

  it('does not show the banner below the threshold', async () => {
    mockFetch([], { me: { ...me, consecutiveRejections: 2 } });
    renderPortal();

    await screen.findByText('لوحة الفني');
    expect(screen.queryByText(/رفضات متتالية/)).not.toBeInTheDocument();
  });
});

describe('TechPortal profile tab', () => {
  it('navigates to the profile tab and lists the settings menu', async () => {
    const user = userEvent.setup();
    mockFetch([]);
    renderPortal();

    await screen.findByText('لوحة الفني');
    await user.click(screen.getByRole('button', { name: 'حسابي' }));

    expect(await screen.findByText('البيانات الشخصية')).toBeInTheDocument();
    expect(screen.getByText('الخدمات والأسعار')).toBeInTheDocument();
    expect(screen.getByText('الحساب البنكي')).toBeInTheDocument();
    expect(screen.getByText('الإشعارات')).toBeInTheDocument();
    expect(screen.getByText('الدعم')).toBeInTheDocument();
    expect(screen.getByText('تسجيل الخروج')).toBeInTheDocument();
  });

  it('confirms before logging out', async () => {
    const user = userEvent.setup();
    mockFetch([]);
    renderPortal();

    await screen.findByText('لوحة الفني');
    await user.click(screen.getByRole('button', { name: 'حسابي' }));
    await user.click(await screen.findByText('تسجيل الخروج'));

    expect(await screen.findByText('هل أنت متأكد من تسجيل الخروج؟')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'إلغاء' }));
    expect(screen.queryByText('هل أنت متأكد من تسجيل الخروج؟')).not.toBeInTheDocument();
  });

  it('saves bank details via the dedicated bank-account endpoint', async () => {
    const user = userEvent.setup();
    mockFetch([]);
    renderPortal();

    await screen.findByText('لوحة الفني');
    await user.click(screen.getByRole('button', { name: 'حسابي' }));
    await user.click(await screen.findByText('الحساب البنكي'));

    const bankNameInput = await screen.findByPlaceholderText('مثال: البنك العربي');
    await user.type(bankNameInput, 'البنك العربي');
    const ibanInput = screen.getByLabelText('رقم IBAN');
    await user.type(ibanInput, 'JO94ARAB1234567890123456789012');
    await user.click(screen.getByRole('button', { name: 'حفظ التغييرات' }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/technician/bank-account'),
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ iban: 'JO94ARAB1234567890123456789012', bankName: 'البنك العربي' }),
        }),
      );
    });
  });

  it('loads and toggles a notification preference via the backend', async () => {
    const user = userEvent.setup();
    mockFetch([]);
    renderPortal();

    await screen.findByText('لوحة الفني');
    await user.click(screen.getByRole('button', { name: 'حسابي' }));
    await user.click(await screen.findByText('الإشعارات'));

    const promosSwitch = await screen.findByRole('switch', { name: 'العروض والأخبار' });
    expect(promosSwitch).toHaveAttribute('aria-checked', 'true');

    await user.click(promosSwitch);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/technician/notification-preferences'),
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ promotions: false }) }),
      );
    });
    await waitFor(() => expect(promosSwitch).toHaveAttribute('aria-checked', 'false'));
  });

  it('edits services and hourly rate via the services-pricing endpoint', async () => {
    const user = userEvent.setup();
    mockFetch([]);
    renderPortal();

    await screen.findByText('لوحة الفني');
    await user.click(screen.getByRole('button', { name: 'حسابي' }));
    await user.click(await screen.findByText('الخدمات والأسعار'));

    await screen.findByText('كهرباء');
    const rateInput = screen.getByDisplayValue('45');
    await user.clear(rateInput);
    await user.type(rateInput, '55');
    await user.click(screen.getByRole('button', { name: 'حفظ التغييرات' }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/technician/services-pricing'),
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ serviceIds: ['elec'], hourlyRateJod: 55 }),
        }),
      );
    });
  });
});

describe('TechPortal nearby job detail + reject', () => {
  it('opens the job detail screen and rejects the offer', async () => {
    const user = userEvent.setup();
    mockFetch([], { jobs: [nearbyJob] });
    renderPortal();

    await screen.findByText('لوحة الفني');
    await user.click(await screen.findByText('تفاصيل'));

    expect(await screen.findByText('تفاصيل الطلب')).toBeInTheDocument();
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'رفض' }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/bookings/job-1/reject'),
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });
});

describe('TechPortal Onboarding', () => {
  const svc = { id: 'elec', nameAr: 'كهرباء', nameEn: 'Electricity', descriptionAr: null, priceJod: '50', durationMin: 45, isActive: true };

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET';
        if (url.endsWith('/technician/me')) {
          return { ok: false, status: 404, json: async () => ({ error: { message: 'not found' } }) } as Response;
        }
        if (url.endsWith('/services')) {
          return { ok: true, status: 200, json: async () => ({ data: [svc] }) } as Response;
        }
        if (url.endsWith('/technician/onboarding') && method === 'POST') {
          return { ok: true, status: 200, json: async () => ({ data: {} }) } as Response;
        }
        return { ok: true, status: 200, json: async () => ({ data: null }) } as Response;
      }) as unknown as typeof fetch,
    );
  });

  it('keeps submit disabled until the conduct agreement is checked, then submits agreementAccepted:true', async () => {
    const user = userEvent.setup();
    renderPortal();

    await screen.findByText('انضم كفني');
    await user.click(await screen.findByText('كهرباء'));
    await user.click(screen.getByRole('button', { name: 'إرسال الطلب' }).closest('button')!);
    // still disabled: agreement not checked yet
    expect(screen.getByRole('button', { name: 'إرسال الطلب' })).toBeDisabled();

    await user.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('button', { name: 'إرسال الطلب' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'إرسال الطلب' }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/technician/onboarding'),
        expect.objectContaining({ method: 'POST' }),
      );
    });
    const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find((args) => (args[0] as string).endsWith('/technician/onboarding'));
    expect(call).toBeDefined();
    const body = JSON.parse((call![1] as RequestInit).body as string);
    expect(body.agreementAccepted).toBe(true);
  });
});
