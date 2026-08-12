import type { AdminRole } from './store';

/**
 * Single source of truth for which admin roles may reach which route.
 * `roles: undefined` = unrestricted (every authenticated admin, e.g.
 * dashboard). `roles: []` = SUPER_ADMIN only. Otherwise SUPER_ADMIN always
 * passes and everyone else needs an exact role match — least privilege.
 *
 * Consumed by:
 *  - Sidebar, to decide which links to show (icons/labels live there).
 *  - RequireRole (App.tsx), to gate which routes actually render — so a
 *    lower-privileged admin who navigates straight to a URL the sidebar
 *    would hide sees a clear "no access" screen instead of a fully wired
 *    page whose every action then fails with a 403.
 *
 * The backend remains the real authority: every admin endpoint re-checks
 * the role server-side (see backend/src/interface/http/routes/admin*.ts,
 * `requireAdminRole`). This map only prevents the *frontend* from serving
 * an interactive page for actions the server would reject anyway
 * (defense-in-depth / UX, not the security boundary itself).
 */
export interface AdminRouteEntry {
  to: string;
  labelAr: string;
  roles?: AdminRole[];
}

export const ADMIN_ROUTES: readonly AdminRouteEntry[] = [
  { to: '/dashboard', labelAr: 'لوحة التحكم' },
  { to: '/bookings', labelAr: 'الحجوزات', roles: ['OPS'] },
  { to: '/technicians', labelAr: 'الفنيون', roles: ['OPS'] },
  { to: '/quality', labelAr: 'الجودة والثقة', roles: ['OPS'] },
  { to: '/conduct', labelAr: 'بلاغات السلوك', roles: ['OPS'] },
  { to: '/quotes', labelAr: 'طلبات التسعير', roles: ['OPS'] },
  { to: '/materials', labelAr: 'كتالوج المواد', roles: ['OPS'] },
  { to: '/materials-review', labelAr: 'مراجعة المواد', roles: ['OPS'] },
  { to: '/verifications', labelAr: 'نزاعات الأسعار', roles: ['OPS'] },
  { to: '/suppliers', labelAr: 'الموردون', roles: ['OPS'] },
  { to: '/price-index', labelAr: 'مؤشر الأسعار', roles: ['OPS', 'FINANCE'] },
  { to: '/category-readiness', labelAr: 'جاهزية الفئات', roles: ['OPS'] },
  { to: '/guarantee', labelAr: 'الضمان', roles: ['OPS'] },
  { to: '/subscriptions', labelAr: 'الاشتراكات', roles: ['OPS', 'FINANCE'] },
  { to: '/support', labelAr: 'الدعم', roles: ['SUPPORT'] },
  { to: '/customers', labelAr: 'العملاء', roles: ['OPS', 'SUPPORT'] },
  { to: '/payouts', labelAr: 'المدفوعات', roles: ['FINANCE'] },
  { to: '/withdrawals', labelAr: 'طلبات السحب', roles: ['FINANCE'] },
  { to: '/reports', labelAr: 'التقارير', roles: ['FINANCE'] },
  { to: '/broadcast', labelAr: 'إشعارات جماعية', roles: ['OPS'] },
  { to: '/admins', labelAr: 'المسؤولون', roles: [] },
  { to: '/feature-flags', labelAr: 'مفاتيح الميزات', roles: [] },
  { to: '/approvals', labelAr: 'موافقات المؤسس', roles: ['OPS'] },
];

/** Least-privilege role check shared by Sidebar (nav visibility) and
 *  RequireRole (route rendering) — see module doc above. */
export function canAccessRoles(role: AdminRole | undefined, roles?: AdminRole[]): boolean {
  if (!roles) return true; // unrestricted (e.g. dashboard)
  if (role === 'SUPER_ADMIN') return true;
  if (!role) return false; // unknown role → least privilege
  return roles.includes(role);
}

/** Roles allowed for a given path, or undefined if the path isn't in the
 *  admin nav map (defaults to unrestricted, same as `roles: undefined`). */
export function rolesForPath(path: string): AdminRole[] | undefined {
  return ADMIN_ROUTES.find((r) => r.to === path)?.roles;
}

export function canAccessRoute(role: AdminRole | undefined, path: string): boolean {
  return canAccessRoles(role, rolesForPath(path));
}
