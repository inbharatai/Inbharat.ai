
import React from 'react';

interface TricolourStarProps {
  className?: string;
  size?: number;
}

const TricolourStar: React.FC<TricolourStarProps> = ({ className, size = 24 }) => {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 100 100" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={`${className} filter drop-shadow-[0_0_12px_rgba(255,153,51,0.3)] transform transition-transform duration-500 hover:rotate-[18deg]`}
    >
      <defs>
        <linearGradient id="saffronGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#FF9933" />
          <stop offset="100%" stopColor="#FFCC99" />
        </linearGradient>
        <linearGradient id="greenGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#138808" />
          <stop offset="100%" stopColor="#28B21B" />
        </linearGradient>
        <linearGradient id="premiumWhite" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#F0F0F0" />
        </linearGradient>
        <filter id="innerGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* Outer Halo (Abstract Geometry) */}
      <path 
        d="M50 0L55 35H90L62 55L72 90L50 70L28 90L38 55L10 35H45L50 0Z" 
        fill="white" 
        fillOpacity="0.03"
        stroke="white" 
        strokeWidth="0.5" 
        strokeOpacity="0.1" 
        strokeDasharray="2 4"
      />

      {/* Faceted Star Shards - Saffron (Top) */}
      <path 
        d="M50 10L58 38H85L63 53L50 38L37 53L15 38H42L50 10Z" 
        fill="url(#saffronGrad)" 
        fillOpacity="0.95"
      />
      
      {/* Faceted Star Shards - Green (Bottom) */}
      <path 
        d="M50 90L42 62H15L37 47L50 62L63 47L85 62H58L50 90Z" 
        fill="url(#greenGrad)" 
        fillOpacity="0.95"
      />

      {/* White Core Diamond (Nexus) */}
      <path 
        d="M50 32L58 48L74 48L61 58L66 74L50 64L34 74L39 58L26 48L42 48L50 32Z" 
        fill="url(#premiumWhite)" 
        className="drop-shadow-lg"
      />

      {/* Floating Center Orbitals */}
      <circle cx="50" cy="50" r="3" fill="#FF9933" className="animate-pulse" />
      <circle cx="50" cy="50" r="42" stroke="white" strokeWidth="0.5" strokeOpacity="0.1" />
      
      {/* Dynamic Energy Lines */}
      <line x1="50" y1="38" x2="50" y2="62" stroke="white" strokeWidth="0.5" strokeOpacity="0.2" />
      <line x1="38" y1="50" x2="62" y2="50" stroke="white" strokeWidth="0.5" strokeOpacity="0.2" />
    </svg>
  );
};

export default TricolourStar;
