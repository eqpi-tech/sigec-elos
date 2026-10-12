"""CNPJ numérico e ALFANUMÉRICO (Receita Federal, emitido desde jul/2026).

12 caracteres [0-9A-Z] + 2 dígitos verificadores numéricos, ex.
12.ABC.345/01DE-35. Armazenamento: 14 caracteres em MAIÚSCULAS, sem pontuação.
DV: valor (código ASCII − 48) de cada caractere com os pesos de sempre — para
CNPJ só com números o resultado é idêntico ao cálculo antigo.
Mesma regra de src/lib/cnpj.js, netlify/functions/lib/cnpj.js e
supabase/patch_129_cnpj_alfanumerico.sql (normalize_cnpj). Só biblioteca padrão.
"""
import re

_ALNUM_CNPJ = re.compile(r"[0-9A-Z]{12}[0-9]{2}")


def _dv(base: str) -> int:
    soma, peso = 0, 2
    for ch in reversed(base):
        soma += (ord(ch) - 48) * peso
        peso = 2 if peso == 9 else peso + 1
    r = soma % 11
    return 0 if r < 2 else 11 - r


def is_valid_cnpj(value) -> bool:
    """DV oficial; aceita numérico e alfanumérico (com ou sem pontuação)."""
    c = re.sub(r"[^0-9A-Za-z]", "", str(value or "")).upper()
    if not _ALNUM_CNPJ.fullmatch(c) or c == c[0] * 14:
        return False
    d1 = _dv(c[:12])
    d2 = _dv(c[:12] + str(d1))
    return c[12:] == f"{d1}{d2}"


def normalize_doc(value) -> str:
    """CNPJ/CPF sem pontuação, em maiúsculas.

    Mantém as letras SÓ quando o resultado é um CNPJ alfanumérico válido (DV
    confere); qualquer outra coisa segue a regra antiga (só os dígitos) — assim
    nada muda para CNPJ numérico, CPF ou texto sujo ("CNPJ: 12.345...").
    """
    s = str(value or "")
    alnum = re.sub(r"[^0-9A-Za-z]", "", s).upper()
    if not alnum.isdigit() and is_valid_cnpj(alnum):
        return alnum
    return "".join(c for c in s if c.isdigit())


def cnpj_root(doc: str):
    """Raiz (8 primeiros caracteres) de um CNPJ normalizado de 14; senão None."""
    return doc[:8] if doc and len(doc) == 14 else None


if __name__ == "__main__":
    assert is_valid_cnpj("12ABC34501DE35")
    assert is_valid_cnpj("12.ABC.345/01DE-35")
    assert is_valid_cnpj("17996179000181")
    assert not is_valid_cnpj("17996179000182")
    assert normalize_doc("12.abc.345/01de-35") == "12ABC34501DE35"
    assert normalize_doc("17.996.179/0001-81") == "17996179000181"
    assert normalize_doc("CNPJ: 17.996.179/0001-81") == "17996179000181"
    assert normalize_doc("123.456.789-01") == "12345678901"
    print("ok")
