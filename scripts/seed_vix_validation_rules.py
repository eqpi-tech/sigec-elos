# -*- coding: utf-8 -*-
# Seed das REGRAS DE ANÁLISE por documento (documents_catalog.validation_rule)
# Fonte: VIX_REGRAS_ANALISE_DOCUMENTOS_BACKOFFICE.md (28/08/2026) — consolidação
# das planilhas VIX-_REGRA_ANALISE / Cópia / EQP_-_REGRA-VIX_ANALISE_SEG-SUP.
# Idempotente: sobrescreve validation_rule dos docs listados (regra do cliente
# é canônica). Rodar: PYTHONPATH=<pylibs> arch -x86_64 python3 scripts/seed_vix_validation_rules.py
import re
import pg8000.native

RULES = {
# ── Reutilizados do catálogo HOC ─────────────────────────────────────────
37: """REGRAS (VixPar):
a) Estar com a situação cadastral ATIVA.
TITULARIDADE (CNPJ): do cadastro.
VALIDADE: 1 ano da data de análise ou, quando recusada, 4 meses.
Onde conferir: emissão gratuita e imediata no site da Receita Federal.""",

7: """REGRAS (VixPar):
a) Ser regular.
b) Para fornecedores Individuais será aceita a consulta do FGTS de "Empregador não cadastrado"; a validade será a do sistema.
TITULARIDADE (CNPJ): do cadastro.
VALIDADE: informada no documento ou, quando recusada, 4 meses.
Onde conferir: site da Caixa (Consulta Regularidade do Empregador).""",

8: """REGRAS (VixPar):
a) Ser negativa ou positiva com efeito de negativa.
TITULARIDADE (CNPJ): do cadastro.
VALIDADE: informada no documento ou, quando recusada, 4 meses.
Onde conferir: tst.jus.br/certidao (validar código de autenticidade).""",

16: """REGRAS (VixPar):
a) Ser negativa ou positiva com efeito de negativa, dentro da validade.
b) Na ausência do CNPJ, verificar se o documento se refere ao fornecedor cadastrado (Razão Social com IE ou endereço), confrontando com outros documentos já aprovados na base (validar se há documento aprovado que conste o mesmo endereço ou IE).
TITULARIDADE (CNPJ): do cadastro.
VALIDADE: (I) se negativa, prazo definido no documento MAIS 60 dias; (II) se positiva com efeito de negativa, prazo definido no documento MAIS 15 dias.""",

42: """REGRAS (VixPar):
a) Certidão conjunta negativa ou positiva com efeito de negativa.
TITULARIDADE (CNPJ): centralizado por CNPJ Matriz.
VALIDADE: informada no documento ou, quando recusada, 4 meses.
Onde conferir: servicos.receitafederal.gov.br/servico/certidoes (validar pelo código de controle).""",

39: """REGRAS (VixPar):
a) Estar registrado na Junta Comercial ou registrado em Cartório.
b) Estar dentro do prazo de validade.
c) Estar com todos os aditivos e/ou consolidado.
d) Estar assinado com as qualificações dos representantes.
e) No caso de Ata e Estatuto, verificar opção da diretoria e quem administra (não constando os dados do presidente, solicitar o termo de posse).
f) Se Ata/Estatuto ou Contrato registrados em cartório: devem estar registrados/microfilmados, ou averbados em caso de alteração.
g) Sociedade Simples: necessário somente o Registro Civil das Pessoas Jurídicas.
h) Empresas com fim do exercício social entre 31/12/2019 e 31/03/2020: validade prorrogada por 7 meses a contar do término do exercício.
i) Empresa S.A.: validade do documento será de mais 120 dias após o vencimento do mandato. Complementar: para S.A. exige-se também a "Última ata de eleição de diretoria e/ou procuração", registrada em Junta/Cartório, assinada, com validade de 120 dias após o vencimento do mandato.
j/k) Produtores rurais do estado de São Paulo: será aceita a consulta do Cartão CNPJ (cadastrar os dados da empresa; cotas 0).
TITULARIDADE (CNPJ): centralizado por CNPJ Matriz.
VALIDADE: 1 ano da data de análise.""",

150: """REGRAS (VixPar):
a) Documento emitido pelo Tribunal de Justiça ou Cartório.
b) Certidão deve ser Negativa ou "Nada Consta".
c) Deve ter sido emitida com pelo menos um mês anterior ao mês da análise. ⚠️ Redação da origem; provável intenção: "no máximo um mês antes". Confirmar com a VIX antes de automatizar.
d) Aceita certidão emitida pelo CNPJ Matriz ou Filial cadastrada: (1) certidão da Matriz (no caso de filial cadastrada) deve pertencer à mesma UF do Cartão CNPJ; (2) certidão da Filial cadastrada deve pertencer à mesma UF do Cartão CNPJ.
TITULARIDADE (CNPJ): centralizado por CNPJ Matriz.
VALIDADE: do documento (quando houver) ou 1 ano da data de emissão quando não houver validade (observando o item c).""",

26: """REGRAS (VixPar):
a) Estar dentro da validade.
TITULARIDADE (CNPJ): centralizado por CNPJ Matriz.
VALIDADE: informada no documento.""",

40: """REGRAS (VixPar):
a) Estar dentro do prazo de validade.
b) Aceitar TFE com comprovante de pagamento ou Certidão Conjunta de Débitos de Tributos Mobiliários (desde que com abrangência TFE).
c) Alvará "de exercício": validade até o último dia do ano.
d) Fornecedor com sala alugada: encaminhar Alvará do prédio + contrato de locação em vigência.
e) Município de Aparecida de Goiânia: aceita Inscrição Municipal, desde que validável na prefeitura.
f) Na ausência do CNPJ, Razão Social e endereço devem ser os mesmos do cadastro.
g) Fornecedores de Goiás: aceito o documento DUAM (equivale à TFE).
h) MEI: aceito Termo de Ciência e Responsabilidade, com informações constando no CCMEI.
i) Período de pandemia (Goiás, decisão judicial): aceita suspensão da taxa de licença (emitida pela Prefeitura) + CND de Tributos Municipais; validade de 15 dias antes do vencimento da CND.
j) Aceito protocolo de requerimento + Alvará vencido; validade de 1 ano da data de análise.
k) Aceito apenas o Alvará, mesmo quando este solicitar documentos adicionais (se os adicionais constarem na matriz da categoria, já são exigidos em outro campo; se não constarem, não há necessidade). O Alvará deve estar na validade.
l) Na ausência do CNPJ, se Razão Social e Inscrição Municipal forem as mesmas do cadastro, pode aprovar.
m) Aceito DECRETO (municipal, estadual ou federal) que valide ou dispense o documento; quando descrito por CNAE, a atividade principal do fornecedor deve constar no decreto. Valem também decretos por grau de risco da atividade e decretos de situações específicas (bairro/município/período); não é necessário conter os dados da empresa; validade do sistema.
n) Aceito documento do órgão (estadual/federal/municipal) informando isenção e/ou autorização de funcionamento.
o) Quando o Alvará solicitar taxa e/ou comprovante de pagamento, não é necessário apresentá-los, desde que dentro da vigência.
p) Aceito Certificado de Licenciamento Integrado (CLI): se o fornecedor possuir CNAEs das famílias 7119-7 e 7112-0, validade a do Corpo de Bombeiros; caso contrário, validade a da Prefeitura; validade indeterminada/ausente → validade do sistema.
q) Aceita consulta do Cartão CNPJ para atividade com CNAE "dispensada"; o CNAE deve ser o mesmo da categoria selecionada que exige o Alvará; validade de 1 ano da data de análise.
r) Aceito documento incompleto (sem todas as páginas), desde que identificáveis Razão Social e/ou CNPJ, endereço e data de validade.
TITULARIDADE (CNPJ): do cadastro.
VALIDADE: informada no documento ou, quando "de exercício", até o último dia do ano; para TFE, 1 ano da data de vencimento do boleto.""",

18: """REGRAS (VixPar):
a) Aceito apenas documento original emitido pelo IBAMA.
b) Aceita a "Consulta Pública a Certificado de Regularidade — CR".
TITULARIDADE (CNPJ): do cadastro.
VALIDADE: informada no documento.""",

19: """REGRAS (VixPar):
a) Ser referente ao CNAE e à categoria de compra selecionada.
b) Aceito protocolo de renovação, desde que protocolado no mínimo 120 dias antes do vencimento da última licença; validade do protocolo: 6 meses a partir da data do protocolo.
c) Aceita Declaração de Isenção emitida pelo órgão, incluindo o documento "Dispensa de Licença de Operação".
d) Aceita a LO mesmo com "condicionantes"/documentos adicionais, desde que conste os dados da empresa e esteja na validade.
e) Aceita Declaração de Trâmite; validade de 6 meses da emissão.
f) MEI: aceito Termo de Ciência e Responsabilidade, com informações constando no CCMEI.
g) Na ausência do CNPJ, Razão Social e endereço devem ser os mesmos do cadastro.
h) Aceito DECRETO que valide ou dispense o documento (mesmas condições do item m do Alvará de Funcionamento); validade do sistema.
i) Aceito Certificado de Licenciamento Integrado; atividade cadastrada na Cetesb ou em "Atividades licenciadas"; validade da Cetesb.
j) Aceito, como isenção da LO, o Alvará de Funcionamento que contenha: "Dispensado do licenciamento ambiental, por não possuir repercussão ambiental significativa"; validade informada no documento.
k) Aceito Certificado e/ou Consulta de Regularidade — IBAMA (CTF), desde que as atividades do CTF atendam todas as categorias que exigem a LO.
l) Aceita Autorização Ambiental para Transporte Interestadual de Produtos Perigosos, desde que as categorias que exigem a LO sejam de transporte de cargas.
TITULARIDADE (CNPJ): do cadastro.
VALIDADE: informada no documento.""",

67: """REGRAS (VixPar):
a) Identificar o número da ART/AFT.
b) Identificar o responsável técnico, sendo o mesmo que assinou o documento.
c) Identificar o registro do profissional no conselho de classe.
d) Identificar a empresa contratada.
e) Verificar se o objeto da ART/AFT é compatível com o serviço contratado.
f) Verificar a situação da ART/AFT.
g) Estar assinada pelo responsável técnico.
TITULARIDADE (CNPJ): do cadastro.
VALIDADE: informada no documento ou conforme período de execução do serviço.""",

239: """REGRAS (VixPar):
a) Identificar o nome do produto químico que será utilizado.
b) Possuir as 16 seções obrigatórias da norma.
c) Verificar a data de emissão ou revisão do documento.
TITULARIDADE (CNPJ): não se aplica.
VALIDADE: documentos válidos devem refletir as revisões exigidas pela norma de 2023 (prazo de adequação encerrado em julho/2025).""",

157: """REGRAS (VixPar):
a) Conter a Razão Social do cadastro e o nome do estabelecimento atendido (VIX).
b) Endereço da instalação.
c) Identificação dos equipamentos ou sistemas de climatização.
d) Período de vigência.
e) Cronograma de manutenção preventiva com periodicidade definida.
f) Assinado pelo responsável técnico.
g) Número do registro no Conselho de Classe.
h) Novos fornecedores: podem anexar Declaração de Compromisso assinada, com prazo de até 60 dias para adequação.
TITULARIDADE (CNPJ): do cadastro.
VALIDADE: informada no documento ou conforme período de execução do serviço.""",

545: """REGRAS (VixPar):
a) Estar dentro da validade.
b) Conter todas as páginas mencionadas no índice do documento.
c) Na ausência do CNPJ, validar pela Razão Social e endereço.
d) Estar assinado pelo médico do trabalho, integrante ou não do SESMT da empresa.
e) Aceita declaração da própria empresa informando que não possui o documento por não ter funcionário registrado CLT; a declaração deve conter os dados da empresa e estar assinada por representante legal.
TITULARIDADE (CNPJ): do cadastro, ou quando mencionada a validade pela Matriz e Filial.
VALIDADE: informada no documento ou 1 ano da data de emissão (quando não houver validade).""",

546: """REGRAS (VixPar — versão revisada pela área de Segurança):
a) Estar dentro da validade.
b) Conter todas as páginas mencionadas no índice do documento.
c) Na ausência do CNPJ, validar pela Razão Social e endereço.
d) Aceito PGR ou PCMAT.
e) Estar assinado pelo médico do trabalho, técnico de segurança OU engenheiro de segurança do trabalho, integrante ou não do SESMT da empresa. ⚠️ A versão geral exigia só médico do trabalho; adotada a versão ampliada da área de Segurança.
f) Aceita declaração da própria empresa informando que não possui o documento por não ter funcionário registrado CLT; a declaração deve conter os dados da empresa e estar assinada por representante legal.
TITULARIDADE (CNPJ): do cadastro, ou quando mencionada a validade pela Matriz e Filial.
VALIDADE: informada no documento ou 1 ano da data de emissão (quando não houver validade).""",

166: """REGRAS (VixPar):
a) Estar dentro do prazo de validade.
b) Válida somente a Autorização de Funcionamento concedida pelo DPF ou pela SSP do respectivo estado.
TITULARIDADE (CNPJ): do cadastro.
VALIDADE: informada no documento ou, quando "de exercício", até o último dia do ano.""",

65: """REGRAS (VixPar):
a) Identificar o conselho competente (ex.: CREA).
b) Identificar o profissional responsável, quando aplicável.
c) Identificar o número de registro do profissional ou empresa.
d) Verificar a situação do registro.
e) Verificar se a habilitação é compatível com o serviço contratado.
TITULARIDADE (CNPJ): não se aplica — o registro é do profissional.
VALIDADE: informada no documento.""",

79: """REGRAS (VixPar) — sem exigência nas 22 categorias da matriz atual; registrada para uso futuro:
a) Identificar claramente o contador.
b) Estar assinado pelo contador.
c) MEI: aceita declaração feita pelo próprio fornecedor; empresa com menos de 1 ano de abertura: aceita declaração informando essa condição ou Balancete (ambos elaborados pelo contador).
d) Aceita Declaração Anual de Faturamento ou Declaração Anual do MEI (tipo empresarial MEI).
e) ME/EPP optante pelo Simples Nacional: aceita consulta do Simples identificando o fornecedor como optante, ou declaração do próprio fornecedor informando ser optante — (1) consulta do Simples emitida até o mês anterior à análise; (2) declaração deve conter CNPJ e/ou Razão Social e ser validada por consulta ao Simples; validade de 3 meses da data de análise.
f) Aceito, como assinatura do contador, o Recibo de Entrega do SPED Contábil.
g) Sem identificação do contador (número do CRC), o documento deve estar assinado digitalmente.
TITULARIDADE (CNPJ): centralizado por CNPJ Matriz ou pela Razão Social.
VALIDADE: por exercício e regime — Balanço exercício 2025, Lucro Real: até 30/06/2027; outro regime tributário: até 30/05/2027; emitido pelo SPED (Lucro Presumido e Lucro Real): até 31/07/2027.""",

# ── Novos (faixa ELOS 10000+) ────────────────────────────────────────────
10001: """⚠️ Não há regra com o título "Sintegra" nas planilhas VixPar — aplicam-se as regras de INSCRIÇÃO ESTADUAL (equivalência funcional). Confirmar com a VIX.
REGRAS:
a) Estar habilitada.
b) No caso de "não inscrita" ou "isenta", verificar as atividades do Cartão CNPJ; se constar apenas "Serviços", aprovar.
TITULARIDADE (CNPJ): do cadastro.
VALIDADE: 1 ano da data de análise.""",

10002: """REGRAS (VixPar):
a) Não estar inscrito.
b) Consultar o Cadastro de Empregadores em: https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/inspecao-do-trabalho/areas-de-atuacao/cadastro_de_empregadores.pdf
TITULARIDADE (CNPJ): do cadastro.
VALIDADE: 6 meses da data da consulta.""",

10003: """⚠️ Sem regra específica nas planilhas VixPar. Regra mais próxima (Relatório Assertiva): "Não será objeto de avaliação. Somente serão extraídos os dados de inadimplência e protestos."
Confirmar com a VIX se o Relatório de Risco Financeiro segue a mesma lógica (no ELOS, candidato natural a ser gerado pelo A3 Risk Report / ELOS Score, sem análise manual).""",

10004: """REGRAS (VixPar):
a) Comprovar cadastro online MTR em algum dos órgãos (SINIR, FEAM, INEA, SIGOR etc.).
b) Aceito qualquer documento em que conste o MTR.
c) Aceito print do site do cadastro MTR constando o CNPJ.
d) Aceito protocolo de solicitação ou renovação junto ao órgão; ou Declaração de Compromisso assinada, com prazo de até 60 dias para adequação.
e) Os dados devem ser compatíveis com a categoria do fornecedor.
TITULARIDADE (CNPJ): do cadastro ou quando mencionado.
VALIDADE: informada no documento; na ausência, solicitar atualização anualmente.""",

10005: """REGRAS (VixPar):
a) Aceita Declaração, Certificado ou Nota Fiscal que comprove o envio das sucatas para descarte ecologicamente correto.
b) O documento deve conter a forma de destinação final (reciclagem, coprocessamento, aterro industrial licenciado, rerrefino, tratamento etc.).
c) Se Nota Fiscal: deve constar na descrição do produto "Baterias usadas", "sucatas" ou "Baterias inservíveis" e, nas Informações Complementares, o "MTR".
TITULARIDADE (CNPJ): do cadastro.
VALIDADE: informada no documento; na ausência, solicitar atualização anualmente.""",

10007: """REGRAS (VixPar):
a) Certificado emitido por OCP acreditado pelo Inmetro.
b) O certificado deve contemplar pneus novos para veículos comerciais.
c) Número do certificado identificado.
d) Data de emissão identificada.
e) Assinatura ou autenticação digital.
TITULARIDADE (CNPJ): do cadastro ou da área fabril da mesma Razão Social.
VALIDADE: informada no documento.""",

10008: """REGRAS (VixPar) — aceita-se QUALQUER UMA das alternativas a–d:
a) Atestado de capacidade técnica assinado pelo cliente; ou
b) Contrato, ART ou ordem de serviço assinada; ou
c) Declaração do cliente assinada, com identificação do responsável; ou
d) Nota fiscal vinculada ao serviço executado.
e) Constar o período de execução do serviço (data de início e término).
f) A atividade descrita deve estar relacionada à categoria do cadastro.
TITULARIDADE (CNPJ): da empresa executora.
VALIDADE: não aplicada.""",

10009: """REGRAS (VixPar):
a) Número do Alvará Sanitário.
b) Órgão emissor identificado (Vigilância Sanitária Municipal / Prefeitura).
c) Data de emissão.
d) A atividade descrita no Alvará deve estar relacionada à categoria do cadastro.
e) Aceito protocolo de renovação ou Declaração de Compromisso assinada, com prazo de até 60 dias para adequação.
TITULARIDADE (CNPJ): do cadastro.
VALIDADE: informada no documento ou indicação de "vigente por prazo indeterminado".""",

10010: """REGRAS (VixPar):
a) Identificar o conselho de classe competente.
b) Identificar o registro da empresa.
c) Verificar a situação do registro da empresa.
d) Identificar o profissional integrante do Quadro Técnico.
e) Verificar o registro do profissional no conselho de classe.
f) Verificar a compatibilidade da habilitação profissional com o serviço.
Complementar — quando o conselho for o CREA, aplica-se a "Certidão de Registro e Quitação": identificar o CREA emissor; identificar a empresa registrada; verificar número de registro; situação regular; ausência de débitos/pendências conforme a certidão; compatibilidade das atividades registradas com o serviço contratado.
TITULARIDADE (CNPJ): do cadastro.
VALIDADE: informada no documento.""",

10011: """REGRAS (VixPar):
a) Identificar a empresa e o colaborador que irá executar o serviço.
b) Identificar a função.
c) Identificar os riscos.
d) Identificar as medidas de controle.
e) Identificar os EPIs obrigatórios.
TITULARIDADE (CNPJ): do cadastro.
VALIDADE: 6 meses da data de emissão. ⚠️ Divergência entre versões (outra fonte diz "não possui"); adotados 6 meses (versão mais recente/conservadora). Confirmar com a VIX.""",

10012: """REGRAS (VixPar):
a) A CNH deve estar dentro da validade.
b) Não constar como vencida, cassada ou suspensa.
c) Possuir categoria B ou superior (veículos leves).
d) Nome e CPF compatíveis com o ASO apresentado.
TITULARIDADE: CPF conforme o ASO (documento de pessoa física — dado pessoal/LGPD).
VALIDADE: informada no documento.""",

10013: """REGRAS (VixPar):
a) Identificação e compatibilidade do veículo ou equipamento.
b) Data da manutenção.
c) Modelo do veículo ou equipamento.
TITULARIDADE (CNPJ): do cadastro.
VALIDADE: 1 ano após a data de emissão.""",

10015: """REGRAS (VixPar):
a) Identificar o número do documento FM.COP.GET/089.
b) O documento deve estar todo preenchido.
c) Deve conter a assinatura do responsável VIXPAR.
TITULARIDADE (CNPJ): do cadastro.
VALIDADE: atualização a cada 2 anos.
Nota: documento anexável pelo perfil Comprador/Cliente (formulário interno VixPar).""",

10016: """REGRAS (VixPar):
a) Identificar o trabalhador.
b) Identificar a empresa.
c) Identificar o médico responsável e assinatura.
d) Verificar a aptidão para a atividade aplicável.
e) Verificar se os riscos ocupacionais são compatíveis com os riscos previstos no PGR.
f) Verificar se os exames ocupacionais são compatíveis com os exames previstos no PCMSO.
g) Verificar aptidão para trabalho em altura ou espaço confinado, quando aplicável.
TITULARIDADE (CNPJ): da empresa identificada no PCMSO (documento de pessoa física — dado pessoal/LGPD).
VALIDADE: informada no documento ou conforme periodicidade aplicável ao ASO.""",

10017: """REGRAS (VixPar):
a) O Certificado de Registro de Arma de Fogo (CRAF) pode ser emitido em nome do CNPJ da empresa, desde que a arma pertença à pessoa jurídica e o requerimento seja feito na Polícia Federal.
TITULARIDADE (CNPJ): do cadastro.
VALIDADE: informada no documento.""",

10018: """REGRAS (VixPar):
a) Estar dentro da validade.
b) Emitida pela Polícia Federal.
TITULARIDADE (CNPJ): do cadastro (documento de pessoa física — dado pessoal/LGPD).
VALIDADE: informada no documento.""",

10019: """REGRAS (VixPar):
a) Estar com as informações do responsável.
b) Estar vinculado à empresa.
c) O documento poderá ser aprovado quando mencionar validade para Matriz E Filiais.
TITULARIDADE (CNPJ): do cadastro.
VALIDADE: informada no documento.
Nota: para categorias de vigilância há capacitações específicas por NR (NR-10, NR-20, NR-33, NR-35, NR-18/andaime) fora do catálogo-base — regras já mapeadas nas planilhas de origem se a VIX vier a exigi-las.""",

10020: """⚠️ Regra geral em branco na origem; conteúdo importado da aba de clínicas (Table 5). Validar aplicabilidade geral com a VIX.
REGRAS:
a) Identificação da empresa.
b) Preenchimento de todas as questões do questionário.
TITULARIDADE (CNPJ): não informado na origem.
VALIDADE: 1 ano da data de análise.""",

10021: """⚠️ Nenhuma regra encontrada nas planilhas VixPar. PROPOSTA (pendente de validação com a VIX): aceite eletrônico na plataforma (ou upload assinado), contendo identificação da empresa (Razão Social + CNPJ do cadastro) e assinatura/aceite de representante.
VALIDADE (proposta): 1 ano da data do aceite (espelhando o Questionário de Compliance).""",
}

# Calibração: regra ÚNICA para os dois títulos da matriz (duplicidade
# confirmada pelas planilhas — Seg item 37; recomendação: unificar doc_type)
CALIBRACAO = """REGRAS (VixPar — regra ÚNICA para os dois títulos de calibração da matriz; duplicidade confirmada, unificação pendente com a VIX):
a) Identificar o número do certificado — ou, para o serviço "Reformadora de Pneu", se o cadastro no INMETRO está "Ativo".
b) Identificar o instrumento calibrado.
c) Identificar o laboratório responsável pela calibração.
d) Verificar a data de emissão.
e) A rastreabilidade da calibração dos equipamentos deve estar ligada à RBC, ou possuir padrões rastreáveis a organismos nacionais e/ou internacionais (INMETRO); preferível que o certificado possua o selo do INMETRO; identificar os padrões utilizados na calibração, quando informado.
TITULARIDADE (CNPJ): do cadastro.
VALIDADE: do documento (quando houver) ou 1 ano da data de emissão quando não houver validade."""
RULES[10006] = CALIBRACAO
RULES[10014] = CALIBRACAO


def main():
    url = [l.split('=', 1)[1].strip().strip('"') for l in open('.env') if l.startswith('SUPABASE_DB_URL=')][0]
    m = re.match(r'postgres(?:ql)?://([^:]+):([^@]+)@([^:/]+):?(\d+)?/(.+)', url)
    c = pg8000.native.Connection(m.group(1), host=m.group(3), port=int(m.group(4) or 5432),
                                 database=m.group(5), password=m.group(2), ssl_context=True)
    for doc_id, rule in RULES.items():
        c.run("UPDATE documents_catalog SET validation_rule=:r WHERE id=:i", r=rule, i=doc_id)
    n = c.run("SELECT count(*) FROM documents_catalog WHERE id = ANY(:ids) AND validation_rule IS NOT NULL",
              ids=list(RULES.keys()))[0][0]
    print(f"regras gravadas: {n}/{len(RULES)} documentos")
    tot = c.run("SELECT count(*) FROM documents_catalog WHERE validation_rule IS NOT NULL")[0][0]
    print(f"total no catálogo com regra: {tot}")
    c.close()


if __name__ == '__main__':
    main()
