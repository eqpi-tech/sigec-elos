#!/usr/bin/env python3
"""
discovery_hoc.py — Fase 0 da migração v2: mapeamento READ-ONLY do schema HOC.

Executa apenas SELECT / SHOW / DESCRIBE. A sessão MySQL é marcada como
read-only como guarda adicional — nenhuma escrita é possível.

Uso:
  python3 discovery_hoc.py [--config hoc_migration_config.json] > discovery_report.txt
"""

import argparse
import json
import sys

import mysql.connector


def section(title):
    print(f"\n{'='*72}\n{title}\n{'='*72}")


def run(cur, sql, params=None, limit_print=None):
    cur.execute(sql, params or ())
    rows = cur.fetchall()
    if limit_print:
        rows_to_print = rows[:limit_print]
    else:
        rows_to_print = rows
    for r in rows_to_print:
        print(r)
    if limit_print and len(rows) > limit_print:
        print(f"... ({len(rows) - limit_print} linhas omitidas de {len(rows)})")
    return rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default="hoc_migration_config.json")
    args = parser.parse_args()

    with open(args.config) as f:
        cfg = json.load(f)["hoc_mysql"]

    conn = mysql.connector.connect(
        host=cfg["host"], port=cfg.get("port", 3306),
        user=cfg["user"], password=cfg["password"],
        database=cfg["database"], charset=cfg.get("charset", "utf8mb4"),
        use_pure=True, connection_timeout=30,
    )
    cur = conn.cursor()

    # Guarda: sessão somente leitura
    try:
        cur.execute("SET SESSION transaction_read_only = 1")
        print("Sessão MySQL marcada como READ ONLY.")
    except Exception as e:
        print(f"Aviso: não foi possível setar read-only ({e}) — script só usa SELECT/SHOW/DESCRIBE.")

    # ── 1. Todas as tabelas ─────────────────────────────────────────────
    section("1. TABELAS DO SCHEMA")
    tables = [r[0] for r in run(cur, "SHOW TABLES")]

    # ── 2. Estrutura das tabelas-chave ─────────────────────────────────
    key_tables = [t for t in [
        "categoria", "documento", "fluxo", "fluxo_documento", "fluxo_etapa",
        "etapa", "cliente", "fornecedor", "fornecedor_categorias",
        "processo", "processo_categorias", "processo_documento",
        "arquivo", "questao", "grupo_compliance", "regras_compliance",
        "resposta_analise", "documento_categoria", "categoria_documento",
    ] if t in tables]

    for t in key_tables:
        section(f"2. DESCRIBE {t}")
        run(cur, f"DESCRIBE {t}")

    # ── 3. Contagens gerais ─────────────────────────────────────────────
    section("3. CONTAGENS GERAIS")
    for t in key_tables:
        cur.execute(f"SELECT COUNT(*) FROM {t}")
        print(f"{t:32s} {cur.fetchone()[0]:>10,}")

    # ── 4. Categorias por cliente ───────────────────────────────────────
    if "categoria" in tables:
        section("4. CATEGORIAS POR CLIENTE (top 30)")
        run(cur, """
            SELECT c.id, c.sigla, c.razao_social, COUNT(cat.id) AS n_categorias
            FROM cliente c
            LEFT JOIN categoria cat ON cat.id_cliente = c.id
            GROUP BY c.id ORDER BY n_categorias DESC LIMIT 30
        """)
        section("4b. AMOSTRA DE CATEGORIA (5 linhas)")
        run(cur, "SELECT * FROM categoria LIMIT 5")
        section("4c. CATEGORIAS SEM CLIENTE (globais?)")
        run(cur, "SELECT COUNT(*) FROM categoria WHERE id_cliente IS NULL")

    # ── 5. Documentos por cliente ───────────────────────────────────────
    if "documento" in tables:
        section("5. DOCUMENTOS POR CLIENTE (top 30)")
        # coluna de vínculo pode variar — tenta id_cliente
        try:
            run(cur, """
                SELECT c.id, c.sigla, COUNT(d.id) AS n_docs
                FROM cliente c
                LEFT JOIN documento d ON d.id_cliente = c.id
                GROUP BY c.id ORDER BY n_docs DESC LIMIT 30
            """)
        except Exception as e:
            print(f"documento.id_cliente não existe: {e}")
        section("5b. AMOSTRA DE DOCUMENTO (5 linhas)")
        run(cur, "SELECT * FROM documento LIMIT 5")

    # ── 6. Fluxo ↔ documentos ──────────────────────────────────────────
    for t in ("fluxo", "fluxo_documento", "fluxo_etapa", "etapa"):
        if t in tables:
            section(f"6. AMOSTRA {t} (5 linhas)")
            try:
                run(cur, f"SELECT * FROM {t} LIMIT 5")
            except Exception as e:
                print(f"erro: {e}")

    # ── 7. Vínculos fornecedor×categoria ───────────────────────────────
    if "fornecedor_categorias" in tables:
        section("7. VÍNCULOS FORNECEDOR×CATEGORIA")
        run(cur, """
            SELECT COUNT(*) AS total,
                   SUM(CASE WHEN f.ativo = 1 THEN 1 ELSE 0 END) AS de_fornecedores_ativos
            FROM fornecedor_categorias fc
            JOIN fornecedor f ON f.id = fc.id_fornecedor
        """)
        section("7b. VÍNCULOS POR CLIENTE DA CATEGORIA (top 20)")
        run(cur, """
            SELECT cat.id_cliente, cli.sigla, COUNT(*) AS n_vinculos
            FROM fornecedor_categorias fc
            JOIN categoria cat ON cat.id = fc.id_categoria
            LEFT JOIN cliente cli ON cli.id = cat.id_cliente
            GROUP BY cat.id_cliente, cli.sigla
            ORDER BY n_vinculos DESC LIMIT 20
        """)

    # ── 8. Arquivos (volume p/ decisão de cópia S3) ────────────────────
    if "arquivo" in tables:
        section("8. ARQUIVOS")
        cur.execute("SELECT COUNT(*) FROM arquivo")
        print(f"total arquivos: {cur.fetchone()[0]:,}")
        # tenta coluna de tamanho
        cur.execute("DESCRIBE arquivo")
        cols = [r[0] for r in cur.fetchall()]
        size_col = next((c for c in cols if "tamanho" in c.lower() or "size" in c.lower()), None)
        if size_col:
            cur.execute(f"SELECT ROUND(SUM({size_col})/1024/1024/1024, 2) FROM arquivo")
            print(f"volume total ({size_col}): {cur.fetchone()[0]} GB")
        else:
            print(f"sem coluna de tamanho (colunas: {cols})")
        # arquivos referenciados em processos válidos (o que de fato migra)
        run(cur, """
            SELECT COUNT(DISTINCT pd.id_arquivo)
            FROM processo_documento pd
            JOIN processo p ON p.id = pd.id_processo
            WHERE p.ativo = 1 AND p.data_validade >= NOW() AND pd.situacao = 'O'
        """)

    # ── 9. Baseline de reconciliação por cliente ───────────────────────
    section("9. BASELINE POR CLIENTE (processos válidos)")
    run(cur, """
        SELECT cli.id, cli.sigla,
               COUNT(DISTINCT p.id_fornecedor) AS fornecedores,
               COUNT(DISTINCT p.id) AS processos
        FROM processo p
        JOIN fluxo fl ON fl.id = p.id_fluxo
        JOIN cliente cli ON cli.id = fl.id_cliente
        WHERE p.ativo = 1 AND p.data_validade >= NOW()
        GROUP BY cli.id, cli.sigla
        ORDER BY fornecedores DESC
    """)

    cur.close()
    conn.close()
    print("\n=== DISCOVERY CONCLUÍDO (nenhuma escrita realizada) ===")


if __name__ == "__main__":
    main()
