import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AuthModal from './AuthModal';
import { useAuth } from '../lib/store';

// A JWT whose payload base64-decodes to a CUSTOMER role (AuthModal reads it).
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

describe('AuthModal', () => {
  it('runs the OTP flow and stores the session on success', async () => {
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(<AuthModal onClose={onClose} onSuccess={onSuccess} />);

    // Step 1: enter phone, request OTP.
    const phone = screen.getByLabelText('رقم الهاتف');
    await user.type(phone, '799000001');
    await user.click(screen.getByRole('button', { name: 'إرسال الرمز' }));

    // Step 2: OTP entry appears.
    const otp = await screen.findByLabelText('رمز التحقق');
    await user.type(otp, '000000');
    await user.click(screen.getByRole('button', { name: 'تحقق والدخول' }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(useAuth.getState().accessToken).toBe(FAKE_JWT);
    expect(useAuth.getState().role).toBe('CUSTOMER');
  });

  it('is dismissable via Escape (focus-trapped dialog)', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<AuthModal onClose={onClose} onSuccess={vi.fn()} />);

    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});
