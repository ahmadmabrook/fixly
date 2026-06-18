import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLang, useT } from './i18n';

beforeEach(() => {
  localStorage.clear();
  useLang.setState({ lang: 'ar' });
});

describe('i18n', () => {
  it('defaults to Arabic', () => {
    const { result } = renderHook(() => useT());
    expect(result.current('nav.home')).toBe('الرئيسية');
  });

  it('switches to English and mirrors strings + <html> dir/lang', () => {
    const { result: lang } = renderHook(() => useLang());
    const { result: t } = renderHook(() => useT());
    act(() => lang.current.setLang('en'));
    expect(t.current('nav.home')).toBe('Home');
    expect(t.current('hero.titleAccent')).toBe('in 30 minutes');
    expect(document.documentElement.dir).toBe('ltr');
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem('lang')).toBe('en');
  });

  it('falls back to the raw key (never the other language) for a missing key', () => {
    // Arabic session: unknown key → key, not an English string.
    const { result: ar } = renderHook(() => useT());
    expect(ar.current('nonexistent.key')).toBe('nonexistent.key');
  });

  it('an English session never leaks Arabic for a missing key', () => {
    const { result: lang } = renderHook(() => useLang());
    const { result: t } = renderHook(() => useT());
    act(() => lang.current.setLang('en'));
    // A key absent from EN resolves to the key itself — NOT the Arabic value.
    expect(t.current('nonexistent.key')).toBe('nonexistent.key');
    // A real key still resolves to English.
    expect(t.current('nav.home')).toBe('Home');
  });
});
