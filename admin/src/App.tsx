import { useEffect, useState, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useAuth, ADMIN_PROFILE_STORAGE_KEY } from './lib/store';
import { onAuthExpired, restoreSession } from './lib/api';
import { canAccessRoute } from './lib/permissions';
import { COLOR_TEXT_MUTED, COLOR_TEXT_PRIMARY } from './lib/theme';
import Layout from './components/Layout';
import Login from './pages/Login';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Bookings = lazy(() => import('./pages/Bookings'));
const Technicians = lazy(() => import('./pages/Technicians'));
const Payouts = lazy(() => import('./pages/Payouts'));
const Customers = lazy(() => import('./pages/Customers'));
const Guarantee = lazy(() => import('./pages/Guarantee'));
const Support = lazy(() => import('./pages/Support'));
const Reports = lazy(() => import('./pages/Reports'));
const Broadcast = lazy(() => import('./pages/Broadcast'));
const Withdrawals = lazy(() => import('./pages/Withdrawals'));
const Admins = lazy(() => import('./pages/Admins'));
const Quality = lazy(() => import('./pages/Quality'));
const ConductReports = lazy(() => import('./pages/ConductReports'));
const Subscriptions = lazy(() => import('./pages/Subscriptions'));
const Quotes = lazy(() => import('./pages/Quotes'));

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { accessToken } = useAuth();
  return accessToken ? <>{children}</> : <Navigate to="/login" replace />;
}

/**
 * Frontend defense-in-depth: gates rendering of a role-restricted page by
 * the same role map the Sidebar uses to decide what to link to (see
 * lib/permissions.ts). Without this, an authenticated admin with a lower
 * privilege role (e.g. SUPPORT) could type a restricted URL — /admins,
 * /payouts, /withdrawals — directly into the address bar and land on a
 * fully-interactive page whose every request the backend then rejects with
 * 403, which is a confusing dead end rather than a clear "no access"
 * message. The backend (`requireAdminRole` on every admin route) remains
 * the actual authorization boundary; this only improves the UX around it.
 */
function RequireRole({ path, children }: { path: string; children: React.ReactNode }) {
  const role = useAuth((s) => s.admin?.role);
  if (!canAccessRoute(role, path)) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: '60vh' }}>
        <div className="text-center" style={{ maxWidth: 360 }}>
          <p style={{ fontSize: 17, fontWeight: 800, color: COLOR_TEXT_PRIMARY }}>ليست لديك صلاحية للوصول لهذه الصفحة</p>
          <p style={{ fontSize: 13, color: COLOR_TEXT_MUTED, marginTop: 8 }}>
            هذا القسم مخصص لدور آخر. تواصل مع المدير العام إذا كنت تعتقد أن هذا غير صحيح.
          </p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

/** Subscribes to api.onAuthExpired and bounces the user to /login.
 *  Must be inside a <Router> to use useNavigate. */
function AuthExpiredRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    const cb = () => navigate('/login', { replace: true });
    onAuthExpired.push(cb);
    return () => {
      const i = onAuthExpired.indexOf(cb);
      if (i >= 0) onAuthExpired.splice(i, 1);
    };
  }, [navigate]);
  return null;
}

/**
 * Inner app shell — exported separately so tests can mount it inside
 * their own <MemoryRouter> with a controlled initial path.
 */
export function AppShell() {
  // The access token lives only in memory, so on load we silently restore the
  // session from the httpOnly refresh cookie BEFORE the auth guard runs —
  // otherwise a reload would always bounce a logged-in admin to /login.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    // Only refresh if a prior session is hinted (persisted admin profile), so
    // an anonymous visitor goes straight to /login without a pointless 401.
    const hadSession = localStorage.getItem(ADMIN_PROFILE_STORAGE_KEY) !== null;
    (hadSession ? restoreSession() : Promise.resolve(false)).finally(() => {
      if (active) setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ color: COLOR_TEXT_MUTED, fontSize: 14 }}>
        جارٍ التحميل…
      </div>
    );
  }

  return (
    <>
      <AuthExpiredRedirect />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard"   element={<Dashboard />} />
          <Route path="bookings"    element={<RequireRole path="/bookings"><Bookings /></RequireRole>} />
          <Route path="technicians" element={<RequireRole path="/technicians"><Technicians /></RequireRole>} />
          <Route path="guarantee"   element={<RequireRole path="/guarantee"><Guarantee /></RequireRole>} />
          <Route path="support"     element={<RequireRole path="/support"><Support /></RequireRole>} />
          <Route path="payouts"     element={<RequireRole path="/payouts"><Payouts /></RequireRole>} />
          <Route path="withdrawals" element={<RequireRole path="/withdrawals"><Withdrawals /></RequireRole>} />
          <Route path="reports"     element={<RequireRole path="/reports"><Reports /></RequireRole>} />
          <Route path="broadcast"   element={<RequireRole path="/broadcast"><Broadcast /></RequireRole>} />
          <Route path="admins"      element={<RequireRole path="/admins"><Admins /></RequireRole>} />
          <Route path="customers"   element={<RequireRole path="/customers"><Customers /></RequireRole>} />
          <Route path="quality"     element={<RequireRole path="/quality"><Quality /></RequireRole>} />
          <Route path="conduct"     element={<RequireRole path="/conduct"><ConductReports /></RequireRole>} />
          <Route path="subscriptions" element={<RequireRole path="/subscriptions"><Subscriptions /></RequireRole>} />
          <Route path="quotes"      element={<RequireRole path="/quotes"><Quotes /></RequireRole>} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}
