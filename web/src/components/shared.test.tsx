import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PriceBadge, StatusBadge, ServiceIcon, Modal } from './shared';

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

describe('Modal', () => {
  it('renders an accessible dialog labelled by its title', () => {
    render(<Modal title="عنوان" onClose={vi.fn()}><p>محتوى</p></Modal>);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    // aria-labelledby points at the rendered title.
    const labelId = dialog.getAttribute('aria-labelledby');
    expect(screen.getByText('عنوان').id).toBe(labelId);
  });

  it('closes on Escape (focus-trapped dialog)', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Modal title="عنوان" onClose={onClose}><button>زر</button></Modal>);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on backdrop click but not on content click', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Modal title="عنوان" onClose={onClose}><button>زر</button></Modal>);
    await user.click(screen.getByText('زر'));
    expect(onClose).not.toHaveBeenCalled();
    // The backdrop is the dialog's parent element.
    await user.click(screen.getByRole('dialog').parentElement!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
