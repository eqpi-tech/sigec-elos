# Query the ELOS database (read-only inspection)

Run a read-only SQL query against the ELOS Supabase Postgres and show the result.

Query to run: $ARGUMENTS

Steps:
1. The connection string is in `.env` as `SUPABASE_DB_URL` (never print it).
2. Preferred driver for ad-hoc queries is `pg8000` (pure Python). If it is not
   importable, install it into a temp target dir and set `PYTHONPATH` to it:
   `python3 -m pip install --quiet --target <scratchpad>/pylibs pg8000`.
   On Apple Silicon, run Python via `arch -x86_64` if binary wheels complain.
3. Write a small Python script (heredoc `python3 - <<'EOF'`, never `-c` with nested
   quotes) that parses `SUPABASE_DB_URL`, connects with `ssl_context=True` and runs
   the query.
4. This path bypasses RLS (direct DB role) — treat results as sensitive: mask CPF,
   don't paste personal data beyond what the task needs.
5. Writes from scripts are allowed ONLY on the ELOS Supabase. The legacy HOC MySQL
   is read-only, always (`SET SESSION transaction_read_only = 1`).
