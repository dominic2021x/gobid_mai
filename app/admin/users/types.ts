export type SupportedAccountType = "business" | "private" | "executor";

export interface PaymentRecord {
  id: string;
  invoiceNumber?: string | null;
  amount: number;
  currency: string;
  type: string;
  description?: string | null;
  metadata?: Record<string, any>;
  createdAt: string;
}

export interface ActivityRecord {
  id: string;
  event: string;
  properties: Record<string, any>;
  createdAt: string;
}

export interface AuctionHistoryRecord {
  id: string;
  productId?: string | null;
  status: string;
  bidAmount?: number | null;
  currency?: string | null;
  metadata?: Record<string, any>;
  occurredAt: string;
}

export interface TokensState {
  balance: number;
  totalEarned: number;
  totalSpent: number;
  level: string;
}

export interface AdminUser {
  id: string;
  email: string;
  createdAt: string;
  firstName: string;
  lastName: string;
  /** Din user_profiles.metadata sau user_metadata (Supabase Auth). */
  username?: string;
  phone?: string;
  avatar?: string;
  dateOfBirth?: string | null;
  address?: string;
  city?: string;
  country?: string;
  ipAddress?: string;
  companyName?: string;
  companyCui?: string;
  companyAddress?: string;
  companyVerified?: boolean;
  accountType: SupportedAccountType;
  tokens: TokensState;
  payments: PaymentRecord[];
  unlockedProducts: string[];
  favoriteAuctions: string[];
  activity: ActivityRecord[];
  auctionHistory: AuctionHistoryRecord[];
  role?: string;
  isAdmin?: boolean;
  lastActivityDate?: string | null;
  isLive?: boolean;
}


