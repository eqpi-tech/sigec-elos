# Check HOC → ELOS sync health

Verify that the nightly one-way sync (HOC MySQL → ELOS Supabase) is healthy.

Steps:
1. Query the `sync_state` table (see `/db-query`): per entity show `watermark`,
   `last_run_at`, `rows_read`, `rows_written`, `status`, `error`. Flag any entity
   whose `last_run_at` is older than ~26h or whose `status` is `error`.
2. Check the GitHub Actions runs: `gh run list --workflow sync-hoc-elos.yml -L 5`
   (also `daily-notifications.yml` if notification jobs are in question).
3. If a run failed, fetch its log with `gh run view <id> --log-failed`. A single
   transient MySQL connection drop self-heals next run (watermarks are not
   advanced on failure); repeated failures need investigation.
4. Report: last successful sync time, per-entity anomalies, and whether any
   action is needed. Reference `docs/SYNC_HOC_ELOS.md` for the invariants
   (one-way, no DELETE, `hoc_id` ownership, ID ranges).
