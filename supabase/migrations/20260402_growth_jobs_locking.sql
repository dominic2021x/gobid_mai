-- Worker Reliability Layer: lease-based locking, per-type concurrency, quarantine
-- Prevents duplicate execution, starvation, and retry storms.

-- 1) Add columns to growth_jobs
ALTER TABLE growth_jobs
  ADD COLUMN IF NOT EXISTS locked_until timestamptz,
  ADD COLUMN IF NOT EXISTS locked_by text,
  ADD COLUMN IF NOT EXISTS priority int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quarantined boolean DEFAULT false;

-- Ensure last_error exists (already in original schema; explicit for clarity)
ALTER TABLE growth_jobs ADD COLUMN IF NOT EXISTS last_error text;

-- 2) Indexes for claim and health queries
CREATE INDEX IF NOT EXISTS idx_growth_jobs_status_run_after_priority_created
  ON growth_jobs (status, run_after, priority DESC NULLS LAST, created_at);

CREATE INDEX IF NOT EXISTS idx_growth_jobs_locked_until
  ON growth_jobs (locked_until) WHERE locked_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_growth_jobs_type_status_locked_until
  ON growth_jobs (type, status, locked_until);

CREATE INDEX IF NOT EXISTS idx_growth_jobs_quarantined_status
  ON growth_jobs (quarantined, status) WHERE quarantined = true;

-- Replace old lock function with claim function supporting lease, instance id, per-type limits
CREATE OR REPLACE FUNCTION growth_claim_next_job(p_instance_id text)
RETURNS growth_jobs AS $$
DECLARE
  v_limits jsonb;
  v_lease_sec int := 600;  -- 10 min lease
  v_row growth_jobs%ROWTYPE;
  v_candidate_id uuid;
  v_type text;
  v_limit int;
  v_locked_count int;
  v_default_limit int := 10;
BEGIN
  -- Fetch per-type concurrency limits (key: growth_job_type_limits, value: {"type1": 2, "type2": 1, "default": 5})
  SELECT COALESCE(value, '{}'::jsonb) INTO v_limits
  FROM growth_settings
  WHERE key = 'growth_job_type_limits'
  LIMIT 1;

  v_default_limit := COALESCE((v_limits->>'default')::int, 10);

  -- Find first claimable job that has capacity for its type
  FOR v_row IN
    SELECT j.*
    FROM growth_jobs j
    WHERE j.run_after <= now()
      AND (j.quarantined IS FALSE OR j.quarantined IS NULL)
      AND (j.locked_until IS NULL OR j.locked_until < now())
      AND (j.status = 'queued' OR j.status = 'locked')
    ORDER BY COALESCE(j.priority, 0) DESC, j.created_at ASC
    LIMIT 100
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Check per-type concurrency
    v_limit := COALESCE((v_limits->>v_row.type)::int, v_default_limit);
    SELECT count(*)::int INTO v_locked_count
    FROM growth_jobs
    WHERE type = v_row.type
      AND status = 'locked'
      AND locked_until > now();

    IF v_locked_count < v_limit THEN
      -- Claim this job
      UPDATE growth_jobs
      SET
        status = 'locked',
        locked_at = now(),
        locked_until = now() + (v_lease_sec || ' seconds')::interval,
        locked_by = p_instance_id,
        attempts = attempts + 1,
        updated_at = now()
      WHERE id = v_row.id;

      SELECT * INTO v_row FROM growth_jobs WHERE id = v_row.id;
      RETURN v_row;
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Health metrics RPC for admin dashboard
CREATE OR REPLACE FUNCTION growth_jobs_health()
RETURNS jsonb AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'queuedByType', coalesce((
      SELECT jsonb_object_agg(type, cnt)
      FROM (
        SELECT type, count(*)::int as cnt
        FROM growth_jobs
        WHERE status = 'queued' AND (quarantined IS FALSE OR quarantined IS NULL)
        GROUP BY type
      ) t
    ), '{}'::jsonb),
    'lockedByType', coalesce((
      SELECT jsonb_object_agg(type, cnt)
      FROM (
        SELECT type, count(*)::int as cnt
        FROM growth_jobs
        WHERE status = 'locked' AND (locked_until IS NULL OR locked_until > now())
        GROUP BY type
      ) t
    ), '{}'::jsonb),
    'oldestQueuedAgeSecByType', coalesce((
      SELECT jsonb_object_agg(type, age_sec)
      FROM (
        SELECT type, extract(epoch from (now() - min(created_at)))::int as age_sec
        FROM growth_jobs
        WHERE status = 'queued' AND (quarantined IS FALSE OR quarantined IS NULL)
        GROUP BY type
      ) t
    ), '{}'::jsonb),
    'successRate24h', (
      SELECT coalesce(
        round(
          (count(*) FILTER (WHERE ok = true)::numeric / nullif(count(*), 0) * 100)::numeric,
          2
        ),
        0
      )
      FROM growth_job_runs r
      JOIN growth_jobs j ON j.id = r.job_id
      WHERE r.started_at > now() - interval '24 hours'
    ),
    'p95RuntimeMsByType', coalesce((
      SELECT jsonb_object_agg(type, p95_ms)
      FROM (
        SELECT j.type,
          coalesce(
            (percentile_cont(0.95) WITHIN GROUP (ORDER BY extract(epoch from (r.finished_at - r.started_at)) * 1000) FILTER (WHERE r.finished_at IS NOT NULL))::int,
            0
          ) as p95_ms
        FROM growth_job_runs r
        JOIN growth_jobs j ON j.id = r.job_id
        WHERE r.started_at > now() - interval '24 hours'
        GROUP BY j.type
      ) t
    ), '{}'::jsonb),
    'quarantinedCount7d', (
      SELECT count(*)::int
      FROM growth_jobs
      WHERE quarantined = true
        AND updated_at > now() - interval '7 days'
    )
  ) INTO v_result;

  RETURN coalesce(v_result, '{}'::jsonb);
END;
$$ LANGUAGE plpgsql;
