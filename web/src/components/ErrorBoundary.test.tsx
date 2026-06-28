import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ErrorBoundary from './ErrorBoundary';

/** A component that throws on render so we can test the boundary. */
function ThrowingChild({ error }: { error: Error }): React.ReactNode {
  throw error;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ErrorBoundary', () => {
  it('renders children when no error is thrown', () => {
    render(
      <ErrorBoundary>
        <p>سليم</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('سليم')).toBeInTheDocument();
  });

  it('shows Arabic fallback UI when a child throws', () => {
    // Suppress React's console.error for the expected error boundary log.
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ThrowingChild error={new Error('boom')} />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('حدث خطأ غير متوقع')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'إعادة تحميل' })).toBeInTheDocument();
  });

  it('calls window.location.reload when the reload button is clicked', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const reloadMock = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadMock },
      writable: true,
    });

    const user = userEvent.setup();
    render(
      <ErrorBoundary>
        <ThrowingChild error={new Error('crash')} />
      </ErrorBoundary>,
    );

    await user.click(screen.getByRole('button', { name: 'إعادة تحميل' }));
    expect(reloadMock).toHaveBeenCalledOnce();
  });
});
