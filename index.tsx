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
const GrowthCockpit = lazy(() => import('./pages/admin/growth/Cockpit.tsx'));
const GrowthOverview = lazy(() => import('./pages/admin/growth/Overview.tsx'));
const GrowthUsage = lazy(() => import('./pages/admin/growth/Usage.tsx'));
const GrowthSites = lazy(() => import('./pages/admin/growth/Sites.tsx'));
const GrowthRepos = lazy(() => import('./pages/admin/growth/Repos.tsx'));
const GrowthIssues = lazy(() => import('./pages/admin/growth/Issues.tsx'));
const GrowthPerformance = lazy(() => import('./pages/admin/growth/Performance.tsx'));
const GrowthSettings = lazy(() => import('./pages/admin/growth/Settings.tsx'));
const GrowthRules = lazy(() => import('./pages/admin/growth/Rules.tsx'));
const GrowthInbox = lazy(() => import('./pages/admin/growth/Inbox.tsx'));
const GrowthIntelligence = lazy(() => import('./pages/admin/growth/Intelligence.tsx'));
const GrowthKnowledge = lazy(() => import('./pages/admin/growth/Knowledge.tsx'));
const GrowthLearning = lazy(() => import('./pages/admin/growth/Learning.tsx'));
const GrowthStrategy = lazy(() => import('./pages/admin/growth/Strategy.tsx'));
const GrowthAgent = lazy(() => import('./pages/admin/growth/Agent.tsx'));

// Single source of truth for the admin child routes (lib/growth/adminRoutes.ts).
// The router, the nav rail, and the SEO noindex shells all derive from this one
// list — adding a child means adding one entry there, not syncing three files.
import { ADMIN_GROWTH_CHILDREN } from './lib/growth/adminRoutes';
const ADMIN_GROWTH_COMPONENTS: Record<string, React.ComponentType> = {
  '': GrowthCockpit,
  overview: GrowthOverview,
  usage: GrowthUsage,
  sites: GrowthSites,
  repos: GrowthRepos,
  issues: GrowthIssues,
  performance: GrowthPerformance,
  settings: GrowthSettings,
  rules: GrowthRules,
  inbox: GrowthInbox,
  intelligence: GrowthIntelligence,
  knowledge: GrowthKnowledge,
  learning: GrowthLearning,
  strategy: GrowthStrategy,
  agent: GrowthAgent,
};
// DEV guard: if a child segment is added to ADMIN_GROWTH_CHILDREN without a
// matching component here, surface it loudly instead of rendering a blank route.
if (import.meta.env?.DEV) {
  for (const c of ADMIN_GROWTH_CHILDREN) {
    if (!ADMIN_GROWTH_COMPONENTS[c.segment]) {
      // eslint-disable-next-line no-console
      console.error(`[admin routes] missing component for segment "${c.segment}" — add it to ADMIN_GROWTH_COMPONENTS in index.tsx`);
    }
  }
}

/** Resolves a shared admin child segment to its lazy component. JSX can't take a
 *  subscript expression as a tag directly, so this wrapper does the lookup. Falls
 *  back to NotFound if a segment is added to the shared list without a component
 *  (the DEV guard above also logs it). */
const AdminChild: React.FC<{ segment: string }> = ({ segment }) => {
  const Comp = ADMIN_GROWTH_COMPONENTS[segment] ?? NotFound;
  return <Comp />;
};

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
              {ADMIN_GROWTH_CHILDREN.map((c) =>
                c.segment === '' ? (
                  <Route key="__index__" index element={<AdminChild segment="" />} />
                ) : (
                  <Route key={c.segment} path={c.segment} element={<AdminChild segment={c.segment} />} />
                ),
              )}
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>,
);
