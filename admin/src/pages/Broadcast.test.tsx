import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { useAuth } from '../lib/store';
import Broadcast from './Broadcast';

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

describe('Broadcast page (send flow with confirm)', () => {
  it('does not send immediately, shows a confirm dialog, and sends only after confirming', async () => {
    useAuth.getState().setAuth('tok', { id: 'a1', name: 'A', email: 'a@b.c' });
    const list = { data: [], meta: { total: 0, limit: 50, offset: 0 } };
    const sendResult = { data: { id: 'b1', titleAr: 'عنوان', segment: 'ALL', recipientCount: 10, createdAt: new Date().toISOString() } };
    const seq = mockFetchWith([{ payload: list }, { payload: sendResult }, { payload: list }]);

    const user = userEvent.setup();
    renderWithProviders(<Broadcast />);
    await waitFor(() => expect(screen.getByText('لا توجد إشعارات مرسلة')).toBeInTheDocument());

    await user.type(screen.getByLabelText(/العنوان/), 'عنوان تجريبي');
    await user.type(screen.getByLabelText(/النص/), 'نص تجريبي');

    await user.click(screen.getByRole('button', { name: /إرسال/ }));

    // Mutation must not have fired yet — clicking "send" only opens the dialog.
    const postCallsBeforeConfirm = seq.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST');
    expect(postCallsBeforeConfirm.length).toBe(0);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/إرسال الإشعار؟/)).toBeInTheDocument();
    expect(within(dialog).getByText(/لا يمكن التراجع عن هذا الإجراء/)).toBeInTheDocument();
    expect(within(dialog).getByText(/عنوان تجريبي/)).toBeInTheDocument();
    expect(within(dialog).getByText(/الجميع/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'إرسال' }));

    await waitFor(() => {
      const postCall = seq.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'POST');
      expect(postCall).toBeTruthy();
    });
  });
});
