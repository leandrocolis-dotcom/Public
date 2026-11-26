import { createServer } from "node:http";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { httpFetch, BROWSER_UA } from "../api/_http.js";

let srv;
let base;
beforeAll(async () => {
  srv = createServer((req, res) => {
    if (req.url === "/ua") return res.end(req.headers["user-agent"]);
    if (req.url === "/hdr") return res.end(String(req.headers["x-teste"]));
    if (req.url === "/slow-headers") return void setTimeout(() => res.end("tarde"), 400);
    if (req.url === "/slow-body") {
      res.write("começo");
      return void setTimeout(() => res.end("fim"), 400);
    }
    res.statusCode = req.url === "/404" ? 404 : 200;
    res.end("ok");
  }).listen(0);
  await new Promise((r) => srv.once("listening", r));
  base = `http://127.0.0.1:${srv.address().port}`;
});
afterAll(() => srv.close());

describe("httpFetch", () => {
  it("usa o User-Agent de navegador por padrão e aceita outro", async () => {
    expect(await httpFetch(`${base}/ua`, {}, (r) => r.text())).toBe(BROWSER_UA);
    expect(await httpFetch(`${base}/ua`, { ua: "Teste/1" }, (r) => r.text())).toBe("Teste/1");
  });
  it("repassa headers extras", async () => {
    expect(await httpFetch(`${base}/hdr`, { headers: { "X-Teste": "abc" } }, (r) => r.text())).toBe(
      "abc",
    );
  });
  it("sem `read` devolve a resposta; com `read`, o resultado dele", async () => {
    const r = await httpFetch(`${base}/404`);
    expect(r.status).toBe(404);
    expect(await httpFetch(`${base}/x`, {}, async (x) => (await x.text()).toUpperCase())).toBe(
      "OK",
    );
  });
  it("interrompe quando os cabeçalhos demoram", async () => {
    await expect(httpFetch(`${base}/slow-headers`, { timeout: 100 })).rejects.toThrow();
  });
  it("interrompe quando o CORPO demora (o `read` roda dentro do tempo limite)", async () => {
    await expect(
      httpFetch(`${base}/slow-body`, { timeout: 100 }, (r) => r.text()),
    ).rejects.toThrow();
  });
});
