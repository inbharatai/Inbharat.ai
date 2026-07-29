import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, CornerDownLeft, ArrowUp, ArrowDown, BarChart3, RefreshCw, Compass } from "lucide-react";
import { useAdminApi } from "../../../lib/growth/adminApi";
import { buildCommandIndex, filterCommands, type Command } from "../../../lib/growth/cockpit/commandBar";

/**
 * Jervis-style Cmd+K command bar over the Growth admin console. Mounts globally
 * (in AdminGrowthLayout) and opens on Cmd+K / Ctrl+K. Static index: every admin
 * child route (from the single source of truth) becomes a "Go to …" command, plus
 * action shortcuts that fire existing POST endpoints. Filtering/ranking lives in
 * the pure commandBar module (hermetically tested); this component only renders,
 * handles keyboard nav, and dispatches.
 *
 * Nothing here auto-publishes. Action shortcuts call the same read/audit endpoints
 * the Today Command uses. Honest empty state — no fabricated commands.
 */

const ICON_BY_KEY: Record<string, React.ComponentType<{ size?: number }>> = {
  nav: Compass,
  bar: BarChart3,
  refresh: RefreshCw,
};

const GROUP_LABEL: Record<string, string> = {
  navigate: "Navigate",
  action: "Actions",
};

const CommandBar: React.FC = () => {
  const navigate = useNavigate();
  const { fetchJson } = useAdminApi();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [busyMsg, setBusyMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const index = useMemo(() => buildCommandIndex(), []);
  const results = useMemo(() => filterCommands(index, query), [index, query]);

  // Open/close handlers. Cmd+K / Ctrl+K toggles; Esc closes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Focus the input on open; reset state on close.
  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      setBusyMsg(null);
      // Defer focus until the input is painted.
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Keep the active index in range as results change.
  useEffect(() => {
    if (active >= results.length) setActive(0);
  }, [results, active]);

  // Scroll the active row into view.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLLIElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  async function runAction(cmd: Command) {
    if (cmd.action === "refresh") {
      setOpen(false);
      window.location.reload();
      return;
    }
    if (cmd.action === "sync-analytics") {
      setBusyMsg("Syncing analytics…");
      const { data, error } = await fetchJson<{ ok: boolean; error?: string }>("/api/growth/performance", {
        method: "POST", body: JSON.stringify({ days: 28 }),
      });
      setBusyMsg(error || !data?.ok ? `Sync failed: ${error || data?.error || "unknown"}` : "Analytics synced ✓");
      return;
    }
    if (cmd.action === "run-audit") {
      setBusyMsg("Running daily audit…");
      const { data, error } = await fetchJson<{ ok: boolean; error?: string }>("/api/growth/cron/daily", {
        method: "POST", body: JSON.stringify({}),
      });
      setBusyMsg(error || !data?.ok ? `Audit failed: ${error || data?.error || "unknown"}` : "Daily audit done ✓");
      return;
    }
  }

  const select = useCallback((cmd: Command) => {
    if (cmd.to) {
      navigate(cmd.to);
      setOpen(false);
    } else if (cmd.action) {
      void runAction(cmd);
    }
  }, [navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); const cmd = results[active]; if (cmd) select(cmd); }
  }

  if (!open) return null;

  // Group results preserving the filtered order (navigate entries precede action
  // entries in the canonical index, so a simple run-length grouping works).
  const grouped: { group: string; items: { cmd: Command; idx: number }[] }[] = [];
  results.forEach((cmd, idx) => {
    const last = grouped[grouped.length - 1];
    if (last && last.group === cmd.group) last.items.push({ cmd, idx });
    else grouped.push({ group: cmd.group, items: [{ cmd, idx }] });
  });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[12vh]" onClick={() => setOpen(false)}>
      <div
        className="w-full max-w-xl overflow-hidden rounded-xl border border-white/10 bg-[#0a0f18] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-white/[0.06] px-3">
          <Search size={15} className="shrink-0 text-[#7a9ab8]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            onKeyDown={onKeyDown}
            placeholder="Type a command or page… (Cmd+K to toggle, Esc to close)"
            className="w-full bg-transparent py-3 text-[13px] text-white placeholder:text-[#5f7c98] focus:outline-none"
          />
          <kbd className="hidden shrink-0 rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-[#7a9ab8] sm:inline">Esc</kbd>
        </div>

        {busyMsg && <p className="px-3 py-2 text-[12px] text-[#c0cfe0]">{busyMsg}</p>}

        <ul ref={listRef} className="max-h-[50vh] overflow-y-auto py-2">
          {results.length === 0 && (
            <li className="px-4 py-6 text-center text-[12px] text-[#7a9ab8]">{`No commands match "${query}".`}</li>
          )}
          {grouped.map(({ group, items }) => (
            <li key={group}>
              <p className="px-4 pt-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#5f7c98]">{GROUP_LABEL[group] ?? group}</p>
              <ul>
                {items.map(({ cmd, idx }) => {
                  const Icon = ICON_BY_KEY[cmd.iconKey] ?? Compass;
                  const isActive = idx === active;
                  return (
                    <li key={cmd.id} data-idx={idx}>
                      <button
                        onMouseEnter={() => setActive(idx)}
                        onClick={() => select(cmd)}
                        className={`flex w-full items-center gap-2.5 px-4 py-2 text-left text-[12.5px] transition-colors ${isActive ? "bg-[#f59f4f]/10 text-white" : "text-[#c8d6e8] hover:bg-white/[0.04]"}`}
                      >
                        <Icon size={14} className="shrink-0 text-[#7a9ab8]" />
                        <span className="min-w-0 flex-1 truncate font-semibold">{cmd.label}</span>
                        {cmd.hint && <span className="hidden truncate text-[10px] text-[#5f7c98] sm:inline">{cmd.hint}</span>}
                        {isActive && <CornerDownLeft size={12} className="shrink-0 text-[#f59f4f]" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-3 border-t border-white/[0.06] px-4 py-2 text-[10px] text-[#5f7c98]">
          <span className="inline-flex items-center gap-1"><ArrowUp size={10} /><ArrowDown size={10} /> navigate</span>
          <span className="inline-flex items-center gap-1"><CornerDownLeft size={10} /> select</span>
          <span className="ml-auto">Read-only + audit actions · nothing auto-publishes</span>
        </div>
      </div>
    </div>
  );
};

export default CommandBar;