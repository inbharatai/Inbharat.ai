import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAdminApi } from "../../lib/growth/adminApi";
import { statusChip } from "../../lib/growth/pipelineStatus";
// Re-export so existing imports from the component module keep working.
export { statusChip };

/**
 * PipelineStrip — the shared "Today&rsquo;s pipeline" card shown at the top of both
 * the Agent and Issues admin pages. It aligns the two pages without merging them:
 * one glance shows the morning content run end-to-end (topic → article →
 * LinkedIn → cover → each draft's status), with a deep-link to the other page.
 *
 * Data comes from GET /api/growth/pipeline (the morning "Build with Reeturaj —
 * Daily Plan" thread + today's article/linkedin/cover drafts). The strip fetches
 * itself on mount and whenever `refreshKey` changes (so the Agent page can force
 * a refetch after running the morning plan). Empty state when there is no run
 * today. Every fetch failure degrades to the empty state, never a crash.
 */

export interface PipelineDraftRef {
  draftId: string;
  status: string;
}
export interface PipelineResp {
  ok: boolean;
  thread?: { id: string; title: string; updatedAt: string } | null;
  topic?: string | null;
  article?: { draftId: string; slug: string | null; title: string | null; status: string; url: string | null } | null;
  linkedin?: PipelineDraftRef | null;
  cover?: { draftId: string; filename: string | null; status: string } | null;
}

interface ChipProps {
  label: string;
  status: string | null;
  to?: string;
  title?: string;
}
const Chip: React.FC<ChipProps> = ({ label, status, to, title }) => {
  const c = statusChip(status);
  const body = (
    <>
      <span className="text-[11px] font-semibold text-[#c0cfe0]">{label}</span>
      <span className={`ml-1.5 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${c.cls}`}>{c.label}</span>
    </>
  );
  if (to) {
    return (
      <Link to={to} title={title} className="inline-flex items-center rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 hover:border-[#f59f4f]/40">
        {body}
      </Link>
    );
  }
  return <span className="inline-flex items-center rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5">{body}</span>;
};

const PipelineStrip: React.FC<{ variant: "agent" | "issues"; refreshKey?: number }> = ({ variant, refreshKey }) => {
  const { fetchJson } = useAdminApi();
  const [data, setData] = useState<PipelineResp | null>(null);

  const load = useCallback(async () => {
    const { data: body, error } = await fetchJson<PipelineResp>("/api/growth/pipeline");
    // Never crash the page on a fetch failure — the strip just stays empty.
    if (!error && body) setData(body);
  }, [fetchJson]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const thread = data?.thread ?? null;
  const article = data?.article ?? null;
  const linkedin = data?.linkedin ?? null;
  const cover = data?.cover ?? null;
  const hasRun = !!(article || linkedin || cover || thread);

  // Deep-link target for each chip, depending on which page this strip is on.
  // On the Agent page, chips jump to the Issues draft card; on the Issues page,
  // chips jump to the Agent thread that produced the run.
  const issuesDraftLink = (id: string) => `/admin/growth/issues?draft=${encodeURIComponent(id)}`;
  const agentThreadLink = thread ? `/admin/growth/agent?thread=${encodeURIComponent(thread.id)}` : null;

  const chipTo = (draftId: string | undefined): string | undefined => {
    if (!draftId) return undefined;
    return variant === "agent" ? issuesDraftLink(draftId) : agentThreadLink ?? undefined;
  };

  if (!hasRun) {
    return (
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#7a9ab8]">Today&rsquo;s pipeline</p>
        <p className="mt-2 text-[12px] text-[#9fb2c6]">
          No content run yet today.{" "}
          <Link to="/admin/growth/agent" className="text-[#f59f4f] hover:underline">Run the morning plan on the Agent tab</Link>{" "}
          to draft today&rsquo;s article + LinkedIn caption + cover.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#f59f4f]/20 bg-[#f59f4f]/[0.04] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#7a9ab8]">Today&rsquo;s pipeline</p>
          {data?.topic && <p className="mt-1 truncate text-[14px] font-bold text-white" title={data.topic}>{data.topic}</p>}
          {thread && (
            <p className="mt-0.5 truncate text-[11px] text-[#7a9ab8]" title={thread.title}>
              from “{thread.title}” · updated {thread.updatedAt ? new Date(thread.updatedAt).toLocaleString() : "—"}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {variant === "agent" && article?.draftId && (
            <Link to={issuesDraftLink(article.draftId)} className="rounded-md border border-[#f59f4f]/40 bg-[#f59f4f]/10 px-3 py-1.5 text-[11px] font-semibold text-[#f6bf84] hover:bg-[#f59f4f]/20">
              Review in Issues ↗
            </Link>
          )}
          {variant === "issues" && agentThreadLink && (
            <Link to={agentThreadLink} className="rounded-md border border-[#f59f4f]/40 bg-[#f59f4f]/10 px-3 py-1.5 text-[11px] font-semibold text-[#f6bf84] hover:bg-[#f59f4f]/20">
              View in Agent ↗
            </Link>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Chip label="Article" status={article?.status ?? null} to={chipTo(article?.draftId)} title={article?.title ?? undefined} />
        <span className="text-[#5f7c98]">→</span>
        <Chip label="LinkedIn" status={linkedin?.status ?? null} to={chipTo(linkedin?.draftId)} />
        <span className="text-[#5f7c98]">→</span>
        <Chip label="Cover" status={cover?.status ?? null} to={chipTo(cover?.draftId)} title={cover?.filename ?? undefined} />
      </div>
    </div>
  );
};

export default PipelineStrip;