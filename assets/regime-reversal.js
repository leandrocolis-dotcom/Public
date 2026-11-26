// Radar de virada do regime (puro, sem DOM): detecta quando o pêndulo do mercado (nota −100 a +100) começa a virar
// depois de um movimento e quando essa virada se consolida. Feito para operação curta e alavancada, em que a
// virada rápida do pré-mercado, do pós-mercado e da noite (futuros) importa tanto quanto a do pregão.
//
// Trilha: a nota a cada 5 min nas últimas 3 h pela MESMA conta do pêndulo (regimeAt, barras de 5 min + preço ao
// vivo), com o fechamento de referência FIXO no de agora (sem salto artificial às 16h), mais o preço do SPY em
// cada ponto (barra própria com pré/pós; parada, o ES=F aplicado sobre ela).
//
// Matemática, por ponto da trilha:
//  • ruído σ = desvio absoluto mediano das variações de 5 min × 1,4826 (piso de 1 ponto): todos os limites andam
//    com o ruído do momento, então o pré/pós (fino e nervoso) pede movimento maior que o pregão calmo;
//  • média rápida (EMA de 3 barras ≈ 15 min) e lenta (EMA de 12 barras ≈ 60 min) da nota;
//  • velocidade = inclinação de mínimos quadrados dos últimos 30 min (pontos/h) e sua estatística t;
//  • perna anterior = zigue-zague na média rápida (pivô a cada recuo ≥ max(5, 2σ)): do pivô anterior ao extremo
//    mais recente no sentido contrário ao de agora; devolução = quanto o nível de agora (meio a meio entre a nota e a média rápida) já voltou desse
//    extremo (em pontos e em % da perna).
// Força da virada (0–100) = 25 × devolução % + 20 × |t|/4 + 15 × cruzamento das médias (em 2σ) + 15 × persistência
// (variações no sentido novo, das últimas 6) + 15 × blocos juntos (EUA, mundo, câmbio/commodities) + 10 × preço
// do SPY desde o extremo (cheio em 0,4%).
// Estágios:
//  • ⚠ tendência de mudança: perna ≥ max(10, 4σ); devolução ≥ max(5, 2σ) e ≥ 25%; velocidade contra a perna com
//    |t| ≥ 2; extremo nas últimas 2 h; força ≥ 40;
//  • ‼ mudança confirmada: tudo isso + força ≥ 70, devolução ≥ 50%, média rápida cruzou a lenta, ≥ 4 de 6
//    variações no sentido novo e ≥ 2 de 3 blocos virados;
//  • arranque (nota vinha de lado, sem perna ≥ max(10, 4σ)): mesmas regras, mas a devolução vira pontos
//    andados desde o ponto de partida: tendência ≥ max(8, 3σ), confirmada ≥ max(15, 5σ) (força usa essa fração);
//  • ↩ não confirmou: houve tendência ou confirmação nos últimos 45 min e a nota passou do extremo antigo
//    (o movimento original retomou).
// Leitura em modo sombra (sem estudo fora da amostra ainda); material educacional, não é recomendação.
import { decSep } from "./format.js";
import { lastLE, priceAt, regimeAt, usRefDate, withLiveBars } from "./regime-history.js";
import { nyClock, usSession, futuresOpen } from "./sessions.js";
import { zoneOf } from "./regime-zones.js";

export const REV = {
  STEP: 300,
  SPAN: 3 * 3600,
  FAST: 3,
  SLOW: 12,
  VEL_N: 6,
  SWING_MIN: 10,
  SWING_SIG: 4,
  RET_MIN: 5,
  RET_SIG: 2,
  RET_WATCH: 0.25,
  RET_CONF: 0.5,
  IMP_WATCH: 8,
  IMP_SIG_W: 3,
  IMP_CONF: 15,
  IMP_SIG_C: 5,
  BURST_FRESH: 3600,
  T_WATCH: 2,
  FRESH: 2 * 3600,
  WATCH: 40,
  CONF: 70,
  PERSIST_CONF: 4,
  PRICE_FULL: 0.004,
  FAIL_LOOK: 9,
};

const clip = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));

/** Média móvel exponencial de n barras. */
export function ema(xs, n) {
  const a = 2 / (n + 1);
  let e = xs[0];
  return xs.map((x, i) => (e = i ? e + a * (x - e) : x));
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Ruído típico de uma variação de 5 min: MAD das variações × 1,4826 (robusto a saltos), piso de 1 ponto. */
export function noiseSigma(xs) {
  const d = xs.slice(1).map((x, i) => x - xs[i]);
  if (d.length < 3) return 1;
  const m = median(d);
  return Math.max(1, 1.4826 * median(d.map((x) => Math.abs(x - m))));
}

/** Inclinação de mínimos quadrados (por hora) e estatística t. ts em segundos. */
export function trendSlope(ts, ys) {
  const n = ys.length;
  if (n < 3) return { perH: 0, t: 0 };
  const x = ts.map((t) => (t - ts[0]) / 3600);
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (x[i] - mx) ** 2;
    sxy += (x[i] - mx) * (ys[i] - my);
  }
  if (!sxx) return { perH: 0, t: 0 };
  const b = sxy / sxx;
  let sse = 0;
  for (let i = 0; i < n; i++) sse += (ys[i] - my - b * (x[i] - mx)) ** 2;
  const se = Math.sqrt(sse / (n - 2) / sxx);
  return { perH: b, t: se > 0 ? b / se : b ? Math.sign(b) * 9 : 0 };
}

/** Sessão de NY em t (ms): rótulo curto para o aviso. */
export function sessionWord(ms) {
  const s = usSession(ms);
  if (s === "pre") return "pré-mercado";
  if (s === "post") return "pós-mercado";
  if (s === "open") return "pregão";
  return futuresOpen(ms) ? "noite (futuros)" : "mercado fechado";
}

/**
 * Pivôs do zigue-zague em xs com recuo mínimo h. Devolve o extremo da perna contrária a dir mais recente (iE) e o
 * pivô anterior a ele (iB, começo daquela perna).
 */
export function legPivots(xs, dir, h) {
  const piv = [];
  let c = 0;
  let d = 0;
  let iMax = 0;
  let iMin = 0;
  for (let i = 1; i < xs.length; i++) {
    if (d === 0) {
      if (xs[i] > xs[iMax]) iMax = i;
      if (xs[i] < xs[iMin]) iMin = i;
      if (xs[iMax] - xs[iMin] >= h) {
        d = iMax > iMin ? 1 : -1;
        piv.push(d > 0 ? iMin : iMax);
        c = d > 0 ? iMax : iMin;
      }
      continue;
    }
    if (d * (xs[i] - xs[c]) > 0) c = i;
    else if (d * (xs[c] - xs[i]) >= h) {
      piv.push(c);
      d = -d;
      c = i;
    }
  }
  if (d === 0) return { iE: dir > 0 ? iMin : iMax, iB: 0 };
  // perna em curso no sentido de agora (o recuo já passou de h): o extremo é o último pivô; senão, o candidato
  if (d === dir) return { iE: piv.at(-1), iB: piv.length > 1 ? piv.at(-2) : 0 };
  return { iE: c, iB: piv.at(-1) };
}

/** Começo da arrancada: volta de i enquanto a média rápida anda no sentido dir (o ponto de partida do movimento). */
export function runStart(xs, i, dir) {
  let j = i;
  while (j > 0 && dir * (xs[j] - xs[j - 1]) > 0) j--;
  return j;
}

/**
 * Leitura do radar no último ponto de pts = [{ t, score, blocks, px }] (passo de 5 min, mais antigo primeiro).
 * Devolve { stage: "none" | "watch" | "confirmed", dir, strength, checks, ... } ou null sem pontos suficientes.
 */
export function reversalAt(pts, o = REV) {
  const n = pts?.length ?? 0;
  if (n < o.SLOW) return null;
  const L = n - 1;
  const s = pts.map((p) => p.score);
  const ts = pts.map((p) => p.t);
  const f = ema(s, o.FAST);
  const sl = ema(s, o.SLOW);
  const sigma = noiseSigma(s);
  const k = Math.min(o.VEL_N, L);
  const vel = trendSlope(ts.slice(L - k), s.slice(L - k));
  const dir = Math.sign(vel.perH) || Math.sign(f[L] - f[L - 1]);
  const base = { t: ts[L], score: s[L], fast: f[L], slow: sl[L], level: (s[L] + f[L]) / 2, sigma, vel: vel.perH, tstat: vel.t }; // prettier-ignore
  if (!dir) return { ...base, stage: "none", dir: 0, strength: 0, checks: [] };
  // extremo da perna anterior por zigue-zague na média rápida (pivô = recuo ≥ H = max(5, 2σ)): o topo se cai
  // agora, o fundo se sobe; a perna vai do pivô anterior até ele. Não depende de onde a janela começa.
  const leg = legPivots(f, dir, Math.max(o.RET_MIN, o.RET_SIG * sigma));
  const swing0 = -dir * (f[leg.iE] - f[leg.iB]);
  const swingOk = swing0 >= Math.max(o.SWING_MIN, o.SWING_SIG * sigma);
  // sem perna anterior relevante (nota de lado): arranque, medido do começo da arrancada da média rápida
  const iE = swingOk ? leg.iE : runStart(f, L, dir);
  const iB = swingOk ? leg.iB : iE;
  const from = Math.max(0, lastLE(ts, ts[L] - o.FRESH));
  const ext = f[iE];
  const swing = swingOk ? swing0 : Math.max(0, swing0);
  // nível de agora = meio a meio entre a nota crua e a média rápida: responde à virada rápida sem seguir um ponto só
  const level = (s[L] + f[L]) / 2;
  const retrace = dir * (level - ext);
  const retPct = swingOk && swing > 0 ? retrace / swing : 0;
  let persist = 0;
  for (let i = Math.max(1, L - 5); i <= L; i++) if (Math.sign(s[i] - s[i - 1]) === dir) persist++;
  const cross = dir * (f[L] - sl[L]);
  const bNow = pts[L].blocks ?? {};
  const bExt = pts[iE].blocks ?? {};
  const ids = Object.keys(bNow).filter(
    (id) => Number.isFinite(bNow[id]) && Number.isFinite(bExt[id]),
  );
  const blocksOn = ids.filter((id) => dir * (bNow[id] - bExt[id]) > 0).length;
  const px0 = pts[iE].px;
  const px1 = pts[L].px;
  const pxRet = px0 > 0 && px1 > 0 ? px1 / px0 - 1 : null;
  const velOk = Math.sign(vel.perH) === dir && Math.abs(vel.t) >= o.T_WATCH;
  // arranque: pontos andados contra o ruído
  const needW = Math.max(o.IMP_WATCH, o.IMP_SIG_W * sigma);
  const needC = Math.max(o.IMP_CONF, o.IMP_SIG_C * sigma);
  const retOk = swingOk
    ? retrace >= Math.max(o.RET_MIN, o.RET_SIG * sigma) && retPct >= o.RET_WATCH
    : retrace >= needW;
  const retConf = swingOk ? retPct >= o.RET_CONF : retrace >= needC;
  const prog = swingOk ? retPct : retrace / needC;
  const strength = Math.round(
    25 * clip(prog) +
      20 * (Math.sign(vel.perH) === dir ? clip(Math.abs(vel.t) / 4) : 0) +
      15 * clip(cross / (2 * sigma)) +
      15 * clip(persist / 6) +
      15 * (ids.length ? blocksOn / ids.length : 0) +
      10 * (pxRet == null ? 0 : clip((dir * pxRet) / o.PRICE_FULL)),
  );
  const checks = [
    swingOk
      ? { id: "swing", ok: true, label: `Virada: perna anterior de ${Math.round(swing)} pontos (mín. ${Math.round(Math.max(o.SWING_MIN, o.SWING_SIG * sigma))})` } // prettier-ignore
      : { id: "swing", ok: true, label: `Arranque: a nota vinha de lado até ${hm(ts[iE])}; mede-se o quanto andou desde então` }, // prettier-ignore
    swingOk
      ? { id: "ret", ok: retOk && retConf, half: retOk, label: `Devolveu ${Math.round(retrace)} pontos (${Math.round(retPct * 100)}% da perna; tendência ≥ 25%, confirma ≥ 50%)` } // prettier-ignore
      : { id: "ret", ok: retOk && retConf, half: retOk, label: `Andou ${Math.round(retrace)} pontos desde o ponto de partida (tendência ≥ ${Math.round(needW)}, confirma ≥ ${Math.round(needC)})` }, // prettier-ignore
    { id: "vel", ok: velOk, label: `Velocidade ${vel.perH > 0 ? "+" : vel.perH < 0 ? "−" : ""}${Math.abs(Math.round(vel.perH))} pts/h nos últimos 30 min (t = ${Math.abs(vel.t).toFixed(1)}; mín. 2)` }, // prettier-ignore
    {
      id: "cross",
      ok: cross > 0,
      label: `Média de 15 min ${cross > 0 ? "cruzou" : "ainda não cruzou"} a de 60 min`,
    },
    { id: "persist", ok: persist >= o.PERSIST_CONF, label: `${persist} de 6 variações de 5 min no sentido novo (confirma ≥ ${o.PERSIST_CONF})` }, // prettier-ignore
    ...(ids.length ? [{ id: "blocks", ok: blocksOn >= Math.min(2, ids.length), label: `${blocksOn} de ${ids.length} blocos virando junto (EUA, mundo, câmbio/commod.)` }] : []), // prettier-ignore
    ...(pxRet == null ? [] : [{ id: "price", ok: dir * pxRet > 0.0015, label: `SPY ${pxRet >= 0 ? "+" : "−"}${Math.abs(pxRet * 100).toFixed(2).replace(".", decSep())}% desde o extremo` }]), // prettier-ignore
  ];
  // arranque só vale se começou há ≤ 1 h, não na borda da janela, e saiu de uma faixa estreita (30 min de lado)
  const pre = s.slice(Math.max(0, iE - 6), iE + 1);
  const flatBefore = iE >= 6 && iE >= from && Math.max(...pre) - Math.min(...pre) <= needW;
  const fresh =
    iE < L &&
    ts[L] - ts[iE] <= o.FRESH &&
    (swingOk || (flatBefore && ts[L] - ts[iE] <= o.BURST_FRESH));
  const watch = retOk && velOk && fresh && strength >= o.WATCH;
  const confirmed =
    watch &&
    strength >= o.CONF &&
    retConf &&
    cross > 0 &&
    persist >= o.PERSIST_CONF &&
    (!ids.length || blocksOn >= Math.min(2, ids.length));
  return {
    ...base,
    stage: confirmed ? "confirmed" : watch ? "watch" : "none",
    kind: swingOk ? "turn" : "burst",
    dir,
    strength,
    swing,
    retrace,
    retPct,
    ext,
    extScore: s[iE],
    tExt: ts[iE],
    baseScore: s[iB],
    tBase: ts[iB],
    persist,
    cross,
    blocksOn,
    blocksN: ids.length,
    pxRet,
    checks,
  };
}

/**
 * Radar com memória curta: a leitura de agora, quando a tendência/confirmação começou e se uma virada recente
 * falhou (o movimento antigo passou do extremo de novo). Sem estado guardado: refaz os últimos 45 min.
 */
export function reversalTrack(pts, o = REV) {
  const now = reversalAt(pts, o);
  if (!now) return null;
  const hist = [];
  for (let j = Math.max(o.SLOW, pts.length - o.FAIL_LOOK); j < pts.length; j++) hist.push(reversalAt(pts.slice(0, j + 1), o)); // prettier-ignore
  // virada recente (tendência ou confirmada) cuja nota já passou do extremo daquela perna: não confirmou
  let failed = null;
  for (let i = hist.length - 2; i >= 0; i--) {
    const r = hist[i];
    if (!r || r.stage === "none" || (now.stage !== "none" && r.dir === now.dir)) continue;
    if (r.dir * (now.level - r.ext) < 0) failed = r;
    break;
  }
  if (now.stage === "none")
    return failed ? { ...now, stage: "failed", dir: failed.dir, failed, since: failed.t } : now;
  const same = (r) => r && r.stage !== "none" && r.dir === now.dir && r.tExt === now.tExt;
  let since = now.t;
  let confSince = now.stage === "confirmed" ? now.t : null;
  for (let i = hist.length - 1; i >= 0 && same(hist[i]); i--) {
    since = hist[i].t;
    if (hist[i].stage === "confirmed") confSince = hist[i].t;
  }
  return { ...now, since, confSince, failed };
}

/** Trilha da nota a cada STEP s nas últimas SPAN s, com a referência fixa na de agora e o preço do SPY. */
export function reversalTrail({ daily, series, nowSec, o = REV }) {
  if (!daily?.dates?.length || !series) return [];
  const refIdx = lastLE(daily.dates, usRefDate(nowSec));
  if (refIdx < 30) return [];
  const pts = [];
  const add = (t) => {
    const p = regimeAt(t, daily, series, refIdx);
    if (p) pts.push({ ...p, px: priceAt("SPY", t, series)?.p ?? null });
  };
  const first = series.SPY?.t?.[0] ?? nowSec - o.SPAN;
  for (let t = Math.ceil(Math.max(nowSec - o.SPAN, first) / o.STEP) * o.STEP; t < nowSec - 60; t += o.STEP) add(t); // prettier-ignore
  add(nowSec);
  return pts;
}

/** Radar completo a partir das barras de 5 min (completadas com o preço ao vivo) e dos fechamentos diários. */
export function regimeReversal({
  daily,
  series,
  quotes = null,
  nowSec = Date.now() / 1000,
  o = REV,
}) {
  if (!series) return null;
  const ser = quotes ? withLiveBars(series, quotes) : series;
  const pts = reversalTrail({ daily, series: ser, nowSec, o });
  const tr = reversalTrack(pts, o);
  return tr ? { ...tr, pts, session: sessionWord(nowSec * 1000) } : null;
}

const sgn = (x) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(Math.round(x))}`;
const HM = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }); // prettier-ignore
export const hm = (sec) => HM.format(new Date(sec * 1000));

/** Textos do radar (para a tela e para o aviso). */
export function reversalText(r) {
  if (!r) return null;
  const up = r.dir > 0;
  const burst = r.kind === "burst";
  const noun = burst ? "Mudança rápida" : "Virada";
  const where = up ? "para cima (rumo ao risco)" : "para baixo (rumo à defesa)";
  const leg = burst
    ? `O pêndulo vinha de lado em ${sgn(r.extScore)} até ${hm(r.tExt)} e já andou ${Math.round(r.retrace)} pontos ${up ? "para cima" : "para baixo"}, ${up ? "subindo" : "caindo"} ${Math.abs(Math.round(r.vel))} pts/h.` // prettier-ignore
    : `O pêndulo ${up ? "caiu" : "subiu"} de ${sgn(r.baseScore)} a ${sgn(r.extScore)} até ${hm(r.tExt)} e já devolveu ${Math.round(r.retrace)} pontos (${Math.round(r.retPct * 100)}% da perna), ${up ? "subindo" : "caindo"} ${Math.abs(Math.round(r.vel))} pts/h.`; // prettier-ignore
  const px = r.pxRet == null ? "" : ` SPY ${r.pxRet >= 0 ? "+" : "−"}${Math.abs(r.pxRet * 100).toFixed(2).replace(".", decSep())}% desde ${hm(r.tExt)}.`; // prettier-ignore
  const zNow = zoneOf(r.score);
  // virada no sentido oposto que acabou de falhar (passou do extremo): vem antes, é o contexto do aviso novo
  const undo =
    r.stage !== "failed" && r.failed
      ? `↩ A virada ${r.failed.dir > 0 ? "para cima" : "para baixo"} de ${hm(r.failed.tExt)} não confirmou. `
      : "";
  if (r.stage === "confirmed")
    return {
      tone: up ? "up" : "dn",
      badge: `‼ ${noun} ${up ? "para cima" : "para baixo"} confirmada`,
      title: `${noun} ${where} CONFIRMADA · ${r.session}`,
      body: `${undo}${leg}${px} Força ${r.strength}/100, médias cruzadas e ${r.blocksOn} de ${r.blocksN} blocos juntos; nota ${sgn(r.score)} (${zNow.label}). ${up ? "Revisar: zerar ou cobrir posições vendidas/inversas e avaliar entrada tática a favor do risco." : "Revisar: proteger ou vender compras alavancadas, apertar stops e reduzir tamanho."}`, // prettier-ignore
      act: up
        ? "Hora de agir a favor do risco (ou sair do vendido)."
        : "Hora de proteger: reduzir ou vender o comprado alavancado.",
    };
  if (r.stage === "watch")
    return {
      tone: "warn",
      badge: `⚠ Tendência de ${burst ? "mudança rápida" : "virada"} ${up ? "para cima" : "para baixo"}`,
      title: `Possível ${noun.toLowerCase()} ${where} · ${r.session}`,
      body: `${undo}${leg}${px} Força ${r.strength}/100: ainda NÃO confirmada (confirma com ${burst ? "o movimento maior" : "≥ 50% devolvido"}, médias cruzadas e blocos juntos). Preparar: stops, tamanho e o plano de saída.`, // prettier-ignore
      act: "Preparar: stop, tamanho e plano de saída. Ainda não confirmou.",
    };
  if (r.stage === "failed") {
    const d = r.failed.dir > 0;
    return {
      tone: "mid",
      badge: "↩ Virada não confirmou",
      title: `Virada ${d ? "para cima" : "para baixo"} não confirmou · ${r.session}`,
      body: `O pêndulo voltou a ${d ? "cair" : "subir"} e passou do extremo de ${hm(r.failed.tExt)} (nota ${sgn(r.score)}): o movimento anterior retomou. Sinal de virada cancelado.`, // prettier-ignore
      act: "Sinal cancelado: o movimento anterior retomou.",
    };
  }
  return { tone: "mid", badge: "Sem virada à vista", title: "", body: "", act: "" };
}

/**
 * Avisos do radar { key, title, body, tag, url, kind }. Um por estágio e perna (extremo arredondado a 45 min),
 * por dia de NY. O título vem sem o marcador de tema (quem envia põe "🔄 VIRADA DO REGIME").
 */
export function reversalAlerts(r, { nowSec = Date.now() / 1000 } = {}) {
  if (!r || r.stage === "none") return [];
  const day = nyClock(nowSec * 1000).date;
  const tx = reversalText(r);
  const leg = r.stage === "failed" ? r.failed : r;
  const id = `${day}:${leg.dir > 0 ? "up" : "dn"}:${Math.floor(leg.tExt / 2700)}`;
  const kind = r.stage === "confirmed" ? "c" : r.stage === "watch" ? "w" : "f";
  return [
    {
      kind: `rev-${r.stage}`,
      key: `rev:${kind}:${id}`,
      title: tx.title,
      body: tx.body,
      tag: `rev-${id}`,
      url: "./?tab=home",
    },
  ];
}
