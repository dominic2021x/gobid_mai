"use client";

import React from 'react';
import { LocationIcon, UserIcon, ClockIcon, CoinsIcon } from './HeroIcons';

interface LockedContentProps {
  location: string;
  seller: string;
  participants: string;
  isDarkMode: boolean;
  onUnlock: () => void;
  userTokens: number;
  disabled?: boolean;
}

export const LockedContent: React.FC<LockedContentProps> = ({
  location,
  seller,
  participants,
  isDarkMode,
  onUnlock,
  userTokens,
  disabled = false
}) => {
  return (
    <div className="mb-4">
      <div className="space-y-2 blur-sm">
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
      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <CoinsIcon size="m" className="text-yellow-500" />
          <span className={`text-sm font-medium ${isDarkMode ? 'text-yellow-400' : 'text-yellow-600'}`}>1 Token</span>
        </div>
        <button
          onClick={onUnlock}
          className="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={disabled || userTokens < 1}
        >
          Deblochează
        </button>
      </div>
    </div>
  );
};

export default LockedContent;
