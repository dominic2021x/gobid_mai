// User Activity Management Utility
// This utility helps manage user activities across different components

export interface UserActivity {
  id: number;
  type: string;
  description: string;
  amount?: string;
  status?: string;
  timestamp: string;
  timeAgo: string;
}

export interface AuctionHistory {
  id: number;
  title: string;
  status: string;
  bid: string;
  date: string;
}

// Get user activity from localStorage
export const getUserActivity = (): UserActivity[] => {
  if (typeof window === 'undefined') return [];
  
  const savedActivity = localStorage.getItem('userActivity');
  return savedActivity ? JSON.parse(savedActivity) : [];
};

// Get auction history from localStorage
export const getAuctionHistory = (): AuctionHistory[] => {
  if (typeof window === 'undefined') return [];
  
  const savedHistory = localStorage.getItem('auctionHistory');
  return savedHistory ? JSON.parse(savedHistory) : [];
};

// Save user activity to localStorage
export const saveUserActivity = (activity: UserActivity[]): void => {
  if (typeof window === 'undefined') return;
  
  localStorage.setItem('userActivity', JSON.stringify(activity));
};

// Save auction history to localStorage
export const saveAuctionHistory = (history: AuctionHistory[]): void => {
  if (typeof window === 'undefined') return;
  
  localStorage.setItem('auctionHistory', JSON.stringify(history));
};

// Add new activity
export const addUserActivity = (
  type: string, 
  description: string, 
  amount?: string, 
  status?: string
): void => {
  const currentActivity = getUserActivity();
  
  const newActivity: UserActivity = {
    id: Date.now(),
    type,
    description,
    amount,
    status,
    timestamp: new Date().toISOString(),
    timeAgo: 'acum'
  };

  const updatedActivity = [newActivity, ...currentActivity].slice(0, 10); // Keep only last 10
  saveUserActivity(updatedActivity);
};

// Add auction to history
export const addAuctionHistory = (
  title: string, 
  status: string, 
  bid: string, 
  date: string
): void => {
  const currentHistory = getAuctionHistory();
  
  const newHistoryItem: AuctionHistory = {
    id: Date.now(),
    title,
    status,
    bid,
    date
  };

  const updatedHistory = [newHistoryItem, ...currentHistory];
  saveAuctionHistory(updatedHistory);
};

// Clear all user data (for logout)
// NOTE: This function should NEVER remove 'products' from localStorage as products are global data, not user-specific
export const clearUserData = (): void => {
  if (typeof window === 'undefined') return;
  
  localStorage.removeItem('userActivity');
  localStorage.removeItem('auctionHistory');
  localStorage.removeItem('userInfo');
  localStorage.removeItem('userTokens');
  localStorage.removeItem('unlockedAuctions');
  localStorage.removeItem('favorites');
  localStorage.removeItem('recentActivity');
  // DO NOT remove 'products' - it's global data that should persist
  // DO NOT remove 'adminInfo' - it's separate from user data
  // DO NOT remove 'adminNotifications' - it's separate from user data
};
