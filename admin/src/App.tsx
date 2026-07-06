import { useEffect, useState, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from './lib/store';
import { onAuthExpired, restoreSession } from './lib/api';
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
    const hadSession = localStorage.getItem('admin_user') !== null;
    (hadSession ? restoreSession() : Promise.resolve(false)).finally(() => {
      if (active) setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ color: '#64748B', fontSize: 14 }}>
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
          <Route path="bookings"    element={<Bookings />} />
          <Route path="technicians" element={<Technicians />} />
          <Route path="guarantee"   element={<Guarantee />} />
          <Route path="support"     element={<Support />} />
          <Route path="payouts"     element={<Payouts />} />
          <Route path="withdrawals" element={<Withdrawals />} />
          <Route path="reports"     element={<Reports />} />
          <Route path="broadcast"   element={<Broadcast />} />
          <Route path="admins"      element={<Admins />} />
          <Route path="customers"   element={<Customers />} />
          <Route path="quality"     element={<Quality />} />
          <Route path="conduct"     element={<ConductReports />} />
          <Route path="subscriptions" element={<Subscriptions />} />
          <Route path="quotes"      element={<Quotes />} />
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
