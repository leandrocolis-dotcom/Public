import { describe, it, expect } from "vitest";
import { mktRegimeAlerts, nextBound } from "../assets/mkt-regime-alerts.js";
import { mktFor } from "../api/push-alerts.js";

const now = Date.parse("2026-11-20T15:00:00Z") / 1000;
const P = (score, t = now) => ({ t, score, blocks: { us: 10, world: -5, macro: 3 } });
const ago = (score) => P(score, now - 3600);

describe("avisos do regime do mercado", () => {
  it("mudou de faixa com folga: um aviso por troca e dia", () => {
    const [a] = mktRegimeAlerts(P(-15), ago(-35), { nowSec: now });
    expect(a.kind).toBe("zone");
    expect(a.key).toBe("mkt:zone:2026-11-20:df>nt");
    expect(a.title).toBe("Regime mudou: Defesa → Neutro");
    expect(a.body).toMatch(/−35 → −15 em 60 min/);
    expect(a.body).toMatch(/entradas táticas/);
  });
  it("cruzou sem folga: aviso de tração na fronteira, não de troca", () => {
    const [a] = mktRegimeAlerts(P(-19), ago(-30), { nowSec: now });
    expect(a.kind).toBe("near");
    expect(a.body).toMatch(/acabou de cruzar a fronteira −20/);
  });
  it("ganhando tração perto da próxima fronteira", () => {
    const [a] = mktRegimeAlerts(P(-25), ago(-45), { nowSec: now });
    expect(a.kind).toBe("near");
    expect(a.title).toBe("Regime ganhando tração rumo a Neutro");
    expect(a.body).toMatch(/a 5 pontos da fronteira −20/);
  });
  it("rumo à defesa: texto de proteção; sair da defesa forte não é 'aumentar risco'", () => {
    expect(mktRegimeAlerts(P(-45), ago(-10), { nowSec: now })[0].body).toMatch(/reduzir risco/);
    expect(mktRegimeAlerts(P(-50), ago(-70), { nowSec: now })[0].body).toMatch(/defesa está perdendo força/); // prettier-ignore
  });
  it("pulo pequeno em cima da linha não é troca de faixa (−61 → −57)", () => {
    expect(mktRegimeAlerts(P(-57), ago(-61), { nowSec: now })).toEqual([]);
    expect(mktRegimeAlerts(P(-54), ago(-61), { nowSec: now })).toEqual([]); // 6 dentro, mas só 7 de movimento
  });
  it("sem tração ou longe da fronteira: nada", () => {
    expect(mktRegimeAlerts(P(-57), ago(-56), { nowSec: now })).toEqual([]);
    expect(mktRegimeAlerts(P(-40), ago(-55), { nowSec: now })).toEqual([]); // andou 15, mas a 20 da fronteira
    expect(mktRegimeAlerts(P(-25), ago(-30), { nowSec: now })).toEqual([]); // perto, mas sem tração
  });
  it("próxima fronteira no sentido do movimento", () => {
    expect(nextBound(-25, 1)).toBe(-20);
    expect(nextBound(-25, -1)).toBe(-60);
    expect(nextBound(70, 1)).toBeNull();
  });
  it("preferência, fim de semana silenciado e já enviados", () => {
    const mkt = mktRegimeAlerts(P(-15), ago(-35), { nowSec: now });
    expect(mktFor(mkt, {}, new Set(), now)[0].title).toBe(
      "🧭 REGIME DO MERCADO · Regime mudou: Defesa → Neutro",
    );
    expect(mktFor(mkt, { mktregime: false }, new Set(), now)).toEqual([]);
    expect(mktFor(mkt, {}, new Set([mkt[0].key]), now)).toEqual([]);
  });
});
