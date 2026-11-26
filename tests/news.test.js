import { describe, it, expect } from "vitest";
import {
  parseRss,
  parseDate,
  mergeItems,
  matchNews,
  holdingTriggers,
  classifyNews,
  passTags,
  DEFAULT_TAGS,
} from "../assets/news.js";
import { parseSymbols } from "../api/news.js";

const RSS = `<rss><channel>
<item><title><![CDATA[Nvidia shares rise &amp; chips rally]]></title><link>https://ex.com/a</link><pubDate>Wed, 07 Oct 2026 11:44:00 GMT</pubDate></item>
<item><title>Sem link</title></item>
<item><title>Fed minutes awaited</title><link>https://ex.com/b</link><pubDate>2026-10-07 11:18:44</pubDate></item>
</channel></rss>`;

describe("RSS", () => {
  it("lê título, link e data; ignora item sem link", () => {
    const it = parseRss(RSS, { source: "X", region: "int" });
    expect(it.map((x) => x.title)).toEqual([
      "Nvidia shares rise & chips rally",
      "Fed minutes awaited",
    ]);
    expect(it[1].t).toBe(Date.parse("2026-10-07T11:18:44Z") / 1000);
  });
  it("datas RFC 822 e ISO sem fuso (UTC)", () => {
    expect(parseDate("Wed, 07 Oct 2026 11:44 GMT")).toBe(Date.parse("2026-10-07T11:44:00Z") / 1000);
    expect(parseDate("2026-10-07T08:46:22")).toBe(Date.parse("2026-10-07T08:46:22Z") / 1000);
    expect(parseDate("")).toBe(null);
  });
  it("junta sem repetir, descarta antigas e ordena", () => {
    const now = Date.parse("2026-10-07T12:00:00Z") / 1000;
    const out = mergeItems(
      [
        [
          { title: "A b", link: "https://x/1", t: now - 60 },
          { title: "Velha", link: "https://x/2", t: now - 3 * 86400 },
        ],
        [
          { title: "a  B", link: "https://y/1", t: now - 30 },
          { title: "Nova", link: "https://y/2", t: now - 10 },
        ],
      ],
      now,
    );
    expect(out.map((x) => x.title)).toEqual(["Nova", "A b"]);
    expect(out[0].id).toBeTruthy();
  });
  it("valida tickers da URL", () => {
    expect(parseSymbols("nvdl, ftnt,<x>,BRK.B")).toEqual(["NVDL", "FTNT", "BRK.B"]);
  });
});

describe("ligação com a carteira", () => {
  const H = [
    { sym: "NVDL", name: "GraniteShares 2x Long NVDA Daily ETF" },
    { sym: "FTNT", name: "Fortinet, Inc." },
    { sym: "KORU", name: "Direxion Daily MSCI South Korea Bull 3X" },
    { sym: "FAS", name: "Direxion Daily Financial Bull 3X" },
    { sym: "TMV", name: "Direxion Daily 20+ Year Treasury Bear 3X" },
    { sym: "LABD", name: "Direxion Daily S&P Biotech Bear 3X Shares" },
  ];
  const m = (title) => matchNews([{ title }], H)[0].hits ?? [];
  it("cita a empresa ou o ticker: ligação direta", () => {
    expect(m("SpaceX Seeks $40 Billion to Buy Nvidia Chips")).toContainEqual({
      sym: "NVDL",
      why: "Nvidia",
      direct: true,
    });
    expect(m("Fortinet beats estimates")).toContainEqual({
      sym: "FTNT",
      why: "Fortinet",
      direct: true,
    });
    expect(m("Options traders pile into $FTNT").some((h) => h.sym === "FTNT" && h.direct)).toBe(
      true,
    );
  });
  it("tema do ativo: ligação indireta", () => {
    expect(m("US 30-Year Yields Return to 2002 High")).toContainEqual({
      sym: "TMV",
      why: "juros/Fed",
      direct: false,
    });
    expect(m("Samsung profit beats as memory prices soar").map((h) => h.sym)).toContain("KORU");
    expect(m("FDA rejects biotech's lead drug").map((h) => h.sym)).toContain("LABD");
  });
  it("não cai em falsos positivos", () => {
    expect(m("When 20% of Profits Won't Do, Fund Managers Seek Carry")).toEqual([]); // "won"
    expect(m("India's central bank hikes rates").map((h) => h.sym)).not.toContain("FAS"); // banco central ≠ bancos
    expect(m("Vale a pena investir agora?")).toEqual([]); // "vale" ≠ Vale
    expect(
      holdingTriggers("LABD", "Direxion Daily S&P Biotech Bear 3X Shares").themes,
    ).not.toContain("tech");
  });
});

import { summaryOf } from "../assets/news.js";
describe("resumo da manchete", () => {
  it("limpa, corta e descarta o que só repete o título", () => {
    expect(
      summaryOf(
        "<p>U.S. Treasury yields climbed Wednesday as oil prices moved higher.</p>",
        "Yields rise",
      ),
    ).toBe("U.S. Treasury yields climbed Wednesday as oil prices moved higher.");
    expect(summaryOf("Yields rise", "Yields rise")).toBe("");
    expect(summaryOf("Texto curto")).toBe("");
    expect(
      summaryOf("Algo relevante aconteceu no mercado hoje. The post Algo appeared first on Site."),
    ).toBe("Algo relevante aconteceu no mercado hoje.");
    expect(summaryOf("palavra ".repeat(200)).length).toBeLessThanOrEqual(901);
  });
});

describe("popup da notícia", () => {
  it("mostra manchete, resumo completo e link", async () => {
    const { newsPopHtml } = await import("../assets/news-view.js");
    const h = newsPopHtml({
      title: "T <b>",
      link: "https://x.com/a",
      source: "FT",
      t: 0,
      d: "Resumo inteiro.",
    });
    expect(h).toContain("T &lt;b&gt;");
    expect(h).toContain("Resumo inteiro.");
    expect(h).toContain('href="https://x.com/a"');
    expect(h).toContain("data-npop-close");
  });
});

describe("tags e ruído", () => {
  const c = (title) => classifyNews({ title });
  it("marca assunto e impacto", () => {
    expect(c("Oil prices jump on tanker attacks near Strait of Hormuz")).toMatchObject({
      impact: true,
    });
    expect(c("Oil prices jump on tanker attacks near Strait of Hormuz").tags).toEqual(
      expect.arrayContaining(["geo", "commod"]),
    );
    expect(c("US 10-year Treasury yields hit 6%").tags).toContain("bonds");
    expect(c("Fed signals rate cut as inflation cools").tags).toContain("macro");
    expect(c("Dollar Finishes Fourth Straight Week of Gains").tags).toContain("fx");
  });
  it("opinião e ruído ficam fora do padrão", () => {
    const op = c("What Could Derail Boeing Stock?");
    expect(op.tags).toContain("opinion");
    expect(op.impact).toBe(false);
    const nz = c(
      "ROSEN, LEADING INVESTOR COUNSEL, Encourages GoDaddy Inc. Investors to Secure Counsel",
    );
    expect(nz.tags).toContain("noise");
    expect(passTags({ title: "x", tags: op.tags })).toBe(false);
    expect(passTags({ title: "x", tags: op.tags }, [...DEFAULT_TAGS, "opinion"])).toBe(true);
    expect(passTags({ title: "x", tags: ["bonds"] }, ["macro"])).toBe(false);
  });
  it("sem assunto vira Outros (desligado por padrão)", () => {
    expect(c("I've been with my boyfriend for two years").tags).toEqual(["other"]);
    expect(DEFAULT_TAGS).not.toContain("other");
  });
});
