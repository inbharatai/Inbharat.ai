import React, { useState } from 'react';
import { Copy, Check, ListOrdered, Code } from 'lucide-react';

function parseSteps(content: string): string[] {
  const steps: string[] = [];
  const lines = content.split('\n');
  let afterStepsHeading = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^(Steps|Instructions|Procedure):?\s*$/i.test(trimmed)) {
      afterStepsHeading = true;
      continue;
    }
    const numbered = /^\d+\.\s+(.+)$/.exec(trimmed);
    const stepLabel = /^Step\s+\d+[.:]\s*(.+)$/i.exec(trimmed);
    const bullet = afterStepsHeading && /^-\s+(.+)$/.test(trimmed) ? trimmed.replace(/^-\s+/, '').trim() : null;
    if (numbered) {
      steps.push(numbered[1].trim());
      afterStepsHeading = false;
    } else if (stepLabel) {
      steps.push(stepLabel[1].trim());
      afterStepsHeading = false;
    } else if (bullet) {
      steps.push(bullet);
    } else if (trimmed && !/^-\s+/.test(trimmed) && !/^#+\s/.test(trimmed) && !/^```/.test(trimmed)) {
      afterStepsHeading = false;
    }
  }
  return steps.length > 0 ? steps : [];
}

function parseCodeBlocks(content: string): { language: string; code: string }[] {
  const blocks: { language: string; code: string }[] = [];
  const regex = /```(\w*)\n?([\s\S]*?)```/g;
  let m;
  while ((m = regex.exec(content)) !== null) {
    const lang = (m[1] || 'text').trim().toLowerCase();
    const code = m[2].replace(/\n$/, '').trim();
    if (code) blocks.push({ language: lang || 'text', code });
  }
  return blocks;
}

interface CoderResponsePanelProps {
  content: string;
}

const CoderResponsePanel: React.FC<CoderResponsePanelProps> = ({ content }) => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const steps = parseSteps(content);
  const codeBlocks = parseCodeBlocks(content);

  if (steps.length === 0 && codeBlocks.length === 0) return null;

  const handleCopy = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div className="mb-5 animate-in slide-in-from-left-3 duration-400 rounded-2xl border border-[#30363d] bg-[#0d1117]/80 overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-[#30363d]">
        {steps.length > 0 && (
          <div className="p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-3">
              <ListOrdered size={14} className="text-[#138808]" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Steps</span>
            </div>
            <ol className="space-y-2 list-decimal list-inside text-sm text-gray-300">
              {steps.map((step, i) => (
                <li key={i} className="leading-relaxed">
                  <span className="text-[#138808]/90 font-semibold">{i + 1}.</span> {step}
                </li>
              ))}
            </ol>
          </div>
        )}
        {codeBlocks.length > 0 && (
          <div className="p-4 sm:p-5 flex flex-col gap-4">
            <div className="flex items-center gap-2 mb-1">
              <Code size={14} className="text-[#138808]" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Code</span>
            </div>
            {codeBlocks.map((block, idx) => (
              <div key={idx} className="rounded-xl border border-[#30363d] bg-[#161b22] overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b border-[#30363d] bg-[#0d1117]/80">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{block.language || 'text'}</span>
                  <button
                    type="button"
                    onClick={() => handleCopy(block.code, idx)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-gray-400 hover:text-white hover:bg-[#30363d] transition-all"
                  >
                    {copiedIndex === idx ? <Check size={12} /> : <Copy size={12} />}
                    {copiedIndex === idx ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <pre className="p-4 overflow-x-auto text-xs sm:text-sm text-gray-300 font-mono whitespace-pre leading-relaxed m-0">
                  <code>{block.code}</code>
                </pre>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CoderResponsePanel;
