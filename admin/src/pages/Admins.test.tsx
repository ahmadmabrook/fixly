import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { useAuth } from '../lib/store';
import Admins from './Admins';

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
  useAuth.getState().setAuth('tok', { id: 'a1', name: 'Admin', email: 'admin@fixly.jo' });
});

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
  Object.defineProperty(globalThis, 'fetch', { value: fn as unknown as typeof fetch, writable: true, configurable: true });
  return fn;
}

const adminsPayload = {
  data: [
    { id: 'a1', email: 'admin@fixly.jo', name: 'Admin', role: 'SUPER_ADMIN', isActive: true, createdAt: new Date().toISOString() },
    { id: 'a2', email: 'ops@fixly.jo', name: 'خالد', role: 'OPS', isActive: true, createdAt: new Date().toISOString() },
  ],
};

describe('Admins page (deactivate is confirm-gated)', () => {
  it('does NOT fire the deactivate mutation on a single click — confirm dialog required', async () => {
    const seq = mockFetchWith([{ payload: adminsPayload }]);
    const user = userEvent.setup();
    renderWithProviders(<Admins />);
    await waitFor(() => expect(screen.getByText('خالد')).toBeInTheDocument());

    // Click the deactivate button for a2 (not self)
    await user.click(screen.getByTestId('active-btn-a2'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/تأكيد تعطيل المسؤول/)).toBeInTheDocument();

    // Cancel
    await user.click(within(dialog).getByRole('button', { name: /إلغاء/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    const activeCall = seq.mock.calls.find(([url]) => typeof url === 'string' && url.includes('/admins/a2/active'));
    expect(activeCall).toBeUndefined();
  });

  it('fires the deactivate mutation only after confirming', async () => {
    const seq = mockFetchWith([
      { payload: adminsPayload },
      { payload: { data: {} } },
      { payload: adminsPayload },
    ]);
    const user = userEvent.setup();
    renderWithProviders(<Admins />);
    await waitFor(() => expect(screen.getByText('خالد')).toBeInTheDocument());

    await user.click(screen.getByTestId('active-btn-a2'));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /تعطيل/ }));

    await waitFor(() => {
      const activeCall = seq.mock.calls.find(([url]) => typeof url === 'string' && url.includes('/admins/a2/active'));
      expect(activeCall).toBeTruthy();
      const init = activeCall?.[1] as RequestInit | undefined;
      expect(init?.method).toBe('POST');
      expect(JSON.parse(String(init?.body))).toEqual({ isActive: false });
    });
  });
});

describe('Admins page (role-change is confirm-gated)', () => {
  it('does NOT fire the role mutation on a single select change — confirm dialog required', async () => {
    const seq = mockFetchWith([{ payload: adminsPayload }]);
    const user = userEvent.setup();
    renderWithProviders(<Admins />);
    await waitFor(() => expect(screen.getByText('خالد')).toBeInTheDocument());

    // Find the role select for a2 (خالد, currently OPS)
    // The selects are rendered in table rows; خالد's row has a select defaulting to OPS
    const row = screen.getByText('خالد').closest('tr')!;
    const roleSelect = within(row).getByDisplayValue('عمليات');
    await user.selectOptions(roleSelect, 'FINANCE');

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/تأكيد تغيير الدور/)).toBeInTheDocument();

    // Cancel
    await user.click(within(dialog).getByRole('button', { name: /إلغاء/ }));

    const roleCall = seq.mock.calls.find(([url]) => typeof url === 'string' && url.includes('/admins/a2/role'));
    expect(roleCall).toBeUndefined();
  });

  it('fires the role mutation only after confirming', async () => {
    const seq = mockFetchWith([
      { payload: adminsPayload },
      { payload: { data: {} } },
      { payload: adminsPayload },
    ]);
    const user = userEvent.setup();
    renderWithProviders(<Admins />);
    await waitFor(() => expect(screen.getByText('خالد')).toBeInTheDocument());

    const row = screen.getByText('خالد').closest('tr')!;
    const roleSelect = within(row).getByDisplayValue('عمليات');
    await user.selectOptions(roleSelect, 'FINANCE');

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /تغيير الدور/ }));

    await waitFor(() => {
      const roleCall = seq.mock.calls.find(([url]) => typeof url === 'string' && url.includes('/admins/a2/role'));
      expect(roleCall).toBeTruthy();
      const init = roleCall?.[1] as RequestInit | undefined;
      expect(init?.method).toBe('POST');
      expect(JSON.parse(String(init?.body))).toEqual({ role: 'FINANCE' });
    });
  });
});
