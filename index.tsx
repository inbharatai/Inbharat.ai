import React, { Suspense, lazy, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import App from './App.tsx';
import Landing from './pages/Landing.tsx';
import './index.css';
import './lib/i18n';
import { AuthProvider } from './lib/auth.tsx';
import { trackPageView } from './lib/analytics';
import { useDocumentHead } from './lib/useDocumentHead';

const About = lazy(() => import('./pages/About.tsx'));
const Contact = lazy(() => import('./pages/Contact.tsx'));
const Privacy = lazy(() => import('./pages/Privacy.tsx'));
const Terms = lazy(() => import('./pages/Terms.tsx'));
const NotFound = lazy(() => import('./pages/NotFound.tsx'));

const StaticLoader: React.FC = () => (
  <div className="flex min-h-screen items-center justify-center bg-[#030508] text-[#9aafc6]" aria-live="polite">
    <span className="text-[12px] font-semibold uppercase tracking-[0.3em]">Loading…</span>
  </div>
);

/** Runs once per route change: updates SEO + fires analytics page view. */
const RouteEffects: React.FC = () => {
  const { pathname, search } = useLocation();
  useDocumentHead();
  useEffect(() => {
    trackPageView(pathname + search);
  }, [pathname, search]);
  return null;
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <AuthProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <RouteEffects />
        <Suspense fallback={<StaticLoader />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/app" element={<App />} />
            <Route path="/about" element={<About />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>,
);
