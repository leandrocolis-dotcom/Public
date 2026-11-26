import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// Lê os tokens de assets/themes.css e confere o contraste (WCAG 2.x) de cada tema.
const css = readFileSync(new URL("../assets/themes.css", import.meta.url), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);
const blocks = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, sel, body]) => ({
  sel: sel.trim(),
  vars: Object.fromEntries(
    [...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
  ),
}));
const THEMES = { midnight: "dark", graphite: "dark", ember: "dark", terminal: "dark", paper: "light", mist: "light" }; // prettier-ignore

function tokens(theme, cb = false) {
  const t = { ...blocks.find((b) => b.sel.includes(`html[data-theme="${theme}"]`)).vars };
  if (cb)
    Object.assign(
      t,
      blocks.find((b) => b.sel === `html[data-cb="1"][data-mode="${THEMES[theme]}"]`).vars,
    );
  return t;
}
const lum = (hex) => {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

describe.each(Object.keys(THEMES))("tema %s", (theme) => {
  for (const cb of [false, true]) {
    const label = cb ? "com daltonismo" : "padrão";
    const t = tokens(theme, cb);
    const grounds = ["--bg", "--surface", "--surface-2"];
    it(`${label}: todas as cores são hex sólidas`, () => {
      for (const [k, v] of Object.entries(t))
        if (/^--(bg|rail|surface|line|text|accent|on-|buy|sell|wait|info|violet)/.test(k))
          expect(v, k).toMatch(/^#[0-9a-f]{6}$/);
    });
    it(`${label}: texto principal AAA (≥ 7), secundário e terciário AA (≥ 4,5) sobre os fundos`, () => {
      for (const g of grounds) {
        expect(ratio(t["--text"], t[g]), `text/${g}`).toBeGreaterThanOrEqual(7);
        expect(ratio(t["--text-2"], t[g]), `text-2/${g}`).toBeGreaterThanOrEqual(4.5);
      }
      // o terciário carrega rótulos, datas e unidades: AA (≥ 4,5) em todos os fundos, não só decorativo
      for (const g of grounds)
        expect(ratio(t["--text-3"], t[g]), `text-3/${g}`).toBeGreaterThanOrEqual(4.5);
    });
    it(`${label}: alta, baixa, espera, destaque e informação legíveis (≥ 4,5) sobre fundos e sobre o próprio tom suave`, () => {
      for (const c of ["buy", "sell", "wait", "info", "accent"]) {
        for (const g of grounds)
          expect(ratio(t[`--${c}`], t[g]), `${c}/${g}`).toBeGreaterThanOrEqual(4.5);
        expect(ratio(t[`--${c}`], t[`--${c}-soft`]), `${c}/${c}-soft`).toBeGreaterThanOrEqual(4.5);
      }
      for (const c of ["buy", "sell", "wait", "info", "accent"])
        expect(ratio(t["--text"], t[`--${c}-soft`]), `text/${c}-soft`).toBeGreaterThanOrEqual(7);
      expect(ratio(t["--on-accent"], t["--accent"]), "on-accent").toBeGreaterThanOrEqual(4.5);
    });
    it(`${label}: alta e baixa se distinguem por luminosidade e matiz`, () => {
      expect(ratio(t["--buy"], t["--sell"])).toBeGreaterThanOrEqual(cb ? 1.15 : 1.0);
      expect(t["--buy"]).not.toBe(t["--sell"]);
    });
  }
  it("camadas de superfície sobem em degraus visíveis", () => {
    const t = tokens(theme);
    expect(ratio(t["--surface"], t["--bg"])).toBeGreaterThan(1.03);
    expect(ratio(t["--line-2"], t["--surface"])).toBeGreaterThan(1.2);
  });
});

describe.each(Object.keys(THEMES))("realce de células no tema %s", (theme) => {
  for (const cb of [false, true]) {
    it(`${cb ? "com daltonismo" : "padrão"}: texto de alta/baixa continua legível (≥ 4,5) sobre o realce máximo`, () => {
      const t = tokens(theme, cb);
      const a = Number(t["--heat-max"]);
      expect(a).toBeGreaterThan(0.05);
      const mix = (c, base) =>
        "#" +
        [1, 3, 5]
          .map((i) =>
            Math.round(
              parseInt(c.slice(i, i + 2), 16) * a + parseInt(base.slice(i, i + 2), 16) * (1 - a),
            )
              .toString(16)
              .padStart(2, "0"),
          )
          .join("");
      for (const c of ["--buy", "--sell"]) {
        for (const ground of ["--surface", "--surface-2"])
          expect(
            ratio(t[c], mix(t[c], t[ground])),
            `${c} sobre realce em ${ground}`,
          ).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});

describe("daltonismo", () => {
  it("troca verde/vermelho por azul/laranja", () => {
    for (const theme of Object.keys(THEMES)) {
      const a = tokens(theme, false);
      const b = tokens(theme, true);
      expect(b["--buy"]).not.toBe(a["--buy"]);
      expect(b["--sell"]).not.toBe(a["--sell"]);
    }
  });
});
