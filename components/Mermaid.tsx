import React, { useEffect, useId, useState } from 'react';

/**
 * Renders a ```mermaid fence from an article body as a real SVG diagram, not a
 * raw text code block. Mermaid is dynamically imported (await import('mermaid'))
 * so its ~bundle weight lands ONLY on article pages that actually contain a
 * diagram, never in the main app bundle. Initialized once per page with the
 * dark theme so diagrams match the article's dark navy/orange palette.
 *
 * Graceful: if the graph text is malformed (mermaid.render throws), we fall
 * back to a styled <pre> showing the raw source with a small "diagram failed"
 * note — the article still reads cleanly, never a blank box or a crash. This is
 * the public reading surface, so it must degrade gracefully.
 *
 * securityLevel stays 'strict' (mermaid default) — article bodies are model-
 * generated then founder-approved, but strict sanitization is the safe default
 * for a public page.
 */

let mermaidReady: Promise<typeof import('mermaid')['default']> | null = null;
function loadMermaid() {
  if (!mermaidReady) {
    mermaidReady = import('mermaid').then((m) => {
      const mer = m.default;
      mer.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'strict' });
      return mer;
    });
  }
  return mermaidReady;
}

const Mermaid: React.FC<{ graph: string }> = ({ graph }) => {
  const rawId = useId();
  // useId yields strings with ':' (e.g. ":r0:") which are invalid as DOM ids /
  // mermaid render selectors — sanitize to a safe id.
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const id = `mermaid-${rawId.replace(/[^a-zA-Z0-9]/g, '')}`;

  useEffect(() => {
    let cancelled = false;
    loadMermaid()
      .then((mer) => mer.render(id, graph))
      .then((res) => {
        if (!cancelled) setSvg(res.svg);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [graph, id]);

  if (error) {
    return (
      <figure className="my-6 overflow-hidden rounded-xl border border-rose-400/30 bg-rose-500/[0.04] p-4">
        <figcaption className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-rose-300/80">
          Diagram unavailable
        </figcaption>
        <pre className="overflow-x-auto text-[12px] leading-relaxed text-[#c8d6e8]">{graph}</pre>
      </figure>
    );
  }

  if (!svg) {
    // Lightweight skeleton while mermaid loads/parses — matches the diagram
    // aspect ratio roughly so the page doesn't jump on resolve.
    return (
      <div
        className="my-6 flex h-48 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.02] text-[12px] text-[#8eaac5]"
        role="status"
        aria-label="Loading diagram"
      >
        Rendering diagram…
      </div>
    );
  }

  return (
    <div
      className="my-6 flex justify-center overflow-x-auto rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 [&_svg]:max-w-full"
      // Mermaid's render() returns a sanitized SVG string (securityLevel strict).
      // dangerouslySetInnerHTML is the standard mermaid+React integration path.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
};

export default Mermaid;