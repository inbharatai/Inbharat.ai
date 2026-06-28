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
    return entry;
  }
  return null;
}