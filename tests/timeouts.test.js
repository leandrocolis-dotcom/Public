import { createServer } from "node:http";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { httpFetch, deadlineIn, timeLeft } from "../api/_http.js";
import { fetchJSON } from "../assets/net.js";

let srv;
let base;
beforeAll(async () => {
  srv = createServer((req, res) => {
    if (req.url === "/slow") return void setTimeout(() => res.end("tarde"), 3000);
    res.end("ok");
  }).listen(0);
  await new Promise((r) => srv.once("listening", r));
  base = `http://127.0.0.1:${srv.address().port}`;
});
afterAll(() => srv.close());

describe("prazo das funções (evita 504)", () => {
  it("sem tempo restante, nem tenta", async () => {
    await expect(httpFetch(`${base}/`, { deadline: Date.now() + 100 })).rejects.toThrow(
      "sem tempo",
    );
  });
  it("o prazo encurta o tempo limite do pedido", async () => {
    const t0 = Date.now();
    await expect(
      httpFetch(`${base}/slow`, { timeout: 10000, deadline: deadlineIn(1200) }, (r) => r.text()),
    ).rejects.toThrow();
    expect(Date.now() - t0).toBeLessThan(2000);
  });
  it("timeLeft sem prazo é infinito", () => {
    expect(timeLeft(null)).toBe(Infinity);
    expect(timeLeft(Date.now() + 5000)).toBeGreaterThan(4000);
  });
});

describe("fetchJSON: nova tentativa em 502/503/504", () => {
  it("tenta de novo e devolve o corpo da segunda resposta", async () => {
    const resp = (status, body) => ({ ok: status < 400, status, json: async () => body });
    const f = vi
      .fn()
      .mockResolvedValueOnce(resp(504, null))
      .mockResolvedValueOnce(resp(200, { a: 1 }));
    vi.stubGlobal("fetch", f);
    expect(await fetchJSON("api/x", { wait: 1 })).toEqual({ a: 1 });
    expect(f).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });
  it("504 repetido vira erro legível; 404 não repete", async () => {
    const resp = (status) => ({ ok: false, status, json: async () => null });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(resp(504)));
    await expect(fetchJSON("api/x", { wait: 1 })).rejects.toThrow("504");
    const f404 = vi.fn().mockResolvedValue(resp(404));
    vi.stubGlobal("fetch", f404);
    await expect(fetchJSON("api/x", { wait: 1 })).rejects.toThrow("HTTP 404");
    expect(f404).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});
