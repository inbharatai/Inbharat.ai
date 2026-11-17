/** Build-only renderer: uses the real landing tree and its real providers.
 * Node/tsx does not expose Vite's import.meta.env; AuthProvider starts anonymous,
 * and React server rendering never runs its session/auth effects. No browser
 * shims, session lookup, secret configuration, or network access is needed.
 * Keep this module out of the client entry (react-dom/server is build-only).
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import { AuthProvider } from '../../lib/auth';
import i18n from '../../lib/i18n';
import Landing from '../../pages/Landing';

export async function renderStaticLanding(): Promise<string> {
  // The canonical route is English. Browser language selection remains the
  // existing runtime behavior; it must not personalize a shared build artifact.
  await i18n.changeLanguage('en');
  return renderToStaticMarkup(
    <StaticRouter location="/">
      <I18nextProvider i18n={i18n}>
        <AuthProvider><Landing /></AuthProvider>
      </I18nextProvider>
    </StaticRouter>,
  );
}
