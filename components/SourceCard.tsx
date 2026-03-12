
import React from 'react';
import { ExternalLink, Globe } from 'lucide-react';
import { Source } from '../types';

interface SourceCardProps {
  source: Source;
  index: number;
}

const SourceCard: React.FC<SourceCardProps> = ({ source, index }) => {
  let hostname = 'source';
  let faviconUrl = '';
  try {
    const url = new URL(source.uri);
    hostname = url.hostname.replace('www.', '');
    faviconUrl = `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;
  } catch {
    // invalid URL, keep fallback
  }
  
  return (
    <a
      href={source.uri}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 p-3 bg-[#161b22] border border-[#30363d]/50 rounded-2xl hover:bg-[#1c2128] hover:border-[#FF9933]/30 transition-all group min-w-0"
    >
      <div className="relative flex-shrink-0">
        <div className="w-8 h-8 flex items-center justify-center bg-[#0d1117] border border-[#30363d]/30 rounded-xl overflow-hidden group-hover:border-[#FF9933]/20 transition-all">
          {faviconUrl ? (
            <img
              src={faviconUrl}
              alt=""
              className="w-4 h-4"
              onError={(e) => {
                const img = e.target as HTMLImageElement;
                img.style.display = 'none';
                // Show the fallback globe sibling
                const fallback = img.nextElementSibling as HTMLElement;
                if (fallback) fallback.style.display = 'block';
              }}
            />
          ) : null}
          <Globe size={14} className="text-gray-500" style={{ display: faviconUrl ? 'none' : 'block' }} />
        </div>
        <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center w-4 h-4 text-[8px] font-black bg-[#FF9933]/90 text-white rounded-full shadow-sm">
          {index + 1}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold text-gray-100 truncate group-hover:text-white transition-colors leading-tight">
          {source.title}
        </p>
        <p className="text-[9px] font-bold uppercase tracking-wider text-gray-500 truncate mt-0.5">
          {hostname}
        </p>
      </div>
      <ExternalLink size={12} className="text-gray-600 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0 -translate-x-1 group-hover:translate-x-0" />
    </a>
  );
};

export default SourceCard;
