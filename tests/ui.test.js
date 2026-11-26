import { describe, it, expect } from "vitest";
import { parseNum, formatLike, easeOut } from "../assets/motion.js";
import {
  resolveTheme,
  alpha,
  hexToRgb,
  readableOn,
  luminance,
  THEMES,
  DEFAULT_UI,
  stepZoom,
} from "../assets/theme.js";

describe("zoom da tela (− / + / 0)", () => {
  it("anda um degrau, para nas pontas e volta a 100%", () => {
    expect(stepZoom(1, 1)).toBe(1.1);
    expect(stepZoom(1, -1)).toBe(0.9);
    expect(stepZoom(1.5, 1)).toBe(1.5);
    expect(stepZoom(0.67, -1)).toBe(0.67);
    expect(stepZoom(1.25, 0)).toBe(1);
    expect(stepZoom(undefined, 1)).toBe(1.1);
    expect(stepZoom(1.05, 1)).toBe(1.1);
    expect(stepZoom(1.05, -1)).toBe(1);
  });
});

describe("motion: ler e formatar números em pt-BR", () => {
  it("lê inteiros, decimais, milhares, sinal e sufixo", () => {
    expect(parseNum("85")).toMatchObject({ value: 85, decimals: 0 });
    expect(parseNum("1.234,56")).toMatchObject({ value: 1234.56, decimals: 2 });
    expect(parseNum("+2,1%")).toMatchObject({ value: 2.1, decimals: 1, prefix: "+", suffix: "%" });
    expect(parseNum("-0,5σ")).toMatchObject({ value: -0.5, suffix: "σ" });
    expect(parseNum("−12 bps").value).toBe(-12);
    expect(parseNum("3,5x")).toMatchObject({ value: 3.5, suffix: "x" });
  });
  it("ignora o que não é só número", () => {
    for (const t of ["", "–", "SPY", "12/10", "1d +2,0%", "72 · Forte", "12:30"])
      expect(parseNum(t), t).toBeNull();
  });
  it("formata com as mesmas casas, sinal e sufixo", () => {
    const m = parseNum("+2,1%");
    expect(formatLike(1.05, m)).toBe("+1,1%");
    expect(formatLike(-0.04, m)).toBe("0,0%");
    expect(formatLike(-3.2, m)).toBe("-3,2%");
    expect(formatLike(1234.5, parseNum("0,00"))).toBe("1.234,50");
    expect(formatLike(7, parseNum("85"))).toBe("7");
  });
  it("ida e volta: o texto lido e formatado de novo é o mesmo", () => {
    for (const t of ["+17,7%", "-24,1%", "1.234,56", "85", "0,27", "+3,9%"])
      expect(formatLike(parseNum(t).value, parseNum(t))).toBe(t);
  });
  it("easeOut vai de 0 a 1 sem passar do alvo", () => {
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
    expect(easeOut(0.5)).toBeGreaterThan(0.5);
    expect(easeOut(0.99)).toBeLessThan(1);
  });
});

describe("tema: escolha e cores", () => {
  it("automático segue o sistema; id desconhecido volta ao padrão", () => {
    expect(resolveTheme("auto", true)).toBe("midnight");
    expect(resolveTheme("auto", false)).toBe("paper");
    expect(resolveTheme("graphite", false)).toBe("graphite");
    expect(resolveTheme("nao-existe", true)).toBe(DEFAULT_UI.theme);
  });
  it("seis temas, quatro escuros e dois claros, com o escuro como padrão", () => {
    expect(THEMES.map((t) => t.mode).sort()).toEqual([
      "dark",
      "dark",
      "dark",
      "dark",
      "light",
      "light",
    ]);
    expect(THEMES.find((t) => t.id === DEFAULT_UI.theme).mode).toBe("dark");
  });
  it("alpha, hexToRgb e escolha de texto legível", () => {
    expect(alpha("#3ddc97", 0.5)).toBe("#3ddc9780");
    expect(alpha("#3ddc97", 2)).toBe("#3ddc97ff");
    expect(hexToRgb("#ff7088")).toEqual([255, 112, 136]);
    expect(luminance([255, 255, 255])).toBeCloseTo(1, 6);
    expect(readableOn([250, 250, 250], "#000000", "#ffffff")).toBe("#000000");
    expect(readableOn([10, 20, 40], "#000000", "#ffffff")).toBe("#ffffff");
  });
  it("com preto/branco puros o texto dos blocos passa de 4,5 em qualquer fundo", () => {
    const ratio = (rgb, fg) => {
      const a = luminance(rgb) + 0.05;
      const b = luminance(hexToRgb(fg)) + 0.05;
      return Math.max(a, b) / Math.min(a, b);
    };
    let worst = 99;
    for (let r = 0; r <= 255; r += 15)
      for (let g = 0; g <= 255; g += 15)
        for (let b = 0; b <= 255; b += 15)
          worst = Math.min(worst, ratio([r, g, b], readableOn([r, g, b], "#000000", "#ffffff")));
    expect(worst).toBeGreaterThanOrEqual(4.5);
  });
});

describe("faixa de cotações (marquee)", () => {
  it("anda para a esquerda e volta ao início ao completar uma volta", async () => {
    const { advance } = await import("../assets/marquee.js");
    expect(advance(0, 0.25, 1000, 40)).toBe(10);
    expect(advance(995, 0.25, 1000, 40)).toBe(5);
    expect(advance(100, 5, 1000, 40)).toBe(110); // pausa longa (aba em segundo plano) não dá salto
    expect(advance(50, 0.1, 0)).toBe(0);
  });
});

describe("avisos push do servidor", () => {
  it("não repete o que já foi enviado, respeita as opções e agrupa o excedente", async () => {
    const { newsAlerts, alertsFor } = await import("../scripts/lib/push-alerts.mjs");
    const now = 1_800_000_000;
    const heads = [
      ["AAPL", "AAPL shares rise after iPhone sales beat"],
      ["MSFT", "MSFT cloud revenue tops estimates"],
      ["NVDA", "NVDA unveils new chip for data centers"],
      ["AMZN", "AMZN profit doubles on advertising growth"],
      ["TSLA", "TSLA stock slides as deliveries fall"],
      ["META", "META faces antitrust trial over Instagram deal"],
    ];
    const items = heads.map(([, title], i) => ({
      id: `n${i + 1}`,
      title,
      source: "FT",
      t: now - 60,
    }));
    const holdings = heads.map(([sym]) => ({ sym }));
    const all = newsAlerts(holdings, items, { nowSec: now });
    expect(all.length).toBe(6);
    expect(all[0]).toMatchObject({ key: "news:n1", url: "./?tab=news&news=n1" });
    // a mesma história repetida com outro título conta uma vez só
    const same = [1, 2, 3].map((i) => ({
      id: `s${i}`,
      title: `Fed corta juros ${i}`,
      source: "FT",
      t: now - 60,
    }));
    expect(newsAlerts([{ sym: "TLT" }], same, { nowSec: now }).length).toBe(1);
    expect(newsAlerts(holdings, items, { mode: "off", nowSec: now })).toEqual([]);
    expect(newsAlerts(holdings, items, { nowSec: now + 13 * 3600 })).toEqual([]); // velhas demais
    const r = alertsFor({
      holdings,
      flow: null,
      news: items,
      nowSec: now,
      sent: new Set(["news:n1"]),
      max: 3,
    });
    expect(r.send.length).toBe(4); // 3 avisos + 1 resumo do excedente
    // resumo cobre as 2 notícias excedentes e suas marcas (assinatura da história + contador do ativo no dia)
    expect(r.send.at(-1).covers.filter((k) => k.startsWith("news:")).length).toBe(2);
    expect(r.send.at(-1).covers.length).toBe(6);
    expect(r.send.some((a) => a.key === "news:n1")).toBe(false);
    expect(
      alertsFor({ holdings, flow: null, news: items, nowSec: now, prefs: { news: "off" } }).send,
    ).toEqual([]);
  });
  it("converte a chave VAPID de base64url para bytes", async () => {
    const { b64ToBytes } = await import("../assets/push.js");
    expect([...b64ToBytes("AQID")]).toEqual([1, 2, 3]);
    expect([...b64ToBytes("-_8")]).toEqual([251, 255]);
  });
});

describe("News: terminal", () => {
  it("código curto da fonte", async () => {
    const { srcCode } = await import("../assets/news-view.js");
    expect(srcCode("Bloomberg")).toBe("BBG");
    expect(srcCode("Fonte Nova Qualquer")).toBe("FNQ");
  });
});

describe("News: feed por fonte", () => {
  it("acumula marcando o que chegou", async () => {
    const { accumulate } = await import("../assets/feeds.js");
    const now = 1000;
    const first = accumulate(null, [{ id: 1, t: 900 }], now, true);
    expect(first[0].seen).toBe(0);
    const next = accumulate(first, [{ id: 2, t: 950 }], now + 60);
    expect(next.map((x) => [x.id, x.seen])).toEqual([
      [2, 1060],
      [1, 0],
    ]);
    expect(accumulate(next, [], now + 40 * 3600)).toEqual([]);
  });
});
