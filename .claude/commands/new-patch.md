# Create a new database patch

Create the next `supabase/patch_NNN_<short_name>.sql` for: $ARGUMENTS

Rules:
1. `ls supabase/patch_*.sql` to find the next sequential number (zero-padded, e.g.
   `patch_071_...`). Never edit an already-applied patch — always a new file.
2. Make it re-runnable where practical: `create or replace function`,
   `drop policy if exists` before `create policy`, `if not exists` on columns/indexes.
3. RLS reminders (hard-won):
   - wrap function calls in policies as `(select fn())` so they run once per query;
   - text search under RLS won't use trigram indexes (`ilike` is not leakproof) —
     admin-wide searches belong in a `security definer` RPC guarded by `is_admin()`.
4. Mind the reserved ID ranges (per-client HOC categories ≥ 1,000,000; ELOS-native
   categories 500,000+; ELOS-native catalog docs 10,000+) — the sync relies on them.
5. Header comment: what/why, one line each. Then apply it in the Supabase SQL
   editor, verify, and commit the patch together with the code that uses it.
