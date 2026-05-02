"use client";

interface BadgeProps {
  text: string;
  subtext?: string;
  color: 'orange' | 'green' | 'red' | 'blue';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export default function Badge({ text, subtext, color, size = 'md', className = '' }: BadgeProps) {
  const colorClasses = {
    orange: 'from-orange-500 to-orange-600',
    green: 'from-green-500 to-green-600',
    red: 'from-red-500 to-red-600',
    blue: 'from-blue-500 to-blue-600',
  };

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-[10px] sm:px-3 sm:py-1 sm:text-xs',
    md: 'px-2 py-0.5 text-[10px] sm:px-4 sm:py-2 sm:text-sm',
    lg: 'px-4 py-1 text-xs sm:px-6 sm:py-3 sm:text-base'
  };

  return (
    <div className={`absolute -top-1.5 -right-1.5 sm:-top-3 sm:-right-3 z-10 ${className}`}>
      <div className={`bg-gradient-to-r ${colorClasses[color]} text-white ${sizeClasses[size]} rounded-full shadow-lg transform rotate-12`}>
        <div className="font-bold">{text}</div>
        {subtext && <div className="text-[8px] sm:text-xs opacity-90">{subtext}</div>}
      </div>
    </div>
  );
}





