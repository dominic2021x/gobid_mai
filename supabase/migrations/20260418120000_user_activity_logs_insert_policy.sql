-- Allow authenticated users to insert their own rows (PageTracker / POST /api/user/activity).
-- Service role bypasses RLS; this lets the anon+session client insert when we prefer not to use admin.
drop policy if exists "Users insert own activity" on public.user_activity_logs;
create policy "Users insert own activity"
  on public.user_activity_logs
  for insert
  to authenticated
  with check (auth.uid() = user_id);
