import { describe, expect, it } from "vitest";
import { btgButton } from "../assets/btg.js";
import { BTG_SLOW_MSG, CLOUD_LIMIT_MS } from "../assets/btg-sync.js";

describe("botão Atualizar BTG: espera visível e curta", () => {
  it("mostra há quanto tempo espera a leitura na nuvem", () => {
    const t0 = Date.UTC(2026, 10, 24, 23, 13, 0);
    expect(btgButton({ busy: true, startedAt: t0 }, t0 + 83_000)).toContain(
      "Lendo o BTG na nuvem… 1:23",
    );
    expect(btgButton({ busy: false })).toContain(">Atualizar BTG<");
  });
  it("desiste em 4 min e diz onde está a causa provável", () => {
    expect(CLOUD_LIMIT_MS).toBe(4 * 60000);
    expect(BTG_SLOW_MSG).toContain("conector BTG");
  });
});
