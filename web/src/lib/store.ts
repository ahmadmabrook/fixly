import { create } from 'zustand';

interface AuthState {
  accessToken: string | null;
  role: string | null;
  setTokens: (access: string, role: string) => void;
  logout: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  accessToken: localStorage.getItem('access_token'),
  role: localStorage.getItem('role'),
  setTokens(access, role) {
    localStorage.setItem('access_token', access);
    localStorage.setItem('role', role);
    set({ accessToken: access, role });
  },
  logout() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('role');
    localStorage.removeItem('refresh_token');
    set({ accessToken: null, role: null });
  },
}));
