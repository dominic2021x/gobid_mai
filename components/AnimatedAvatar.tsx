/**
 * Animated Avatar Component - Avatar animat pentru chat
 * Se animă când AI vorbește
 */

"use client";

import { useEffect, useState } from 'react';

interface AnimatedAvatarProps {
  isSpeaking?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export default function AnimatedAvatar({ 
  isSpeaking = false, 
  size = 'md',
  className = '' 
}: AnimatedAvatarProps) {
  const [animationClass, setAnimationClass] = useState('');

  useEffect(() => {
    if (isSpeaking) {
      setAnimationClass('animate-pulse');
    } else {
      setAnimationClass('');
    }
  }, [isSpeaking]);

  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-16 h-16',
  };

  return (
    <div
      className={`${sizeClasses[size]} rounded-full bg-gradient-to-br from-[#25D366] to-[#075E54] flex items-center justify-center ${animationClass} ${className}`}
    >
      <span className="text-white text-xl">🤖</span>
    </div>
  );
}

