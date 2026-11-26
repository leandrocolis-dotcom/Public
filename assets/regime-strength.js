// Intensidade do regime (puro): além do tipo (Risk-on, Risk-off, Misto, Estresse), uma nota de −100 a +100 e uma
// escala de 5 níveis para dizer se o vento a favor é forte o bastante para entrar ou se vale esperar.
//
// Quatro partes, cada uma de −1 a +1, sobre as mesmas razões de risco do regime:
//  • Amplitude: quantas razões sobem no horizonte. Contínua (20/11/2026): cada razão vale tanh(2·z), quase o
//    sinal (±1) a partir de 1 desvio e suave perto de zero, para a nota andar junto com o mercado no dia.
//  • Força: variação de cada razão no horizonte em desvios-padrão da própria razão (tanh(z ÷ 2), sem trava).
//  • Tendência (direcionais): razão acima da MM20, acima da MM50, MM20 acima da MM50 e MM20 subindo; cada
//    parte pela distância em desvios diários (tanh), não só pelo sinal.
//  • Volatilidade: VIX baixo e curva do VIX normal somam; VIX alto ou curva invertida tiram (só EUA), suave.
// Material educacional; não é recomendação de investimento.

export const STRENGTH_W = { breadth: 0.3, force: 0.25, trend: 0.3, vol: 0.15 };
/**
 * Pesos do pêndulo ao vivo (h = 1, 23/11/2026): ele é o termômetro do humor do mercado AGORA, com o dado mais
 * novo de cada fonte (pregão, pré, pós, futuros, bolsas de fora, VIX). Sem médias de 20/50 pregões: o longo
 * prazo fica no pano de fundo da Início (MM200 + crédito, backdrop.js). O histórico de 250 pregões entra só para
 * medir o tamanho normal de um dia de cada razão (desvio), não como direção.
 */
export const STRENGTH_W_LIVE = { breadth: 0.4, force: 0.4, trend: 0, vol: 0.2 };

/** Escala de intensidade (0 a 100, no sentido do regime). */
export const STRENGTH_LEVELS = [
  { min: 80, label: "Muito forte" },
  { min: 60, label: "Forte" },
  { min: 40, label: "Moderada" },
  { min: 20, label: "Fraca" },
  { min: 0, label: "Muito fraca" },
];

const clamp = (x, a = -1, b = 1) => Math.max(a, Math.min(b, x));
const fin = (x) => Number.isFinite(x);

/** Amplitude contínua de uma razão: tanh(2·z) (≈ ±1 a partir de 1 desvio); sem desvio, o sinal da variação. */
export const breadthOf = (c, sd) => (sd ? Math.tanh((2 * c) / sd) : c > 0 ? 1 : c < 0 ? -1 : 0);
/** Força de uma razão: tanh(z ÷ 2), sem trava em 2 desvios (3σ ainda anda além de 2σ). */
export const forceOf = (c, sd) => (sd ? Math.tanh(c / sd / 2) : null);

function mean(xs, ws = null) {
  let sum = 0;
  let wsum = 0;
  xs.forEach((x, i) => {
    const w = ws ? ws[i] : 1;
    if (fin(x) && fin(w) && w > 0) {
      sum += w * x;
      wsum += w;
    }
  });
  return wsum ? sum / wsum : null;
}

/** Desvio-padrão das variações de h pregões da série (janela de até n pontos). */
export function sdChange(s, h, n = 250) {
  if (!s) return null;
  const t = s.slice(-n - h);
  const r = [];
  for (let i = h; i < t.length; i++)
    if (fin(t[i]) && fin(t[i - h]) && t[i - h] !== 0) r.push(t[i] / t[i - h] - 1);
  if (r.length < 20) return null;
  const m = r.reduce((a, b) => a + b, 0) / r.length;
  return Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1)) || null;
}

function ma(s, n, end = s.length) {
  if (end < n) return null;
  let sum = 0;
  for (let i = end - n; i < end; i++) {
    if (!fin(s[i])) return null;
    sum += s[i];
  }
  return sum / n;
}

/**
 * Direcionais de uma razão: −1 (tudo para baixo) a +1 (tudo para cima). Cada parte pela distância relativa em
 * desvios diários da razão (tanh), para o preço do momento mexer na leitura ao longo do dia; sem desvio, o sinal.
 */
export function trendOf(s) {
  if (!s || s.length < 55) return null;
  const last = s.at(-1);
  const m20 = ma(s, 20);
  const m50 = ma(s, 50);
  const m20ago = ma(s, 20, s.length - 5);
  if (![last, m20, m50, m20ago].every(fin)) return null;
  const sd = sdChange(s, 1);
  const sg = (x, y) => {
    const d = y ? x / y - 1 : 0;
    return sd ? Math.tanh(d / sd) : d > 0 ? 1 : d < 0 ? -1 : 0;
  };
  // inclinação da MM20 em 5 pregões: anda ~1/4 do preço; escala de 0,5 desvio para pesar parecido
  const slope = sd ? Math.tanh((m20 / m20ago - 1) / (0.5 * sd)) : sg(m20, m20ago);
  return (sg(last, m20) + sg(last, m50) + sg(m20, m50) + slope) / 4;
}

/**
 * Volatilidade (EUA): VIX e VIX ÷ VIX 3m; com move (z da variação do VIX desde o último fechamento), o rumo do
 * VIX AGORA pesa metade: VIX alto e caindo forte é humor melhorando, não "nota no mínimo" (o nível satura acima
 * de ~30). Suave (tanh): VIX 30 ou 35 não ficam travados no mesmo −1.
 */
export function volScore(vix, term, move = null, bondVol = null) {
  const parts = [];
  const ws = [];
  if (fin(vix)) {
    parts.push(Math.tanh((20 - vix) / 8)); // 12 → +0,76; 20 → 0; 28 → −0,76; 36 → −0,96
    ws.push(1);
  }
  if (fin(term)) {
    parts.push(Math.tanh((0.95 - term) / 0.1)); // 0,85 → +0,76; 1,05 → −0,76
    ws.push(1);
  }
  if (fin(move)) {
    parts.push(Math.tanh(-move)); // VIX −1σ → +0,76
    ws.push(2);
  }
  if (fin(bondVol) && bondVol > 0) {
    parts.push(Math.tanh((90 - bondVol) / 25)); // MOVE 70 → +0,66; 90 → 0; 110 → −0,66 (vol de Treasuries)
    ws.push(1);
  }
  return mean(parts, ws);
}

/** Nível da escala para uma intensidade de 0 a 100. */
export const levelOf = (x) => STRENGTH_LEVELS.find((l) => x >= l.min) ?? STRENGTH_LEVELS.at(-1);

/** Direção do tipo de regime: +1 Risk-on, −1 Risk-off/Estresse, 0 Misto. */
export const verdictDir = (verdict) =>
  /^Risk-on/i.test(verdict) ? 1 : /^Risk-off|Estresse/i.test(verdict) ? -1 : 0;

function hintFor(dir, lvl) {
  if (dir > 0) {
    if (lvl.min >= 60) return "momentum amplo e confirmado: entrada a favor do regime";
    if (lvl.min >= 40) return "a favor, sem folga: entrar em parte e com stop";
    return "apetite ainda tímido: esperar momentum mais forte";
  }
  if (dir < 0) {
    if (lvl.min >= 60) return "aversão forte: proteger e não abrir compra";
    if (lvl.min >= 40) return "pressão vendedora firme: reduzir ou esperar";
    return "pressão leve: esperar definição antes de entrar";
  }
  return "sem direção clara: esperar";
}

/**
 * Intensidade do regime.
 * items: [{ s (série da razão), c (variação no horizonte) }]; h: horizonte em pregões; verdict: tipo do regime.
 * Devolve score (−100 a +100: positivo = apetite a risco), intensity (0 a 100 no sentido do regime),
 * level (rótulo da escala), hint (o que fazer) e as partes.
 */
export function regimeStrength(
  items,
  h,
  {
    verdict = "Misto",
    vix = null,
    term = null,
    vixMove = null,
    bondVol = null,
    weights = STRENGTH_W,
    sdScale = 1,
  } = {},
) {
  const list = (items ?? []).filter((x) => fin(x.c));
  if (!list.length) return null;
  // peso por razão (x.w, opcional): no Offshore cada bloco (EUA, mundo, câmbio/commodities) pesa igual
  const ws = list.map((x) => (fin(x.w) ? x.w : 1));
  // sdScale: janelas de horas (pêndulo 1h/3h/5h) usam o desvio de um dia × √(horas ÷ 6,5)
  const sds = list.map((x) => {
    const sd = sdChange(x.s, h);
    return sd ? sd * sdScale : sd;
  });
  const breadth = mean(
    list.map((x, i) => breadthOf(x.c, sds[i])),
    ws,
  );
  const force = mean(
    list.map((x, i) => forceOf(x.c, sds[i])),
    ws,
  );
  const trend = mean(
    list.map((x) => trendOf(x.s)),
    ws,
  );
  const vol = volScore(vix, term, vixMove, bondVol);
  const parts = { breadth, force, trend, vol };
  // abertura por módulo (x.mod, opcional): amplitude e força de cada módulo e o peso dele nas razões; com os pesos
  // da nota, as parcelas dos módulos + tendência + vol somam a nota (home-view.js, "Como a nota se forma")
  const wTot = ws.reduce((t, w) => t + w, 0);
  const mods = {};
  for (const id of new Set(list.map((x) => x.mod).filter(Boolean))) {
    const idx = list.map((x, i) => (x.mod === id ? i : -1)).filter((i) => i >= 0);
    const mw = idx.map((i) => ws[i]);
    mods[id] = {
      w: mw.reduce((t, w) => t + w, 0) / wTot,
      breadth: mean(
        idx.map((i) => breadthOf(list[i].c, sds[i])),
        mw,
      ),
      force: mean(
        idx.map((i) => forceOf(list[i].c, sds[i])),
        mw,
      ),
    };
  }
  let sum = 0;
  let wsum = 0;
  for (const [k, w] of Object.entries(weights)) {
    if (fin(parts[k])) {
      sum += w * parts[k];
      wsum += w;
    }
  }
  // raw: nota sem arredondar (a agulha do pêndulo anda com ela); score: a inteira das faixas e dos avisos
  const raw = (100 * sum) / wsum;
  const score = Math.round(raw);
  const dir = verdictDir(verdict);
  // Misto: a intensidade mede a inclinação (para que lado o mercado pende)
  const lean = dir === 0 ? Math.sign(score) : dir;
  const intensity = clamp(score * (lean || 1), 0, 100);
  const level = levelOf(intensity);
  // tipo e nota em sentidos opostos (ex.: alta de um dia contra a tendência): intensidade conta como fraca
  const against = dir !== 0 && Math.sign(score) === -dir;
  return {
    score,
    raw,
    intensity,
    level: level.label,
    min: level.min,
    hint: hintFor(dir, level),
    lean:
      dir === 0 ? (score > 0 ? "pende para risk-on" : score < 0 ? "pende para risk-off" : "") : "",
    against,
    parts,
    mods,
    weights,
  };
}

/** Texto curto da escala para a legenda. */
export const STRENGTH_NOTE =
  "Intensidade (0 a 100, no sentido do regime). Três módulos: Bolsas (EUA, Europa, Ásia) e Classes de ativos (risco × segurança) pesam igual no movimento (amplitude e força em desvios-padrão); VIX e vol (VIX, curva, rumo do VIX e MOVE) completa. No dia: Bolsas 40%, Classes 40%, VIX e vol 20%; em 5D/1M/3M entram também as médias de 20 e 50 pregões (30%). Escala: 0–19 muito fraca, 20–39 fraca, 40–59 moderada, 60–79 forte, 80+ muito forte.";
