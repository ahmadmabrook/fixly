import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { useAuth, type AdminRole } from '../lib/store';
import Sidebar from './Sidebar';

function renderSidebar(props?: { open?: boolean; onClose?: () => void }) {
  return render(
    <MemoryRouter>
      <Sidebar {...props} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useAuth.getState().logout();
  localStorage.clear();
});

function login(role?: AdminRole) {
  useAuth.getState().setAuth('tok', { id: 'a1', name: 'A', email: 'a@b.c', role });
}

describe('Sidebar RBAC (least privilege)', () => {
  it('SUPER_ADMIN sees every section including المسؤولون', () => {
    login('SUPER_ADMIN');
    renderSidebar();
    expect(screen.getByText('المسؤولون')).toBeInTheDocument();
    expect(screen.getByText('المدفوعات')).toBeInTheDocument();
    expect(screen.getByText('الدعم')).toBeInTheDocument();
  });

  it('FINANCE sees finance sections but not OPS/SUPPORT-only or المسؤولون', () => {
    login('FINANCE');
    renderSidebar();
    expect(screen.getByText('المدفوعات')).toBeInTheDocument();
    expect(screen.getByText('طلبات السحب')).toBeInTheDocument();
    expect(screen.queryByText('الفنيون')).not.toBeInTheDocument();
    expect(screen.queryByText('المسؤولون')).not.toBeInTheDocument();
  });

  it('an unknown role sees ONLY unrestricted items (never المسؤولون or finance)', () => {
    login(undefined);
    renderSidebar();
    // Dashboard is unrestricted → visible.
    expect(screen.getByText('لوحة التحكم')).toBeInTheDocument();
    // Privileged sections must be hidden under least privilege.
    expect(screen.queryByText('المسؤولون')).not.toBeInTheDocument();
    expect(screen.queryByText('المدفوعات')).not.toBeInTheDocument();
    expect(screen.queryByText('الفنيون')).not.toBeInTheDocument();
  });
});

describe('Sidebar founder-mobile responsive drawer', () => {
  it('anchors to the inline-START side (right, in this RTL app) — regression guard: inset-inline-END resolves to the LEFT in RTL and would leave the closed drawer only partially off-screen', () => {
    login('SUPER_ADMIN');
    renderSidebar({ open: false });
    const aside = document.querySelector('aside')!;
    expect(aside.className).toContain('start-0');
    expect(aside.className).not.toContain('end-0');
    expect(aside.className).toContain('translate-x-full');
  });

  it('renders no backdrop and a closed transform when open=false (default)', () => {
    login('SUPER_ADMIN');
    renderSidebar();
    expect(document.querySelector('.fixed.inset-0')).not.toBeInTheDocument();
  });

  it('renders a backdrop when open=true, and clicking it calls onClose', async () => {
    login('SUPER_ADMIN');
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderSidebar({ open: true, onClose });

    const aside = document.querySelector('aside')!;
    expect(aside.className).toContain('translate-x-0');

    const backdrop = document.querySelector('.fixed.inset-0')!;
    expect(backdrop).toBeInTheDocument();
    await user.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes the drawer when a nav link is clicked (founder taps through to an approval queue)', async () => {
    login('SUPER_ADMIN');
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderSidebar({ open: true, onClose });

    await user.click(screen.getByText('مراجعة المواد'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
