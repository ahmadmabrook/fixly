import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  PriceBadge, StatusBadge, ServiceIcon, Modal,
  ReportTechnicianModal, CancelBookingModal, FaqAccordion, OfflineBanner,
} from './shared';

describe('PriceBadge', () => {
  it('renders the amount with the JOD label', () => {
    render(<PriceBadge amount={20} />);
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText('دينار')).toBeInTheDocument();
  });

  it('renders "حسب المعاينة" instead of a number for a quote_first service (§0.2 #4)', () => {
    render(<PriceBadge amount={20} quoteFirst />);
    expect(screen.getByText('حسب المعاينة')).toBeInTheDocument();
    expect(screen.queryByText('20')).not.toBeInTheDocument();
  });
});

describe('StatusBadge', () => {
  it('maps PENDING to "searching for a technician", not a payment label (AWAITING_PAYMENT owns that state)', () => {
    render(<StatusBadge status="PENDING" />);
    expect(screen.getByText('قيد البحث عن فني')).toBeInTheDocument();
  });

  it('maps AWAITING_PAYMENT to its own Arabic label rather than falling through to the raw enum', () => {
    render(<StatusBadge status="AWAITING_PAYMENT" />);
    expect(screen.getByText('بانتظار الدفع')).toBeInTheDocument();
  });

  it('maps NO_SHOW to its own Arabic label rather than falling through to the raw enum', () => {
    render(<StatusBadge status="NO_SHOW" />);
    expect(screen.getByText('عدم تواجد العميل')).toBeInTheDocument();
  });

  it('maps EN_ROUTE to the on-the-way label', () => {
    render(<StatusBadge status="EN_ROUTE" />);
    expect(screen.getByText('الفني في الطريق')).toBeInTheDocument();
  });

  it('falls back to the raw status for unknown values', () => {
    render(<StatusBadge status="WEIRD" />);
    expect(screen.getByText('WEIRD')).toBeInTheDocument();
  });
});

describe('ServiceIcon', () => {
  it('renders without crashing when given an Arabic service name', () => {
    const { container } = render(<ServiceIcon nameAr="كهرباء" />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});

describe('Modal', () => {
  it('renders an accessible dialog labelled by its title', () => {
    render(<Modal title="عنوان" onClose={vi.fn()}><p>محتوى</p></Modal>);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    // aria-labelledby points at the rendered title.
    const labelId = dialog.getAttribute('aria-labelledby');
    expect(screen.getByText('عنوان').id).toBe(labelId);
  });

  it('closes on Escape (focus-trapped dialog)', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Modal title="عنوان" onClose={onClose}><button>زر</button></Modal>);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on backdrop click but not on content click', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Modal title="عنوان" onClose={onClose}><button>زر</button></Modal>);
    await user.click(screen.getByText('زر'));
    expect(onClose).not.toHaveBeenCalled();
    // The backdrop is the dialog's parent element.
    await user.click(screen.getByRole('dialog').parentElement!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('ReportTechnicianModal', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => (
      { ok: true, status: 201, json: async () => ({ data: { id: 'r1' } }) } as Response
    )));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('requires a reason before the submit button is enabled', async () => {
    render(<ReportTechnicianModal bookingId="b1" technicianId="t1" onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'إرسال البلاغ' })).toBeDisabled();
  });

  it('submits the selected reason and details, then closes', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ReportTechnicianModal bookingId="b1" technicianId="t1" onClose={onClose} />);

    await user.click(screen.getByRole('radio', { name: 'لم يحضر' }));
    await user.type(screen.getByLabelText('تفاصيل إضافية (اختياري)'), 'لم يصل الفني في الموعد');
    await user.click(screen.getByRole('button', { name: 'إرسال البلاغ' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const call = fetchMock.mock.calls.find((c: unknown[]) => String(c[0]).endsWith('/conduct-reports'));
    expect(call).toBeDefined();
    const body = JSON.parse((call![1] as RequestInit).body as string);
    expect(body).toMatchObject({ kind: 'NO_SHOW', bookingId: 'b1', subjectTechId: 't1', details: 'لم يصل الفني في الموعد' });
  });
});

describe('CancelBookingModal', () => {
  it('shows the refund breakdown only after a reason is picked, then confirms with the Arabic label', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<CancelBookingModal priceJod={50} discountJod={5} totalJod={45} onConfirm={onConfirm} onCancel={vi.fn()} />);

    expect(screen.queryByText('المبلغ المسترد')).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'تأخر الفني' }));

    expect(screen.getByText('المبلغ المسترد')).toBeInTheDocument();
    expect(screen.getByText('45 دينار')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'تأكيد الإلغاء' }));
    expect(onConfirm).toHaveBeenCalledWith('تأخر الفني');
  });
});

describe('FaqAccordion', () => {
  it('expands and collapses an item on click', async () => {
    const user = userEvent.setup();
    render(<FaqAccordion items={[['سؤال؟', 'الجواب هنا']]} />);
    expect(screen.queryByText('الجواب هنا')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'سؤال؟' }));
    expect(screen.getByText('الجواب هنا')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'سؤال؟' }));
    expect(screen.queryByText('الجواب هنا')).not.toBeInTheDocument();
  });
});

describe('OfflineBanner', () => {
  const originalOnLine = window.navigator.onLine;
  afterEach(() => {
    Object.defineProperty(window.navigator, 'onLine', { value: originalOnLine, configurable: true });
  });

  it('renders nothing while online', () => {
    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
    const { container } = render(<OfflineBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the offline message when the browser goes offline', () => {
    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
    render(<OfflineBanner />);
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByText('لا يوجد اتصال بالإنترنت')).toBeInTheDocument();
  });
});
