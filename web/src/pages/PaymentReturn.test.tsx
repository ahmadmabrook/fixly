import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import PaymentReturn from './PaymentReturn';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/payment/return" element={<PaymentReturn />} />
        <Route path="/my-bookings" element={<div>MY BOOKINGS</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function mockStatus(state: string) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.includes('/payment-status')) {
      return { ok: true, status: 200, json: async () => ({ data: { state } }) } as Response;
    }
    return { ok: true, status: 200, json: async () => ({}) } as Response;
  }) as unknown as typeof fetch);
}

beforeEach(() => localStorage.clear());
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('PaymentReturn', () => {
  it('shows success when the checkout authorized', async () => {
    mockStatus('authorized');
    renderAt('/payment/return?bookingId=b1');
    expect(await screen.findByText('تم تأكيد الدفع')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'عرض حجوزاتي' })).toBeInTheDocument();
  });

  it('shows a retry option when the checkout was rejected', async () => {
    mockStatus('rejected');
    renderAt('/payment/return?bookingId=b1');
    expect(await screen.findByText('تعذّر إتمام الدفع')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'حاول مرة أخرى' })).toBeInTheDocument();
  });

  it('reports an error when no bookingId is present', async () => {
    mockStatus('authorized');
    renderAt('/payment/return');
    expect(await screen.findByText('حدث خطأ')).toBeInTheDocument();
  });
});
