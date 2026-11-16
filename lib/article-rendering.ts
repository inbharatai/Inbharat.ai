/** Keep the abstract and metadata-backed FAQ single-sourced in both renderers. */
export function prepareArticleMarkdown(md: string, abstract?: string, faqQuestions?: readonly string[]): string {
  const lines = md.split('\n');
  // Correction/admonition blocks are public evidence, never disposable prose.
  // Remove ONLY a leading blockquote positively matching the shared abstract.
  // Inspect consecutive introduction quotes; don't touch later quotations/code.
  const normalize = (value: string) => value.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*`]/g, '').replace(/\s+/g, ' ').trim();
  const body: string[] = [];
  let cursor = 0;
  while (cursor < lines.length) {
    if (!lines[cursor].trim()) { body.push(lines[cursor++]); continue; }
    if (!lines[cursor].trimStart().startsWith('>')) break;
    const block: string[] = [];
    while (cursor < lines.length && lines[cursor].trimStart().startsWith('>')) block.push(lines[cursor++]);
    const quoted = block.map((line) => line.replace(/^\s*>\s?/, '')).join('\n');
    const isCorrection = /content correction|historical note|editorial note/i.test(quoted);
    if (isCorrection || !abstract || normalize(quoted) !== normalize(abstract)) body.push(...block);
  }
  body.push(...lines.slice(cursor));
  let fence = '';
  let faq = -1;
  let end = body.length;
  for (let i = 0; i < body.length; i++) {
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(body[i]);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = '';
      continue;
    }
    if (fence) continue;
    if (faq < 0 && /^(?:#{1,2}\s+|\*\*)?(?:FAQs?|Frequently Asked Questions)(?:\s*\(FAQ\))?(?:\s*#*|\*\*)\s*:?\s*$/i.test(body[i].trim())) faq = i;
    else if (faq >= 0 && (/^---\s*$/.test(body[i].trim()) || /^#{1,2}\s/.test(body[i]) || /^#[^\s#]/.test(body[i]))) {
      end = i;
      break;
    }
  }
  if (faq >= 0 && faqQuestions) {
    const section = body.slice(faq + 1, end).join('\n');
    const expected = faqQuestions.map(normalize);
    const questions = [...section.matchAll(/^\s*(?:\*\*)?Q:\s*(.+?)(?:\*\*)?\s*$/gm)].map((match) => normalize(match[1]));
    // Never discard an unrelated FAQ or a source-only question. The build's
    // exact-once assertions expose drift instead of silently dropping content.
    if (!expected.length || !expected.every((question) => normalize(section).includes(question)) ||
        questions.some((question) => !expected.includes(question))) return body.join('\n').trimEnd();
  }
  return (faq < 0 ? body : [...body.slice(0, faq), ...body.slice(end)]).join('\n').trimEnd();
}

export function safeArticleUrl(value: string, image = false): string {
  const url = value.trim();
  if ([...url].some((char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127 || char === '\\')) return '';
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(url)?.[1]?.toLowerCase();
  if (scheme && !(image ? ['http', 'https'] : ['http', 'https', 'mailto', 'tel']).includes(scheme)) return '';
  return url;
}

type HeadingTree = { type: string; depth?: number; url?: string; alt?: string; value?: string; identifier?: string; children?: HeadingTree[] };
/** Shared heading and URL-policy transform before HTML/React rendering.
 * Code blocks are text and never inspected as links. Raw HTML is not enabled. */
export function normalizeArticleHeadings() {
  return (tree: HeadingTree): void => {
    const unsafeImageDefinitions = new Set<string>();
    const collect = (node: HeadingTree) => {
      if (node.type === 'definition' && node.identifier && typeof node.url === 'string' && !safeArticleUrl(node.url, true)) unsafeImageDefinitions.add(node.identifier);
      node.children?.forEach(collect);
    };
    collect(tree);
    const visit = (node: HeadingTree) => {
      if ((node.type === 'image' && typeof node.url === 'string' && !safeArticleUrl(node.url, true)) ||
          (node.type === 'imageReference' && node.identifier && unsafeImageDefinitions.has(node.identifier))) {
        node.type = 'text'; node.value = node.alt || '[Image omitted: unsupported URL]';
        delete node.url; delete node.children; return;
      }
      if (node.type === 'heading' && node.depth === 1) node.depth = 2;
      if (typeof node.url === 'string' && ['link', 'image', 'definition'].includes(node.type)) {
        node.url = safeArticleUrl(node.url, node.type === 'image');
      }
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}
