"""Gera o HTML (→ PDF) dos modelos dos comunicados, para aprovação. Usa contatos FICTÍCIOS.
  python3 scripts/migracao_hoc/pdf_comunicados.py A "Cliente 1" "Cliente 2" > /tmp/comunicados_A.html
(os nomes dos clientes vêm por argumento — não ficam no repositório)"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from enviar_comunicado import ONDAS, CAMPANHAS

camp = sys.argv[1] if len(sys.argv) > 1 else 'A'
k = CAMPANHAS[camp]
NOMES = (sys.argv[2:4] + ['Cliente 1', 'Cliente 2'])[:2]
DATAS = {'A': ['terça, 13/10', 'quarta, 14/10', 'quinta, 15/10', 'sexta, 16/10'],
         'B': ['a definir', 'a definir', 'a definir', 'sexta, 20/11']}[camp]
EX = [
    ('Fornecedor', {'nome': 'Carlos Lima', 'email': 'carlos.lima@empresaexemplo.com.br', 'tipo': 'SUPPLIER', 'clientes': [NOMES[0]], 'outros': False}),
    ('Fornecedor que também atende cliente da outra onda', {'nome': 'Marina Alves', 'email': 'marina.alves@empresaexemplo.com.br', 'tipo': 'SUPPLIER', 'clientes': [NOMES[1]], 'outros': True}),
    ('Usuário do cliente', {'nome': 'Ana Souza', 'email': 'ana.souza@clienteexemplo.com.br', 'tipo': 'CLIENT', 'clientes': [NOMES[0]], 'outros': False}),
]
paginas = []
for n in sorted(ONDAS):
    for rot, c in EX:
        if camp == 'B' and c['outros']: continue
        assunto, html = ONDAS[n](dict(c, link='https://elos.eqpitech.com.br/redefinir-senha?welcome=1'), k)
        paginas.append(f'''<section class="pg"><div class="meta"><div class="n">Comunicado {n} de 4 · envio: {DATAS[n-1]}</div>
<div><b>Público:</b> {rot}</div><div><b>Assunto:</b> {assunto}</div>
<div class="obs">Exemplo com dados fictícios — no envio real entram o nome, o e-mail e o(s) cliente(s) de cada pessoa.</div></div>{html}</section>''')

capa = f'''<section class="pg capa"><h1>Comunicados da migração HOC → SIGEC-ELOS</h1>
<h2>Onda {camp}: {' e '.join(NOMES)}</h2>
<table><tr><th>Comunicado</th><th>Envio</th><th>Mensagem principal</th></tr>
<tr><td>1 · O aviso</td><td>{DATAS[0]}</td><td>A homologação vai para o SIGEC-ELOS; HOC até {k['hoc_ate']}; início em {k['inicio']}; nada a fazer agora</td></tr>
<tr><td>2 · Acesso pronto</td><td>{DATAS[1]}</td><td>Botão "Criar minha senha"; pode conhecer a plataforma; documentos continuam no HOC até {k['hoc_ate']}</td></tr>
<tr><td>3 · O que melhora</td><td>{DATAS[2]}</td><td>Novidades para fornecedor e cliente; manual no menu Ajuda</td></tr>
<tr><td>4 · Segunda é no ELOS</td><td>{DATAS[3]}</td><td>Passo a passo do acesso; endereços do HOC levam ao ELOS; suporte</td></tr></table>
<p><b>Destinatários:</b> usuários ativos no HOC — usuários dos clientes e de fornecedores com processo vigente ou aberto há menos de 1 ano (sem e-mails devolvidos).</p>
<p><b>Três versões:</b> fornecedor · fornecedor que também atende cliente da outra onda (documentos seguem pelo HOC até a 2ª virada) · usuário do cliente.</p>
<p><b>Remetente:</b> SIGEC-ELOS &lt;noreply@eqpitech.com.br&gt; · respostas vão para suporte@eqpitech.com.br</p></section>'''
print(f'''<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
@page {{ size: A4; margin: 12mm; }} body {{ font-family: Arial, sans-serif; margin: 0; color: #1f2937 }}
.pg {{ page-break-after: always; }} .pg:last-child {{ page-break-after: auto; }}
.capa h1 {{ color: #1a1c5e; font-size: 22pt; margin: 30mm 0 4mm }} .capa h2 {{ color: #F47E2F; font-size: 14pt; margin: 0 0 10mm }}
table {{ border-collapse: collapse; width: 100%; font-size: 10pt; margin-bottom: 8mm }} th {{ background: #2E3192; color: #fff; text-align: left; padding: 6px }}
td {{ border-bottom: 1px solid #e5e7eb; padding: 6px; vertical-align: top }} p {{ font-size: 10.5pt }}
.meta {{ background: #f4f5fa; border: 1px solid #e2e4ef; border-radius: 8px; padding: 8px 12px; font-size: 9.5pt; margin-bottom: 8px }}
.meta .n {{ font-weight: bold; color: #2E3192; font-size: 11pt; margin-bottom: 2px }} .meta .obs {{ color: #6b7280; font-size: 8.5pt; margin-top: 3px }}
</style></head><body>{capa}{"".join(paginas)}</body></html>''')
