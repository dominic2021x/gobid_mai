/**
 * Types for REPES (prod.executori.ro/repes) sync - server-only.
 */

export interface SyncSummary {
  pagesCrawled: number;
  itemsFound: number;
  inserted: number;
  updated: number;
  softDeleted: number;
  detailsFetched: number;
  errors: string[];
}

export interface VerifyStatusSummary {
  pagesCrawled: number;
  itemsFound: number;
  softDeleted: number;
  reactivated: number;
  errors: string[];
}

export interface RepesListingCard {
  externalId: string;
  detailUrl: string;
  title: string;
  priceText: string | null;
  locationRaw: string | null;
  timeLeft: string | null;
  publishDate: string | null;
  guarantee: string | null;
  thumbnails: string[];
}
