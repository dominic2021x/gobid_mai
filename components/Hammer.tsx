"use client";

import { useState, useEffect } from "react";

interface HammerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  animated?: boolean;
  color?: 'default' | 'gold' | 'silver' | 'bronze';
  className?: string;
  onClick?: () => void;
}

export default function Hammer({ 
  size = 'md', 
  animated = false, 
  color = 'default',
  className = '',
  onClick 
}: HammerProps) {
  const [isAnimating, setIsAnimating] = useState(false);

  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
    xl: 'w-24 h-24'
  };

  const colorClasses = {
    default: 'text-gray-700',
    gold: 'text-yellow-500',
    silver: 'text-gray-400',
    bronze: 'text-orange-600'
  };

  const handleClick = () => {
    if (animated) {
      setIsAnimating(true);
      setTimeout(() => setIsAnimating(false), 1000);
    }
    onClick?.();
  };

  // Continuous animation for loading
  useEffect(() => {
    if (animated) {
      setIsAnimating(true);
    }
  }, [animated]);

  return (
    <div 
      className={`${sizeClasses[size]} ${className} ${onClick ? 'cursor-pointer' : ''} transition-transform duration-200 hover:scale-105 relative`}
      onClick={handleClick}
    >
      <svg 
        viewBox="0 0 24 24" 
        fill="currentColor"
        className={`w-full h-full ${colorClasses[color]} ${
          isAnimating ? 'hammer-strike' : ''
        }`}
      >
        {/* Hammer Head */}
        <rect 
          x="8" 
          y="4" 
          width="8" 
          height="4" 
          rx="1"
          className="drop-shadow-sm"
        />
        
        {/* Hammer Handle */}
        <rect 
          x="10.5" 
          y="8" 
          width="3" 
          height="12" 
          rx="1.5"
          className="drop-shadow-sm"
        />
        
        
        {/* Hammer Face Detail */}
        <rect 
          x="8.5" 
          y="4.5" 
          width="7" 
          height="1" 
          rx="0.5"
          className="opacity-80"
        />
        
        {/* Metallic Shine Effect */}
        <rect 
          x="8.2" 
          y="4.2" 
          width="1.5" 
          height="3.6" 
          rx="0.3"
          className="opacity-30"
        />
      </svg>
      
      {/* Wooden Sound Block - rectangular positioned slightly left and down */}
      <div className="absolute left-2 top-1/2 transform translate-y-3">
        <svg width="28" height="16" viewBox="0 0 28 16" fill="currentColor" className={`${colorClasses[color]} opacity-80`}>
          {/* Main block surface - rectangular */}
          <rect x="2" y="4" width="24" height="8" rx="1" />
          
          {/* Wood grain vertical lines */}
          <line x1="6" y1="4" x2="6" y2="12" stroke="currentColor" strokeWidth="0.5" opacity="0.3"/>
          <line x1="10" y1="4" x2="10" y2="12" stroke="currentColor" strokeWidth="0.5" opacity="0.3"/>
          <line x1="14" y1="4" x2="14" y2="12" stroke="currentColor" strokeWidth="0.5" opacity="0.3"/>
          <line x1="18" y1="4" x2="18" y2="12" stroke="currentColor" strokeWidth="0.5" opacity="0.3"/>
          <line x1="22" y1="4" x2="22" y2="12" stroke="currentColor" strokeWidth="0.5" opacity="0.3"/>
        </svg>
      </div>
    </div>
  );
}

// Animated Auction Hammer Component
export function AuctionHammer({ 
  isActive = false, 
  onStrike = () => {},
  className = '' 
}: {
  isActive?: boolean;
  onStrike?: () => void;
  className?: string;
}) {
  const [isStriking, setIsStriking] = useState(false);

  const handleStrike = () => {
    setIsStriking(true);
    onStrike();
    setTimeout(() => setIsStriking(false), 600);
  };

  useEffect(() => {
    if (isActive) {
      const interval = setInterval(() => {
        handleStrike();
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [isActive]);

  return (
    <div className={`relative ${className}`}>
      {/* Hammer */}
      <div 
        className={`transition-transform duration-300 ${
          isStriking ? 'hammer-strike' : 'rotate-0 scale-100'
        }`}
      >
        <Hammer 
          size="xl" 
          color="gold" 
          animated={isStriking}
          onClick={handleStrike}
        />
      </div>
      
      {/* Strike Effect */}
      {isStriking && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-16 h-16 border-4 border-yellow-400 rounded-full ripple-effect opacity-75"></div>
        </div>
      )}
      
      {/* Sound Waves */}
      {isStriking && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-6 h-6 border-2 border-yellow-300 rounded-full ripple-effect animation-delay-100"></div>
          <div className="absolute w-10 h-10 border-2 border-yellow-200 rounded-full ripple-effect animation-delay-200"></div>
          <div className="absolute w-14 h-14 border-2 border-yellow-100 rounded-full ripple-effect animation-delay-300"></div>
        </div>
      )}
    </div>
  );
}

// Hammer Icon for Navigation/UI (full hammer with sound block)
export function HammerIcon({ 
  size = 'md',
  className = '' 
}: {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  return (
    <Hammer 
      size={size} 
      color="default" 
      className={className}
    />
  );
}

// Minimal gavel icon for menu/nav (cap stânga, mâner diagonal, linie sunet)
export function GavelIcon({ 
  className = '' 
}: {
  className?: string;
}) {
  return (
    <svg 
      viewBox="0 0 24 24" 
      fill="currentColor"
      className={className}
      aria-hidden
    >
      {/* Cap gavel - dreptunghi stânga */}
      <rect x="1" y="5" width="7" height="5" rx="0.5" />
      {/* Mâner diagonal spre dreapta-jos */}
      <path d="M 6 10 L 20 22 L 22 20 L 8 8 Z" />
      {/* Linie bloc sunet dedesubt */}
      <rect x="3" y="20" width="10" height="2" rx="0.5" />
    </svg>
  );
}