import { describe, it, expect } from "vitest";
import { NOTIF_KINDS, notifOn, setNotif, anyNotifOn, pushKinds } from "../assets/notif-prefs.js";

describe("preferências de notificação por tipo", () => {
  it("começa tudo ligado e herda o antigo 'Sinais desligado'", () => {
    for (const [k] of NOTIF_KINDS) expect(notifOn({}, k)).toBe(true);
    expect(notifOn({ sigAlerts: "off" }, "pairs")).toBe(false);
    expect(notifOn({ sigAlerts: "off" }, "news")).toBe(true);
  });
  it("liga e desliga cada tipo sem afetar os outros", () => {
    let p = setNotif({}, "pairs", false);
    expect(notifOn(p, "pairs")).toBe(false);
    expect(notifOn(p, "portfolio")).toBe(true);
    p = setNotif(p, "pairs", true);
    expect(notifOn(p, "pairs")).toBe(true);
  });
  it("notícias: desligar e religar volta ao modo anterior", () => {
    let p = setNotif({ newsAlerts: "direct" }, "news", false);
    expect(p.newsAlerts).toBe("off");
    p = setNotif(p, "news", true);
    expect(p.newsAlerts).toBe("direct");
  });
  it("tudo desligado e prefs do push", () => {
    let p = {};
    for (const [k] of NOTIF_KINDS) p = setNotif(p, k, false);
    expect(anyNotifOn(p)).toBe(false);
    expect(pushKinds(setNotif({}, "regime", false))).toMatchObject({ regime: false, levels: true });
  });
});
