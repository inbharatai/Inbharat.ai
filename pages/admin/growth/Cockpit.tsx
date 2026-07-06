import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Inbox as InboxIcon, AlertTriangle, BarChart3, FileText, ArrowRight } from "lucide-react";
import ActionLog from "../../../components/growth/cockpit/ActionLog";
import PipelineBoard from "../../../components/growth/cockpit/PipelineBoard";
import PublishedMemoryTable from "../../../components/growth/cockpit/PublishedMemoryTable";
import InspectorDrawer, { type InspectorSelection } from "../../../components/growth/cockpit/InspectorDrawer";
import type { PipelineCard } from "../../../lib/growth/cockpit/pipelineBoard";
import type { PublishedMemoryItem } from "../../../lib/growth/publishedMemory";

/**
 * Growth "Jervis Cockpit" — the index route at /admin/growth. A launchpad +
 * inspector over the 13 existing admin pages (which stay untouched). 3 native
 * tabs (Today / Pipeline / Published Memory) + 4 deep-link tabs (Inbox / Drafts /
 * Review / Analytics) that link out to the existing pages, NOT embed them.
 *
 * Right inspector drawer opens on item click (draft card → accuracy gates + human
 * approval; published-memory row → cross-platform state). Approval stays a human
 * click; gates are advisory; nothing auto-publishes. No global omnibar/search
 * (founder-stated scope cut). Honest empty states — no fabricated metrics/URLs.
 */
type Tab = "today" | "pipeline" | "memory" | "inbox" | "drafts" | "review" | "analytics";

const TABS: { key: Tab; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "pipeline", label: "Pipeline" },
  { key: "memory", label: "Published Memory" },
  { key: "inbox", label: "Inbox" },
  { key: "drafts", label: "Drafts" },
  { key: "review", label: "Review" },
  { key: "analytics", label: "Analytics" },
];

const DEEP_LINKS: Record<"inbox" | "drafts" | "review" | "analytics", { to: string; icon: React.ComponentType<{ size?: number }>; blurb: string }> = {
  inbox: { to: "/admin/growth/inbox", icon: InboxIcon, blurb: "Inbox-as-knowledge-base — captured founder notes + lead context the agent reasons over." },
  drafts: { to: "/admin/growth/issues", icon: FileText, blurb: "Pending article + LinkedIn promotion drafts awaiting your review. Human-approved only." },
  review: { to: "/admin/growth/issues", icon: AlertTriangle, blurb: "Critique + redraft loop, publish/syndicate controls, and per-article cross-post history." },
  analytics: { to: "/admin/growth/performance", icon: BarChart3, blurb: "GA4 + GSC reach, page-level SEO/GEO audit results, and outcome trends." },
};

const Cockpit: React.FC = () => {
  const [tab, setTab] = useState<Tab>("today");
  const [selection, setSelection] = useState<InspectorSelection>(null);

  function selectCard(card: PipelineCard) { setSelection({ type: "card", card }); }
  function selectItem(item: PublishedMemoryItem) { setSelection({ type: "memory", item }); }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Cockpit</h1>
          <p className="mt-2 max-w-2xl text-[14px] leading-[1.7] text-[#9fb2c6]">
            One view over the whole Growth Agent pipeline — ideas to measured outcomes. Drafts are checked by 8 advisory
            accuracy gates, but <span className="font-semibold text-[#f59f4f]">approval is always your click</span> —
            nothing auto-publishes. The 13 detail pages stay one link away.
          </p>
        </div>
        <Link to="/admin/growth/overview" className="rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-[12.5px] font-semibold text-[#c0cfe0] hover:border-white/20 hover:text-white">
          Full Overview ↗
        </Link>
      </div>

      {/* Tab bar */}
      <div className="mt-5 flex gap-1 overflow-x-auto rounded-xl border border-white/[0.06] bg-white/[0.02] p-1">
        {TABS.map((tb) => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors ${
              tab === tb.key ? "bg-[#f59f4f]/15 text-[#f59f4f] ring-1 ring-[#f59f4f]/30" : "text-[#9fb2c6] hover:bg-white/[0.04] hover:text-white"
            }`}
          >
            {tb.label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === "today" && (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {(Object.keys(DEEP_LINKS) as (keyof typeof DEEP_LINKS)[]).map((k) => {
                const dl = DEEP_LINKS[k];
                return (
                  <Link key={k} to={dl.to} className="group rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 transition-colors hover:border-white/15 hover:bg-white/[0.04]">
                    <div className="flex items-center gap-2">
                      <dl.icon size={16} />
                      <span className="text-[13px] font-semibold capitalize text-white">{k}</span>
                      <ArrowRight size={12} className="ml-auto text-[#7a9ab8] transition-transform group-hover:translate-x-0.5" />
                    </div>
                    <p className="mt-2 text-[11px] leading-relaxed text-[#9fb2c6]">{dl.blurb}</p>
                  </Link>
                );
              })}
            </div>
            <ActionLog />
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.2em] text-[#7a9ab8]">Daily audit</h2>
              <p className="mt-2 text-[12px] text-[#9fb2c6]">Run the SEO + GEO audit on demand, or check the last cron result + integration health on the full Overview.</p>
              <Link to="/admin/growth/overview" className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-[#f59f4f] hover:underline">
                Open Overview <ArrowRight size={12} />
              </Link>
            </div>
          </div>
        )}

        {tab === "pipeline" && <PipelineBoard onSelectCard={selectCard} selectedId={selection?.type === "card" ? selection.card.id : null} />}
        {tab === "memory" && <PublishedMemoryTable onSelectItem={selectItem} selectedSlug={selection?.type === "memory" ? selection.item.slug : null} />}

        {tab !== "today" && tab !== "pipeline" && tab !== "memory" && (
          <DeepLinkTab tab={tab} />
        )}
      </div>

      <InspectorDrawer selection={selection} onClose={() => setSelection(null)} onApprove={() => { /* state refresh handled by re-clicking Refresh on each panel */ }} />
    </div>
  );
};

const DeepLinkTab: React.FC<{ tab: "inbox" | "drafts" | "review" | "analytics" }> = ({ tab }) => {
  const dl = DEEP_LINKS[tab];
  const Icon = dl.icon;
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03]">
        <Icon size={20} />
      </div>
      <h2 className="mt-4 text-[15px] font-semibold capitalize text-white">{tab}</h2>
      <p className="mx-auto mt-2 max-w-md text-[12px] leading-relaxed text-[#9fb2c6]">{dl.blurb}</p>
      <Link to={dl.to} className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#f59f4f] px-4 py-2 text-[12.5px] font-bold text-[#0a0c10] hover:bg-[#f5b76f]">
        Open {tab} <ArrowRight size={14} />
      </Link>
      <p className="mt-3 text-[10px] text-[#5f7c98]">Cockpit is a launchpad — the detail surface lives on the dedicated page, not embedded here.</p>
    </div>
  );
};

export default Cockpit;