import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useAuth, type AdminRole } from '../lib/store';
import Sidebar from './Sidebar';

function renderSidebar() {
  return render(
    <MemoryRouter>
      <Sidebar />
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
