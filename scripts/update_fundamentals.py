"""Gera data/fundamentals.json (aba Valor): séries do FRED e P/L do SPY.

Uso:   python scripts/update_fundamentals.py
Roda uma vez por dia (fechamento). Juros nominais e preços já vêm de data/prices.json;
aqui entra só o que o app não tem: juro real, inflação implícita, spreads de crédito e P/L.
Se uma fonte falhar, a série anterior é mantida (nunca grava vazio).
"""
import csv
import io
import json
import sys
from datetime import date
from pathlib import Path

import re
import time
from datetime import timedelta

import requests

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "fundamentals.json"
START = "2006-01-01"
FRED = {
    "DFII10": "Juro real 10 anos (TIPS)",
    "T10YIE": "Inflação implícita 10 anos",
    "BAMLH0A0HYM2": "Spread high yield EUA (OAS)",
    "BAMLEMCBPIOAS": "Spread crédito emergente (OAS)",
}
# Sem User-Agent próprio: o FRED derruba a conexão quando o agente se declara robô ("compatible; ...").


def weekly(points):
    """Último ponto de cada semana ISO + o último dia (arquivo pequeno, histórico longo)."""
    out = {}
    for d, v in points:
        y, w, _ = date.fromisoformat(d).isocalendar()
        out[(y, w)] = (d, v)
    rows = sorted(out.values())
    if points and rows[-1][0] != points[-1][0]:
        rows.append(points[-1])
    return rows


def fred(series_id):
    url = f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}&cosd={START}"
    r = get(url, tries=2)
    pts = []
    for row in csv.reader(io.StringIO(r.text)):
        if len(row) != 2 or row[0] == "observation_date":
            continue
        try:
            pts.append((row[0], round(float(row[1]), 3)))
        except ValueError:
            continue  # "." = feriado
    if len(pts) < 500:
        raise RuntimeError(f"{series_id}: só {len(pts)} pontos")
    rows = weekly(pts)
    return {"label": FRED[series_id], "dates": [d for d, _ in rows], "values": [v for _, v in rows]}


def merge(old, new):
    """Junta o histórico salvo com o baixado: o FRED só libera 3 anos dos spreads ICE,
    então o arquivo guarda o que já viu e o histórico cresce com o tempo."""
    if not old:
        return new
    pts = dict(zip(old["dates"], old["values"]))
    pts.update(zip(new["dates"], new["values"]))
    rows = weekly(sorted(pts.items()))
    return {**new, "dates": [d for d, _ in rows], "values": [v for _, v in rows]}


def get(url, timeout=45, tries=3):
    """GET com novas tentativas (o shillerdata.com derruba conexões de vez em quando)."""
    for i in range(tries):
        try:
            r = requests.get(url, timeout=timeout)
            r.raise_for_status()
            return r
        except requests.RequestException:
            if i == tries - 1:
                raise
            time.sleep(3 * (i + 1))


SHILLER_PAGE = "https://shillerdata.com/"
CAPE_MAX_AGE = 25  # dias: a planilha muda ~1x por mês; antes disso nem baixa


def cape():
    """CAPE e Excess CAPE Yield mensais desde 1881 (planilha ie_data.xls de Robert Shiller).
    O link do arquivo muda a cada versão, então é lido da página antes de baixar."""
    import pandas as pd

    page = get(SHILLER_PAGE).text
    m = re.search(r'(?:https?:)?//[^"\s]*/ie_data\.xls[^"\s]*', page)
    if not m:
        raise RuntimeError("link do ie_data.xls não encontrado")
    url = m.group(0) if m.group(0).startswith("http") else "https:" + m.group(0)
    r = get(url, timeout=90)
    df = pd.read_excel(io.BytesIO(r.content), sheet_name="Data", header=7)
    cols = {c.strip(): c for c in df.columns if isinstance(c, str)}
    if "Date" not in cols or "CAPE" not in cols:
        raise RuntimeError(f"colunas inesperadas: {list(cols)[:15]}")
    ecy_col = cols.get("Yield")  # "Excess CAPE Yield" ocupa duas linhas de cabeçalho
    dates, values, ecy = [], [], []
    for _, row in df.iterrows():
        d, c = row[cols["Date"]], row[cols["CAPE"]]
        try:
            d, c = float(d), float(c)
        except (TypeError, ValueError):
            continue
        if c != c or d != d:
            continue
        year = int(d)
        month = round((d - year) * 100)  # 2026.1 = outubro; 2026.01 = janeiro
        if not 1 <= month <= 12:
            continue
        e = row[ecy_col] if ecy_col else None
        dates.append(f"{year}-{month:02d}")
        values.append(round(c, 2))
        ecy.append(round(float(e) * 100, 3) if e is not None and e == e else None)
    if len(dates) < 1200:
        raise RuntimeError(f"CAPE: só {len(dates)} meses")
    return {"label": "CAPE (Shiller P/E10)", "dates": dates, "values": values, "ecy": ecy}


EQUITY_GROUPS = ("Ações EUA", "Setores", "Ações Globais")
EQUITY_EXTRA = ("GDX", "COPX")  # mineradoras: ações, embora fiquem em Commodities no universo
EQUITY_SKIP = ("SPXL",)  # alavancado: P/L igual ao do índice, não acrescenta nada


def equity_etfs():
    """ETFs de ações do universo (assets/universe.js é a fonte única)."""
    src = (ROOT / "assets" / "universe.js").read_text(encoding="utf-8")
    block = src.split("const RAW_ASSETS = [", 1)[1].split("];", 1)[0]
    rows = re.findall(r'\["([A-Z0-9]+)",\s*"([^"]+)",\s*"[^"]*",\s*"[^"]*",\s*"([^"]+)"\]', block)
    syms = [c for c, y, g in rows if (g in EQUITY_GROUPS or c in EQUITY_EXTRA) and c not in EQUITY_SKIP]
    return sorted(set(syms), key=lambda c: (c != "SPY", c))


def snapshot(sym):
    """P/L passado, dividend yield (%) e P/VP de um ETF. P/L fora de (0, 200] vira None (lucro negativo distorce)."""
    import yfinance as yf

    for i in range(2):
        try:
            info = yf.Ticker(sym).info
            break
        except Exception:  # noqa: BLE001 (429 do Yahoo)
            if i:
                raise
            time.sleep(5)
    num = lambda k, d=2: round(float(info[k]), d) if isinstance(info.get(k), (int, float)) else None  # noqa: E731
    pe = num("trailingPE")
    if pe is not None and not 0 < pe <= 200:
        pe = None
    return pe, num("dividendYield"), num("priceToBook")


def append_point(hist, today, pe, dy, pb):
    """Um ponto por dia, acumulado (não há histórico grátis de P/L)."""
    if hist["dates"] and hist["dates"][-1] == today:
        hist["pe"][-1], hist["dy"][-1], hist["pb"][-1] = pe, dy, pb
    else:
        hist["dates"].append(today)
        hist["pe"].append(pe)
        hist["dy"].append(dy)
        hist["pb"].append(pb)


def main():
    prev = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    out = {"meta": {}, "fred": dict(prev.get("fred", {})), "spy": prev.get("spy", {"dates": [], "pe": [], "dy": []})}
    errors = []
    for sid in FRED:
        try:
            out["fred"][sid] = merge(out["fred"].get(sid), fred(sid))
        except Exception as e:  # noqa: BLE001
            errors.append(f"{sid}: {e}")
    out["cape"] = prev.get("cape")
    fetched = prev.get("meta", {}).get("cape_fetched")
    if not out["cape"] or not fetched or date.fromisoformat(fetched) < date.today() - timedelta(days=CAPE_MAX_AGE):
        try:
            out["cape"] = cape()
            fetched = date.today().isoformat()
        except Exception as e:  # noqa: BLE001
            errors.append(f"CAPE: {e}")
    today = date.today().isoformat()
    etf = prev.get("etf") or {}
    if "SPY" not in etf and out["spy"]["dates"]:  # migra o formato da Fase 1
        old = out["spy"]
        etf["SPY"] = {"dates": old["dates"], "pe": old["pe"], "dy": old["dy"], "pb": [None] * len(old["dates"])}
    for sym in equity_etfs():
        try:
            pe, dy, pb = snapshot(sym)
            if pe is None and dy is None:
                raise RuntimeError("sem P/L nem dividend yield")
            append_point(etf.setdefault(sym, {"dates": [], "pe": [], "dy": [], "pb": []}), today, pe, dy, pb)
        except Exception as e:  # noqa: BLE001
            errors.append(f"{sym}: {e}")
        time.sleep(0.5)
    out["etf"] = etf
    if "SPY" in etf:  # compatibilidade: a página da Fase 1 lê "spy"
        out["spy"] = {k: etf["SPY"][k] for k in ("dates", "pe", "dy")}
    if not out["fred"] and not etf:
        print("Nada obtido; arquivo anterior mantido.", file=sys.stderr)
        return 1
    out["meta"] = {"updated_at": date.today().isoformat(), "source": "FRED (St. Louis Fed), Yahoo Finance, Robert Shiller"}
    if out["cape"]:
        out["meta"]["cape_fetched"] = fetched
    else:
        del out["cape"]
    if errors:
        out["meta"]["errors"] = errors
        print("Avisos:", errors, file=sys.stderr)
    OUT.write_text(json.dumps(out, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    print(f"OK fundamentos: {len(out['fred'])} séries FRED, {len(etf)} ETFs com P/L -> {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
