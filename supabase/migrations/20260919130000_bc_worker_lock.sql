-- patch_082_bc_worker_lock.sql — BC Report (19/09)
-- Lock de processamento por request: evita dois workers background
-- sobrepostos coletarem o mesmo request (a guarda retrospectiva de 90s não
-- enxerga chamadas em voo — houve consulta paga em dobro no teste Full).
alter table report_requests add column if not exists worker_lock_until timestamptz;
