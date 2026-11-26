import { describe, expect, it } from "vitest";
import {
  applyRemote,
  localBundle,
  mergeBundles,
  stampChanges,
  tracked,
} from "../assets/settings-sync.js";

const J = JSON.stringify;

describe("edições na nuvem", () => {
  it("acompanha só as chaves de edição", () => {
    expect(tracked("pendulo.prefs")).toBe(true);
    expect(tracked("dashLayout")).toBe(true);
    expect(tracked("pendulo.cloud.session")).toBe(false);
    expect(tracked("pendulo.news.seen")).toBe(false);
  });
  it("carimba campo a campo e ignora aba aberta e zoom", () => {
    const st = stampChanges(
      "pendulo.prefs",
      J({ tab: "home", tabOrder: {} }),
      J({ tab: "risk", tabOrder: { wallet: ["phist"] } }),
      {},
      10,
    );
    expect(st).toEqual({ "pendulo.prefs|tabOrder": 10 });
    expect(stampChanges("pendulo.ui", J({ zoom: 1 }), J({ zoom: 1.25 }), {}, 10)).toEqual({});
    expect(stampChanges("dashLayout", null, J({ order: ["a"] }), {}, 7)).toEqual({ dashLayout: 7 });
    expect(stampChanges("dashLayout", J({ a: 1 }), J({ a: 1 }), {}, 7)).toEqual({});
  });
  it("mescla: a edição mais nova vence por chave; empate fica com a nuvem", () => {
    const local = { a: { v: 1, at: 5 }, b: { v: 2, at: 9 }, c: { v: 3, at: 0 } };
    const remote = { a: { v: 10, at: 8 }, b: { v: 20, at: 4 }, d: { v: 4, at: 2 } };
    const { merged, pull, push } = mergeBundles(local, remote);
    expect(merged).toEqual({ a: { v: 10, at: 8 }, b: { v: 2, at: 9 }, c: { v: 3, at: 0 }, d: { v: 4, at: 2 } }); // prettier-ignore
    expect(pull.sort()).toEqual(["a", "d"]);
    expect(push).toBe(true);
    expect(mergeBundles({ x: { v: 1, at: 0 } }, { x: { v: 2, at: 0 } }).pull).toEqual(["x"]);
    expect(mergeBundles({ x: { v: 1, at: 3 } }, { x: { v: 1, at: 3 } })).toMatchObject({ pull: [], push: false }); // prettier-ignore
  });
  it("pacote local e aplicação da nuvem preservam o que é do aparelho", () => {
    const mem = {
      "pendulo.prefs": J({ tab: "home", calMin: "high", old: 1 }),
      "pendulo.ui": J({ theme: "paper", zoom: 1.5 }),
      dashLayout: J({ order: ["x"] }),
    };
    const get = (k) => mem[k] ?? null;
    const b = localBundle(get, { "pendulo.prefs|calMin": 4 });
    expect(b["pendulo.prefs|tab"]).toBeUndefined();
    expect(b["pendulo.ui|zoom"]).toBeUndefined();
    expect(b["pendulo.prefs|calMin"]).toEqual({ v: "high", at: 4 });
    const remote = {
      "pendulo.prefs|calMin": { v: "low", at: 9 },
      "pendulo.prefs|old": { v: null, at: 9 },
      "pendulo.ui|theme": { v: "ember", at: 9 },
      dashLayout: { v: null, at: 9 },
    };
    const touched = applyRemote(Object.keys(remote), remote, {
      get,
      set: (k, v) => (mem[k] = v),
      del: (k) => delete mem[k],
    });
    expect(touched.sort()).toEqual(["dashLayout", "pendulo.prefs", "pendulo.ui"]);
    expect(JSON.parse(mem["pendulo.prefs"])).toEqual({ tab: "home", calMin: "low" });
    expect(JSON.parse(mem["pendulo.ui"])).toEqual({ theme: "ember", zoom: 1.5 });
    expect(mem.dashLayout).toBeUndefined();
  });
});
