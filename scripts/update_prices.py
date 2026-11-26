"""Gera data/prices.json (Pêndulo), data/flow.json (mapa de fluxo) e data/ohlc.json (análise gráfica)
a partir do Yahoo Finance.

Uso:   python scripts/update_prices.py
Requer: pip install yfinance requests pandas

Se qualquer etapa crítica falhar, o arquivo anterior é mantido (a página passa a
marcá-lo como defasado sozinha).
"""
import json
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd
import requests
import yfinance as yf

from price_guard import calendar_regressed, keep_newer, load_prev

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "prices.json"
FLOW_OUT = ROOT / "data" / "flow.json"
OHLC_OUT = ROOT / "data" / "ohlc.json"
OHLC_ROWS = 520  # ~2 anos de pregões: média de 200 dias + histórico para o teste do sinal
FLOW_ROWS = 300  # fechamentos: 1 ano + folga para médias de 50 dias
FLOW_VOL_ROWS = 60  # volume: só o necessário para a média de 20 dias e o replay
BRT = timezone(timedelta(hours=-3))
KEEP_ROWS = 1000
MIN_ROWS = 800


def load_assets() -> dict:
    """Lê código -> símbolo Yahoo direto de assets/universe.js (fonte única da verdade)."""
    src = (ROOT / "assets" / "universe.js").read_text(encoding="utf-8")
    block = src.split("const RAW_ASSETS = [", 1)[1].split("];", 1)[0]
    return dict(re.findall(r'\["([A-Z0-9]+)",\s*"([^"]+)"', block))


def load_flow_symbols() -> list:
    """Símbolos do mapa de fluxo, lidos de assets/flow-universe.js."""
    src = (ROOT / "assets" / "flow-universe.js").read_text(encoding="utf-8")
    block = src.split("const RAW = [", 1)[1].split("];", 1)[0]
    return re.findall(r'^\s*\["([^"]+)",', block, flags=re.M)


def write_flow(raw_close, raw_vol, cal) -> None:
    """data/flow.json: fechamentos e volumes alinhados ao calendário do SPY."""
    syms = [s for s in load_flow_symbols() if s in raw_close.columns and raw_close[s].notna().any()]
    close = pd.DataFrame({s: raw_close[s].dropna() for s in syms})
    close = close.reindex(close.index.union(cal)).ffill().loc[cal].tail(FLOW_ROWS)
    close = close.dropna(axis=1, how="any")
    vol = raw_vol.reindex(cal).loc[close.index].tail(FLOW_VOL_ROWS).fillna(0)
    out = {
        "dates": [d.strftime("%Y-%m-%d") for d in close.index],
        "close": {s: [round(float(v), 6 if v < 1 else 4) for v in close[s]] for s in close.columns},
        "vol": {s: [int(v) for v in vol[s]] for s in close.columns if s in vol.columns and vol[s].sum() > 0},
        "last_real": {s: raw_close[s].dropna().index.max().date().isoformat() for s in close.columns},
    }
    fixed = keep_newer(out, "close", load_prev(FLOW_OUT))
    if fixed:
        print(f"Aviso (fluxo): Yahoo sem o último pregão de {len(fixed)} ativo(s); mantido o publicado: "
              f"{', '.join(sorted(fixed)[:12])}", file=sys.stderr)
    missing = sorted(set(load_flow_symbols()) - set(close.columns))
    if missing:
        print(f"Aviso (fluxo): sem histórico para {missing}", file=sys.stderr)
    FLOW_OUT.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    print(f"OK fluxo: {len(close.columns)} ativos, {len(close)} pregões -> {FLOW_OUT.relative_to(ROOT)}")


def write_ohlc(data, assets, cal, market_open, ny_today) -> None:
    """data/ohlc.json: abertura, máxima, mínima, fechamento e volume diários por ativo (análise gráfica).

    Com o pregão aberto o último dia é parcial e fica de fora (a página o monta com a cotação ao vivo).
    Assim o arquivo só muda quando um pregão novo fecha, sem commits a cada 30 minutos.
    v em milhares de unidades. Preços de ativos abaixo de 10 levam 4 casas (juros, câmbio)."""
    cols = {k: data[k] for k in ("Open", "High", "Low", "Close", "Volume")}
    idx = cal
    if market_open:
        idx = idx[idx < pd.Timestamp(ny_today)]
    idx = idx[-OHLC_ROWS:]
    cols = {k: cols[k].copy() for k in ("Open", "High", "Low", "Close", "Volume")}
    for k in ("Open", "High", "Low", "Close"):
        fix_fx_dates(cols[k])
    bars, last_real = {}, {}
    for code, sym in assets.items():
        if sym not in cols["Close"].columns or not cols["Close"][sym].notna().any():
            continue
        c = cols["Close"][sym].reindex(idx).ffill()
        if c.isna().any():
            continue  # sem histórico completo na janela: fica de fora
        dec = 4 if float(c.iloc[-1]) < 10 else 2
        o, h, l = (cols[k][sym].reindex(idx).fillna(c) for k in ("Open", "High", "Low"))
        h, l = pd.concat([h, o, c], axis=1).max(axis=1), pd.concat([l, o, c], axis=1).min(axis=1)
        v = cols["Volume"][sym].reindex(idx).fillna(0)
        bars[code] = {
            "o": [round(float(x), dec) for x in o],
            "h": [round(float(x), dec) for x in h],
            "l": [round(float(x), dec) for x in l],
            "c": [round(float(x), dec) for x in c],
            "vk": [int(x // 1000) for x in v],
        }
        last_real[code] = cols["Close"][sym].dropna().index.max().date().isoformat()
    out = {
        "dates": [d.strftime("%Y-%m-%d") for d in idx],
        "bars": bars,
        "last_real": last_real,
    }
    OHLC_OUT.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    print(f"OK ohlc: {len(bars)} ativos, {len(idx)} pregões -> {OHLC_OUT.relative_to(ROOT)}")


def with_retry(fn, tries=3, wait=5):
    """O Yahoo falha de vez em quando (429, timeout): tenta de novo antes de desistir."""
    for i in range(tries):
        try:
            return fn()
        except Exception as e:  # noqa: BLE001
            if i == tries - 1:
                raise
            print(f"Tentativa {i + 1} falhou ({e}); nova tentativa em {wait * (i + 1)}s", file=sys.stderr)
            time.sleep(wait * (i + 1))


def carry_forward(df, assets, last_real, series):
    """Ativo que o Yahoo não devolveu: repete o último preço do arquivo anterior e NÃO atualiza o
    last_real. A página então o marca como defasado e suprime os pares dele (seção 9)."""
    if not OUT.exists():
        return df
    prev = json.loads(OUT.read_text(encoding="utf-8"))
    idx = pd.to_datetime(prev["dates"])
    for c in assets:
        if c in series or c not in prev.get("series", {}):
            continue
        s = pd.Series(prev["series"][c], index=idx)
        df[c] = s.reindex(s.index.union(df.index)).ffill().reindex(df.index).to_numpy()
        last_real[c] = prev.get("last_real", {}).get(c, prev["dates"][-1])
        print(f"Aviso: {c} sem dados novos; mantido o preço anterior (marcado como defasado)", file=sys.stderr)
    return df


def fix_fx_dates(close: pd.DataFrame) -> None:
    """Câmbio à vista (=X) do Yahoo: a barra diária datada D traz o fechamento de D-1 (o Yahoo carimba a barra
    às 00:00 de Londres). Sem correção, toda moeda fica um pregão atrasada em relação a ações e futuros
    (ex.: a queda do USD/BRL após a eleição apareceu em 06/10 em vez de 05/10; PTAX confirma 05/10).
    Recuo cada valor para a data anterior da própria série; o último pregão vem da cotação ao vivo."""
    for s in [c for c in close.columns if str(c).endswith("=X")]:
        col = close[s].dropna()
        if len(col) > 1:
            close[s] = pd.Series(col.to_numpy()[1:], index=col.index[:-1]).reindex(close.index)


def main() -> int:
    assets = load_assets()
    if len(assets) != 47:
        print(f"Universo inesperado: {len(assets)} ativos (esperado 47)", file=sys.stderr)
        return 1

    symbols = sorted(set(assets.values()) | set(load_flow_symbols()))
    data = with_retry(
        lambda: yf.download(symbols, period="5y", progress=False, auto_adjust=True, group_by="column")
    )
    raw = data["Close"].copy()
    fix_fx_dates(raw)
    series = {c: raw[s].dropna() for c, s in assets.items() if s in raw.columns and raw[s].notna().any()}
    missing = sorted(set(assets) - set(series))
    if missing:
        print(f"Aviso: sem dados para {missing}", file=sys.stderr)
    if "SPY" not in series:
        print("SPY ausente: abortando (mantendo arquivo anterior)", file=sys.stderr)
        return 1

    cal = series["SPY"].index  # calendário do SPY: só pregões dos EUA
    df = pd.DataFrame({c: s.reindex(cal.union(s.index)) for c, s in series.items()})
    df = df.loc[cal].ffill().tail(KEEP_ROWS)
    df = df.dropna(axis=1, how="any")  # ativo sem histórico completo na janela fica de fora
    last_real = {c: series[c].index.max().date().isoformat() for c in df.columns}
    df = carry_forward(df, assets, last_real, series)
    if len(df) < MIN_ROWS:
        print(f"Histórico curto ({len(df)} < {MIN_ROWS}): abortando", file=sys.stderr)
        return 1

    # last_real: última data com preço REAL (não preenchido) de cada ativo (calculado acima).
    meta = with_retry(
        lambda: requests.get(
            "https://query1.finance.yahoo.com/v8/finance/chart/SPY",
            params={"range": "1d", "interval": "1d"},
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=20,
        ).json()["chart"]["result"][0]["meta"]
    )
    t = meta["regularMarketTime"]
    reg = meta["currentTradingPeriod"]["regular"]
    # pregão aberto pelo RELÓGIO, não pela hora do último negócio: o Yahoo às vezes para em 15:57 de NY e,
    # com `t < end`, o fechamento seguia "Intradiário" a noite toda (ohlc.json ficou sem o pregão de 20/11/2026)
    now = time.time()

    out = {
        "meta": {
            "updated_at_brt": datetime.fromtimestamp(t, tz=BRT).isoformat(),
            "market_status": "Intradiário" if reg["start"] <= now < reg["end"] else "Fechamento",
            "source": "Yahoo Finance",
        },
        "dates": [d.strftime("%Y-%m-%d") for d in df.index],
        "series": {c: [round(float(v), 4) for v in df[c]] for c in df.columns},
        "last_real": last_real,
    }
    # trava: a base publicada nunca anda para trás (scripts/price_guard.py)
    prev = load_prev(OUT)
    if calendar_regressed(out["dates"], prev):
        print(f"Aviso: Yahoo devolveu a base até {out['dates'][-1]}, mais velha que a publicada "
              f"({prev['dates'][-1]}): nada gravado, mantidos os arquivos anteriores", file=sys.stderr)
        return 0
    fixed = keep_newer(out, "series", prev)
    if fixed:
        print(f"Aviso: Yahoo sem o último pregão de {sorted(fixed)}; mantido o valor publicado", file=sys.stderr)
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    write_flow(raw, data["Volume"], cal)
    market_open = out["meta"]["market_status"] == "Intradiário"
    ny_today = datetime.fromtimestamp(t, tz=ZoneInfo("America/New_York")).date()
    write_ohlc(data, assets, cal, market_open, ny_today)
    print(f"OK: {len(out['series'])} ativos, {len(out['dates'])} pregões, até {out['dates'][-1]} "
          f"({out['meta']['market_status']}) -> {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
