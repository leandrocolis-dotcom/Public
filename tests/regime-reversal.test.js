import { describe, it, expect } from "vitest";
import {
  REV,
  ema,
  noiseSigma,
  trendSlope,
  reversalAt,
  reversalTrack,
  reversalText,
  reversalAlerts,
  sessionWord,
} from "../assets/regime-reversal.js";
import { revBannerHtml, revSpark } from "../assets/reversal-view.js";
import { revBadge } from "../assets/pend-float.js";
import { mktFor } from "../api/push-alerts.js";

const t0 = Date.parse("2026-11-20T12:00:00Z") / 1000; // 7h de NY: pré-mercado
function trail(path, noise = 0.5) {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
  return path.map((sc, i) => ({
    t: t0 + i * 300,
    score: sc + noise * rnd(),
    blocks: { us: sc * 0.8, world: sc * 0.5, macro: sc * 0.3 },
    px: 600 * (1 + sc / 5000),
  }));
}
const rise = Array.from({ length: 20 }, (_, i) => -10 + i * 2); // −10 → +28 em 95 min
const drop = (n, st = 2.5) => Array.from({ length: n }, (_, i) => 28 - (i + 1) * st);

describe("matemática do radar", () => {
  it("EMA, ruído robusto e inclinação com t", () => {
    expect(ema([0, 10, 10, 10], 3).at(-1)).toBeCloseTo(8.75);
    expect(noiseSigma([0, 1, 2, 3, 4, 5])).toBe(1); // variações iguais: piso de 1 ponto
    expect(noiseSigma([0, 3, 0, 3, 0, 3, 0])).toBeGreaterThan(3);
    const ts = [0, 300, 600, 900, 1200];
    const s = trendSlope(ts, [0, 1, 2.1, 2.9, 4]);
    expect(s.perH).toBeCloseTo(12, 0);
    expect(s.t).toBeGreaterThan(10);
  });
  it("sem pontos suficientes não lê nada", () => {
    expect(reversalAt(trail(rise.slice(0, 5)))).toBeNull();
  });
});

describe("estágios da virada", () => {
  it("movimento sem devolução: nada", () => {
    expect(reversalTrack(trail(rise)).stage).toBe("none");
    expect(reversalTrack(trail(Array(30).fill(5))).stage).toBe("none");
  });
  it("devolveu ~30% com velocidade: tendência de mudança, ainda não confirmada", () => {
    const r = reversalTrack(trail([...rise, ...drop(6)]));
    expect(r.stage).toBe("watch");
    expect(r.dir).toBe(-1);
    expect(r.retPct).toBeGreaterThanOrEqual(REV.RET_WATCH);
    expect(r.retPct).toBeLessThan(REV.RET_CONF);
    expect(r.strength).toBeGreaterThanOrEqual(REV.WATCH);
  });
  it("devolveu mais da metade com médias, blocos e SPY juntos: confirmada", () => {
    const r = reversalTrack(trail([...rise, ...drop(9)]));
    expect(r.stage).toBe("confirmed");
    expect(r.strength).toBeGreaterThanOrEqual(REV.CONF);
    expect(r.checks.every((c) => c.ok)).toBe(true);
    expect(r.since).toBeLessThan(r.confSince);
    expect(r.blocksOn).toBe(3);
    expect(r.pxRet).toBeLessThan(0);
  });
  it("virada que não seguiu e passou do extremo antigo: não confirmou (vem junto do aviso novo)", () => {
    // ainda abaixo do topo antigo: sem falha
    expect(reversalTrack(trail([...rise, ...drop(9), 12, 18, 24])).failed ?? null).toBeNull();
    const v = reversalTrack(trail([...rise, ...drop(9), 12, 18, 24, 30]));
    expect(v.stage).toBe("confirmed");
    expect(v.dir).toBe(1);
    expect(v.failed.dir).toBe(-1);
    expect(reversalText({ ...v, session: "pregão" }).body).toMatch(/^↩ A virada para baixo de .* não confirmou/); // prettier-ignore
    const f = { ...v, stage: "failed", dir: -1, session: "pregão" };
    expect(reversalText(f).badge).toBe("↩ Virada não confirmou");
    expect(reversalAlerts(f, { nowSec: v.t })[0].key).toMatch(/^rev:f:/);
  });
  it("virada para cima depois de queda: espelho", () => {
    const fall = rise.map((x) => -x);
    const r = reversalTrack(trail([...fall, ...drop(9).map((x) => -x)]));
    expect(r.stage).toBe("confirmed");
    expect(r.dir).toBe(1);
  });
  it("ruído alto pede perna maior: a mesma devolução em mercado nervoso não avisa", () => {
    const r = reversalTrack(trail([...rise, ...drop(6)], 10));
    expect(r.stage).toBe("none");
  });
});

describe("textos e avisos", () => {
  const cpts = trail([...rise, ...drop(9)]);
  const conf = { ...reversalTrack(cpts), pts: cpts, session: "pré-mercado" };
  const watch = { ...reversalTrack(trail([...rise, ...drop(6)])), session: "pré-mercado" };
  it("título claro com sessão e ação", () => {
    expect(reversalText(conf).title).toBe(
      "Virada para baixo (rumo à defesa) CONFIRMADA · pré-mercado",
    );
    expect(reversalText(conf).body).toMatch(/proteger ou vender compras alavancadas/);
    expect(reversalText(watch).title).toMatch(/^Possível virada para baixo/);
    expect(reversalText(watch).body).toMatch(/NÃO confirmada/);
  });
  it("um aviso por estágio e perna; tendência e confirmada com chaves diferentes e mesma tag", () => {
    const [a] = reversalAlerts(watch, { nowSec: watch.t });
    const [b] = reversalAlerts(conf, { nowSec: conf.t });
    expect(a.key).toMatch(/^rev:w:2026-11-20:dn:/);
    expect(b.key).toMatch(/^rev:c:2026-11-20:dn:/);
    expect(a.tag).toBe(b.tag);
    expect(reversalAlerts({ ...conf, stage: "none" })).toEqual([]);
  });
  it("preferência própria (reversal) e marcador 🔄 no push", () => {
    const rev = reversalAlerts(conf, { nowSec: conf.t }).map((a) => ({ ...a, topic: "rev" }));
    const mkt = [{ key: "mkt:zone:x", title: "Regime mudou", body: "", tag: "mkt-regime" }];
    const both = mktFor([...rev, ...mkt], {}, new Set(), conf.t);
    expect(both.map((a) => a.title.slice(0, 2))).toEqual(["🔄", "🧭"]);
    expect(mktFor([...rev, ...mkt], { reversal: false }, new Set(), conf.t)).toHaveLength(1);
    expect(mktFor([...rev, ...mkt], { mktregime: false }, new Set(), conf.t)[0].title).toMatch(/^🔄 VIRADA DO REGIME/); // prettier-ignore
  });
  it("sessão pelo relógio de NY", () => {
    expect(sessionWord(t0 * 1000)).toBe("pré-mercado");
    expect(sessionWord(Date.parse("2026-11-20T22:00:00Z"))).toBe("pós-mercado");
    expect(sessionWord(Date.parse("2026-11-20T16:00:00Z"))).toBe("pregão");
  });
  it("tela: cartão, faixa e selo", () => {
    expect(revBannerHtml(watch)).toMatch(/⚠ Tendência de virada para baixo/);
    expect(revBannerHtml({ ...conf, stage: "none" })).toBe("");
    expect(revBadge(conf)).toMatch(/▼ virada/);
    expect(revSpark(conf)).toMatch(/rv-ext/);
  });
});

describe("arranque saindo de lateral", () => {
  it("nota de lado e depois queda forte: mudança rápida (tendência e depois confirmada)", () => {
    const flat = Array(24).fill(10);
    const w = reversalTrack(trail([...flat, 8, 5, 2, 0]));
    expect(w.kind).toBe("burst");
    expect(w.stage).toBe("watch");
    const c = reversalTrack(trail([...flat, 8, 5, 2, -1, -4, -7]));
    expect(c.stage).toBe("confirmed");
    expect(reversalText({ ...c, session: "pós-mercado" }).title).toBe(
      "Mudança rápida para baixo (rumo à defesa) CONFIRMADA · pós-mercado",
    );
  });
});

describe("radar integrado ao pêndulo", () => {
  const cpts = trail([...rise, ...drop(9)]);
  const conf = { ...reversalTrack(cpts), pts: cpts, session: "pregão" };
  it("perna deslocada para terminar na agulha", async () => {
    const { revOverlay } = await import("../assets/reversal-view.js");
    const o = revOverlay(conf, conf.score + 4);
    expect(o.now).toBe(conf.score + 4);
    expect(o.ext - o.now).toBeCloseTo(conf.extScore - conf.score);
    expect(o.tone).toBe("dn");
    expect(o.label).toMatch(/^topo /);
    expect(revOverlay({ ...conf, stage: "none" }, 0)).toBeNull();
  });
  it("faixa e detalhe", async () => {
    const { revStripHtml, revDetailHtml } = await import("../assets/reversal-view.js");
    expect(revStripHtml(conf)).toMatch(/rvs dn confirmed/);
    expect(revStripHtml({ ...conf, stage: "none" })).toMatch(/Radar de virada: sem sinal/);
    expect(revDetailHtml(conf)).toMatch(/id="hm-rv"/);
  });
});
