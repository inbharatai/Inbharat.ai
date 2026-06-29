/**
 * Pure status → chip-color mapping for the shared "Today's pipeline" strip
 * (rendered on both the Agent and Issues admin pages). Kept in lib (no React,
 * no auth imports) so it's hermetically unit-testable without pulling the
 * component graph into the test process. The PipelineStrip component imports
 * this; the test imports it directly.
 */
export interface StatusChip {
  label: string;
  cls: string;
}

export function statusChip(status: string | null | undefined): StatusChip {
  switch (status) {
    case "pending":
      return { label: "pending", cls: "bg-amber-500/15 text-amber-300" };
    case "approved":
      return { label: "approved", cls: "bg-emerald-500/15 text-emerald-300" };
    case "rejected":
      return { label: "rejected", cls: "bg-rose-500/15 text-rose-300" };
    case "published":
      return { label: "published", cls: "bg-sky-500/15 text-sky-300" };
    default:
      return { label: status || "—", cls: "bg-white/5 text-[#7a9ab8]" };
  }
}