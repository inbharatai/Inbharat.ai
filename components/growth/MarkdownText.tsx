import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Compact markdown renderer for admin growth surfaces (Agent chat bubbles +
 * Issues draft previews). The founder was seeing raw markdown syntax — `**bold**`,
 * `##` headings, ```code fences, `#hashtags` — because those surfaces rendered
 * text as-is. This renders it: bold as bold, headings as headings, code as
 * styled code blocks. Mermaid fences render as a styled code block here (the
 * live ArticlePage is where diagrams are rendered as SVG); the preview just
 * needs to show clean formatted text, not raw syntax. Dark-themed + small to
 * fit admin panels. Pass a `className` to set the base font size.
 */
const MarkdownText: React.FC<{ children: string; className?: string }> = ({ children, className = "" }) => (
  <div
    className={
      "leading-relaxed text-[#e6eef7] " +
      "[&_a]:text-[#f5b76f] [&_a]:underline " +
      "[&_h1]:mt-3 [&_h1]:text-[15px] [&_h1]:font-bold [&_h1]:text-white " +
      "[&_h2]:mt-3 [&_h2]:text-[14px] [&_h2]:font-bold [&_h2]:text-white " +
      "[&_h3]:mt-2 [&_h3]:text-[13px] [&_h3]:font-semibold [&_h3]:text-white " +
      "[&_p]:my-1.5 [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 " +
      "[&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 " +
      "[&_strong]:text-white [&_blockquote]:border-l-2 [&_blockquote]:border-[#f59f4f]/40 [&_blockquote]:pl-2.5 [&_blockquote]:text-[#c8d6e8] " +
      "[&_code]:rounded [&_code]:bg-black/30 [&_code]:px-1 [&_code]:py-0.5 " +
      "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:border [&_pre]:border-white/10 [&_pre]:bg-black/30 [&_pre]:p-2.5 " +
      "[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-[12px] " +
      className
    }
  >
    <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
  </div>
);

export default MarkdownText;