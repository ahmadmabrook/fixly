import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { useAuth } from '../lib/store';
import Quality from './Quality';

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

const listPayload = {
  data: [
    {
      id: 'tp1', trustTier: 'VERIFIED', bgCheckStatus: 'PASSED', skillsTestPassedAt: null,
      isInsured: true, rating: 4.6, totalReviews: 12, jobsCompleted: 40, offPlatformFlags: 0,
      status: 'APPROVED', user: { name: 'خالد', phone: '0790000000' },
    },
  ],
  meta: { total: 1, limit: 200, offset: 0 },
};
const scorecardPayload = { data: { onTimeRate: 90, redoRate: 5, complaintRate: 2, acceptanceRate: 88, sampleSizes: {} } };

describe('Quality page (kanban board)', () => {
  it('groups technicians into trust-tier columns', async () => {
    loginAsAdmin();
    const fn = vi.fn(async () => ({ ok: true, status: 200, json: async () => listPayload }) as Response);
    Object.defineProperty(globalThis, 'fetch', { value: fn as unknown as typeof fetch, writable: true, configurable: true });

    renderWithProviders(<Quality />);
    await waitFor(() => expect(screen.getByText('خالد')).toBeInTheDocument());
    expect(screen.getByText('موثّق')).toBeInTheDocument();
  });

  it('opens a drawer with bg-check, skills test, and scorecard on card click', async () => {
    loginAsAdmin();
    const fn = vi.fn(async (url: string) => {
      if (typeof url === 'string' && url.includes('/scorecard')) {
        return { ok: true, status: 200, json: async () => scorecardPayload } as Response;
      }
      return { ok: true, status: 200, json: async () => listPayload } as Response;
    });
    Object.defineProperty(globalThis, 'fetch', { value: fn as unknown as typeof fetch, writable: true, configurable: true });

    const user = userEvent.setup();
    renderWithProviders(<Quality />);
    await waitFor(() => expect(screen.getByText('خالد')).toBeInTheDocument());
    await user.click(screen.getByTestId('quality-card-tp1'));

    await waitFor(() => expect(screen.getByText('بطاقة الأداء')).toBeInTheDocument());
    expect(screen.getByText('90%')).toBeInTheDocument();
    expect(screen.getByText('88%')).toBeInTheDocument();
  });

  it('requires confirmation before changing the trust tier', async () => {
    loginAsAdmin();
    const fn = vi.fn(async (url: string, init?: RequestInit) => {
      if (typeof url === 'string' && url.includes('/scorecard')) {
        return { ok: true, status: 200, json: async () => scorecardPayload } as Response;
      }
      if (typeof url === 'string' && url.includes('/trust-tier')) {
        return { ok: true, status: 200, json: async () => ({ data: { id: 'tp1', trustTier: 'PRO' } }) } as Response;
      }
      return { ok: true, status: 200, json: async () => listPayload } as Response;
    });
    Object.defineProperty(globalThis, 'fetch', { value: fn as unknown as typeof fetch, writable: true, configurable: true });

    const user = userEvent.setup();
    renderWithProviders(<Quality />);
    await waitFor(() => expect(screen.getByText('خالد')).toBeInTheDocument());
    await user.click(screen.getByTestId('quality-card-tp1'));
    await waitFor(() => expect(screen.getByText('فئة الثقة')).toBeInTheDocument());

    await user.selectOptions(screen.getByDisplayValue('موثّق'), 'PRO');

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/تأكيد تغيير فئة الثقة/)).toBeInTheDocument();

    // Not called yet — confirmation is required first.
    expect(fn.mock.calls.find(([url]) => typeof url === 'string' && url.includes('/trust-tier'))).toBeUndefined();

    await user.click(within(dialog).getByRole('button', { name: /^تأكيد$/ }));

    await waitFor(() => {
      const call = fn.mock.calls.find(([url]) => typeof url === 'string' && url.includes('/trust-tier'));
      expect(call).toBeTruthy();
      expect((call?.[1] as RequestInit | undefined)?.method).toBe('POST');
    });
  });
});
