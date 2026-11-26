// Cron de fim de semana (GitHub Actions): guarda as manchetes do fechamento de sexta à abertura de segunda
// em data/news-weekend.json, para o botão "🗓 Resumo do fds" da aba News (os feeds RSS só devolvem as últimas N).
// Junta com o arquivo anterior do mesmo fim de semana; um fim de semana novo recomeça do zero.
import { readFileSync, writeFileSync } from "node:fs";
import { fetchNews } from "../api/news.js";
import { mergeItems } from "../assets/news.js";
import { inWindow, weekendWindow } from "../assets/weekend.js";

const path = new URL("../data/news-weekend.json", import.meta.url);
const now = Date.now() / 1000;
const win = weekendWindow(now);
let prev = null;
try {
  prev = JSON.parse(readFileSync(path, "utf8"));
} catch {
  /* primeiro fim de semana */
}
const old = prev?.key === win.key ? (prev.items ?? []) : [];
const fresh = await fetchNews([]).catch((e) => {
  console.log(`feeds indisponíveis: ${e.message}`);
  return { items: [], errors: [] };
});
// só EUA/internacional: o usuário não opera Brasil
const items = mergeItems([fresh.items.filter((x) => x.region !== "br"), old], now, 24 * 4)
  .filter((x) => inWindow(x, { ...win, to: Math.max(win.to, now) }))
  .slice(0, 500);
writeFileSync(
  path,
  JSON.stringify({
    updated_at: new Date().toISOString(),
    key: win.key,
    from: win.from,
    to: win.to,
    items,
  }),
);
console.log(`OK fim de semana ${win.key}: ${items.length} manchetes (${old.length} já guardadas)`);
