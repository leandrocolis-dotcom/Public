// Candidatos a liderança (Fluxo › Rotação relativa, janela Hoje, todos os grupos). Arquivo com "_" não vira rota
// (o plano Hobby da Vercel aceita só 12 funções): é servido por api/intraday.js como GET /api/intraday?leaders=1[&ext=1|0] -> { at, ext, session, regime, candidates: [...] }
// ext = pré/pós entram (switch Off market); sem o parâmetro segue o relógio (pregão = On; pré, pós e fechado = Off).
// Cache de 2 min na borda: o app (lista abaixo do gráfico) e o push (api/push-alerts) dividem a mesma varredura.
import { fetchBatch, MAX_BATCH } from "./intraday.js";
import { fetchAll } from "./quotes.js";
import { deadlineIn, timeLeft } from "./_http.js";
import { FLOW_ASSETS, FLOW_GROUPS } from "../assets/flow-universe.js";
import { rotationIntraday, intradaySymbols, livePoint } from "../assets/rot-intraday.js";
import { quadrantOf } from "../assets/flow-engine.js";
import {
  preCandidates,
  rateCandidates,
  namesToQuote,
  dayChange,
  STALE,
} from "../assets/leaders.js";
import { regime } from "../assets/dash.js";
import { usSession } from "../assets/refresh.js";
import { nyDate } from "../assets/live.js";

export const ROT_GROUPS = FLOW_GROUPS.filter((g) => !g.noRotation);
const PER_GROUP = 3; // no máximo 3 pré-candidatos por grupo (os de maior pontuação)

/** Fechamentos do fluxo com o preço de agora no fim (substitui o pregão de hoje ou acrescenta). */
export function closeWithLive(flow, quotes, ext) {
  const out = {};
  const last = flow?.dates?.at(-1);
  for (const [sym, s] of Object.entries(flow?.close ?? {})) {
    const lp = livePoint(quotes?.[sym], ext);
    if (!lp || !s?.length) {
      out[sym] = s;
      continue;
    }
    const d = nyDate(lp.t);
    out[sym] = d === last ? [...s.slice(0, -1), lp.p] : d > last ? [...s, lp.p] : s;
  }
  return out;
}

/** Varredura completa (exportada para teste e reuso). get(path) busca arquivos publicados (data/flow.json). */
export async function scanLeaders({ ext, get, deadline = deadlineIn(25000) }) {
  const members = (g) => FLOW_ASSETS.filter((a) => a.group === g.id);
  const syms = [...new Set(ROT_GROUPS.flatMap((g) => intradaySymbols(g, members(g))))];
  const lots = [];
  for (let i = 0; i < syms.length; i += MAX_BATCH) lots.push(syms.slice(i, i + MAX_BATCH));
  const [flow, uq] = await Promise.all([
    get("data/flow.json").catch(() => null),
    fetchAll(undefined, [], { deadline: deadlineIn(9000) }).catch(() => null),
  ]);
  const quotes = { ...(uq?.quotes ?? {}) };
  // barras de 5 min (com pré/pós) em lotes, 2 por vez (o Yahoo responde 429 em rajada)
  const series = {};
  for (let i = 0; i < lots.length && timeLeft(deadline) > 6000; i += 2) {
    const got = await Promise.all(lots.slice(i, i + 2).map((l) => fetchBatch(l, "short").catch(() => null))); // prettier-ignore
    for (const b of got) Object.assign(series, b?.series ?? {});
  }
  const data = { series };
  const rots = ROT_GROUPS.map((g) => [g, rotationIntraday(data, g, members(g), "today", quotes, quadrantOf, { ext, sessions: true })]); // prettier-ignore
  // referência de "agora": a cabeça mais nova da varredura (depois do fechamento, o fim do pregão)
  const refT = Math.max(0, ...rots.flatMap(([, r]) => r.map((x) => x.tail.at(-1).t ?? 0)));
  const pre = rots.flatMap(([g, r]) => preCandidates(r, g.id, quadrantOf, { minT: refT - STALE }).slice(0, PER_GROUP)); // prettier-ignore
  // nomes puros dos pré-candidatos que ainda não vieram com o universo
  const need = namesToQuote(pre).filter((s) => !quotes[s]);
  if (need.length && timeLeft(deadline) > 3000) {
    const nq = await fetchAll([], need.slice(0, 120), { deadline: deadlineIn(Math.min(8000, timeLeft(deadline) - 1000)) }).catch(() => null); // prettier-ignore
    Object.assign(quotes, nq?.quotes ?? {});
  }
  const rg = flow?.close ? regime(closeWithLive(flow, quotes, ext), 1) : null;
  const benchChg = Object.fromEntries(
    ROT_GROUPS.filter((g) => g.bench).map((g) => [g.id, dayChange(quotes[g.bench], ext) ?? 0]),
  );
  const label = Object.fromEntries(FLOW_GROUPS.map((g) => [g.id, g.label]));
  const candidates = rateCandidates(pre, { quotes, regime: rg, benchChg, groupOf: (id) => label[id], ext }); // prettier-ignore
  return {
    regime: rg ? { verdict: rg.verdict, on: rg.on, n: rg.n, level: rg.strength?.level ?? null, intensity: rg.strength?.intensity ?? null } : null, // prettier-ignore
    candidates,
    scanned: Object.keys(series).length,
    asked: syms.length,
  };
}

export default async function handler(req, res) {
  const params = new URL(req.url, "http://x").searchParams;
  const session = usSession();
  const ext = params.has("ext") ? params.get("ext") === "1" : session !== "open";
  const local = /^(localhost|127\.0\.0\.1)(:|$)/.test(req.headers.host ?? "");
  const origin = `${local ? "http" : "https"}://${req.headers.host}`;
  const get = (p) => fetch(`${origin}/${p}`, { signal: AbortSignal.timeout(8000) }).then((r) => (r.ok ? r.json() : null)); // prettier-ignore
  try {
    const out = await scanLeaders({ ext, get });
    const ok = out.scanned > 0;
    res.setHeader("Cache-Control", ok ? "public, s-maxage=120, stale-while-revalidate=240" : "no-store"); // prettier-ignore
    res.status(ok ? 200 : 502).json({ at: new Date().toISOString(), ext, session, ...out });
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    res.status(500).json({ error: String(e?.message ?? e) });
  }
}
