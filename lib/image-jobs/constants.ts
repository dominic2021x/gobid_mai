/** Fetch timeout per job attempt (SSR-safe request). */
export const IMAGE_JOB_FETCH_TIMEOUT_MS = 5_000;

/** Parallel jobs inside one worker invocation (import turbo + cron). */
export const IMAGE_JOB_WORKER_CONCURRENCY = 12;

/** Max retries per job (initial try + failures). */
export const IMAGE_JOB_MAX_ATTEMPTS = 3;

/** Max pending rows fetched per cron tick. */
export const IMAGE_JOB_BATCH_LIMIT = 48;
