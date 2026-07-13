import { Suspense } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import Sidebar from './Sidebar';
import Header from './Header';
import { useAuth } from '../lib/store';
import { COLOR_APP_BACKGROUND, COLOR_TEXT_MUTED } from '../lib/theme';

export default function Layout() {
  const { accessToken } = useAuth();

  if (!accessToken) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex min-h-screen" style={{ background: COLOR_APP_BACKGROUND }}>
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          <Suspense fallback={<div style={{ padding: 48, textAlign: 'center', color: COLOR_TEXT_MUTED, fontSize: 14 }}>جارٍ التحميل…</div>}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      <Toaster position="top-center" richColors />
    </div>
  );
}
