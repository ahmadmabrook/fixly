import { create } from 'zustand';

export type AdminRole = 'SUPER_ADMIN' | 'OPS' | 'FINANCE' | 'SUPPORT';

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role?: AdminRole;
}

interface AuthState {
  accessToken: string | null;
  admin: AdminUser | null;
  setAuth: (token: string, admin: AdminUser) => void;
  logout: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  // Access token in memory only (never localStorage); restored on load via the
  // httpOnly refresh cookie. Only the non-credential admin profile is persisted
  // so the shell can render name/email immediately on reload.
  accessToken: null,
  admin: (() => {
    try {
      const raw = localStorage.getItem('admin_user');
      return raw ? (JSON.parse(raw) as AdminUser) : null;
    } catch {
      return null;
    }
  })(),
  setAuth(token, admin) {
    localStorage.setItem('admin_user', JSON.stringify(admin));
    set({ accessToken: token, admin });
  },
  logout() {
    localStorage.removeItem('admin_user');
    set({ accessToken: null, admin: null });
  },
}));
