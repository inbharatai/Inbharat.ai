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
const LearnAIWithReeturaj = lazy(() => import('./pages/LearnAIWithReeturaj.tsx'));
const ArticlePage = lazy(() => import('./pages/ArticlePage.tsx'));
const NotFound = lazy(() => import('./pages/NotFound.tsx'));

// InBharat Growth Agent admin (audit-only). Client-gated by RequireAdmin;
// real enforcement is server-side in api/lib/requireAdmin.ts. Excluded from
// the public sitemap (not listed in seo.config ROUTES) + forces noindex.
const AdminGrowthLayout = lazy(() => import('./pages/admin/growth/AdminGrowthLayout.tsx'));
const GrowthOverview = lazy(() => import('./pages/admin/growth/Overview.tsx'));
const GrowthUsage = lazy(() => import('./pages/admin/growth/Usage.tsx'));
const GrowthSites = lazy(() => import('./pages/admin/growth/Sites.tsx'));
const GrowthRepos = lazy(() => import('./pages/admin/growth/Repos.tsx'));
const GrowthIssues = lazy(() => import('./pages/admin/growth/Issues.tsx'));
const GrowthPerformance = lazy(() => import('./pages/admin/growth/Performance.tsx'));
const GrowthSettings = lazy(() => import('./pages/admin/growth/Settings.tsx'));
const GrowthRules = lazy(() => import('./pages/admin/growth/Rules.tsx'));
const GrowthInbox = lazy(() => import('./pages/admin/growth/Inbox.tsx'));
const GrowthKnowledge = lazy(() => import('./pages/admin/growth/Knowledge.tsx'));
const GrowthLearning = lazy(() => import('./pages/admin/growth/Learning.tsx'));
const GrowthStrategy = lazy(() => import('./pages/admin/growth/Strategy.tsx'));
const GrowthAgent = lazy(() => import('./pages/admin/growth/Agent.tsx'));

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
            <Route path="/learn-ai-with-reeturaj" element={<LearnAIWithReeturaj />} />
            <Route path="/learn-ai-with-reeturaj/:slug" element={<ArticlePage />} />
            <Route path="/admin/growth" element={<AdminGrowthLayout />}>
              <Route index element={<GrowthOverview />} />
              <Route path="usage" element={<GrowthUsage />} />
              <Route path="sites" element={<GrowthSites />} />
              <Route path="repos" element={<GrowthRepos />} />
              <Route path="issues" element={<GrowthIssues />} />
              <Route path="performance" element={<GrowthPerformance />} />
              <Route path="settings" element={<GrowthSettings />} />
              <Route path="rules" element={<GrowthRules />} />
              <Route path="inbox" element={<GrowthInbox />} />
              <Route path="knowledge" element={<GrowthKnowledge />} />
              <Route path="learning" element={<GrowthLearning />} />
              <Route path="strategy" element={<GrowthStrategy />} />
              <Route path="agent" element={<GrowthAgent />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>,
);
