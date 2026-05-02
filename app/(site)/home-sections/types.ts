/**
 * Shared types for homepage section components. Keeps props contracts explicit and reusable.
 */

export interface HomeActiveAuction {
  id: string;
  title: string;
  image?: string;
  price: string;
  location: string;
  tokenCost: number;
  timerSeconds?: number;
  auctionDate?: string | null;
  url?: string;
  slug?: string;
  [key: string]: unknown;
}

export interface HomeUserTokens {
  balance: number;
  totalEarned: number;
  totalSpent: number;
  level: string;
  package: string;
}
