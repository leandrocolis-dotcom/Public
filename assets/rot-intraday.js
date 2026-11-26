// Rotação relativa por janela de tempo: intraday (barras de 5/30 min com pré e pós-mercado + preço ao vivo)
// e diária (fechamentos). Puro (sem DOM): o desenho fica em flow-view.js; as barras vêm de api/intraday?symbols=.
// Mesma leitura da rotação diária (inspirada em RRG): x = força relativa contra o benchmark, suavizada
// (100 × MME rápida ÷ MME lenta da razão ativo/benchmark); y = momento dessa força (x agora ÷ x de `lag` barras atrás).

/**
 * Completa a série com o preço ao vivo (puro; não muda a série recebida). series = { t, c, s? } (t em s);
 * live = { p, t } (t em s). Preço mais novo que a última barra (e a menos de 3 dias): na mesma barra de `barMin`
 * troca o fechamento dela; numa barra nova, acrescenta o ponto (com a sessão da última barra).
 */
export function completeLastBar(series, live, barMin) {
  const n = series?.t?.length ?? 0;
  if (!n || !(live?.p > 0)) return series;
  const lastT = series.t[n - 1];
  if (!(live.t > lastT) || live.t - lastT >= 3 * 86400) return series;
  const sec = barMin * 60;
  if (Math.floor(live.t / sec) === Math.floor(lastT / sec)) {
    const c = series.c.slice();
    c[n - 1] = live.p;
    return { ...series, c };
  }
  const out = { ...series, t: [...series.t, live.t], c: [...series.c, live.p] };
  if (series.s) out.s = [...series.s, series.s[n - 1]];
  return out;
}

/**
 * Janelas do seletor. intra: src = lote da API (short = barras de 5 min, long = 30 min; é a grade do cálculo);
 * every = minutos entre os pontos da cauda, alinhados ao relógio (ex.: Hoje = um ponto a cada meia hora,
 * :00 e :30). O último ponto é sempre o preço de agora (a meia hora em formação).
 */
export const ROT_WINDOWS = {
  "1h": { label: "1h", intra: true, src: "short", bar: 5, every: 5, min: 60 },
  "2h": { label: "2h", intra: true, src: "short", bar: 5, every: 10, min: 120 },
  today: { label: "Hoje", intra: true, src: "short", bar: 5, every: 30, days: 1 },
  "2d": { label: "2 dias", intra: true, src: "long", bar: 30, every: 60, days: 2 },
  "5d": { label: "5 dias", intra: true, src: "long", bar: 30, every: 120, days: 5 },
  "4w": { label: "4 sem", points: 5, step: 5 },
  "8w": { label: "8 sem", points: 8, step: 5 },
  "3m": { label: "3 meses", points: 13, step: 5 },
  "6m": { label: "6 meses", points: 14, step: 10 },
};
export const ROT_DEFAULT = "8w";
export const rotWindow = (k) => ROT_WINDOWS[k] ?? ROT_WINDOWS[ROT_DEFAULT];

const FAST = 5; // MME rápida (barras da grade)
const SLOW = 20; // MME lenta
const LAG = 5; // barras para o momento
const MIN_PTS = 4; // pontos mínimos na janela "Hoje" (abaixo disso, completa com o fim da sessão anterior)
const MIN_SHARE = 0.3; // ponto da grade só entra se ≥30% dos ativos negociaram nele (tira a madrugada dos ETFs)

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * Preço ao vivo mais recente da cotação. ext = incluir pré/pós (xp/xt) quando for posterior ao último negócio
 * regular. Usa o preço regular de verdade (regP/regT no modo Off), nunca o implícito pelo futuro: a rotação
 * só mistura negócios reais do próprio ativo.
 */
export function livePoint(q, ext = true) {
  if (!q) return null;
  const p = q.regP ?? q.p;
  const t = q.regT ?? q.t;
  if (ext && q.xp > 0 && q.xt > (t ?? 0)) return { p: q.xp, t: q.xt };
  return p > 0 && t > 0 ? { p, t } : null;
}

/** Minuto do dia no horário da bolsa (gmt = deslocamento em segundos). */
const sessionMin = (t, gmt = 0) => Math.floor(((((t + gmt) % 86400) + 86400) % 86400) / 60);

/**
 * Grade comum de horários (em segundos, início de cada barra de `bar` min) com o preço de cada ativo
 * (último da barra, repetido adiante quando não negociou; null antes do 1º negócio).
 * series: { SYM: { t, c, s?, g? } }; live: { SYM: {p,t} } (opcional) entra como último ponto.
 */
export function buildGrid(series, syms, bar, live = {}) {
  const sec = bar * 60;
  const per = {};
  const sess = new Map();
  const hits = new Map();
  for (const sym of syms) {
    if (!series[sym]?.t?.length) continue;
    // última barra completada pelo preço ao vivo (mesma regra da central de barras)
    const sr = completeLastBar(series[sym], live[sym], bar);
    const m = new Map();
    sr.t.forEach((t, i) => {
      const k = Math.floor(t / sec) * sec;
      m.set(k, sr.c[i]);
      if (sr.s && !sess.has(k)) sess.set(k, sr.s[i]);
    });
    for (const k of m.keys()) hits.set(k, (hits.get(k) ?? 0) + 1);
    per[sym] = m;
  }
  const n = Object.keys(per).length;
  if (!n) return { t: [], vals: {}, sess: [], gmt: 0 };
  const need = Math.max(1, Math.ceil(n * MIN_SHARE));
  const t = [...hits.entries()]
    .filter(([, c]) => c >= need)
    .map(([k]) => k)
    .sort((a, b) => a - b);
  const vals = {};
  for (const [sym, m] of Object.entries(per)) {
    let last = null;
    const ks = [...m.keys()].sort((a, b) => a - b);
    let j = 0;
    vals[sym] = t.map((k) => {
      // barras fora da grade (madrugada de um ativo 24 h) ainda atualizam o último preço conhecido
      while (j < ks.length && ks[j] <= k) last = m.get(ks[j++]);
      return last;
    });
  }
  const g = series[syms.find((s) => series[s]?.g != null)]?.g ?? 0;
  return { t, vals, sess: t.map((k) => sess.get(k) ?? "reg"), gmt: g };
}

function ema(xs, w) {
  const a = 2 / (w + 1);
  let e = null;
  return xs.map((x) => {
    if (x == null) return e;
    e = e == null ? x : e + a * (x - e);
    return e;
  });
}

/** Índice do 1º ponto da janela na grade. */
export function windowStart(t, win, gmt = 0) {
  if (!t.length) return 0;
  const last = t.at(-1);
  if (win.min)
    return Math.max(
      0,
      t.findIndex((x) => x >= last - win.min * 60),
    );
  const day = (x) => Math.floor((x + gmt) / 86400);
  const days = [...new Set(t.map(day))].slice(-(win.days ?? 1));
  return Math.max(
    0,
    t.findIndex((x) => day(x) === days[0]),
  );
}

const fmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); // prettier-ignore
const fmtHM = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }); // prettier-ignore
const SESS_PT = { pre: " (pré)", post: " (pós)" };

/**
 * Rotação intraday de um grupo.
 * @param data resposta de api/intraday?symbols= ({ series })
 * @param g grupo do universo ({ id, bench? }); members = ativos do grupo [{sym,label,name,inv?}]
 * @param winKey chave de ROT_WINDOWS (intraday)
 * @param live { SYM: cotação } (opcional): o preço mais novo vira o último ponto
 * @param opts { ext: pré/pós entram (switch Off market; padrão true), sessions: false = bolsa sem pré/pós
 *        marcado (B3: tudo é pregão) }. Com ext, "Hoje" começa no pós da véspera (o antes) e vai até o pós de hoje.
 * @returns [{ sym, label, name, tail: [{x,y,t,label}], quadrant }] — mesmo formato de rotation()
 */
export function rotationIntraday(data, g, members, winKey, live = {}, quadrantOf, opts = {}) {
  const win = rotWindow(winKey);
  if (!win.intra || !data?.series) return [];
  const ext = opts.ext ?? true;
  const sessions = opts.sessions ?? true;
  // On market: só as barras do pregão regular; sem sessões marcadas (B3), tudo é pregão
  const prep = (sr, inv) => {
    if (!sr) return null;
    let out = sessions ? sr : { ...sr, s: undefined };
    if (!ext && out.s) {
      const keep = out.s.map((x, i) => (x === "reg" ? i : -1)).filter((i) => i >= 0);
      out = {
        ...out,
        t: keep.map((i) => sr.t[i]),
        c: keep.map((i) => sr.c[i]),
        s: keep.map(() => "reg"),
      };
    }
    return inv ? { ...out, c: out.c.map((v) => 1 / v) } : out;
  };
  const series = {};
  for (const a of members) {
    const sr = prep(data.series[a.sym], a.inv);
    if (sr?.t.length) series[a.sym] = sr;
  }
  const benchSym = g.bench && data.series[g.bench] ? g.bench : null;
  if (benchSym && !series[benchSym]) series[benchSym] = prep(data.series[benchSym], false);
  const syms = Object.keys(series);
  const lv = {};
  for (const a of [...members, { sym: benchSym }]) {
    let p = a.sym && livePoint(live[a.sym], ext);
    const sr = a.sym && series[a.sym];
    // On market: o negócio de fechamento (16:00 em NY) é o fim do pregão, não uma barra do pós
    if (p && !ext && sr?.s && sessionMin(p.t, sr.g) >= 960) p = { ...p, t: Math.min(p.t, sr.t.at(-1) + win.bar * 60 - 1) }; // prettier-ignore
    if (p) lv[a.sym] = a.inv ? { p: 1 / p.p, t: p.t } : p;
  }
  const grid = buildGrid(series, syms, win.bar, lv);
  const n = grid.t.length;
  if (n < LAG + 2) return [];
  let bench;
  if (benchSym) bench = grid.vals[benchSym];
  else {
    const norm = members
      .filter((a) => grid.vals[a.sym])
      .map((a) => {
        const v = grid.vals[a.sym];
        const b0 = v.find((x) => x != null);
        return v.map((x) => (x == null ? null : x / b0));
      });
    bench = grid.t.map((_, i) => {
      const xs = norm.map((s) => s[i]).filter((x) => x != null);
      return xs.length ? mean(xs) : null;
    });
  }
  let start = windowStart(grid.t, win, grid.gmt);
  // com pré/pós, "Hoje" inclui o pós da véspera: a reação ao fechamento de ontem é o "antes" de hoje
  if (ext && sessions && win.days === 1)
    while (start > 0 && grid.sess[start - 1] === "post") start--;
  // logo depois da abertura (On market: só barras do pregão) o dia tem 1 ponto e a cauda some;
  // recua para o fim da sessão anterior ("ontem 15:30…") até ter MIN_PTS pontos
  let picks = slotPicks(grid.t, start, win.every ?? win.bar);
  while (win.days === 1 && picks.length < MIN_PTS && start > LAG) {
    start--;
    picks = slotPicks(grid.t, start, win.every ?? win.bar);
  }
  const sameDay = !!win.min || win.days === 1;
  const day = (x) => Math.floor((x + grid.gmt) / 86400); // dia da bolsa (o pós da véspera vira "ontem 18:30")
  const lastDay = day(grid.t[n - 1]);
  const out = [];
  for (const a of members) {
    if (a.sym === benchSym) continue;
    const v = grid.vals[a.sym];
    if (!v) continue;
    const rs = v.map((x, i) => (x != null && bench[i] > 0 ? (100 * x) / bench[i] : null));
    const f = ema(rs, FAST);
    const s = ema(rs, SLOW);
    const ratio = f.map((x, i) => (x != null && s[i] > 0 ? (100 * x) / s[i] : null));
    const tail = [];
    const sec = (win.every ?? win.bar) * 60;
    for (const [j, i] of picks.entries()) {
      if (i - LAG < 0 || ratio[i] == null || ratio[i - LAG] == null) continue;
      // ponto fechado = fim da fatia (10:30, 11:00…)
      // o último (fatia em formação) marca o fim da barra mais nova: o horário do preço de agora
      const end = (Math.floor(grid.t[i] / sec) + 1) * sec;
      const t = j === picks.length - 1 ? Math.min(end, grid.t[i] + win.bar * 60) : end;
      tail.push({
        x: ratio[i],
        y: (100 * ratio[i]) / ratio[i - LAG],
        t,
        s: grid.sess[i],
        label:
          (sameDay && day(grid.t[i]) !== lastDay ? "ontem " : "") +
          (sameDay ? fmtHM : fmt).format(new Date(t * 1000)).replace(",", "") +
          (SESS_PT[grid.sess[i]] ?? ""),
      });
    }
    if (tail.length >= 2)
      out.push({
        sym: a.sym,
        label: a.label,
        name: a.name,
        tail,
        quadrant: quadrantOf(tail.at(-1)),
      });
  }
  return out;
}

/**
 * Um índice da grade por fatia de `every` min alinhada ao relógio: o último negócio de cada fatia
 * (o ponto das 10:30 é o preço do fim da meia hora 10:00–10:30). A última fatia termina no preço de agora.
 */
export function slotPicks(t, start, every) {
  const sec = every * 60;
  const out = [];
  for (let i = start; i < t.length; i++) {
    const slot = Math.floor(t[i] / sec);
    if (i + 1 < t.length && Math.floor(t[i + 1] / sec) === slot) continue;
    out.push(i);
  }
  return out;
}

// ───────────── animação: força do movimento, quadros do play e transição entre janelas ─────────────

const keyOf = (p) => p.t ?? p.date;
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Força de cada trecho da cauda (0 a 1): distância percorrida no plano força × momento, relativa ao
 * percentil 90 de todos os trechos do gráfico. Trecho longo = rotação rápida = linha grossa.
 * @returns [[...]] um array por ativo, com tail.length − 1 valores
 */
export function segIntensity(data) {
  const d = data.map((r) =>
    r.tail.slice(1).map((p, k) => Math.hypot(p.x - r.tail[k].x, p.y - r.tail[k].y)),
  );
  const all = d.flat().sort((a, b) => a - b);
  const ref = all.length ? all[Math.min(all.length - 1, Math.floor(all.length * 0.9))] : 0;
  return d.map((xs) => xs.map((v) => (ref > 0 ? Math.min(1, v / ref) : 0)));
}

/** Linha do tempo comum do play: horários (intraday) ou datas (diário) de todos os pontos, em ordem. */
export function playTimeline(data) {
  return [...new Set(data.flatMap((r) => r.tail.map(keyOf)))].sort(cmp);
}

/**
 * Cauda até o quadro `f` (0 … timeline.length − 1, fracionário): pontos já passados e a cabeça
 * deslizando em linha reta até o próximo ponto. Ativo sem ponto até ali: cauda vazia.
 */
export function frameTail(tail, timeline, f, trail = 0) {
  const vis = frameTailAll(tail, timeline, f);
  return trail > 0 && vis.length > trail ? vis.slice(-trail) : vis;
}

/** Rastro curto (cometa): os últimos `n` pontos já mostrados; 0 = cauda completa. */
export const TRAIL = 8;

function frameTailAll(tail, timeline, f) {
  if (f == null) return tail;
  const k = Math.max(0, Math.min(timeline.length - 1, Math.floor(f)));
  const fr = f - k;
  const vis = tail.filter((p) => cmp(keyOf(p), timeline[k]) <= 0);
  if (!vis.length || fr <= 0 || k + 1 >= timeline.length) return vis;
  const next = tail.find((p) => keyOf(p) === timeline[k + 1]);
  if (!next) return vis;
  const a = vis.at(-1);
  return [
    ...vis,
    { ...next, x: a.x + (next.x - a.x) * fr, y: a.y + (next.y - a.y) * fr, partial: true },
  ];
}

/** Reamostra uma cauda para `n` pontos (interpolação linear): ponto de partida da transição entre janelas. */
export function resampleTail(tail, n) {
  if (!tail?.length || n <= 0) return [];
  if (tail.length === 1 || n === 1)
    return Array.from({ length: n }, () => ({ x: tail.at(-1).x, y: tail.at(-1).y }));
  return Array.from({ length: n }, (_, i) => {
    const pos = (i / (n - 1)) * (tail.length - 1);
    const j = Math.min(tail.length - 2, Math.floor(pos));
    const fr = pos - j;
    return {
      x: tail[j].x + (tail[j + 1].x - tail[j].x) * fr,
      y: tail[j].y + (tail[j + 1].y - tail[j].y) * fr,
    };
  });
}

/** Símbolos que a API precisa para o grupo (membros + benchmark), em ordem fixa (cache da borda estável). */
const FETCHABLE = /^\^?[A-Z0-9][A-Z0-9.\-=^]{0,14}$/; // cestas calculadas no app (ex.: "S:oil" do Onshore) ficam de fora
export function intradaySymbols(g, members) {
  const s = new Set(members.map((a) => a.sym).filter((x) => FETCHABLE.test(x)));
  if (s.size && g.bench && FETCHABLE.test(g.bench)) s.add(g.bench);
  return [...s].sort();
}

/**
 * Escala de um eixo que cobre TODOS os pontos mostrados (todas as caudas visíveis, nada cortado), sempre com a
 * linha 100 visível (cruz dos quadrantes) e uma folga nas bordas para a seta e o rótulo. Devolve [mín, máx].
 * @param floor amplitude mínima do eixo (intraday 0,2; diário 3)
 */
export function fitAxis(vals, floor) {
  const v = vals.filter(Number.isFinite);
  if (!v.length) return [100 - floor / 2, 100 + floor / 2];
  let lo = Math.min(100, ...v);
  let hi = Math.max(100, ...v);
  if (hi - lo < floor) {
    const c = (hi + lo) / 2;
    lo = Math.min(lo, c - floor / 2);
    hi = Math.max(hi, c + floor / 2);
  }
  const span = hi - lo;
  lo = Math.min(lo, 100 - span * 0.06); // a cruz nunca encosta na borda
  hi = Math.max(hi, 100 + span * 0.06);
  const pad = (hi - lo) * 0.1;
  return [lo - pad, hi + pad];
}

/**
 * Zoom que acompanha as caudas no play: abre na hora quando um ponto ia sair (nada é cortado) e fecha devagar
 * quando sobra espaço (sem tremer). `k` = fração do caminho andada por quadro ao fechar.
 */
export function followAxis(cur, target, k = 0.08) {
  if (!cur) return target;
  return [
    target[0] < cur[0] ? target[0] : cur[0] + (target[0] - cur[0]) * k,
    target[1] > cur[1] ? target[1] : cur[1] + (target[1] - cur[1]) * k,
  ];
}

// ───────────── velocidade do play ─────────────

/** Velocidades do player, em escala crescente (−1x = de trás para frente, do agora ao começo da janela). */
export const ROT_SPEEDS = [-1, 0.5, 1, 2];
export const rotSpeed = (v) => (ROT_SPEEDS.includes(Number(v)) ? Number(v) : 1);

/** Duração (s) de uma volta na janela em 1x: entre 4 e 14 s conforme o número de quadros. */
export const playDuration = (L) => Math.max(4, Math.min(14, L * 0.35));

/** Quadro de partida ao tocar ▶: para frente recomeça do início se já estava no fim; para trás, do fim se no início. */
export function playStart(f, L, speed) {
  if (speed < 0) return f == null || f <= 0 ? L - 1 : f;
  return f == null || f >= L - 1 ? 0 : f;
}

/**
 * Avança o play `dt` segundos na velocidade `speed`. Para frente, termina no agora (f = null);
 * para trás, para no começo da janela (f = 0). Devolve { f, playing }.
 */
export function playStep(f, L, dt, speed) {
  const cur = f ?? L - 1;
  const next = cur + dt * ((L - 1) / playDuration(L)) * speed;
  if (speed >= 0 && next >= L - 1) return { f: null, playing: false };
  if (speed < 0 && next <= 0) return { f: 0, playing: false };
  return { f: next, playing: true };
}

// ───────────── velocidade do fluxo (intensidade, não só direção) ─────────────

/**
 * Por que não "pontos de preço por minuto": $1/min num ativo de $500 é pouco e num de $20 é muito, e um dia
 * agitado mexe tudo junto. A velocidade aqui é medida no próprio plano da rotação, em pontos de FORÇA
 * RELATIVA (1 ponto ≈ 1% de desempenho contra o benchmark, suavizado) por unidade de tempo:
 *   - intraday: por hora (os pontos têm horário `t`);
 *   - diário: por pregão (`step` pregões entre os pontos).
 * Componentes: vx = força ganhando/perdendo (sinal = direção); vy = momento acelerando/freando;
 * v = distância percorrida no plano (intensidade sem sinal). Usa os 2 últimos trechos (tira o ruído da barra
 * em formação). `rel` = v ÷ mediana da velocidade de todos os trechos do gráfico: 1x = ritmo típico do grupo
 * nesta janela, 3x = três vezes mais rápido. Comparável entre ativos e entre moedas, juros e ações.
 */
export const SPEED_LEVELS = [
  { min: 3, id: "vfast", label: "muito rápido" },
  { min: 1.5, id: "fast", label: "rápido" },
  { min: 0.5, id: "normal", label: "normal" },
  { min: 0, id: "slow", label: "lento" },
];
// nível pelo múltiplo como aparece na tela (1 casa): "1,5x" é sempre rápido, nunca "1,5x normal"
export const speedLevel = (rel) => {
  const r = Math.round(rel * 10) / 10;
  return SPEED_LEVELS.find((l) => r >= l.min) ?? SPEED_LEVELS.at(-1);
};

/** Duração entre dois pontos na unidade da janela (horas no intraday; pregões no diário). */
function spanOf(a, b, ia, ib, step) {
  if (a.t != null && b.t != null) return (b.t - a.t) / 3600;
  return (ib - ia) * step;
}

/** Velocidade da cabeça de uma cauda: { vx, vy, v } por unidade, ou null com menos de 2 pontos. */
export function headSpeed(tail, { step = 1, back = 2 } = {}) {
  const pts = (tail ?? []).filter(
    (p) => !p.partial && Number.isFinite(p.x) && Number.isFinite(p.y),
  );
  if (pts.length < 2) return null;
  const j = Math.max(0, pts.length - 1 - back);
  const a = pts[j];
  const h = pts.at(-1);
  const dt = spanOf(a, h, j, pts.length - 1, step);
  if (!(dt > 0)) return null;
  const vx = (h.x - a.x) / dt;
  const vy = (h.y - a.y) / dt;
  return { vx, vy, v: Math.hypot(vx, vy) };
}

/** Mediana das velocidades de todos os trechos do gráfico: o "ritmo típico" do grupo na janela. */
export function typicalSpeed(data, { step = 1 } = {}) {
  const all = [];
  for (const d of data) {
    const pts = d.tail.filter((p) => !p.partial);
    for (let k = 1; k < pts.length; k++) {
      const dt = spanOf(pts[k - 1], pts[k], k - 1, k, step);
      if (dt > 0) all.push(Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y) / dt);
    }
  }
  if (!all.length) return 0;
  all.sort((a, b) => a - b);
  return all[Math.floor(all.length / 2)];
}

/**
 * Quadro de velocidade de um grupo, do mais rápido ao mais lento.
 * @param tails caudas mostradas agora (no play, as do quadro); ref = caudas completas (ritmo típico)
 * @returns [{ sym, label, vx, vy, v, rel, level }]
 */
export function speedBoard(tails, ref = tails, { step = 1 } = {}) {
  const typ = typicalSpeed(ref, { step });
  return tails
    .map((d) => {
      const s = headSpeed(d.tail, { step });
      if (!s) return null;
      const rel = typ > 0 ? s.v / typ : 0;
      return { sym: d.sym, label: d.label, ...s, rel, level: speedLevel(rel) };
    })
    .filter(Boolean)
    .sort((a, b) => b.rel - a.rel);
}
