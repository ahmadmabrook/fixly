import { create } from 'zustand';

interface AuthState {
  /** Access token — kept in memory only (never localStorage) so an XSS payload
   *  can't read it. Restored on load via the httpOnly refresh cookie. */
  accessToken: string | null;
  /** Non-sensitive UI hint (which nav to show); safe to persist. */
  role: string | null;
  setTokens: (access: string, role: string) => void;
  logout: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  accessToken: null,
  role: localStorage.getItem('role'),
  setTokens(access, role) {
    localStorage.setItem('role', role);
    set({ accessToken: access, role });
  },
  logout() {
    localStorage.removeItem('role');
    // Defensive: scrub any refresh token persisted by older app versions so a
    // stale, JS-readable credential can't linger in the browser after logout.
    localStorage.removeItem('refresh_token');
    set({ accessToken: null, role: null });
  },
}));
