/** Scoped locale/SSR contract tests using the installed React and i18next. */
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { useTranslation } from 'react-i18next';
import i18n, { selectedUiLanguage, syncDocumentLanguage, supportedLanguages } from '../lib/i18n';
import { EnglishOnly, languageOfText, localized } from '../lib/locale-text';

let checks = 0;
const equal = (a: unknown, b: unknown) => { assert.deepEqual(a, b); checks++; };
const DeviceCopy = () => { const { t } = useTranslation(); return <p>{t('landDevicesSub')}</p>; };
for (const { code } of supportedLanguages) {
  await i18n.changeLanguage(code);
  equal(selectedUiLanguage(), code);
  equal(languageOfText(i18n.t('landProdOpenclawDesc')), 'en');
  equal(languageOfText(i18n.t('landHeroTitle1')), 'en');
  for (const key of ['faqA2','faqA3','faqA4','faqA6','landLanguageCoverageNotice','landSafetyNotice','landProdSocialFlowDesc','landProdSwasthyaDesc','landProdSahaayakSevaDesc']) {
    equal(languageOfText(i18n.t(key)), code);
    const html = renderToStaticMarkup(localized(i18n.t(key)));
    assert.ok(html.startsWith(`<span lang="${code}">`)); checks++;
  }
  const isolated = renderToStaticMarkup(<EnglishOnly><DeviceCopy /></EnglishOnly>);
  assert.ok(isolated.includes('lang="en"') && isolated.includes('separate local stores')); checks++;
  equal(selectedUiLanguage(), code); // English island did not mutate UI selection.
  equal(i18n.t('landDevicesSub'), i18n.getFixedT(code)('landDevicesSub'));
}
await i18n.changeLanguage('hi-IN');
equal(selectedUiLanguage(), 'hi');
equal(languageOfText(i18n.t('landJakStat4')), 'hi');
await i18n.changeLanguage('as');
equal(languageOfText(i18n.t('landJakStat4')), 'en'); // Baseline English, not Assamese.
// No DOM available is a supported SSR path, not an unsafe global access.
syncDocumentLanguage();
console.log(`PASS locale boundaries: ${checks} assertions across all 11 choices; no human linguistic certification implied.`);
