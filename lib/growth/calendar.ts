/**
 * "Build with Reeturaj" content calendar — pure topic-picker.
 *
 * The daily morning cron uses pickNextCalendarTopic to choose today's unbuilt
 * article from the founder's calendar (content/build-with-reeturaj-calendar.ts).
 * Kept here (not in the cron handler) so it's hermetically unit-testable with no
 * Gemini / DB / Vercel deps.
 */
import { slugifyTitle } from "./articleWriter.js";
import type { CalendarTopic } from "../../content/build-with-reeturaj-calendar.js";

export type { CalendarTopic } from "../../content/build-with-reeturaj-calendar.js";

/**
 * Return the first calendar entry whose slug (slugifyTitle(topic)) is neither
 * already published (in `publishedSlugs`) nor already drafted (in `draftedSlugs`),
 * or `null` when every entry is built/drafted (the cron then free-plans a fresh
 * topic via web_search so the cadence never stalls).
 *
 * Pure + deterministic. `draftedSlugs` may contain duplicates; we normalize to a
 * Set once. Slugs are compared lowercased (slugifyTitle already lowercases).
 */
export function pickNextCalendarTopic(
  calendar: CalendarTopic[],
  publishedSlugs: Set<string>,
  draftedSlugs: string[],
): CalendarTopic | null {
  const drafted = new Set(draftedSlugs.map((s) => s.toLowerCase()));
  for (const entry of calendar) {
    const slug = slugifyTitle(entry.topic).toLowerCase();
    if (publishedSlugs.has(slug)) continue;
    if (drafted.has(slug)) continue;
    // Substantive-duplicate guard. A published article whose slug is this topic
    // made MORE specific — e.g. calendar "fine-tuning-vs-rag-when-to-use-each" vs
    // published "fine-tuning-vs-rag-when-to-use-each-for-your-indian-ai-produ" —
    // means the topic is already covered under a longer slug. Exact-slug match
    // above misses this; the agent then (correctly) refuses to re-write it as a
    // duplicate and the morning cron stalls on this entry every day: pick →
    // refuse → zero drafts. Skip it so the cadence advances to the next
    // genuinely-new topic. Directional: only skip when the PUBLISHED slug is the
    // longer one (calendar topic is the broad version of a specific published
    // article). The reverse — calendar slug longer than a published broad slug —
    // is a legitimate "deeper follow-up" and is NOT skipped.
    if (isCoveredByPublished(slug, publishedSlugs)) continue;
    return entry;
  }
  return null;
}

/**
 * True when some published slug is this calendar slug made more specific — i.e.
 * `published.startsWith(slug + "-")`. Guards very short slugs (length < 8) out of
 * prefix-matching to avoid false positives; every real calendar topic slug is far
 * longer than that. Case-insensitive (both sides already lowercased by callers).
 */
function isCoveredByPublished(slug: string, publishedSlugs: Set<string>): boolean {
  if (slug.length < 8) return false;
  const prefix = slug + "-";
  for (const pub of publishedSlugs) {
    if (typeof pub === "string" && pub.toLowerCase().startsWith(prefix)) return true;
  }
  return false;
}