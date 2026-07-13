import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import { COLOR_BG_APP, COLOR_BRAND_PRIMARY, COLOR_TEXT_PRIMARY, COLOR_TEXT_SECONDARY, COLOR_WHITE } from '../lib/theme';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Global error boundary — catches render-time throws and shows an Arabic RTL
 * fallback instead of a white screen. Reloads on button click.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main
          dir="rtl"
          lang="ar"
          role="alert"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            padding: 24,
            fontFamily: 'system-ui, sans-serif',
            background: COLOR_BG_APP,
            textAlign: 'center',
          }}
        >
          <h1 style={{ fontSize: 22, fontWeight: 800, color: COLOR_TEXT_PRIMARY, marginBottom: 8 }}>
            حدث خطأ غير متوقع
          </h1>
          <p style={{ fontSize: 14, color: COLOR_TEXT_SECONDARY, marginBottom: 24 }}>
            نعتذر عن هذا الخلل. يرجى إعادة تحميل الصفحة.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              height: 48,
              paddingInline: 24,
              borderRadius: 12,
              background: COLOR_BRAND_PRIMARY,
              color: COLOR_WHITE,
              fontWeight: 700,
              fontSize: 15,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            إعادة تحميل
          </button>
        </main>
      );
    }

    return this.props.children;
  }
}
