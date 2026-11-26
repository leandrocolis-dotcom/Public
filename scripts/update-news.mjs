// Cron (GitHub Actions): manchetes dos sites que recusam a função da Vercel (Financial Times, The Economist)
// e reserva de Yahoo Finance, WSJ, Business Insider e BBC (que às vezes recusam a função).
// Usa curl, que esses sites aceitam, e grava data/news.json; o app junta com as manchetes de /api/news.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { parseRss, mergeItems } from "../assets/news.js";
import { translateItems } from "../assets/translate.js";

const FEEDS = [
  { source: "Financial Times", region: "int", url: "https://www.ft.com/markets?format=rss" },
  { source: "Financial Times", region: "int", url: "https://www.ft.com/rss/home" },
  { source: "Financial Times", region: "int", url: "https://www.ft.com/global-economy?format=rss" },
  { source: "The Economist", region: "int", url: "https://www.economist.com/finance-and-economics/rss.xml" },
  { source: "The Economist", region: "int", url: "https://www.economist.com/business/rss.xml" },
  { source: "Yahoo Finance", region: "int", url: "https://feeds.finance.yahoo.com/rss/2.0/headline?s=%5EGSPC,%5EDJI,%5EIXIC&region=US&lang=en-US" },
  { source: "Wall Street Journal", region: "int", url: "https://feeds.content.dowjones.io/public/rss/RSSMarketsMain" },
  { source: "Business Insider", region: "int", url: "https://markets.businessinsider.com/rss/news" },
  { source: "BBC Business", region: "int", url: "https://feeds.bbci.co.uk/news/business/rss.xml" },
]; // prettier-ignore

const lists = [];
const errors = [];
for (const f of FEEDS) {
  try {
    const xml = execFileSync("curl", ["-s", "-L", "-m", "20", "-A", "Mozilla/5.0 (compatible; PenduloNews/1.0)", f.url], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 }); // prettier-ignore
    const items = parseRss(xml, f);
    if (!items.length) throw new Error("vazio");
    lists.push(items);
  } catch (e) {
    errors.push(`${f.source}: ${e.message.split("\n")[0]}`);
  }
}
const items = await translateItems(mergeItems(lists).slice(0, 160), { timeout: 15000 });
writeFileSync(
  new URL("../data/news.json", import.meta.url),
  JSON.stringify({ updated_at: new Date().toISOString(), items, errors }),
);
console.log(
  `OK notícias: ${items.length} manchetes${errors.length ? ` · erros: ${errors.join("; ")}` : ""}`,
);
