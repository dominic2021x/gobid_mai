export type ImageJobStatus = "pending" | "processing" | "done" | "failed";

export type ImageJobRow = {
  id: string;
  source_url: string;
  user_id: string;
  status: ImageJobStatus;
  content_hash: string | null;
  result_public_url: string | null;
  storage_key: string | null;
  error_message: string | null;
  attempts: number;
  max_attempts: number;
  product_id: string | null;
  replace_source_url: string;
  next_run_at: string | null;
  locked_at: string | null;
  created_at: string;
  updated_at: string;
};
