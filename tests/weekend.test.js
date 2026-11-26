import { describe, it, expect } from "vitest";
import { isWeekendNY, quietNow, weekendWindow, weekendDigest } from "../assets/weekend.js";
import { alertsFor } from "../scripts/lib/push-alerts.mjs";
import { viewNews } from "../assets/news-view.js";
import { viewSettings } from "../assets/settings-view.js";

const sec = (iso) => Date.parse(iso) / 1000;

describe("fim de semana (Nova York)", () => {
  it("sábado e domingo de NY, não o fuso do aparelho", () => {
    expect(isWeekendNY(sec("2026-10-17T15:00:00Z"))).toBe(true); // sábado
    expect(isWeekendNY(sec("2026-10-19T03:00:00Z"))).toBe(true); // domingo 23h em NY
    expect(isWeekendNY(sec("2026-10-19T05:00:00Z"))).toBe(false); // segunda 01h em NY
  });
  it("silencia só com a escolha ligada", () => {
    const sat = sec("2026-10-17T15:00:00Z");
    expect(quietNow({}, sat)).toBe(false);
    expect(quietNow({ weekendQuiet: true }, sat)).toBe(true);
    expect(quietNow({ weekendQuiet: true }, sec("2026-10-16T15:00:00Z"))).toBe(false);
  });
  it("janela: fechamento de sexta à abertura de segunda, com horário de verão", () => {
    const live = weekendWindow(sec("2026-10-17T15:00:00Z"));
    expect(live).toMatchObject({
      live: true,
      from: sec("2026-10-16T20:00:00Z"),
      key: "2026-10-16",
    });
    const done = weekendWindow(sec("2026-10-21T12:00:00Z"));
    expect(done).toMatchObject({ live: false, from: sec("2026-10-16T20:00:00Z"), to: sec("2026-10-19T13:30:00Z") }); // prettier-ignore
    // sexta antes do fechamento: ainda é o fim de semana anterior
    expect(weekendWindow(sec("2026-10-16T19:00:00Z")).key).toBe("2026-10-09");
    // depois do fim do horário de verão (1º/11) o fechamento é 21:00 UTC
    expect(weekendWindow(sec("2026-11-07T15:00:00Z")).from).toBe(sec("2026-11-06T21:00:00Z"));
  });
  it("resumo: carteira primeiro, depois as principais; fora da janela e Brasil ficam de fora", () => {
    const win = weekendWindow(sec("2026-10-21T12:00:00Z"));
    const t = sec("2026-10-17T12:00:00Z");
    const items = [
      { id: "a", title: "Fed signals rate cut as inflation cools", t, region: "int", impact: true },
      { id: "b", title: "NVDA chip export curbs", t, region: "int", impact: true, hits: [{ sym: "NVDA", direct: true }] }, // prettier-ignore
      { id: "c", title: "Ibovespa sobe", t, region: "br", impact: true },
      { id: "d", title: "Stocks rally on earnings", t: sec("2026-10-15T12:00:00Z"), region: "int", impact: true }, // prettier-ignore
    ];
    const d = weekendDigest(items, win);
    expect(d.pf.map((x) => x.id)).toEqual(["b"]);
    expect(d.top.map((x) => x.id)).toEqual(["a"]);
    expect(d.total).toBe(3);
  });
});

describe("silenciar no fim de semana", () => {
  it("push: nada sai no sábado com a escolha ligada", () => {
    const eco = [];
    const base = { holdings: [], news: [], eco, nowSec: sec("2026-10-17T15:00:00Z") };
    expect(alertsFor({ ...base, prefs: { weekendQuiet: true } })).toEqual({ send: [], all: [] });
  });
  it("Configurações › Avisos mostra a chave", () => {
    const html = viewSettings({ sub: "avisos", notifPrefs: { weekendQuiet: true } });
    expect(html).toContain("Silenciar no fim de semana");
    expect(html).toMatch(/aria-checked="true"[^>]*data-quiet/);
  });
  it("News: botão do resumo e seção quando ligado", () => {
    const news = { items: [{ id: "x", title: "Fed cuts rates", link: "l", source: "CNBC", t: 1 }] };
    expect(viewNews({ news })).toContain('data-wknd="1" aria-pressed="false"');
    const win = weekendWindow(sec("2026-10-21T12:00:00Z"));
    const item = { id: "y", title: "Fed signals rate cut", link: "m", source: "CNBC", region: "int", impact: true, t: sec("2026-10-17T12:00:00Z") }; // prettier-ignore
    const html = viewNews({ news, wknd: { items: [item], win } });
    expect(html).toContain("Resumo do fim de semana");
    expect(html).toContain("Principais do mercado");
    expect(html).toContain('data-news-pop="m"');
  });
});

describe("preferências entre aparelhos", () => {
  it("vale a escolha do aparelho atualizado por último, não a ordem do banco", async () => {
    const { userPrefs } = await import("../scripts/lib/push-alerts.mjs");
    const devices = [
      { prefs: { sig: true }, updated_at: "2026-10-15 17:07:50+00" },
      { prefs: { sig: true, weekendQuiet: true }, updated_at: "2026-10-17 14:56:26+00" },
    ];
    expect(userPrefs(devices).weekendQuiet).toBe(true);
    expect(userPrefs([...devices].reverse()).weekendQuiet).toBe(true);
    expect(userPrefs([])).toEqual({});
  });
});
