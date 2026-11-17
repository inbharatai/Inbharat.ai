import en from '../locales/en.json' with { type: 'json' };
import { expect, type Page, type Locator } from '@playwright/test';
import { PRODUCT_REGISTRY } from '../content/productRegistry';

// The restored homepage uses original localized company descriptions, not the
// separately authored /ecosystem registry descriptions. Assert exact content
// against its actual resource; do not replace equality with a length check.
const companyDescriptionKeys: Record<string, keyof typeof en> = {
  'InBharat AI': 'landProdInbharatDesc',
  'JAK Swarm': 'landProdJakDesc',
  'JAK Shield': 'landProdJakshieldDesc',
  'Agent Arcade': 'landProdArcadeDesc',
  'SocialFlow': 'landProdSocialFlowDesc',
  'Sahayaak AI': 'landProdSahaayakDesc',
  'KathaKitaab': 'landProdKathakitaabDesc',
  'UniBot': 'landProdUnibotDesc',
  'Phoring': 'landProdPhoringDesc',
  'UniAssist.ai': 'landProdUniassistDesc',
  'TestsPrep.in': 'landProdTestsprepDesc',
  'UnoOne': 'landProdUnooneDesc',
  'OpenClawFix': 'landProdOpenclawDesc',
  'Sahayaak Seva': 'landProdSahaayakSevaDesc',
  'SwasthyaScore AI': 'landProdSwasthyaDesc',
};
export function companyDescription(name: string) {
  if (!companyDescriptionKeys[name]) throw new Error(`Unmapped original company product: ${name}`);
  return en[companyDescriptionKeys[name]];
}


/** Exercise only the real original enhanced picker, never its hidden fallback.
 * Core has responsive duplicate buttons: choose a visible real user target. */
export async function selectCompanyProduct(page: Page, name: string) {
  const products = page.locator('#products');
  await products.getByRole('button').filter({ hasText: 'InBharat Core AI' }).filter({ visible: true }).first().click();
  if (name !== 'InBharat AI') await products.getByRole('button').filter({ hasText: name }).filter({ visible: true }).first().click();
  const heading = products.locator('h3').filter({ visible: true }).first();
  await expect(heading).toHaveText(name);
  const panel = heading.locator('xpath=../../..');
  await expect(panel.locator(':scope > p')).toHaveText(companyDescription(name));
  const product = PRODUCT_REGISTRY.find(item => item.name === name)!;
  const href = product.href === "/#chatbot" ? "#chatbot" : product.href;
  await expect(panel.locator(`a[href="${href}"]`).first()).toBeVisible();
  return panel;
}

/** Font ink may overhang a visible line box. Only hidden/clip ancestors and
 * horizontal viewport bounds can crop content; scrollHeight alone is not proof. */
export async function croppedText(nodes: Locator) {
  return nodes.evaluateAll(elements => elements.filter(el => {
    for (let disclosure = el.closest('details:not([open])'); disclosure; disclosure = disclosure.parentElement?.closest('details:not([open])') ?? null) {
      if (!disclosure.querySelector(':scope > summary')?.contains(el)) return false;
    }
    const box = el.getBoundingClientRect();
    if (!box.width || !box.height) return false;
    const range = document.createRange(); range.selectNodeContents(el);
    const rectangles = [...range.getClientRects()];
    if (rectangles.some(r => r.left < -1 || r.right > innerWidth + 1)) return true;
    for (let parent: Element | null = el; parent && parent !== document.body && parent !== document.documentElement; parent = parent.parentElement) {
      const style = getComputedStyle(parent), bounds = parent.getBoundingClientRect();
      const left = bounds.left + parent.clientLeft, top = bounds.top + parent.clientTop;
      if (/(hidden|clip)/.test(style.overflowX) && rectangles.some(r => r.left < left - 1 || r.right > left + parent.clientWidth + 1)) return true;
      if (/(hidden|clip)/.test(style.overflowY) && rectangles.some(r => r.top < top - 1 || r.bottom > top + parent.clientHeight + 1)) return true;
    }
    return false;
  }).map(el => el.textContent));
}
