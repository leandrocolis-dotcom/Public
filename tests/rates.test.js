import { describe, expect, it } from "vitest";
import { cmpDate, curveSvg, interp, liveUs, normCmp, shapeOf, spreadsOf, weekdayOnOrBefore } from "../assets/rates.js"; // prettier-ignore
import { di1Maturity, parseB3Ref, parseBoeCurve, parseDi1, parseEcbCurve, parseMofCurve, parseTreasury, pickOnOrBefore, tenorYears } from "../api/_curves.js"; // prettier-ignore

const US = [
  { t: 0.25, y: 4.0 },
  { t: 2, y: 3.6 },
  { t: 5, y: 3.7 },
  { t: 10, y: 4.1 },
  { t: 30, y: 4.6 },
];

describe("rates (puro)", () => {
  it("interpola no prazo e não extrapola", () => {
    expect(interp(US, 2)).toBe(3.6);
    expect(interp(US, 7.5)).toBeCloseTo(3.9, 6);
    expect(interp(US, 40)).toBeNull();
    expect(interp([], 1)).toBeNull();
  });
  it("datas de comparação caem em dia útil", () => {
    expect(weekdayOnOrBefore("2026-11-15")).toBe("2026-11-13"); // domingo -> sexta
    expect(cmpDate("1d", "2026-11-16")).toBe("2026-11-13"); // segunda -> sexta
    expect(cmpDate("1m", "2026-11-18")).toBe("2026-10-16"); // 18/10 é domingo
    expect(cmpDate("1y", "2026-11-18")).toBe("2025-11-18");
    expect(cmpDate("ytd", "2026-11-18")).toBe("2025-12-31");
    expect(cmpDate("2025-03-15", "2026-11-18")).toBe("2025-03-15");
    expect(cmpDate("xx", "2026-11-18")).toBeNull();
  });
  it("normCmp tira inválidas, repetidas e corta em 6", () => {
    expect(normCmp(["1m", "1m", "foo", "2024-01-02"])).toEqual(["1m", "2024-01-02"]);
    expect(normCmp(["1d", "1w", "1m", "3m", "6m", "1y", "2y"]).length).toBe(6);
    expect(normCmp(undefined)).toEqual(["1m", "1y"]);
  });
  it("inclinações em bp e formato", () => {
    const s = spreadsOf(US, "us");
    expect(s[0]).toEqual({ label: "10a − 2a", bp: 50 });
    expect(s[1].bp).toBe(10);
    expect(shapeOf(US, "us").id).toBe("pos");
    expect(
      shapeOf(
        [
          { t: 2, y: 5 },
          { t: 10, y: 4 },
        ],
        "us",
      ).id,
    ).toBe("inv");
  });
  it("curva dos EUA ao vivo: fechamento + variação do dia interpolada", () => {
    const base = { date: "2026-11-17", points: US.map((p) => ({ ...p, label: "" })) };
    const q = { "^IRX": { p: 4.02, pc: 4.0 }, "^FVX": { p: 3.75, pc: 3.7 }, "^TNX": { p: 4.2, pc: 4.1 }, "^TYX": { p: 4.7, pc: 4.6 } }; // prettier-ignore
    const l = liveUs(base, q, "2026-11-18");
    expect(l.live).toBe(true);
    expect(l.points.find((p) => p.t === 10).y).toBeCloseTo(4.2, 6);
    expect(l.points.find((p) => p.t === 30).y).toBeCloseTo(4.7, 6);
    // 2a: entre 3m (+2 bp) e 5a (+5 bp)
    expect(l.points.find((p) => p.t === 2).y).toBeCloseTo(3.6 + 0.02 + (0.03 * 1.75) / 4.75, 3);
    expect(liveUs(base, q, "2026-11-17")).toBeNull(); // oficial já inclui o pregão
  });
  it("gráfico SVG com uma linha por curva e dica nos pontos", () => {
    const svg = curveSvg([{ name: "Agora", points: US, color: "red" }, { name: "1 mês", points: US.map((p) => ({ ...p, y: p.y + 0.2 })), color: "blue" }]); // prettier-ignore
    expect(svg.match(/<path/g).length).toBe(2);
    expect(svg).toContain("<title>Agora · 10a: 4,10%</title>");
    expect(curveSvg([])).toBe("");
  });
});

describe("api/_curves (parsers)", () => {
  it("Tesouro americano", () => {
    const csv = `Date,"1 Mo","1.5 Month","2 Mo","3 Mo","6 Mo","1 Yr","2 Yr","5 Yr","10 Yr","30 Yr"\n11/17/2026,4.10,4.08,4.05,4.00,3.90,3.80,3.60,3.70,4.10,4.60\n11/14/2026,4.11,,4.06,4.01,3.91,3.81,3.61,3.71,4.12,4.62`;
    const r = parseTreasury(csv);
    expect(r.map((x) => x.date)).toEqual(["2026-11-14", "2026-11-17"]);
    expect(r[1].points.find((p) => p.t === 10).y).toBe(4.1);
    expect(r[0].points.some((p) => p.t === 1.5 / 12)).toBe(false); // vazio fica de fora
    expect(pickOnOrBefore(r, "2026-11-16").date).toBe("2026-11-14");
    expect(pickOnOrBefore(r, null).date).toBe("2026-11-17");
    expect(tenorYears("1.5 Month")).toBeCloseTo(0.125);
  });
  it("BCE, MoF e BoE", () => {
    const ecb = `KEY,FREQ,TIME_PERIOD,OBS_VALUE\nYC.B.U2.EUR.4F.G_N_A.SV_C_YM.SR_3M,B,2026-11-17,1.9\nYC.B.U2.EUR.4F.G_N_A.SV_C_YM.SR_2Y,B,2026-11-17,2.0\nYC.B.U2.EUR.4F.G_N_A.SV_C_YM.SR_10Y,B,2026-11-17,2.6`;
    expect(parseEcbCurve(ecb)[0].points.map((p) => p.t)).toEqual([0.25, 2, 10]);
    const mof = `Interest Rate\nDate,1Y,2Y,10Y,40Y\n2026/11/17,0.8,0.9,1.6,3.3\n`;
    expect(parseMofCurve(mof)[0]).toMatchObject({ date: "2026-11-17" });
    const boe = `DATE,IUDBEDR,IUDSNZC,IUDMNZC,IUDLNZC\n17 Nov 2026,3.75,3.9,4.4,5.0`;
    const b = parseBoeCurve(boe)[0];
    expect(b.date).toBe("2026-11-17");
    expect(b.points[0]).toMatchObject({ t: 0, label: "Bank Rate", y: 3.75 });
  });
  it("B3: taxa referencial e DI1 ao vivo", () => {
    const rows = Array.from({ length: 40 }, (_, i) => `<tr><td>${(i + 1) * 30}</td><td>14,${String(50 - i).padStart(2, "0")}</td><td>14,00</td></tr>`).join(""); // prettier-ignore
    const pts = parseB3Ref(`<table>${rows}</table>`);
    expect(pts.length).toBeGreaterThan(10);
    expect(pts[0].y).toBeCloseTo(14.5);
    expect(parseB3Ref("<p>sem dados</p>")).toEqual([]);
    expect(di1Maturity("DI1F27")).toBe("2027-01-01");
    const now = Date.parse("2026-11-18T12:00:00Z");
    const j = { Scty: [{ symb: "DI1F28", SctyQtn: { curPrc: 13.2 }, asset: { AsstSummry: { mtrtyCode: "2028-01-03", opnCtrcts: 10 } } }, { symb: "DI1F27", buyOffer: { price: 14.0 }, sellOffer: { price: 14.1 } }, { symb: "DI1X26", SctyQtn: { curPrc: 15 } }] }; // prettier-ignore
    const d = parseDi1(j, now);
    expect(d.map((x) => x.sym)).toEqual(["DI1F27", "DI1F28"]); // X26 já venceu (prazo < 1 semana)
    expect(d[0].y).toBeCloseTo(14.05);
  });
});

describe("scripts/update-br-curve", async () => {
  const { di1Curves, parseTd, prevWeekday } = await import("../scripts/update-br-curve.mjs");
  it("DI1: ajuste do pregão anterior e taxa de hoje", () => {
    expect(prevWeekday("2026-11-16")).toBe("2026-11-13");
    const j = { Scty: [{ symb: "DI1F28", SctyQtn: { curPrc: 14.5, prvsDayAdjstmntPric: 14.43 }, asset: { AsstSummry: { mtrtyCode: "2028-01-03", opnCtrcts: 9 } } }, { symb: "XYZ" }] }; // prettier-ignore
    const c = di1Curves(j, "2026-11-18");
    expect(c.today[0][1]).toBe(14.5);
    expect(c.prev[0][1]).toBe(14.43);
    expect(c.prev[0][0]).toBeGreaterThan(c.today[0][0]);
  });
  it("Tesouro Direto: só prefixados, por data base", () => {
    const csv =
      "Tipo Titulo;Data Vencimento;Data Base;Taxa Compra Manha;Taxa Venda Manha\nTesouro Prefixado;01/01/2028;17/11/2025;13,10;13,22\nTesouro IPCA+;15/05/2035;17/11/2025;7,1;7,2\nTesouro Prefixado com Juros Semestrais;01/01/2035;17/11/2025;13,5;13,6\nTesouro Prefixado com Juros Semestrais;01/01/2028;17/11/2025;13,4;13,5";
    const td = parseTd(csv);
    expect(Object.keys(td)).toEqual(["2025-11-17"]);
    expect(td["2025-11-17"].map((x) => x[1])).toEqual([13.1, 13.5]);
  });
});

describe("juro real e inflação implícita", async () => {
  const { breakeven, curveFor, beParts, shapeOf } = await import("../assets/rates.js");
  const { parseTreasury } = await import("../api/_curves.js");
  const { parseNtnb } = await import("../scripts/update-br-curve.mjs");
  it("curva efetiva por modo", () => {
    expect(curveFor("us", "real")).toBe("usr");
    expect(curveFor("br", "be")).toBe("brb");
    expect(curveFor("eu", "real")).toBe("eu"); // sem versão real: fica a nominal
    expect(beParts("usb")).toEqual({ nom: "us", real: "usr" });
    expect(
      shapeOf(
        [
          { t: 5, y: 2 },
          { t: 10, y: 3 },
        ],
        "usb",
      ),
    ).toBeNull();
  });
  it("breakeven: EUA por diferença, Brasil por Fisher, sem extrapolar", () => {
    const nom = [
      { t: 1, y: 14 },
      { t: 10, y: 13 },
    ];
    const real = [
      { t: 5, y: 7.5 },
      { t: 30, y: 7 },
    ];
    expect(breakeven(nom, real)).toEqual([{ t: 5, y: 6.056 }]); // 13,556 − 7,5
    // vértices padrão entram com as duas curvas interpoladas; 2a fica fora (antes da curva real)
    const g = breakeven(
      nom,
      [
        { t: 2.7, y: 7.9 },
        { t: 8.5, y: 7.3 },
        { t: 13, y: 7.2 },
      ],
      true,
      [2, 5, 10],
    );
    expect(g.map((p) => p.t)).toEqual([2.7, 5, 8.5, 10]);
    expect(breakeven(nom, real, true)[0].y).toBeCloseTo((1.13556 / 1.075 - 1) * 100, 2);
  });
  it("TIPS: CSV do Tesouro americano (5 YR..30 YR)", () => {
    const csv =
      'Date,"5 YR","7 YR","10 YR","20 YR","30 YR"\n11/17/2026,1.45,1.62,1.85,2.20,2.35\n11/16/2026,1.40,1.60,1.83,2.18,2.33';
    const r = parseTreasury(csv);
    expect(r.at(-1).date).toBe("2026-11-17");
    expect(r.at(-1).points.map((p) => p.t)).toEqual([5, 7, 10, 20, 30]);
  });
  it("NTN-B: cupom como referência, principal só onde falta; Educa+/Renda+ fora", () => {
    const csv = [
      "Tipo Titulo;Data Vencimento;Data Base;Taxa Compra Manha;Taxa Venda Manha",
      "Tesouro IPCA+ com Juros Semestrais;15/05/2035;17/11/2026;7,40;7,52",
      "Tesouro IPCA+;15/05/2035;17/11/2026;7,55;7,67",
      "Tesouro IPCA+;15/08/2029;17/11/2026;7,90;8,02",
      "Tesouro IPCA+ com Juros Semestrais;15/08/2050;17/11/2026;7,10;7,22",
      "Tesouro Educa+;15/12/2040;17/11/2026;7,3;7,4",
      "Tesouro Renda+ Aposentadoria Extra;15/12/2049;17/11/2026;7,2;7,3",
      "Tesouro Prefixado;01/01/2029;17/11/2026;13,1;13,2",
    ].join("\n");
    const d = parseNtnb(csv)["2026-11-17"];
    expect(d.map((x) => x[1])).toEqual([7.9, 7.4, 7.1]);
  });
});

describe("implícita × Focus", async () => {
  const { focusCurve, inflationPremium } = await import("../assets/rates.js");
  const { parseFocusIpca } = await import("../api/_bcb.js");
  it("Focus: última mediana de cada ano", () => {
    const rows = [
      { Data: "2026-11-13", DataReferencia: "2027", Mediana: 4.0 },
      { Data: "2026-11-06", DataReferencia: "2027", Mediana: 4.1 },
      { Data: "2026-11-13", DataReferencia: "2026", Mediana: 4.4 },
    ];
    expect(parseFocusIpca(rows)).toEqual({ date: "2026-11-13", years: { 2026: 4.4, 2027: 4.0 } });
  });
  it("curva do Focus: média anualizada de hoje até k anos", () => {
    const f = focusCurve({ 2026: 4, 2027: 4, 2028: 4 }, "2026-11-18");
    expect(f.map((x) => x.t)).toEqual([1, 2]);
    expect(f[0].y).toBeCloseTo(4, 3); // inflação constante -> média igual
    expect(focusCurve({ 2027: 4 }, "2026-11-18")).toEqual([]); // sem o ano corrente
  });
  it("prêmio = implícita − Focus, só onde a implícita cobre", () => {
    const p = inflationPremium(
      [
        { t: 2.5, y: 5.2 },
        { t: 5, y: 5.7 },
      ],
      [
        { t: 1, y: 4 },
        { t: 3, y: 3.7 },
      ],
    );
    expect(p).toEqual([{ t: 3, be: 5.3, focus: 3.7, bp: 160 }]);
  });
});
