import { create } from 'zustand';

export type AdminRole = 'SUPER_ADMIN' | 'OPS' | 'FINANCE' | 'SUPPORT';

/**
 * localStorage key holding the persisted (non-credential) admin profile.
 * Single source of truth — the store reads/writes it and App.tsx reads it as
 * the "a session may exist" hint before attempting a silent refresh. Never
 * store the access token here; it stays in memory only.
 */
export const ADMIN_PROFILE_STORAGE_KEY = 'admin_user';

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
      const raw = localStorage.getItem(ADMIN_PROFILE_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as AdminUser) : null;
    } catch {
      return null;
    }
  })(),
  setAuth(token, admin) {
    localStorage.setItem(ADMIN_PROFILE_STORAGE_KEY, JSON.stringify(admin));
    set({ accessToken: token, admin });
  },
  logout() {
    localStorage.removeItem(ADMIN_PROFILE_STORAGE_KEY);
    set({ accessToken: null, admin: null });
  },
}));
