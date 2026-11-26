import { describe, it, expect } from "vitest";
import { viewSettings, SUBS } from "../assets/settings-view.js";

const base = {
  cloud: {},
  portfolio: null,
  appearanceHtml: "<h2>Aparência</h2>",
  autoReload: 5,
  notifPerm: "default",
  newsAlerts: "all",
  sigAlerts: "on",
};
describe("Configurações", () => {
  it("todas as sub-abas renderizam com o conteúdo certo", () => {
    const want = {
      conta: "data-cloud-form",
      carteira: 'id="pfText"',
      aparencia: "Aparência",
      dados: 'id="autoReload"',
      avisos: 'data-setpref="newsAlerts"',
    };
    for (const [id] of SUBS) expect(viewSettings({ ...base, sub: id })).toContain(want[id]);
  });
  it("conectado: sincronização automática, sem botão de sincronizar", () => {
    const h = viewSettings({
      ...base,
      sub: "conta",
      cloud: { user: { email: "a@b.c" }, syncedAt: "10:00" },
    });
    expect(h).toContain("Sincronização automática ativa");
    expect(h).not.toContain("cloud-sync");
    expect(h).toContain('data-action="cloud-out"');
  });
  it("tempo real ou desligado e sub-aba inválida cai em Conta", () => {
    expect(viewSettings({ ...base, sub: "dados", autoReload: 0 })).toContain('value="0" selected');
    expect(viewSettings({ ...base, sub: "dados", autoReload: "auto" })).toContain(
      'value="auto" selected',
    );
    expect(viewSettings({ ...base, sub: "xyz" })).toContain(
      'data-set="conta" aria-selected="true"',
    );
  });
});
