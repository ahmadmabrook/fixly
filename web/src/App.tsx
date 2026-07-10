import { useEffect, lazy, Suspense } from 'react';
import {
  BrowserRouter, Routes, Route, Navigate, useNavigate, useParams,
} from 'react-router-dom';
import { Toaster } from 'sonner';
import { useAuth } from './lib/store';
import { useLang } from './lib/i18n';
import { restoreSession, logout as apiLogout } from './lib/api';
import { BookingSocketProvider } from './lib/socket-provider';
import TopNav from './components/TopNav';
import Footer from './components/Footer';
import ErrorBoundary from './components/ErrorBoundary';
import OnboardingSplash from './components/OnboardingSplash';
import { OfflineBanner } from './components/shared';

/* ── Route-level code splitting ─────────────────────────────────────────────── */
const Landing = lazy(() => import('./pages/Landing'));
const Catalog = lazy(() => import('./pages/Catalog'));
const ServicePage = lazy(() => import('./pages/ServicePage'));
const BookingPage = lazy(() => import('./pages/BookingPage'));
const PaymentReturn = lazy(() => import('./pages/PaymentReturn'));
const MyBookings = lazy(() => import('./pages/MyBookings'));
const BookingDetail = lazy(() => import('./pages/BookingDetail'));
const TrackingPage = lazy(() => import('./pages/TrackingPage'));
const GuaranteePage = lazy(() => import('./pages/GuaranteePage'));
const Account = lazy(() => import('./pages/Account'));
const ReferralPage = lazy(() => import('./pages/ReferralPage'));
const QuotesPage = lazy(() => import('./pages/QuotesPage'));
const TechPortal = lazy(() => import('./pages/tech/TechPortal'));
const LoginPage = lazy(() => import('./pages/LoginPage'));

/** Centered spinner shown while a lazy route chunk loads. */
function RouteSpinner() {
  return (
    <div className="flex items-center justify-center" style={{ minHeight: 240 }}>
      <div
        className="animate-spin rounded-full"
        style={{ width: 32, height: 32, border: '3px solid #E2E8F0', borderTopColor: '#1366D6' }}
        role="status"
        aria-label="جارٍ التحميل"
      />
    </div>
  );
}

/**
 * Deep-linkable customer shell. Routes:
 *  /                — landing
 *  /login           — sign-in (?returnTo= where to land after success)
 *  /services        — catalog
 *  /services/:id    — service details (deep-linkable, shareable)
 *  /services/:id/book — booking form
 *  /my-bookings     — authenticated customer's bookings
 *
 * `BookingSocketProvider` is mounted here so every route can subscribe
 * to its own booking's live status updates.
 */
export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}

function AppShell() {
  const navigate = useNavigate();
  const accessToken = useAuth((s) => s.accessToken);
  const authed = !!accessToken;
  const lang = useLang((s) => s.lang);
  const dir = lang === 'ar' ? 'rtl' : 'ltr';

  // Keep <html dir/lang> in sync with the chosen language (set on load too, not
  // just on toggle, so a persisted 'en' applies before any interaction).
  useEffect(() => {
    document.documentElement.dir = dir;
    document.documentElement.lang = lang;
  }, [dir, lang]);

  // On load the access token lives only in memory (gone after a reload), so
  // silently re-establish the session from the httpOnly refresh cookie — but
  // only if we previously had one (role hint), so anonymous visitors don't
  // fire a pointless refresh/401 on every page load.
  useEffect(() => {
    if (localStorage.getItem('role')) void restoreSession();
  }, []);

  function requireLogin(returnTo: string) {
    navigate(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  }

  return (
    <BookingSocketProvider>
      <div dir={dir} className="min-h-screen" style={{ background: '#F6F8FB' }}>
        <OfflineBanner />
        <OnboardingSplash />
        <TopNav authed={authed} onLogin={() => requireLogin('/services')} onLogout={() => void apiLogout()} />

        <ErrorBoundary>
          <Suspense fallback={<RouteSpinner />}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/services" element={<Catalog />} />
              <Route
                path="/services/:id"
                element={<ServiceRoute onRequireLogin={requireLogin} />}
              />
              <Route
                path="/services/:id/book"
                element={<BookingRoute onRequireLogin={requireLogin} />}
              />
              <Route
                path="/payment/return"
                element={authed ? <PaymentReturn /> : <Navigate to="/" replace />}
              />
              <Route
                path="/my-bookings"
                element={authed ? <MyBookings /> : <Navigate to="/" replace />}
              />
              <Route
                path="/bookings/:id"
                element={authed ? <BookingDetail /> : <Navigate to="/" replace />}
              />
              <Route
                path="/bookings/:id/track"
                element={authed ? <TrackingPage /> : <Navigate to="/" replace />}
              />
              <Route
                path="/guarantee"
                element={authed ? <GuaranteePage /> : <Navigate to="/" replace />}
              />
              <Route
                path="/account"
                element={authed ? <Account /> : <Navigate to="/" replace />}
              />
              <Route
                path="/referral"
                element={authed ? <ReferralPage /> : <Navigate to="/" replace />}
              />
              <Route
                path="/quotes"
                element={authed ? <QuotesPage /> : <Navigate to="/" replace />}
              />
              <Route
                path="/tech"
                element={authed ? <TechPortal /> : <Navigate to="/" replace />}
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>

        <Footer />
      </div>

      <Toaster position="top-center" richColors />
    </BookingSocketProvider>
  );
}

function ServiceRoute({ onRequireLogin }: { onRequireLogin: (returnTo: string) => void }) {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  return (
    <ServicePage
      serviceId={id}
      onBook={() => {
        if (!useAuth.getState().accessToken) {
          onRequireLogin(`/services/${id}/book`);
          return;
        }
        navigate(`/services/${id}/book`);
      }}
      onBack={() => navigate('/services')}
    />
  );
}

function BookingRoute({ onRequireLogin }: { onRequireLogin: (returnTo: string) => void }) {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  // Subscribe to auth state so this re-renders on login/logout.
  const accessToken = useAuth((s) => s.accessToken);
  // Navigate to /login as a side effect — never call a parent's setState
  // during render (React warns and it can cause cross-component update bugs).
  useEffect(() => {
    if (!accessToken) onRequireLogin(`/services/${id}/book`);
  }, [accessToken, id, onRequireLogin]);

  if (!accessToken) {
    return (
      <main className="max-w-[1200px] mx-auto px-6 py-16 text-center">
        <p style={{ color: '#475569', fontSize: 16 }}>سجّل دخولك لإكمال الحجز.</p>
      </main>
    );
  }
  return (
    <BookingPage
      serviceId={id}
      onBack={() => navigate(`/services/${id}`)}
      onDone={() => navigate('/my-bookings')}
    />
  );
}
