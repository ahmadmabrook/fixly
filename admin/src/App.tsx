import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from './lib/store';
import { onAuthExpired } from './lib/api';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Bookings from './pages/Bookings';
import Technicians from './pages/Technicians';
import Payouts from './pages/Payouts';
import Customers from './pages/Customers';

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
          <Route path="payouts"     element={<Payouts />} />
          <Route path="customers"   element={<Customers />} />
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
