import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import ReferralPage from './ReferralPage';

const stats = { referralCode: 'FIXLY-ABC', totalReferred: 3, totalCreditEarnedJod: 7.5 };

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ReferralPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('/referrals/me')) {
      return { ok: true, status: 200, json: async () => ({ data: stats }) } as Response;
    }
    return { ok: true, status: 200, json: async () => ({}) } as Response;
  }) as unknown as typeof fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('ReferralPage', () => {
  it('shows the referral code and stats from GET /referrals/me', async () => {
    renderPage();
    expect(await screen.findByText('FIXLY-ABC')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('7.5')).toBeInTheDocument();
  });

  it('copies the referral code to the clipboard', async () => {
    // userEvent.setup() installs its own clipboard stub, so define ours after
    // that call or user-event's stub wins.
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    renderPage();
    await screen.findByText('FIXLY-ABC');
    await user.click(screen.getByRole('button', { name: /نسخ الرمز/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('FIXLY-ABC'));
  });
});
