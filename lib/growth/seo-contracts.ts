import { load } from "cheerio";

/** Static-contract checks, not ranking predictions or Rich Results certification. */
export type SchemaNode = Record<string, unknown>;

export function schemaNodes(value: unknown): SchemaNode[] {
  if (Array.isArray(value)) return value.flatMap(schemaNodes);
  if (!value || typeof value !== "object") return [];
  const node = value as SchemaNode;
  return [node, ...Object.values(node).flatMap((child) => schemaNodes(child))];
}

export function schemaTypes(nodes: SchemaNode[]): string[] {
  return [...new Set(nodes.flatMap((node) => {
    const type = node["@type"];
    return typeof type === "string" ? [type] : Array.isArray(type) ? type.filter((t): t is string => typeof t === "string") : [];
  }))];
}

const REQUIRED: Record<string, string[]> = {
  // Unknown first-live dates must be omitted, not invented. Audit callers also
  // compare known manifest dates against emitted article nodes.
  TechArticle: ["headline", "author", "mainEntityOfPage"],
  Article: ["headline", "author"],
  BlogPosting: ["headline", "author"],
  BreadcrumbList: ["itemListElement"],
  Organization: ["name"], WebSite: ["name", "url"], Person: ["name"],
  FAQPage: ["mainEntity"], Question: ["name", "acceptedAnswer"], Answer: ["text"],
  ItemList: ["itemListElement"], SoftwareApplication: ["name", "applicationCategory"],
};

function empty(value: unknown): boolean {
  return value === undefined || value === null ||
    (typeof value === "string" && !value.trim()) ||
    (Array.isArray(value) && value.length === 0) ||
    (typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0);
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validateJsonLd(html: string, expectedTypes: string[], canonical?: string): string[] {
  const $ = load(html);
  const errors: string[] = [];
  const nodes: SchemaNode[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const value: unknown = JSON.parse($(el).text());
      if (!value || typeof value !== "object") errors.push("JSON-LD root must be an object or array");
      nodes.push(...schemaNodes(value));
    } catch { errors.push("malformed JSON-LD block"); }
  });
  const referenceOnly = (node: SchemaNode) => typeof node['@id'] === 'string' && !!node['@id'].trim() &&
    Object.keys(node).every((key) => key === '@id' || key === '@type');
  const definitions = nodes.filter((node) => !referenceOnly(node));
  const types = schemaTypes(definitions);
  for (const type of expectedTypes) if (!types.includes(type)) errors.push(`missing expected ${type} schema definition`);
  const resolve = (value: unknown): SchemaNode | undefined => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const node = value as SchemaNode;
    return referenceOnly(node) ? definitions.find((candidate) => candidate['@id'] === node['@id']) : node;
  };
  const nonemptyString = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
  const httpUrl = (value: unknown): boolean => {
    if (!nonemptyString(value)) return false;
    try { const url = new URL(value); return /^https?:$/.test(url.protocol) && !url.username && !url.password; }
    catch { return false; }
  };
  const entityTarget = (value: unknown): boolean => {
    if (typeof value === 'string') return httpUrl(value);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const entity = value as SchemaNode;
    return httpUrl(entity['@id']) || httpUrl(entity.url) ||
      (nonemptyString(entity['@type']) && nonemptyString(entity.name));
  };
  if (!nodes.length) errors.push("no JSON-LD nodes");
  const today = new Date().toISOString().slice(0, 10);
  for (const node of nodes) {
    for (const type of schemaTypes([node])) {
      // Only actual identified references may defer their fields to a definition.
      // A type-only stub is not a reference and cannot satisfy coverage.
      if (referenceOnly(node)) {
        const definition = resolve(node);
        if (!definition || !schemaTypes([definition]).includes(type)) errors.push(`unresolved typed ${type} reference`);
        continue;
      }
      if (type === "SearchAction") errors.push("retired SearchAction is not part of this site's schema contract");
      const missing = (REQUIRED[type] || []).filter((key) => empty(node[key]));
      if (missing.length) errors.push(`${type} missing ${missing.join(", ")}`);
      for (const key of (REQUIRED[type] || []).filter((field) => ['name', 'headline', 'text', 'applicationCategory'].includes(field))) {
        if (!nonemptyString(node[key])) errors.push(`${type}.${key} must be a nonempty string`);
      }
      if (node.url !== undefined && !httpUrl(node.url)) errors.push(`${type}.url must be an absolute HTTP(S) URL`);
      if (/^(TechArticle|Article|BlogPosting)$/.test(type)) {
        const authors = Array.isArray(node.author) ? node.author : [node.author];
        if (!authors.length || authors.some((value) => {
          const author = resolve(value);
          return !author || !schemaTypes([author]).some((kind) => kind === 'Person' || kind === 'Organization') || !nonemptyString(author.name);
        })) errors.push(`${type}.author must resolve to named Person/Organization entities`);
        if (!entityTarget(node.mainEntityOfPage)) errors.push(`${type}.mainEntityOfPage must identify a page`);
      }
      if (type === "FAQPage" && (!Array.isArray(node.mainEntity) ||
          node.mainEntity.some((q) => !q || typeof q !== "object" || (q as SchemaNode)["@type"] !== "Question"))) {
        errors.push("FAQPage.mainEntity must contain Question objects");
      }
      if (type === 'Question') {
        const answer = resolve(node.acceptedAnswer);
        if (!answer || answer['@type'] !== 'Answer' || typeof answer.text !== 'string' || !answer.text.trim()) {
          errors.push('Question.acceptedAnswer must resolve to a nonempty Answer');
        }
      }
      if (type === 'BreadcrumbList' || type === 'ItemList') {
        if (!Array.isArray(node.itemListElement) || node.itemListElement.some((entry, index) => {
          const item = resolve(entry);
          return !item || item['@type'] !== 'ListItem' || item.position !== index + 1 || !entityTarget(item.item) ||
            (type === 'BreadcrumbList' && (typeof item.name !== 'string' || !item.name.trim()));
        })) errors.push(`${type}.itemListElement must be ordered nonempty ListItems`);
      }
      if (/^(TechArticle|Article|BlogPosting)$/.test(type) && canonical &&
          node.mainEntityOfPage !== canonical &&
          !(node.mainEntityOfPage && typeof node.mainEntityOfPage === "object" &&
            (node.mainEntityOfPage as SchemaNode)["@id"] === canonical)) {
        errors.push(`${type} mainEntityOfPage does not match canonical`);
      }
    }
    for (const field of ["datePublished", "dateModified"]) {
      if (node[field] !== undefined && (typeof node[field] !== "string" ||
          !isIsoDate(node[field] as string) || (node[field] as string) > today)) errors.push(`invalid or future ${field}`);
    }
    if (typeof node.datePublished === "string" && typeof node.dateModified === "string" &&
        node.dateModified < node.datePublished) errors.push("dateModified precedes datePublished");
  }
  return [...new Set(errors)];
}

/** A URL in schema/text is not a user- or crawler-followable HTML anchor. */
export function hasPublicAnchor(html: string, target: string, base: string): boolean {
  const $ = load(html);
  return $('a[href]').toArray().some((el) => {
    if ($(el).closest('[hidden], [aria-hidden="true"]').length) return false;
    try { return new URL($(el).attr("href") || "", base).href === new URL(target, base).href; }
    catch { return false; }
  });
}

export function validateSitemapXml(xml: string, origin: string, expected: string[]): { locs: string[]; errors: string[] } {
  const errors: string[] = [];
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) errors.push("sitemap must not declare external entities");
  const $ = load(xml, { xml: true });
  if ($.root().children().length !== 1 || $.root().children().first()[0]?.tagName !== "urlset") errors.push("expected one urlset root");
  if ($("urlset").attr("xmlns") !== "http://www.sitemaps.org/schemas/sitemap/0.9") errors.push("invalid sitemap namespace");
  const locs: string[] = [];
  const seen = new Set<string>();
  const expectedSet = new Set(expected);
  const today = new Date().toISOString().slice(0, 10);
  $("urlset > url").each((_, el) => {
    const loc = $(el).children("loc").text().trim();
    if ($(el).children("loc").length !== 1 || !loc) errors.push("each sitemap URL needs one nonempty loc");
    locs.push(loc);
    if (seen.has(loc)) errors.push(`duplicate sitemap loc: ${loc}`);
    seen.add(loc);
    try {
      const url = new URL(loc);
      if (url.origin !== new URL(origin).origin || url.username || url.password) errors.push(`foreign sitemap origin: ${loc}`);
      if (url.search || url.hash) errors.push(`noncanonical sitemap query/fragment: ${loc}`);
      if (!expectedSet.has(loc)) errors.push(`unexpected sitemap loc: ${loc}`);
    } catch { errors.push(`invalid sitemap URL: ${loc}`); }
    const dates = $(el).children("lastmod");
    if (dates.length > 1) errors.push(`duplicate lastmod: ${loc}`);
    if (dates.length && (!isIsoDate(dates.text().trim()) || dates.text().trim() > today)) errors.push(`invalid or future lastmod: ${loc}`);
  });
  for (const loc of expected) if (!seen.has(loc)) errors.push(`missing sitemap loc: ${loc}`);
  if (!locs.length) errors.push("sitemap has no URLs");
  return { locs, errors };
}
