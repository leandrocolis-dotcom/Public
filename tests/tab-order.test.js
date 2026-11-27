import { describe, expect, it } from "vitest";
import { orderTabs, subNavHtml } from "../assets/ui.js";
import { GROUPS, TABS, TAB_INFO } from "../assets/state.js";

describe("ordem das sub-abas", () => {
  it("segue a ordem salva e põe abas novas no fim", () => {
    expect(orderTabs(["a", "b", "c", "d"], ["c", "a"])).toEqual(["c", "a", "b", "d"]);
    expect(orderTabs(["a", "b"], undefined)).toEqual(["a", "b"]);
    expect(orderTabs(["a", "b"], ["x", "b"])).toEqual(["b", "a"]);
  });
  it("Carteira tem Histórico e respeita a ordem arrastada", () => {
    const html = subNavHtml(GROUPS, TABS, TAB_INFO, "portfolio", {
      tabOrder: { wallet: ["phist", "rebal", "portfolio"] },
    });
    expect(html).toContain('data-order-key="wallet"');
    const ids = [...html.matchAll(/class="subtab"[^>]*data-tab="(\w+)"/g)].map((m) => m[1]);
    expect(ids).toEqual([
      "phist",
      "rebal",
      "portfolio",
      "pairdesk",
      "pfperf",
      "journal",
      "risk",
      "rfix",
    ]);
  });
});
