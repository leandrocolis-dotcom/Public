// Central de barras intraday (assets/bars-hub.js): chave canônica, validade = tamanho da barra alinhada ao relógio,
// última barra completada pelo preço ao vivo, pedidos iguais viram um só, erro mantém as barras anteriores.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ERR_RETRY, GRACE, MIN_GAP, barMinOf, barsCache, barsKey, completeLastBar, expiryOf, getBars, peekBars, refreshBars, useBars, validUntil } from "../assets/bars-hub.js"; // prettier-ignore
import { buildGrid } from "../assets/rot-intraday.js";

const T0 = Date.UTC(2026, 10, 13, 15, 7, 12); // 15:07:12 UTC

describe("bars-hub: chave", () => {
  it("lote: sem repetição e em ordem (a mesma URL entre telas)", () => {
    expect(barsKey({ symbols: ["XLK", "SPY", "XLK", "^VIX"], win: "short" })).toBe(
      "api/intraday?symbols=SPY,XLK,%5EVIX&win=short",
    );
    expect(barsKey({ symbols: ["B", "A"], win: "long" })).toBe("api/intraday?symbols=A,B&win=long");
  });
  it("um ativo, com e sem pré/pós (mesma URL de antes)", () => {
    expect(barsKey({ symbol: "BRK-B", prepost: true })).toBe("api/intraday?symbol=BRK-B&prepost=1");
    expect(barsKey({ symbol: "ES=F" })).toBe("api/intraday?symbol=ES%3DF");
  });
  it("tamanho da barra pela chave: long = 30 min; short e ?symbol= = 5 min", () => {
    expect(barMinOf("api/intraday?symbols=A,B&win=long")).toBe(30);
    expect(barMinOf("api/intraday?symbols=A,B&win=short")).toBe(5);
    expect(barMinOf("api/intraday?symbol=SPY&prepost=1")).toBe(5);
  });
});

describe("bars-hub: validade", () => {
  it("5 min: próxima virada :10 (+ folga); 30 min: próxima :30", () => {
    expect(validUntil(T0, 5)).toBe(Date.UTC(2026, 10, 13, 15, 10) + GRACE);
    expect(validUntil(T0, 30)).toBe(Date.UTC(2026, 10, 13, 15, 30) + GRACE);
    expect(validUntil(T0, 5, 0)).toBe(Date.UTC(2026, 10, 13, 15, 10));
  });
  it("exatamente na virada: vale até a próxima", () => {
    const at = Date.UTC(2026, 10, 13, 15, 10);
    expect(validUntil(at, 5, 0)).toBe(Date.UTC(2026, 10, 13, 15, 15));
  });
  it("base = hora da busca no servidor; resposta velha da borda vence logo, mas não antes de MIN_GAP", () => {
    const now = Date.UTC(2026, 10, 13, 15, 11);
    expect(expiryOf({ now, fetchedAt: now - 5_000, barMin: 5 })).toBe(Date.UTC(2026, 10, 13, 15, 15) + GRACE); // prettier-ignore
    // servidor buscou às 15:09:40 (antes da virada das 15:10): vale só MIN_GAP
    expect(expiryOf({ now, fetchedAt: Date.UTC(2026, 10, 13, 15, 9, 40), barMin: 5 })).toBe(now + MIN_GAP); // prettier-ignore
    // sem fetched_at (ou no futuro): base = agora
    expect(expiryOf({ now, barMin: 30 })).toBe(Date.UTC(2026, 10, 13, 15, 30) + GRACE);
    expect(expiryOf({ now, fetchedAt: now + 60_000, barMin: 30 })).toBe(Date.UTC(2026, 10, 13, 15, 30) + GRACE); // prettier-ignore
  });
  it("erro: nova tentativa em ERR_RETRY", () => {
    expect(expiryOf({ now: T0, barMin: 5, ok: false })).toBe(T0 + ERR_RETRY);
  });
});

describe("bars-hub: última barra completada pelo preço ao vivo", () => {
  const sr = { t: [1000 * 300, 1001 * 300], c: [10, 11], s: ["reg", "reg"] };
  it("mesma barra: troca o fechamento; não muda a série recebida", () => {
    const out = completeLastBar(sr, { p: 11.5, t: 1001 * 300 + 120 }, 5);
    expect(out.t).toEqual(sr.t);
    expect(out.c).toEqual([10, 11.5]);
    expect(sr.c).toEqual([10, 11]);
  });
  it("barra nova: acrescenta o ponto com a sessão da última barra", () => {
    const out = completeLastBar(sr, { p: 12, t: 1002 * 300 + 10 }, 5);
    expect(out.t).toEqual([...sr.t, 1002 * 300 + 10]);
    expect(out.c).toEqual([10, 11, 12]);
    expect(out.s).toEqual(["reg", "reg", "reg"]);
  });
  it("preço velho, inválido ou de mais de 3 dias: série igual", () => {
    expect(completeLastBar(sr, { p: 12, t: 1001 * 300 }, 5)).toBe(sr);
    expect(completeLastBar(sr, { p: 0, t: 1002 * 300 }, 5)).toBe(sr);
    expect(completeLastBar(sr, null, 5)).toBe(sr);
    expect(completeLastBar(sr, { p: 12, t: 1001 * 300 + 3 * 86400 }, 5)).toBe(sr);
    expect(completeLastBar({ t: [], c: [] }, { p: 1, t: 5 }, 5)).toEqual({ t: [], c: [] });
  });
  it("buildGrid (rotação) dá o mesmo resultado de antes com o preço ao vivo", () => {
    const series = {
      A: { t: [0, 300, 600], c: [1, 2, 3], s: ["pre", "reg", "reg"] },
      B: { t: [0, 300, 600], c: [5, 6, 7], s: ["pre", "reg", "reg"] },
    };
    // mesma barra (600–900): fechamento trocado
    const same = buildGrid(series, ["A", "B"], 5, { A: { p: 3.5, t: 700 } });
    expect(same.t).toEqual([0, 300, 600]);
    expect(same.vals.A).toEqual([1, 2, 3.5]);
    expect(same.vals.B).toEqual([5, 6, 7]);
    // barra nova (900): entra se ≥30% dos ativos negociaram nela; B repete o último preço
    const next = buildGrid(series, ["A", "B"], 5, { A: { p: 4, t: 950 } });
    expect(next.t).toEqual([0, 300, 600, 900]);
    expect(next.vals.A).toEqual([1, 2, 3, 4]);
    expect(next.vals.B).toEqual([5, 6, 7, 7]);
    expect(next.sess).toEqual(["pre", "reg", "reg", "reg"]);
  });
});

describe("bars-hub: cache", () => {
  let calls;
  let reply;
  beforeEach(() => {
    barsCache.clear();
    calls = [];
    reply = (url) =>
      new Response(JSON.stringify({ fetched_at: new Date(Date.now()).toISOString(), url }), { status: 200 }); // prettier-ignore
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    vi.stubGlobal(
      "fetch",
      vi.fn((url) => {
        calls.push(url);
        return Promise.resolve(reply(url));
      }),
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("pedidos iguais ao mesmo tempo viram um só; depois, o cache vale até a virada da barra", async () => {
    const key = barsKey({ symbol: "SPY", prepost: true });
    const [a, b] = await Promise.all([getBars(key), getBars(key)]);
    expect(calls).toHaveLength(1);
    expect(a).toBe(b);
    expect(peekBars(key)).not.toBeNull();
    await getBars(key, { now: Date.UTC(2026, 10, 13, 15, 10) + GRACE - 1 });
    expect(calls).toHaveLength(1);
    vi.setSystemTime(Date.UTC(2026, 10, 13, 15, 10) + GRACE);
    await getBars(key);
    expect(calls).toHaveLength(2);
  });

  it("refreshBars: busca na hora furando o cache da borda e grava na chave canônica", async () => {
    const key = barsKey({ symbols: ["SPY", "^VIX"], win: "short" });
    await getBars(key);
    await refreshBars(key); // ainda dentro da validade: busca mesmo assim
    expect(calls).toHaveLength(2);
    expect(calls[1]).toBe(`${key}&r=${T0}`);
    expect(peekBars(key).data.url).toBe(`${key}&r=${T0}`);
  });

  it("useBars: devolve a entrada na hora, busca em segundo plano e avisa uma vez por função", async () => {
    const key = barsKey({ symbols: ["XLK", "SPY"], win: "short" });
    const cb = vi.fn();
    const e = useBars(key, { onUpdate: cb });
    expect(e.loading).toBe(true);
    expect(e.data).toBe(null);
    useBars(key, { onUpdate: cb }); // redesenho durante a busca: não repete pedido nem aviso
    await e.promise;
    expect(calls).toHaveLength(1);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(useBars(key).data.url).toBe(key);
    expect(calls).toHaveLength(1);
  });

  it("telas diferentes com a mesma chave usam o mesmo cache (radar técnico + painel do ativo)", async () => {
    const key = barsKey({ symbol: "NVDA", prepost: true });
    await getBars(key);
    const e = useBars(key);
    expect(e.loading).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it("erro: mantém as barras anteriores, registra o motivo e tenta de novo em 1 min", async () => {
    const key = barsKey({ symbols: ["A"], win: "long" });
    const first = await getBars(key);
    vi.setSystemTime(Date.UTC(2026, 10, 13, 15, 31));
    reply = () => new Response(JSON.stringify({ error: "fonte fora" }), { status: 500 });
    await expect(getBars(key)).rejects.toThrow("fonte fora");
    const e = peekBars(key);
    expect(e.data).toBe(first);
    expect(e.err).toBe("fonte fora");
    // dentro do minuto: não busca de novo (rejeita com o mesmo erro)
    await expect(getBars(key)).rejects.toThrow("fonte fora");
    expect(calls).toHaveLength(2);
    vi.setSystemTime(Date.UTC(2026, 10, 13, 15, 31) + ERR_RETRY);
    reply = (url) => new Response(JSON.stringify({ url, ok: 1 }), { status: 200 });
    const d = await getBars(key);
    expect(d.ok).toBe(1);
    expect(peekBars(key).err).toBe(null);
  });

  it("force ignora a validade, mas não repete uma busca em andamento", async () => {
    const key = barsKey({ symbol: "QQQ", prepost: true });
    await getBars(key);
    const p1 = getBars(key, { force: true });
    const p2 = getBars(key, { force: true });
    await Promise.all([p1, p2]);
    expect(calls).toHaveLength(2);
  });
});
