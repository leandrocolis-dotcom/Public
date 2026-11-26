import { describe, it, expect } from "vitest";
import { releaseNotice } from "../scripts/lib/release-notice.mjs";

describe("releaseNotice", () => {
  it("feat vira Novidade, sem o prefixo convencional", () => {
    const n = releaseNotice("feat(fluxo): velocidade do fluxo\n\ncorpo");
    expect(n.notify).toBe(true);
    expect(n.body).toBe("Novidade: Velocidade do fluxo");
  });
  it("fix vira Correção", () => {
    expect(releaseNotice("fix(busca): lupa no iPhone").body).toBe("Correção: Lupa no iPhone");
  });
  it("commits de dados, docs e robôs não notificam", () => {
    for (const msg of [
      "chore(mercado): varredura diária do universo [skip ci]",
      "docs: roadmap",
      "test: casos",
      "ci: workflow",
    ])
      expect(releaseNotice(msg).notify).toBe(false);
  });
  it("respeita [skip push]", () => {
    expect(releaseNotice("feat: algo [skip push]").notify).toBe(false);
  });
  it("mensagem livre ou vazia ainda avisa", () => {
    expect(releaseNotice("Ajustes gerais").body).toBe("Novidade: Ajustes gerais");
    expect(releaseNotice("").body).toMatch(/versão nova/);
  });
  it("corta textos longos e tira o número do PR", () => {
    const n = releaseNotice("feat: " + "a".repeat(300));
    expect(n.body.length).toBeLessThanOrEqual(140);
    expect(releaseNotice("feat: nova aba (#42)").body).toBe("Novidade: Nova aba");
  });
});

describe("api/verify?version", () => {
  it("expõe o commit do deploy", async () => {
    const { liveVersion } = await import("../api/verify.js");
    expect(
      liveVersion({
        VERCEL_GIT_COMMIT_SHA: "abc",
        VERCEL_GIT_COMMIT_MESSAGE: "feat: x",
        VERCEL_ENV: "production",
      }),
    ).toEqual({ sha: "abc", message: "feat: x", env: "production" });
  });
});
