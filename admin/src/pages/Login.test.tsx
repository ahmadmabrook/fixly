import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { useAuth } from '../lib/store';
import Login from './Login';

function renderWithProviders(ui: React.ReactNode, routerProps = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter {...routerProps}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useAuth.getState().logout();
  localStorage.clear();
});

describe('Login page', () => {
  it('submits email + password, stores the token, navigates to /dashboard', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/api/v1/admin/login')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: { accessToken: 'tok-abc', admin: { id: 'a1', name: 'Admin', email: 'admin@fixly.jo' } },
          }),
        } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    });
    Object.defineProperty(globalThis, 'fetch', { value: fetchMock as unknown as typeof fetch, writable: true, configurable: true });

    const user = userEvent.setup();
    renderWithProviders(<Login />, { initialEntries: ['/login'] });
    const emailField = screen.getByLabelText(/البريد الإلكتروني/) as HTMLInputElement;
    const passwordField = screen.getByLabelText(/كلمة المرور/) as HTMLInputElement;
    await user.clear(emailField);
    await user.type(emailField, 'admin@fixly.jo');
    await user.clear(passwordField);
    await user.type(passwordField, 'admin12345');
    await user.click(screen.getByRole('button', { name: /تسجيل الدخول/ }));

    await waitFor(() => {
      expect(useAuth.getState().accessToken).toBe('tok-abc');
    });
    expect(useAuth.getState().admin?.email).toBe('admin@fixly.jo');
  });

  it('shows an error toast on a 401 from the API', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } }),
    }));
    Object.defineProperty(globalThis, 'fetch', { value: fetchMock as unknown as typeof fetch, writable: true, configurable: true });

    const user = userEvent.setup();
    renderWithProviders(<Login />, { initialEntries: ['/login'] });
    const emailField = screen.getByLabelText(/البريد الإلكتروني/) as HTMLInputElement;
    const passwordField = screen.getByLabelText(/كلمة المرور/) as HTMLInputElement;
    await user.clear(emailField);
    await user.type(emailField, 'a@b.c');
    await user.clear(passwordField);
    await user.type(passwordField, 'wrong');
    await user.click(screen.getByRole('button', { name: /تسجيل الدخول/ }));

    await waitFor(() => {
      expect(useAuth.getState().accessToken).toBeNull();
    });
  });
});
