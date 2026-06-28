import { create } from 'zustand';

/* ── Dark-mode preference ──────────────────────────────────────────────────── */

export type ThemePref = 'light' | 'dark' | 'system';

interface ThemeState {
  pref: ThemePref;
  setPref: (p: ThemePref) => void;
}

const storedTheme = (typeof localStorage !== 'undefined' ? localStorage.getItem('theme') : null) as ThemePref | null;

/** Applies (or removes) the `dark` class on `<html>` and persists preference. */
function applyTheme(pref: ThemePref) {
  if (typeof document === 'undefined') return;
  const systemDark =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false;
  const isDark = pref === 'dark' || (pref === 'system' && systemDark);
  document.documentElement.classList.toggle('dark', isDark);
}

export const useTheme = create<ThemeState>((set) => ({
  pref: storedTheme ?? 'system',
  setPref(pref) {
    try {
      localStorage.setItem('theme', pref);
    } catch {
      /* ignore */
    }
    applyTheme(pref);
    set({ pref });
  },
}));

// Apply on initial load.
applyTheme(useTheme.getState().pref);

// Re-apply when system preference changes (relevant when pref === 'system').
if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    applyTheme(useTheme.getState().pref);
  });
}

/* ── Auth state ────────────────────────────────────────────────────────────── */

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
