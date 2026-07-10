import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import LoginPage from './LoginPage';
import { useAuth } from '../lib/store';

function renderPage(initialEntry = '/login') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/services" element={<div>SERVICES PAGE</div>} />
        <Route path="/services/:id/book" element={<div>BOOKING PAGE</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

// A JWT whose payload base64-decodes to a CUSTOMER role (LoginPage reads it).
const PAYLOAD = btoa(JSON.stringify({ userId: 'u1', role: 'CUSTOMER' }));
const FAKE_JWT = `header.${PAYLOAD}.sig`;

function mockFetch() {
  return vi.fn(async (url: string) => {
    if (url.endsWith('/auth/otp/request')) {
      return { ok: true, status: 200, json: async () => ({ message: 'OTP sent' }) } as Response;
    }
    if (url.endsWith('/auth/otp/verify')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { accessToken: FAKE_JWT, refreshToken: 'r1' } }),
      } as Response;
    }
    return { ok: false, status: 404, json: async () => ({ error: { message: 'nope' } }) } as Response;
  });
}

beforeEach(() => {
  useAuth.getState().logout();
  vi.stubGlobal('fetch', mockFetch());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('LoginPage', () => {
  it('runs the OTP flow, stores the session and navigates to returnTo on success', async () => {
    const user = userEvent.setup();

    renderPage('/login?returnTo=%2Fservices%2Fid1%2Fbook');

    const phone = screen.getByLabelText('رقم الهاتف');
    await user.type(phone, '799000001');
    await user.click(screen.getByRole('button', { name: 'إرسال الرمز' }));

    const otp = await screen.findByLabelText('رمز التحقق');
    await user.type(otp, '000000');
    await user.click(screen.getByRole('button', { name: 'تحقق والدخول' }));

    await waitFor(() => expect(useAuth.getState().accessToken).toBe(FAKE_JWT));
    expect(useAuth.getState().role).toBe('CUSTOMER');
    expect(await screen.findByText('BOOKING PAGE')).toBeInTheDocument();
  });

  it('pre-fills the referral code from a ?ref= deep link and sends it on verify', async () => {
    const user = userEvent.setup();

    renderPage('/login?ref=ABC123');

    expect(screen.getByLabelText('رمز الإحالة')).toHaveValue('ABC123');

    const phone = screen.getByLabelText('رقم الهاتف');
    await user.type(phone, '799000001');
    await user.click(screen.getByRole('button', { name: 'إرسال الرمز' }));

    const otp = await screen.findByLabelText('رمز التحقق');
    await user.type(otp, '000000');

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    await user.click(screen.getByRole('button', { name: 'تحقق والدخول' }));
    await waitFor(() => expect(useAuth.getState().accessToken).toBe(FAKE_JWT));

    const verifyCall = fetchMock.mock.calls.find((call: unknown[]) => String(call[0]).endsWith('/auth/otp/verify'));
    expect(verifyCall).toBeDefined();
    const body = JSON.parse((verifyCall![1] as RequestInit).body as string);
    expect(body.referralCode).toBe('ABC123');
  });
});
