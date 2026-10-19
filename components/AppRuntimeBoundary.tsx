import React from 'react';

/**
 * Production rescue boundary: render useful content instead of a black screen
 * if a route, authentication provider, or lazy chunk throws during rendering.
 * This does not conceal the exception: it stays in the browser console.
 */
type Props = { children: React.ReactNode };
type State = { failed: boolean };

export default class AppRuntimeBoundary extends React.Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[InBharat] Application render failed', error, info.componentStack);
  }

  render(): React.ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <main style={{
        minHeight: '100vh', background: '#030508', color: '#e6ecf5',
        padding: '72px 24px', display: 'flex', alignItems: 'center',
        justifyContent: 'center', textAlign: 'center',
      }}>
        <div style={{ maxWidth: 650 }}>
          <a href="/" style={{ color: '#f59f4f', fontWeight: 700, textDecoration: 'none' }}>InBharat.ai</a>
          <p lang="sa" style={{ marginTop: 35, lineHeight: 2, fontSize: 19 }}>
            कर्मण्येवाधिकारस्ते मा फलेषु कदाचन ।<br />
            मा कर्मफलहेतुर्भूर्मा ते सङ्गोऽस्त्वकर्मणि ॥
          </p>
          <h1 style={{ fontSize: 30, marginTop: 30 }}>We couldn't load this page.</h1>
          <p style={{ color: '#a8bfd4', lineHeight: 1.7 }}>
            Your data has not been changed. Please try again or contact our team.
          </p>
          <div style={{ marginTop: 26, display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 14 }}>
            <a href="/?__recover=1" style={{ background: '#f59f4f', color: '#030508', fontWeight: 700, padding: '12px 20px', borderRadius: 999, textDecoration: 'none' }}>Try homepage again</a>
            <a href="/contact" style={{ color: '#f59f4f', padding: '12px 20px', textDecoration: 'none' }}>Contact</a>
          </div>
        </div>
      </main>
    );
  }
}
