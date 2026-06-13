import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { useAuth } from '../lib/store';
import Technicians from './Technicians';

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

function loginAsAdmin() {
  useAuth.getState().setAuth('tok', { id: 'a1', name: 'A', email: 'a@b.c' });
}

function mockFetchWith(payloads: Array<{ status?: number; payload: unknown }>) {
  let i = 0;
  const fn = vi.fn(async (_url: string, _init?: RequestInit) => {
    const r = payloads[i++] ?? payloads[payloads.length - 1];
    return {
      ok: (r.status ?? 200) >= 200 && (r.status ?? 200) < 300,
      status: r.status ?? 200,
      json: async () => r.payload,
    } as Response;
  });
  // Use defineProperty for reliable cross-file stubbing.
  Object.defineProperty(globalThis, 'fetch', { value: fn as unknown as typeof fetch, writable: true, configurable: true });
  return fn;
}

describe('Technicians page (verify flow with confirm)', () => {
  it('opens a confirm dialog before calling the verify endpoint', async () => {
    loginAsAdmin();
    const listPayload = {
      data: [
        { id: 'tp1', isVerified: false, user: { id: 'u1', name: 'علي' }, rating: 4.5, totalReviews: 10 },
      ],
      meta: { total: 1, limit: 50, offset: 0 },
    };
    const verifyPayload = { data: { id: 'tp1', isVerified: true, user: { id: 'u1', name: 'علي' } } };
    const seq = mockFetchWith([{ payload: listPayload }, { payload: verifyPayload }, { payload: listPayload }]);

    const user = userEvent.setup();
    renderWithProviders(<Technicians />);

    await waitFor(() => expect(screen.getByText('علي')).toBeInTheDocument());
    await user.click(screen.getByTestId('verify-btn-tp1'));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/تأكيد توثيق الفني/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /إلغاء/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    // Sanity: the verify endpoint was NOT called.
    const verifyCall = seq.mock.calls.find(([url]) => url.includes('/technicians/tp1/verify'));
    expect(verifyCall).toBeUndefined();
  });

  it('calls the verify endpoint only after explicit confirm', async () => {
    loginAsAdmin();
    const listPayload = {
      data: [{ id: 'tp1', isVerified: false, user: { id: 'u1', name: 'علي' }, rating: 4.5, totalReviews: 10 }],
      meta: { total: 1, limit: 50, offset: 0 },
    };
    const verifyPayload = { data: { id: 'tp1', isVerified: true, user: { id: 'u1', name: 'علي' } } };
    const seq = mockFetchWith([
      { payload: listPayload },
      { payload: verifyPayload },
      { payload: listPayload },
    ]);

    const user = userEvent.setup();
    renderWithProviders(<Technicians />);
    await waitFor(() => expect(screen.getByText('علي')).toBeInTheDocument());

    await user.click(screen.getByTestId('verify-btn-tp1'));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /^توثيق$/ }));

    await waitFor(() => {
      const verifyCall = seq.mock.calls.find(([url]) => typeof url === 'string' && url.includes('/technicians/tp1/verify'));
      expect(verifyCall).toBeTruthy();
      const init = verifyCall?.[1] as RequestInit | undefined;
      expect(init?.method).toBe('POST');
    });
  });
});
