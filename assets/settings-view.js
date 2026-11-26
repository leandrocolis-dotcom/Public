// Configurações: tudo o que é ajuste do app fica aqui, em sub-abas. As outras telas só mostram e analisam.
import { NOTIF_KINDS, notifOn } from "./notif-prefs.js";
import { esc } from "./format.js";
import { cloudBox, importBoxHtml } from "./portfolio-view.js";

export const SUBS = [
  ["conta", "Conta e sincronia"],
  ["carteira", "Carteira"],
  ["aparencia", "Aparência"],
  ["dados", "Atualização e dados"],
  ["avisos", "Avisos"],
];

const INTERVALS = [
  ["auto", "Tempo real"],
  [0, "Desligado"],
];

const row = (title, desc, control) =>
  `<div class="set-row"><div><b>${title}</b>${desc ? `<small>${desc}</small>` : ""}</div><div class="set-ctl">${control}</div></div>`;

function conta(ctx) {
  return `<section class="card"><h2>Conta e sincronia</h2>${cloudBox(ctx.cloud)}</section>`;
}

function carteira(ctx) {
  const pf = ctx.portfolio;
  const status = pf
    ? `<p class="set-status">${pf.holdings.length} posições · importada em ${esc(ctx.importedAt ?? "–")} · ${ctx.cloud?.user ? "☁ salva na nuvem" : "só neste aparelho"}</p>`
    : `<p class="set-status">Nenhuma carteira importada.</p>`;
  return `<section class="card"><h2>${pf ? "Atualizar carteira" : "Importar carteira"} do Investing</h2>${status}${importBoxHtml(ctx)}</section>`;
}

function aparencia(ctx) {
  return `<section class="card set-appearance">${ctx.appearanceHtml}</section>`;
}

function dados(ctx) {
  const sel = `<select id="autoReload" aria-label="Atualizar a cada">${INTERVALS.map(([v, l]) => `<option value="${v}" ${String(ctx.autoReload) === String(v) ? "selected" : ""}>${l}</option>`).join("")}</select>`;
  return `<section class="card"><h2>Atualização e dados</h2>
    ${row("Cotações", "Tempo real: o servidor empurra o preço para a tela a cada ~15 s no pregão, no pré e no pós-mercado, e a cada 1 min à noite (futuros, para o modo Off); parado nos fins de semana. Se o canal cair, o app busca sozinho a cada 2 min (pregão) ou 5 min (pré/pós) até ele voltar. Com notificações ativas, continua vigiando com o app minimizado (o botão Recarregar sempre funciona).", sel)}
    ${row(
      "Gráfico do ativo",
      "Pro: velas do TradingView (Lightweight Charts) com zoom, arrasto, cruz com OHLC, volume e níveis no eixo; duplo clique volta ao zoom padrão. Clássico: o gráfico anterior.",
      `<span class="seg" role="group">${[
        ["on", "Pro"],
        ["off", "Clássico"],
      ]
        .map(
          ([v, l]) =>
            `<button data-setpref="proChart" data-val="${v}" aria-pressed="${(ctx.proChart ?? "on") === v}">${l}</button>`,
        )
        .join("")}</span>`,
    )}
    ${row(
      "Pêndulo flutuante",
      "Pílula sobre todas as abas com a nota do regime (−100 a +100), a faixa e quanto andou na última hora. Arraste para mover; toque abre a Início; o × esconde.",
      `<span class="seg" role="group">${[
        ["on", "Mostrar"],
        ["off", "Esconder"],
      ]
        .map(
          ([v, l]) =>
            `<button data-setpref="pendFloat" data-val="${v}" aria-pressed="${(ctx.pendFloat ?? "on") === v}">${l}</button>`,
        )
        .join("")}</span>`,
    )}
    ${row(
      "Separador decimal",
      "Como os números aparecem em todas as telas. Ponto é o padrão (1,234.56); vírgula fica no formato brasileiro (1.234,56). Campos de digitação aceitam os dois.",
      `<span class="seg" role="group">${[
        [".", "Ponto · 1,234.56"],
        [",", "Vírgula · 1.234,56"],
      ]
        .map(
          ([v, l]) =>
            `<button data-setpref="numSep" data-val="${v}" aria-pressed="${(ctx.numSep ?? ".") === v}">${l}</button>`,
        )
        .join("")}</span>`,
    )}
    ${row("Atualização manual de preços", "Digite preços quando a fonte gratuita atrasar (vale até o próximo fechamento).", `<button class="btn" data-action="open-manual">Abrir</button>`)}
    ${row("Atualizar versão do site", `Baixa a versão mais recente ignorando o cache${ctx.version ? ` · versão no ar: ${esc(ctx.version)}` : ""}.`, `<button class="btn" data-action="hard-refresh">Atualizar</button>`)}
    ${row("Instalar o app", "Ícone na tela inicial do iPhone, Android ou Mac, com janela própria.", `<button class="btn" data-action="install">Instalar</button>`)}
    ${row("Verificação dos dados", "Confere preços com uma segunda fonte e refaz os cálculos.", `<button class="btn" data-tab="checks">Abrir</button>`)}
  </section>`;
}

function avisos(ctx) {
  const perm = ctx.notifPerm;
  const notif =
    perm === "granted"
      ? `<span class="tag buy">Ativas</span>`
      : perm === "denied"
        ? `<span class="tag sell">Bloqueadas</span>`
        : perm === "unsupported"
          ? `<span class="tag neutral">Não suportadas</span>`
          : `<button class="btn primary" data-action="notify-enable">Ativar</button>`;
  const seg = (key, cur, opts) =>
    `<span class="seg" role="group">${opts.map(([v, l]) => `<button data-setpref="${key}" data-val="${v}" aria-pressed="${cur === v}">${l}</button>`).join("")}</span>`;
  const PUSH = {
    on: [`<span class="tag buy">Ativo</span> <button class="btn ghost" data-action="push-off">Desligar</button>`, "Este aparelho recebe os avisos mesmo com o app fechado. No iPhone, o Apple Watch espelha o aviso quando o iPhone está bloqueado."],
    off: [`<button class="btn primary" data-action="push-on">Ativar</button>`, "Receba sinais e notícias da carteira no celular e no Apple Watch, com o app fechado."],
    denied: [`<span class="tag sell">Bloqueado</span>`, "Libere as notificações deste site nas configurações do aparelho e volte aqui."],
    "needs-install": [`<button class="btn" data-action="install">Instalar</button>`, "No iPhone: Compartilhar → Adicionar à Tela de Início, abra pelo ícone e ative aqui (iOS 16.4 ou mais novo)."],
    "not-configured": [`<span class="tag neutral">Pendente</span>`, "Servidor de avisos fora do ar agora. Tente de novo em instantes."],
    unsupported: [`<span class="tag neutral">Não suportado</span>`, "Este navegador não suporta push."],
  }[ctx.pushState ?? "unsupported"] ?? ["", ""]; // prettier-ignore
  return `<section class="card"><h2>Avisos</h2>
    ${row("Avisos com o app fechado (push)", PUSH[1], PUSH[0])}
    ${row("Notificações do sistema", perm === "denied" ? "Liberar nas configurações do navegador/iPhone para este site." : "Aparecem fora da tela: no PC, mesmo com o app minimizado ou em outra aba (ele continua vigiando a carteira). Para avisos com o app fechado, use o push acima.", notif)}
    ${row(
      "Silenciar no fim de semana",
      "Sábado e domingo (horário de Nova York) a bolsa dos EUA está fechada: nenhuma notificação toca (do sistema ou push). Os avisos ficam no histórico do sino, e as notícias do período estão em Notícias › 🗓 Resumo do fds.",
      `<button class="switch" role="switch" aria-checked="${ctx.notifPrefs?.weekendQuiet === true}" aria-label="Silenciar no fim de semana" data-quiet="1"><span></span></button>`,
    )}
    <h3 class="set-sub">O que notificar</h3>
    ${NOTIF_KINDS.map(([k, label, desc]) => {
      const on = notifOn(ctx.notifPrefs, k);
      const extra =
        k === "news" && on
          ? ` ${seg("newsAlerts", ctx.newsAlerts ?? "all", [
              ["all", "Todas"],
              ["direct", "Só citando o ativo"],
            ])}`
          : "";
      return row(
        label,
        desc,
        `${extra}<button class="switch" role="switch" aria-checked="${on}" aria-label="${esc(label)}" data-notif="${k}"><span></span></button>`,
      );
    }).join("")}
    <p class="note">Cada aviso aparece uma vez. No iPhone, notificações exigem o app instalado na tela inicial (iOS 16.4+).</p></section>`;
}

const RENDER = { conta, carteira, aparencia, dados, avisos };

/** ctx: { sub, cloud, portfolio, importedAt, pfText, pfParsed, appearanceHtml, autoReload, version, notifPerm, newsAlerts, sigAlerts } */
export function viewSettings(ctx) {
  const sub = RENDER[ctx.sub] ? ctx.sub : "conta";
  const tabs = SUBS.map(
    ([id, l]) =>
      `<button class="set-tab" data-set="${id}" aria-selected="${id === sub}">${esc(l)}</button>`,
  ).join("");
  return `<nav class="set-tabs" role="tablist" aria-label="Configurações">${tabs}</nav>${RENDER[sub](ctx)}`;
}
