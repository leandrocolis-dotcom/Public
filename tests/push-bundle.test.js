// A Edge Function `push` calcula os avisos com o api/push-alerts.js empacotado (push.bundle.js). Se alguém mudar
// uma regra de aviso sem rodar `npm run build:push`, o robô de 1 min seguiria com a regra velha: este teste trava.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bundlePush, OUT } from "../scripts/build-push.mjs";
import { callHandler, localGet, routeOf, TTL } from "../scripts/lib/push-local.mjs";

describe("push: pacote do cálculo dos avisos", () => {
  it("está atualizado (rode `npm run build:push` e reimplante a função)", async () => {
    expect(readFileSync(OUT, "utf8")).toBe(await bundlePush());
  });

  it("não depende de Node nem da Vercel", () => {
    const code = readFileSync(OUT, "utf8").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/node:(fs|path)/);
    expect(code.replace(/<define:process\.env>/g, "")).not.toMatch(/\bprocess\.(cwd|env)\b/);
  });

  it("a função carrega o pacote do site e só usa /api/push-alerts como reserva", () => {
    const src = readFileSync(OUT.replace("push.bundle.js", "index.ts"), "utf8");
    expect(src).toMatch(/\/supabase\/functions\/push\/push\.bundle\.js/);
    expect(src.match(/\/api\/push-alerts/g)).toHaveLength(2); // comentário + reserva no catch
    expect(src).toMatch(/catch \(e\) \{\s*const r = await fetch\(`\$\{APP\}\/api\/push-alerts`/);
  });
});

describe("push: get local (sem Vercel)", () => {
  it("rota de cada caminho", () => {
    expect(routeOf("api/quotes?only=1&extra=SPY")).toBe("quotes");
    expect(routeOf("api/intraday?leaders=1")).toBe("leaders");
    expect(routeOf("api/intraday?symbols=SPY&win=short")).toBe("intraday");
    expect(routeOf("api/news")).toBeNull();
    expect(routeOf("data/flow.json")).toBeNull();
  });

  it("handler na memória: JSON com 200, null com erro", async () => {
    const ok = (req, res) => res.status(200).json({ url: req.url });
    const bad = (req, res) => res.status(500).json({ error: "x" });
    expect(await callHandler(ok, "api/x?a=1")).toEqual({ url: "/api/x?a=1" });
    expect(await callHandler(bad, "api/x")).toBeNull();
    expect(
      await callHandler(() => {
        throw new Error("boom");
      }, "api/x"),
    ).toBeNull();
  });

  it("data/ vem do estático, com cache; vazio não fica guardado", async () => {
    let t = 0;
    let n = 0;
    const get = localGet({ getStatic: async (p) => (n++, p === "data/a.json" ? { a: 1 } : null), now: () => t }); // prettier-ignore
    expect(await get("data/a.json")).toEqual({ a: 1 });
    await get("data/a.json");
    expect(n).toBe(1);
    t += TTL.data + 1;
    await get("data/a.json");
    expect(n).toBe(2);
    expect(await get("data/b.json")).toBeNull();
    await new Promise((r) => setTimeout(r, 0));
    await get("data/b.json");
    expect(n).toBe(4);
    expect(await get("http://fora/x")).toBeNull();
  });
});
