
import React from 'react';
import { ExternalLink, Globe } from 'lucide-react';
import { Source } from '../types';

interface SourceCardProps {
  source: Source;
  index: number;
}

const SourceCard: React.FC<SourceCardProps> = ({ source, index }) => {
  let hostname = 'source';
  try {
    hostname = new URL(source.uri).hostname.replace('www.', '');
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
      <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-[#0d1117] border border-[#30363d]/30 text-gray-400 font-bold rounded-xl text-[10px] group-hover:text-[#FF9933] group-hover:border-[#FF9933]/20 transition-all">
        {index + 1}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold text-gray-100 truncate group-hover:text-white transition-colors">
          {source.title}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <Globe size={10} className="text-gray-600" />
          <p className="text-[9px] font-bold uppercase tracking-wider text-gray-500 truncate">
            {hostname}
          </p>
        </div>
      </div>
      <ExternalLink size={12} className="text-gray-600 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0 -translate-x-1 group-hover:translate-x-0" />
    </a>
  );
};

export default SourceCard;
