import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { useAuth } from '../lib/store';
import ConductReports from './ConductReports';

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
  useAuth.getState().setAuth('tok', { id: 'a1', name: 'A', email: 'a@b.c' });
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

const listPayload = {
  data: [
    {
      id: 'c1', kind: 'SAFETY', details: 'تصرف غير لائق', status: 'OPEN', createdAt: new Date().toISOString(),
      reporter: { name: 'ليلى' }, subjectTech: { id: 'tech1', user: { name: 'محمد' } },
    },
  ],
  meta: { total: 1, limit: 50, offset: 0 },
};

describe('ConductReports page (list + error state)', () => {
  it('renders open conduct reports', async () => {
    mockFetchWith([{ payload: listPayload }]);
    renderWithProviders(<ConductReports />);
    await waitFor(() => expect(screen.getByText('محمد')).toBeInTheDocument());
    expect(screen.getByText('سلامة')).toBeInTheDocument();
  });

  it('shows an error message when the list request fails', async () => {
    mockFetchWith([{ status: 500, payload: { error: { message: 'fail' } } }]);
    renderWithProviders(<ConductReports />);
    await waitFor(() => expect(screen.getByText('تعذّر تحميل بلاغات السلوك')).toBeInTheDocument());
  });
});

describe('ConductReports page (resolve is confirm-gated)', () => {
  it('does NOT fire the resolve mutation on a single click — confirm dialog required', async () => {
    const seq = mockFetchWith([{ payload: listPayload }]);
    const user = userEvent.setup();
    renderWithProviders(<ConductReports />);
    await waitFor(() => expect(screen.getByText('محمد')).toBeInTheDocument());

    await user.click(screen.getByText('تأكيد'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/تأكيد البلاغ/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /إلغاء/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    const resolveCall = seq.mock.calls.find(([url]) => typeof url === 'string' && url.includes('/conduct-reports/c1/resolve'));
    expect(resolveCall).toBeUndefined();
  });

  it('fires the resolve mutation with UPHELD only after confirming', async () => {
    const seq = mockFetchWith([
      { payload: listPayload },
      { payload: { data: {} } },
      { payload: listPayload },
    ]);
    const user = userEvent.setup();
    renderWithProviders(<ConductReports />);
    await waitFor(() => expect(screen.getByText('محمد')).toBeInTheDocument());

    await user.click(screen.getByText('تأكيد'));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /^تأكيد$/ }));

    await waitFor(() => {
      const resolveCall = seq.mock.calls.find(([url]) => typeof url === 'string' && url.includes('/conduct-reports/c1/resolve'));
      expect(resolveCall).toBeTruthy();
      const init = resolveCall?.[1] as RequestInit | undefined;
      expect(init?.method).toBe('POST');
      expect(JSON.parse(String(init?.body))).toEqual({ decision: 'UPHELD' });
    });
  });
});
