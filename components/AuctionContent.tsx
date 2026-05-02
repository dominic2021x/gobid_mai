"use client";

import React from 'react';
import LockedContent from './LockedContent';
import UnlockedContent from './UnlockedContent';

interface AuctionContentProps {
  isUnlocked: boolean;
  location: string;
  seller: string;
  participants: string;
  isDarkMode: boolean;
  onUnlock: () => void;
  userTokens: number;
  disabled?: boolean;
}

export const AuctionContent: React.FC<AuctionContentProps> = ({
  isUnlocked,
  location,
  seller,
  participants,
  isDarkMode,
  onUnlock,
  userTokens,
  disabled = false
}) => {
  if (isUnlocked) {
    return (
      <UnlockedContent
        location={location}
        seller={seller}
        participants={participants}
        isDarkMode={isDarkMode}
      />
    );
  }

  return (
    <LockedContent
      location={location}
      seller={seller}
      participants={participants}
      isDarkMode={isDarkMode}
      onUnlock={onUnlock}
      userTokens={userTokens}
      disabled={disabled}
    />
  );
};

export default AuctionContent;
