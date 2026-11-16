/** Pure source/content contract checks. Node 24 native TS stripping; no network or dependencies. */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ARTICLES } from '../content/articles.meta.ts';
import { UNOONE_PAGES, READINESS_LABELS, PRIVATE_AI_REVIEWED_ON, PRIVATE_AI_EVIDENCE_SCOPE } from '../content/privateAI.ts';
import { CREDENTIALS, FEATURED_CREDENTIALS, credentialSchemaNodes, awardStrings } from '../content/credentials.ts';
import { DEEP_TECH_PROJECTS } from '../content/deepTech.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (path) => readFileSync(root + path, 'utf8');
const normalize = (s) => s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*`]/g, '').replace(/\s+/g, ' ').trim();
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const same = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };

same(PRIVATE_AI_REVIEWED_ON, '2026-11-16', 'Review date is editorial, not runtime-generated');
check(/internal engineering/.test(PRIVATE_AI_EVIDENCE_SCOPE), 'Evidence scope must disclose internal provenance');
check(/Unit tests.*earlier device runs/.test(PRIVATE_AI_EVIDENCE_SCOPE), 'Test/device evidence must remain distinguishable');
same(UNOONE_PAGES.length, 7, 'Preserve all private-AI page exports');
const page = (path) => { const p = UNOONE_PAGES.find((item) => item.path === path); assert.ok(p, path); return p; };
for (const p of UNOONE_PAGES) for (const cap of p.capabilities) {
  check(Boolean(READINESS_LABELS[cap.readiness]), `${p.path}/${cap.name}: readiness has a public label`);
  check(Boolean(cap.evidence), `${p.path}/${cap.name}: evidence scope is present`);
}
same(page('/technology').capabilities.find((c) => c.name === 'SILT').readiness, 'research', 'A research programme is not working runtime evidence');
same(page('/technology').capabilities.find((c) => /Historical portable/.test(c.name)).readiness, 'historical', 'Retired portable research is not planned consumer product');
for (const name of ['On-device model execution', 'Task intelligence', 'Personal memory on the phone']) {
  same(page('/unoone/mobile').capabilities.find((c) => c.name === name).readiness, 'in-development', `${name}: open device/end-to-end validation is not working qualification`);
}
const privacyAnswer = page('/private-ai').faqs.find((f) => /private if/.test(f.q)).a;
for (const term of ['mail', 'navigation', 'form', 'uploads', 'queries', 'requests', 'files', 'authentication']) check(privacyAnswer.includes(term), `Privacy answer must cover ${term}`);
check(!/only outbound|never share credentials/.test(privacyAnswer), 'No false outbound or authentication absolute');
check(/blocked outright/.test(JSON.stringify(page('/unoone/mobile'))), 'Sensitive agent classes stay blocked');
check(/manual or automatic/.test(page('/unoone/sync').status), 'No qualified manual sync implied');
check(/own encrypted local state/.test(page('/unoone/sync').description), 'Independent device stores remain explicit');
check(/No|Not yet|Not as/.test(page('/unoone/power').faqs.find((f) => /installer/.test(f.q)).a), 'No installer offer');

same(DEEP_TECH_PROJECTS.map((p) => p.applicationNo), ['202631101454', '202631102427'], 'Preserve filing identities without broadening');
check(DEEP_TECH_PROJECTS.find((p) => p.id === 'pai').limitations.some((s) => /historical filing does not establish coverage/.test(s)), 'Historical filing scope cannot cover every new feature by implication');
same(CREDENTIALS.length, 14, 'Preserve credential records, not unsupported revocation');
same(FEATURED_CREDENTIALS.map((c) => c.id), ['dpiit', 'stanford-seed-spark', 'openai-partner-network', 'google-genai-academy-apac', 'hyperagent-founding-500', 'sarvam-startup-program'], 'Preserve featured recognition rail');
for (const holder of ['org', 'person']) {
  same(credentialSchemaNodes(holder).map((c) => c.name), CREDENTIALS.filter((c) => c.holder === holder && c.category === 'certification').map((c) => c.title), 'Only completion credentials use EducationalOccupationalCredential');
  same(awardStrings(holder), [], 'Membership/participation is not an award');
}
same(CREDENTIALS.find((c) => c.id === 'dpiit').holder, 'org', 'DPIIT holder remains the legal organization');

check(ARTICLES.length >= 31, 'No baseline article erased');
same(new Set(ARTICLES.map((a) => a.slug)).size, ARTICLES.length, 'Stable unique article identities');
same(readdirSync(root + 'content/articles').filter((f) => f.endsWith('.md')).length, ARTICLES.length, 'No unlisted or deleted article bodies');
// Original first-publication dates at approved baseline 085ecb6. Do not refresh these on corrections.
const published = {
  "what-are-ai-agents": "2026-01-14",
  "rag": "2026-01-21",
  "vibe-coding": "2026-02-04",
  "agentic-ai": "2026-02-18",
  "prompt-engineering": "2026-03-04",
  "generative-ai": "2026-03-18",
  "cicd": "2026-04-01",
  "infrastructure-as-code": "2026-04-15",
  "devsecops": "2026-05-06",
  "supply-chain-security": "2026-05-20",
  "inbharat-ecosystem": "2026-06-03",
  "desh-ka-ai": "2026-06-17",
  "harness-engineering": "2026-06-27",
  "neural-networks-the-core-of-practical-ai-for-indian-engineer": "2026-06-28",
  "fine-tuning-vs-rag-when-to-use-each-for-your-indian-ai-produ": "2026-06-29",
  "building-unoone-leaf-indias-local-agi-fabric": "2026-06-29",
  "why-i-am-building-jak-shield-an-ai-safety-net-for-bharat": "2026-06-30",
  "building-a-digital-shield-ai-for-scam-detection-in-indian-te": "2026-07-02",
  "evals-for-ai-features-measuring-what-actually-ships": "2026-07-03",
  "streaming-llm-responses-ux-and-cost-trade-offs": "2026-07-04",
  "token-economics-pricing-an-ai-feature-without-losing-money": "2026-07-05",
  "model-routing-and-cost-control-across-gemini-tiers": "2026-07-06",
  "context-engineering-managing-what-the-model-actually-sees": "2026-07-07",
  "multilingual-llm-apps-beyond-english-only-prompts": "2026-07-09",
  "building-unoone-an-offline-ai-agent-for-bharats-realities": "2026-07-14",
  "voice-first-ai-designing-for-ears-before-screens": "2026-07-17",
  "mcp-servers-in-plain-english": "2026-07-26",
  "prompt-chaining-vs-a-single-mega-prompt": "2026-07-29",
  "local-first-ai-running-models-on-your-own-laptop": "2026-08-01",
  "embeddings-what-they-actually-do-and-when-you-dont-need-them": "2026-07-22",
  "red-teaming-your-ai-feature-before-it-ships": "2026-07-30"
};
for (const slug of Object.keys(published)) check(ARTICLES.some((a) => a.slug === slug), `${slug}: baseline article retained`);
for (const article of ARTICLES) {
  const body = read(`content/articles/${article.slug}.md`);
  if (published[article.slug]) {
    same(article.datePublished, published[article.slug], `${article.slug}: preserve original publication date`);
    same(article.dateModified, '2026-11-16', `${article.slug}: actual correction date`);
    check(body.startsWith('> **Content correction — 16 November 2026:**'), `${article.slug}: authored dated correction (renderer visibility tested separately)`);
  }
  check(!article.dateModified || !article.datePublished || article.datePublished <= article.dateModified, `${article.slug}: sane chronology`);
  check(/[.!?]$/.test(article.description), `${article.slug}: complete description, no truncated words`);
  check(!/\[\d+(?:,\s*\d+)*\]/.test(body), `${article.slug}: no unresolved numeric citations`);
  for (const faq of article.faq) {
    check(normalize(body).includes(normalize(faq.q)), `${article.slug}: schema question is visible`);
    check(normalize(body).includes(normalize(faq.a)), `${article.slug}: schema answer agrees with body`);
  }
}
const ecosystem = read('content/articles/inbharat-ecosystem.md');
for (const scope of ['historical', 'Aadhaar', 'No verified implementation', 'India', 'not prove production deployments', 'fifteen']) check(ecosystem.toLowerCase().includes(scope.toLowerCase()) || byMeta('inbharat-ecosystem').abstract.includes(scope), `Ecosystem scope: ${scope}`);
function byMeta(slug) { return ARTICLES.find((a) => a.slug === slug); }
check(/not demonstrated AGI/.test(byMeta('building-unoone-leaf-indias-local-agi-fabric').abstract), 'LEAF abstract does not promise AGI');
check(!/AGI Fabric/.test(byMeta('building-unoone-leaf-indias-local-agi-fabric').title), 'Historical slug retained without current AGI headline');
check(/not unlocked by confirmation/.test(read('content/articles/building-unoone-an-offline-ai-agent-for-bharats-realities.md')), 'Android history has unambiguous blocked-agent scope');
check(/cosine distance/.test(read('content/articles/embeddings-what-they-actually-do-and-when-you-dont-need-them.md')), 'pgvector operator correction retained');
check(/not MCP unless/.test(read('content/articles/mcp-servers-in-plain-english.md')), 'Generic HTTP API is not labelled MCP');

const landing = read('pages/Landing.tsx');
const productDefs = landing.split('const PRODUCT_DEFS = [')[1].split('] as const;')[0];
same((productDefs.match(/\{ name:/g) || []).length, 15, 'Preserve all fifteen directory entries');
check(/name: 'InBharat AI'.*href: '\/app'/.test(productDefs), 'Web console entry retained');
check(/name: 'UnoOne'.*href: '\/unoone'.*internal: true/.test(productDefs), 'UnoOne entry links to current two-product ecosystem');
check(!/val: '100%'|val: '0'/.test(landing), 'No fabricated security percentages/counts');
check(!landing.includes('status-pulse"'), 'Static product status is not animated live-health telemetry');
check(landing.includes("t('landJakIllustration')"), 'Decorative pipeline is labelled illustrative');
check(landing.includes('<HeroGitaQuote />'), 'Gita signature preserved');
check(landing.includes('CredentialRail'), 'Credential rail preserved');
check(!read('components/landing/UnoOneDevices.tsx').includes('ONE VAULT'), 'No one-physical-vault implication');
check(read('components/landing/UnoOneDevices.tsx').includes('landDevicesSyncStatus'), 'Sync boundary is adjacent to the device art');
check(!read('pages/unoone/UnoOnePages.tsx').includes('Verified:</span>'), 'No blanket Verified evidence label');

const seo = read('seo.config.ts');
same(seo.match(/const ORG_SAMEAS = (\[[\s\S]*?\]);/)[1], '[SITE.social.github]', 'Organization sameAs does not merge founder or products');
check(/sameAs: \[SITE.social.linkedin, SITE.social.twitter\]/.test(seo), 'Founder social identities stay on Person');
const deepSuite = seo.split('const deepTechSuite =')[1].split('const productSuite =')[0];
check(!deepSuite.includes('offers:'), 'No unsupported free UnoOne offer');
check(deepSuite.includes('Historical Pocket AI portable host-adaptive architecture'), 'Pocket AI research schema distinct from current PAI');
for (const item of ['page.capabilities.map', 'page.sections.map', 'page.faqs.map', 'PRIVATE_AI_EVIDENCE_SCOPE']) check(seo.includes(item), `Crawler body retains ${item}`);
check(!/multilingual: true/.test(seo), 'No fictitious translated route alternates');

const english = JSON.parse(read('locales/en.json'));
const highValue = ['landLanguageCoverageNotice', 'landSafetyNotice', 'landProdSocialFlowDesc', 'landProdSwasthyaDesc', 'landProdSahaayakSevaDesc', 'faqA2', 'faqA3', 'faqA4', 'faqA6'];
for (const filename of readdirSync(root + 'locales').filter((f) => f.endsWith('.json'))) {
  const locale = JSON.parse(read(`locales/${filename}`));
  const effective = { ...english, ...locale };
  for (const key of ['landDevicesSyncStatus', ...highValue, 'landJakIllustration', 'landJakControl1', 'landJakControl2', 'landJakControl3', 'landJakControl4']) check(Boolean(effective[key]), `${filename}: ${key} resolves`);
  check(!JSON.stringify(locale).includes('[EN]'), `${filename}: no fake translated English prefixes`);
  check(!/All systems operational/.test(effective.landStatusOperational), `${filename}: no fake health status`);
  check(/Windows/.test(effective.landProdUnooneDesc) && /Android/.test(effective.landProdUnooneDesc), `${filename}: product taxonomy consistent`);
  check(!/never leaves|100% local/.test(effective.landProdSocialFlowDesc), `${filename}: social publishing data flow honest`);
  if (filename !== 'en.json') {
    for (const key of highValue) {
      check(Boolean(locale[key]) && locale[key] !== english[key] && /[^\u0000-\u007f]/.test(locale[key]), `${filename}: ${key} has local-language text (not linguistic certification)`);
    }
    for (const key of ['landHeroDesc', 'landPaiBody', 'faqA5', 'landJakStat4']) check(Boolean(locale[key]) && !locale[key].startsWith('[EN]'), `${filename}: previous truthful copy retained without fake prefix`);
    for (const key of ['landProdOpenclawDesc', 'landProdUnooneDesc', 'landJakDesc']) check(!Object.hasOwn(locale, key), `${filename}: ${key} deliberately uses English fallback, not a mislabeled copy`);
  }
}
check(landing.includes('localized(t(`faqA${n}` as const))'), 'FAQ answers carry resource language');
check(landing.includes('<EnglishOnly><UnoOneDevices showCards /></EnglishOnly>'), 'Mixed technical device composition is an explicit English-only island');
check(landing.includes('data-locale-coverage'), 'Localized partial-coverage notice is near the hero');
check(!landing.includes('line-clamp-2'), 'Product caveats are not clipped to two lines');
const vibe = read('content/articles/vibe-coding.md');
check(!/months to hours|₹5.?10 lakhs|over a weekend/.test(vibe), 'No categorical MVP time or cost premise');
const fineTuning = read('content/articles/fine-tuning-vs-rag-when-to-use-each-for-your-indian-ai-produ.md');
check(!/requires substantial, high-quality parallel data/.test(fineTuning), 'Parallel data is not a universal multilingual SFT requirement');
check(/not a general requirement/.test(fineTuning) && /held-out per-language/.test(fineTuning), 'Task-specific dataset needs and held-out language tests retained');
const chaining = read('content/articles/prompt-chaining-vs-a-single-mega-prompt.md');
check(!/much more reliable|control is not possible|mega-prompts also consume more tokens|This optimizes both cost and performance/.test(chaining), 'No categorical chaining superiority');
check(/Independent steps may run in parallel; dependent steps must wait/.test(chaining), 'Parallelism follows dependencies, not just shorter prompts');
const llms = read('public/llms.txt');
for (const term of ['16 November 2026', 'No public UnoOne installer', 'Android alpha', 'manual or automatic', 'form submissions and uploads', 'Translations are partial', 'not the current consumer']) check(llms.includes(term), `llms.txt includes ${term}`);
console.log(`PASS content accuracy: ${checks} pure assertions; no runtime product or deployment qualification implied.`);
