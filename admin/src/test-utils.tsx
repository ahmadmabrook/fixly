import { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, MemoryRouterProps } from 'react-router-dom';

/**
 * Standard render helper for admin tests. Wraps the tree in:
 *  - MemoryRouter (with optional initialEntries / initialIndex)
 *  - QueryClientProvider (so useQuery / useMutation work)
 * Each test gets a fresh QueryClient so cache state doesn't leak.
 */
export function renderWithProviders(
  ui: ReactNode,
  opts: { routerProps?: MemoryRouterProps } = {},
) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter {...opts.routerProps}>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}
