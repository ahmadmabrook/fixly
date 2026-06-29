import { create } from 'zustand';

/* ── Dark-mode preference ──────────────────────────────────────────────────── */

export type ThemePref = 'light' | 'dark' | 'system';

interface ThemeState {
  pref: ThemePref;
  /** Resolved appearance after applying the system preference. Subscribers
   *  (e.g. the nav toggle) read this so the UI re-renders when the OS theme
   *  changes while pref === 'system'. */
  isDark: boolean;
  setPref: (p: ThemePref) => void;
}

const storedTheme = (typeof localStorage !== 'undefined' ? localStorage.getItem('theme') : null) as ThemePref | null;

function systemPrefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

/** Resolves whether the given preference should render dark right now. */
export function resolveIsDark(pref: ThemePref): boolean {
  return pref === 'dark' || (pref === 'system' && systemPrefersDark());
}

/** Applies (or removes) the `dark` class on `<html>`. */
function applyTheme(pref: ThemePref): boolean {
  const isDark = resolveIsDark(pref);
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('dark', isDark);
  }
  return isDark;
}

export const useTheme = create<ThemeState>((set) => ({
  pref: storedTheme ?? 'system',
  isDark: resolveIsDark(storedTheme ?? 'system'),
  setPref(pref) {
    try {
      localStorage.setItem('theme', pref);
    } catch {
      /* ignore */
    }
    set({ pref, isDark: applyTheme(pref) });
  },
}));

// Apply on initial load (synchronous, before first paint → no FOUC).
applyTheme(useTheme.getState().pref);

// Re-apply when system preference changes (relevant when pref === 'system').
// A single named listener is registered once; it updates the store so
// `isDark` subscribers re-render. (Guarded so HMR re-imports don't stack it.)
if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const onSystemThemeChange = () => {
    const { pref } = useTheme.getState();
    useTheme.setState({ isDark: applyTheme(pref) });
  };
  mq.removeEventListener('change', onSystemThemeChange);
  mq.addEventListener('change', onSystemThemeChange);
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
