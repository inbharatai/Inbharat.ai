/** Build-only: render the exact route components used by the client. No CSS
 * imports, auth lookup, browser shims or release/service activation. */
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import { UNOONE_PAGES } from '../../content/privateAI';
import { type LaunchPath } from '../../content/unooneRelease';
import { PrivateAiPageView } from './UnoOnePages';
import { LAUNCH_COMPONENTS } from './LaunchPages';

export function renderStaticUnoOne(path: string): string | null {
  const page = UNOONE_PAGES.find(candidate => candidate.path === path);
  const LaunchPage = Object.hasOwn(LAUNCH_COMPONENTS, path) ? LAUNCH_COMPONENTS[path as LaunchPath] : undefined;
  if (!page && !LaunchPage) return null;
  return renderToStaticMarkup(<StaticRouter location={path}>{LaunchPage ? <LaunchPage /> : page ? <PrivateAiPageView page={page} /> : null}</StaticRouter>);
}
