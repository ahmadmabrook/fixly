import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';

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
            background: '#F6F8FB',
            textAlign: 'center',
          }}
        >
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', marginBottom: 8 }}>
            حدث خطأ غير متوقع
          </h1>
          <p style={{ fontSize: 14, color: '#475569', marginBottom: 24 }}>
            نعتذر عن هذا الخلل. يرجى إعادة تحميل الصفحة.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              height: 48,
              paddingInline: 24,
              borderRadius: 12,
              background: '#1366D6',
              color: '#FFF',
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
