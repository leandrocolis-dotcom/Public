// Edge Function quotes-feed v2 rodando de ponta a ponta com Supabase e Yahoo simulados (sem rede):
// 1ª rodada busca tudo e manda completo; rodadas seguintes só a camada quente e só o que mudou;
// foto + contadores no máximo 1 vez por minuto; force só com segredo.
import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { SYMBOLS } from "../api/quotes.js";

const SB = "https://sb.test";
let handler = null;
let dir = null;
const log = { yahoo: [], broadcasts: [], snaps: [], demand: [["XYZW"]] };
let price = 100;

function fakeFetch(url, init = {}) {
  const u = String(url);
  const ok = (body, status = 200) =>
    Promise.resolve(
      new Response(body == null ? null : JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    );
  if (u.startsWith("https://fc.yahoo.com"))
    return Promise.resolve(new Response("", { status: 404 }));
  if (u.includes("/v1/test/getcrumb")) return Promise.resolve(new Response("crumb123"));
  if (u.includes("/v7/finance/quote")) {
    const syms = decodeURIComponent(u.split("symbols=")[1].split("&")[0]).split(",");
    log.yahoo.push(syms);
    const t = 1_790_000_000 + price; // hora só anda quando o preço muda
    return ok({
      quoteResponse: {
        result: syms.map((symbol) => ({
          symbol,
          regularMarketPrice: symbol === "SPY" ? price : 50,
          regularMarketTime: symbol === "SPY" ? t : 1_790_000_000,
          regularMarketPreviousClose: 49,
          marketState: "REGULAR",
          fiftyTwoWeekHigh: 60,
        })),
      },
    });
  }
  if (u.startsWith(`${SB}/rest/v1/pendulo_quotes?id=eq.1&select=`))
    return ok([{ claimed_at: "1970-01-01T00:00:00Z", stats: {} }]);
  if (u.startsWith(`${SB}/rest/v1/pendulo_quotes?id=eq.1&claimed_at=`)) return ok([{ id: 1 }]);
  if (u.startsWith(`${SB}/rest/v1/pendulo_portfolio`)) return ok([{ holdings: [{ sym: "ABCD" }] }]);
  if (u.startsWith(`${SB}/rest/v1/pendulo_demand`)) return ok(log.demand.map((syms) => ({ syms })));
  if (u === `${SB}/rest/v1/pendulo_quotes?id=eq.1` && init.method === "PATCH") {
    log.snaps.push(JSON.parse(init.body));
    return Promise.resolve(new Response(null, { status: 204 }));
  }
  if (u === `${SB}/realtime/v1/api/broadcast`) {
    log.broadcasts.push(JSON.parse(init.body).messages[0].payload);
    return Promise.resolve(new Response("{}", { status: 202 }));
  }
  throw new Error(`fetch inesperado: ${u}`);
}

const call = async (q = "", headers = {}) =>
  (await handler(new Request(`https://fn.test/quotes-feed${q}`, { headers }))).json();

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "qf-"));
  const out = join(dir, "fn.mjs");
  await build({
    entryPoints: ["supabase/functions/quotes-feed/index.ts"],
    bundle: true,
    format: "esm",
    platform: "neutral",
    outfile: out,
    logLevel: "silent",
  });
  globalThis.Deno = {
    env: {
      get: (k) => ({ SUPABASE_SERVICE_ROLE_KEY: "k", SUPABASE_URL: SB, FEED_SECRET: "s3" })[k],
    },
    serve: (h) => (handler = h),
  };
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-07T15:00:00Z")); // quarta, 11:00 em NY: pregão
  await import(pathToFileURL(out).href);
});
afterAll(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete globalThis.Deno;
  rmSync(dir, { recursive: true, force: true });
});

describe("quotes-feed v2", () => {
  it("1ª rodada: busca o universo inteiro + carteiras + quentes e manda o pacote completo", async () => {
    const r = await call();
    expect(r).toMatchObject({
      ok: true,
      sent: true,
      tier: "full",
      kind: "full",
      seq: 1,
      saved: true,
    });
    expect(log.yahoo.flat()).toEqual(expect.arrayContaining(["SPY", "ABCD", "XYZW"]));
    expect(r.yahoo_calls).toBe(log.yahoo.length);
    const p = log.broadcasts.at(-1);
    expect(p.count).toBeGreaterThanOrEqual(SYMBOLS.length);
    expect(p.quotes.SPY.h52).toBeUndefined(); // canal enxuto
    const snap = log.snaps.at(-1);
    expect(snap.data.quotes.SPY.h52).toBe(60); // foto completa
    expect(snap.stats["2026-10-07"]).toMatchObject({ runs: 1, packets: 1 });
  });

  it("15 s depois: só a camada quente (1 consulta) e só o que mudou (SPY)", async () => {
    log.yahoo.length = 0;
    price = 101;
    vi.setSystemTime(new Date("2026-10-07T15:00:15Z"));
    const r = await call();
    expect(r).toMatchObject({ tier: "hot", kind: "delta", seq: 2, saved: false, yahoo_calls: 1 });
    expect(log.yahoo).toHaveLength(1);
    expect(Object.keys(log.broadcasts.at(-1).quotes)).toEqual(["SPY"]);
  });

  it("nada mudou: não transmite; 60 s depois: rodada morna, foto e contadores gravados", async () => {
    vi.setSystemTime(new Date("2026-10-07T15:00:30Z"));
    const r = await call();
    expect(r).toMatchObject({ tier: "hot", sent: false });
    log.yahoo.length = 0;
    price = 102;
    vi.setSystemTime(new Date("2026-10-07T15:01:00Z"));
    const w = await call();
    expect(w).toMatchObject({ tier: "warm", sent: true, saved: true });
    expect(w.yahoo_calls).toBeLessThanOrEqual(7);
    expect(log.snaps.at(-1).stats["2026-10-07"].runs).toBeGreaterThanOrEqual(3);
  });

  it("?force sem o segredo não fura o horário; com o segredo, busca", async () => {
    vi.setSystemTime(new Date("2026-10-10T16:00:00Z")); // sábado: nada negocia
    expect(await call("?force")).toMatchObject({ skipped: true, session: null });
    const r = await call("?force", { "x-feed-secret": "s3" });
    expect(r.ok).toBe(true);
    expect(r.skipped).not.toBe(true);
  });
});
