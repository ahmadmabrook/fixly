import { create } from 'zustand';

interface AdminUser {
  id: string;
  name: string;
  email: string;
}

interface AuthState {
  accessToken: string | null;
  admin: AdminUser | null;
  setAuth: (token: string, admin: AdminUser) => void;
  logout: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  accessToken: localStorage.getItem('admin_access_token'),
  admin: (() => {
    try {
      const raw = localStorage.getItem('admin_user');
      return raw ? (JSON.parse(raw) as AdminUser) : null;
    } catch {
      return null;
    }
  })(),
  setAuth(token, admin) {
    localStorage.setItem('admin_access_token', token);
    localStorage.setItem('admin_user', JSON.stringify(admin));
    set({ accessToken: token, admin });
  },
  logout() {
    localStorage.removeItem('admin_access_token');
    localStorage.removeItem('admin_user');
    set({ accessToken: null, admin: null });
  },
}));
