import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PriceBadge, StatusBadge, ServiceIcon } from './shared';

describe('PriceBadge', () => {
  it('renders the amount with the JOD label', () => {
    render(<PriceBadge amount={20} />);
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText('دينار')).toBeInTheDocument();
  });
});

describe('StatusBadge', () => {
  it('maps a known status to its Arabic label', () => {
    render(<StatusBadge status="PENDING" />);
    expect(screen.getByText('بانتظار الدفع')).toBeInTheDocument();
  });

  it('maps EN_ROUTE to the on-the-way label', () => {
    render(<StatusBadge status="EN_ROUTE" />);
    expect(screen.getByText('الفني في الطريق')).toBeInTheDocument();
  });

  it('falls back to the raw status for unknown values', () => {
    render(<StatusBadge status="WEIRD" />);
    expect(screen.getByText('WEIRD')).toBeInTheDocument();
  });
});

describe('ServiceIcon', () => {
  it('renders without crashing when given an Arabic service name', () => {
    const { container } = render(<ServiceIcon nameAr="كهرباء" />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
