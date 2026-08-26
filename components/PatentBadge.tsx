import React from 'react';

type Props = {
  applicationNo: string;
  className?: string;
};

export const PatentBadge: React.FC<Props> = ({ applicationNo, className = '' }) => (
  <span
    className={[
      'inline-flex items-center gap-2 rounded-full border border-[#f59f4f]/30',
      'bg-[#f59f4f]/[0.08] px-3 py-1 text-[10px] font-bold uppercase',
      'tracking-[0.12em] text-[#f7bd7b]',
      className,
    ].join(' ')}
  >
    <span
      className="h-1.5 w-1.5 rounded-full bg-[#f59f4f]"
      aria-hidden="true"
    />
    Patent Pending · India · {applicationNo}
  </span>
);
