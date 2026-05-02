/**
 * Types for licitatii-insolventa.ro sync (server-only).
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

export interface ListingRow {
  id: string;
  source_external_id: string;
  source_url: string;
  title: string | null;
  price_text: string | null;
  category: string | null;
  location_raw: string | null;
  location_city: string | null;
  location_county: string | null;
  description_html: string | null;
  seller_name: string | null;
  seller_profile_url: string | null;
  published_at: string | null;
  auction_date: string | null;
  auction_time: string | null;
  sale_type: string | null;
  pdf_url: string | null;
  last_seen_at: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}
