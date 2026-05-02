"use client";

import React from 'react';
import { LocationIcon, UserIcon, ClockIcon } from './HeroIcons';

interface UnlockedContentProps {
  location: string;
  seller: string;
  participants: string;
  isDarkMode: boolean;
}

export const UnlockedContent: React.FC<UnlockedContentProps> = ({
  location,
  seller,
  participants,
  isDarkMode
}) => {
  return (
    <div className="mb-4">
      <div className="space-y-2">
        <div className="flex items-center space-x-2">
          <LocationIcon size="s" className="text-gray-500" />
          <span className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>{location}</span>
        </div>
        <div className="flex items-center space-x-2">
          <UserIcon size="s" className="text-gray-500" />
          <span className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Vânzător: {seller}</span>
        </div>
        <div className="flex items-center space-x-2">
          <ClockIcon size="s" className="text-gray-500" />
          <span className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Licitatii: {participants}</span>
        </div>
      </div>
    </div>
  );
};

export default UnlockedContent;
