import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { useAuth } from '../lib/store';
import FeatureFlags from './FeatureFlags';

function renderWithProviders(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useAuth.getState().logout();
  localStorage.clear();
});

function mockFetchWith(payload: unknown) {
  const fn = vi.fn(async () => ({ ok: true, status: 200, json: async () => payload }) as Response);
  Object.defineProperty(globalThis, 'fetch', { value: fn as unknown as typeof fetch, writable: true, configurable: true });
  return fn;
}

describe('FeatureFlags page (§0.6.1/§17.16 — read-only)', () => {
  it('renders each flag with its enabled/disabled status and prerequisite state, and no toggle control', async () => {
    useAuth.getState().setAuth('tok', { id: 'a1', name: 'A', email: 'a@b.c' });
    mockFetchWith({
      data: [
        { key: 'FEATURE_QUOTE_FIRST', enabled: false, phase: 'quote_first + materials', prerequisite: 'category ready', prerequisiteMet: false },
        { key: 'FEATURE_SUBSCRIPTIONS', enabled: true, phase: 'Protection plan (Phase 2)', prerequisite: 'manual decision', prerequisiteMet: null },
      ],
    });

    renderWithProviders(<FeatureFlags />);

    await waitFor(() => expect(screen.getByText('FEATURE_QUOTE_FIRST')).toBeInTheDocument());
    expect(screen.getByText('FEATURE_SUBSCRIPTIONS')).toBeInTheDocument();
    expect(screen.getByText('مُفعّلة')).toBeInTheDocument();
    expect(screen.getByText('معطّلة (افتراضي)')).toBeInTheDocument();
    // Read-only by design: no interactive toggle for a flag the UI can't safely flip.
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});
