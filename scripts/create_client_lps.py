#!/usr/bin/env python3
"""
create_client_lps.py — Cria registros de client_landing_pages para todos os
clientes migrados do HOC no SIGEC-ELOS.

Usa o campo `sigla` do HOC como slug (ex: aga, csn, apn).
É idempotente: pula clientes que já têm LP cadastrada.

Uso:
  python3.12 create_client_lps.py [--dry-run]
"""

import argparse
import json
import sys
import logging
from datetime import datetime
import mysql.connector
from supabase import create_client

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger('create_lps')


def load_config(path='hoc_migration_config.json'):
    with open(path) as f:
        return json.load(f)


def normalize_slug(sigla: str) -> str:
    return sigla.strip().lower().replace(' ', '-')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--config', default='hoc_migration_config.json')
    args = parser.parse_args()

    cfg = load_config(args.config)
    dry_run = args.dry_run
    if dry_run:
        log.info('*** DRY-RUN — nada será gravado ***')

    # Conectar MySQL HOC
    conn = mysql.connector.connect(
        host=cfg['hoc_mysql']['host'],
        user=cfg['hoc_mysql']['user'],
        password=cfg['hoc_mysql']['password'],
        database=cfg['hoc_mysql']['database'],
        use_pure=True,
    )
    cur = conn.cursor(dictionary=True)

    # Buscar todos os clientes HOC com sigla
    cur.execute('SELECT id, razao_social, nome_fantasia, sigla, cnpj FROM cliente ORDER BY id')
    hoc_clients = {row['id']: row for row in cur.fetchall()}
    log.info(f'HOC: {len(hoc_clients)} clientes encontrados')
    cur.close()
    conn.close()

    # Conectar Supabase
    sb = create_client(cfg['sigec_supabase']['url'], cfg['sigec_supabase']['service_role_key'])

    # Buscar clientes do SIGEC com hoc_id
    res = sb.table('clients').select('id,hoc_id,razao_social,nome_fantasia').execute()
    sigec_clients = {c['hoc_id']: c for c in (res.data or []) if c['hoc_id']}
    log.info(f'SIGEC: {len(sigec_clients)} clientes com hoc_id')

    # Buscar LPs já existentes
    res_lp = sb.table('client_landing_pages').select('client_id,slug').execute()
    existing_client_ids = {lp['client_id'] for lp in (res_lp.data or [])}
    existing_slugs = {lp['slug'] for lp in (res_lp.data or [])}
    log.info(f'LPs já existentes: {len(existing_client_ids)}')

    created = skipped = errors = 0

    for hoc_id, hoc_row in hoc_clients.items():
        sigec = sigec_clients.get(hoc_id)
        if not sigec:
            log.warning(f'  Cliente HOC id={hoc_id} ({hoc_row["razao_social"]}) não encontrado no SIGEC — pulando')
            skipped += 1
            continue

        if sigec['id'] in existing_client_ids:
            log.info(f'  LP já existe para {hoc_row["razao_social"]} — pulando')
            skipped += 1
            continue

        if not hoc_row.get('sigla'):
            log.warning(f'  Cliente HOC id={hoc_id} sem sigla — pulando')
            skipped += 1
            continue

        slug = normalize_slug(hoc_row['sigla'])

        # Garante unicidade do slug
        final_slug = slug
        suffix = 2
        while final_slug in existing_slugs:
            final_slug = f'{slug}-{suffix}'
            suffix += 1
        existing_slugs.add(final_slug)

        company_name = (
            hoc_row.get('nome_fantasia') or hoc_row.get('razao_social') or f'Cliente {hoc_id}'
        ).strip()

        record = {
            'client_id':    sigec['id'],
            'slug':         final_slug,
            'company_name': company_name,
            'is_active':    True,
        }

        log.info(f'  LP: slug={final_slug!r}  empresa={company_name!r}  hoc_id={hoc_id}')

        if dry_run:
            created += 1
            continue

        try:
            sb.table('client_landing_pages').insert(record).execute()
            created += 1
        except Exception as e:
            log.error(f'  ERRO hoc_id={hoc_id}: {e}')
            errors += 1

    log.info(f'\nResumo: {created} LPs criadas, {skipped} puladas, {errors} erros')
    if not dry_run:
        log.info('Acesse /portal/<slug> para testar cada LP.')


if __name__ == '__main__':
    main()
