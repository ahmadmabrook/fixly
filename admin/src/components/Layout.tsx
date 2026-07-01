import { Suspense } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import Sidebar from './Sidebar';
import { useAuth } from '../lib/store';

export default function Layout() {
  const { accessToken } = useAuth();

  if (!accessToken) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex min-h-screen" style={{ background: '#F6F8FB' }}>
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-6 lg:p-8">
        <Suspense fallback={<div style={{ padding: 48, textAlign: 'center', color: '#64748B', fontSize: 14 }}>جارٍ التحميل…</div>}>
          <Outlet />
        </Suspense>
      </main>
      <Toaster position="top-center" richColors />
    </div>
  );
}
