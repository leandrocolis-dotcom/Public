"""Trava "a base nunca anda para trás" (puro, sem rede). Usado por scripts/update_prices.py.

Diagnóstico de 20/11/2026: as rodadas do cron que o GitHub atrasa para depois da meia-noite UTC (00:00–02:00,
20:00–22:00 em NY) recebem do Yahoo o histórico SEM o pregão do dia. Sem trava, o arquivo publicado perdia o
último pregão inteiro (ex.: 05/11 01:00 UTC, 183 a 194 ativos voltando de 04/11 para 03/11) ou parte dos ativos
voltava a repetir o fechamento da véspera (20/11 02:26 UTC: MTUM, QUAL, XLC… com o preço de 18/11 no lugar do de
19/11). O app escondia o erro na tela (o preço ao vivo e o fechamento anterior oficial entram por cima), mas
robôs e estudos que leem a base gravavam o dado velho.

Regras:
  1. Calendário: se a nova base termina ANTES da publicada, não grava nada (mantém a publicada).
  2. Por ativo: se o último preço real de um ativo (last_real) ficou mais velho que o publicado, os pregões entre
     um e outro voltam a ter o valor publicado (que era real), e o last_real publicado é mantido.
     Só para ativos negociados no calendário dos EUA (ações e ETFs, símbolo de 1 a 5 letras, sem índice de fora,
     futuro, moeda ou cripto: esses têm horário próprio e são tratados à parte).
"""

import json
import re
from pathlib import Path

US_SYM = re.compile(r"^[A-Z]{1,5}$")


def load_prev(path):
    """Arquivo publicado (dict) ou None."""
    p = Path(path)
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def calendar_regressed(new_dates, prev):
    """A nova base termina antes da publicada?"""
    if not prev or not prev.get("dates") or not new_dates:
        return False
    return new_dates[-1] < prev["dates"][-1]


def keep_newer(out, key, prev, is_us=lambda s: bool(US_SYM.match(s))):
    """
    Devolve os pregões que a nova base perdeu, por ativo, com o valor publicado. Altera `out` no lugar:
    out = {"dates": [...], key: {sym: [...]}, "last_real": {sym: "AAAA-MM-DD"}}. Retorna {sym: n de pregões}.
    """
    if not prev or key not in prev:
        return {}
    pidx = {d: i for i, d in enumerate(prev.get("dates", []))}
    plr = prev.get("last_real", {})
    fixed = {}
    for sym, vals in out[key].items():
        if not is_us(sym):
            continue
        old_lr = plr.get(sym)
        new_lr = out["last_real"].get(sym)
        pser = prev[key].get(sym)
        if not old_lr or not new_lr or not pser or new_lr >= old_lr:
            continue
        n = 0
        for i, d in enumerate(out["dates"]):
            if new_lr < d <= old_lr and d in pidx:
                vals[i] = pser[pidx[d]]
                n += 1
        if n:
            out["last_real"][sym] = old_lr
            fixed[sym] = n
    return fixed
