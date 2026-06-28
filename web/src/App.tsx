import { useState, useCallback, useEffect, lazy, Suspense } from 'react';
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
import AuthModal from './components/AuthModal';
import ErrorBoundary from './components/ErrorBoundary';

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
const TechPortal = lazy(() => import('./pages/tech/TechPortal'));

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

type ModalState =
  | { open: false }
  | { open: true; returnTo: string };

/**
 * Deep-linkable customer shell. Routes:
 *  /                — landing
 *  /services        — catalog
 *  /services/:id    — service details (deep-linkable, shareable)
 *  /services/:id/book — booking form
 *  /my-bookings     — authenticated customer's bookings
 *
 * `BookingSocketProvider` is mounted here so every route can subscribe
 * to its own booking's live status updates.
 */
export default function App() {
  const [modal, setModal] = useState<ModalState>({ open: false });
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

  const openLoginModal = useCallback((returnTo: string) => {
    setModal({ open: true, returnTo });
  }, []);

  const closeModal = useCallback(() => setModal({ open: false }), []);

  return (
    <BrowserRouter>
      <BookingSocketProvider>
        <div dir={dir} className="min-h-screen" style={{ background: '#F6F8FB' }}>
          <TopNav authed={authed} onLogin={() => openLoginModal('/services')} onLogout={() => void apiLogout()} />

          <ErrorBoundary>
            <Suspense fallback={<RouteSpinner />}>
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/services" element={<Catalog />} />
                <Route
                  path="/services/:id"
                  element={<ServiceRoute onRequireLogin={openLoginModal} />}
                />
                <Route
                  path="/services/:id/book"
                  element={<BookingRoute onRequireLogin={openLoginModal} />}
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
                  path="/tech"
                  element={authed ? <TechPortal /> : <Navigate to="/" replace />}
                />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>

          <Footer />

          {modal.open && (
            <AuthModal
              onClose={closeModal}
              onSuccess={() => {
                const target = modal.returnTo;
                closeModal();
                window.location.assign(target);
              }}
            />
          )}
        </div>

        <Toaster position="top-center" richColors />
      </BookingSocketProvider>
    </BrowserRouter>
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
  // Open the login modal as a side effect — never call a parent's setState
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
