import { describe, it, expect, vi, afterEach } from "vitest";
import webpush from "web-push";
import { vapidKeys } from "../scripts/lib/push-send.mjs";

afterEach(() => vi.unstubAllGlobals());

describe("push no servidor", () => {
  it("gera e guarda o par VAPID no primeiro uso; depois só lê", async () => {
    let row = null;
    const calls = [];
    vi.stubGlobal("fetch", async (url, opt = {}) => {
      calls.push(opt.method ?? "GET");
      if (opt.method === "POST") {
        const b = JSON.parse(opt.body)[0];
        row ??= { public_key: b.public_key, private_key: b.private_key };
        return new Response(null, { status: 201 });
      }
      return new Response(JSON.stringify(row ? [row] : []), { status: 200 });
    });
    const k1 = await vapidKeys("svc", webpush);
    expect(k1.publicKey).toMatch(/^[A-Za-z0-9_-]{80,}$/);
    expect(calls).toEqual(["GET", "POST", "GET"]);
    const k2 = await vapidKeys("svc", webpush);
    expect(k2).toEqual(k1);
    expect(calls.slice(3)).toEqual(["GET"]);
  });
});

describe("telemetria", () => {
  it("monta a linha e ignora ruído", async () => {
    const { errorRow } = await import("../assets/telemetry.js");
    expect(errorRow(new Error("x is undefined"), { tab: "news" })).toMatchObject({ message: "x is undefined", tab: "news" });
    expect(errorRow("ResizeObserver loop limit exceeded")).toBeNull();
    expect(errorRow("")).toBeNull();
    expect(errorRow("a".repeat(900)).message.length).toBe(500);
  }); // prettier-ignore
});
