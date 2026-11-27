// Gatilhos › Agora (21/11/2026): só os gatilhos que passaram no teste, com o placar ao vivo. Funções puras.
// Evidência: docs/estudo-conclusoes.md, docs/ESTUDO-GATILHOS.md, docs/ESTUDO-VELOCIDADE.md, docs/ESTUDO-DINHEIRO.md.

/** Proteção de quem já está alocado: cortam a queda máxima (não acertam a direção). Placar em data/model.json. */
export const PROTECT = [
  { id: "reduce", logic: "dec:reduce:sell", label: "Reduzir (Decisão do trader)", why: "Única lógica que manda operar e teve vantagem no estudo retroativo (+0,10R por dia, 487 dias, aprovada no BH)." },
  { id: "lost200", logic: "sig:lost200:sell", label: "Perdeu a média de 200 dias", why: "Ficar fora 20 pregões cortou a pior queda de −43% para −36% em 40 ETFs (10 anos)." },
  { id: "stretched", logic: "sig:stretched:sell", label: "Esticado: alta de 5 dias ≥ 2σ e RSI > 75", why: "Depois disso o retorno dos 5 dias seguintes fica perto de zero: hora de realizar parte." },
]; // prettier-ignore

/** O que NÃO fazer: medido e perdeu dinheiro. `src`: "model" (data/model.json) ou "speed" (data/speed-model.json). */
export const AVOID = [
  { src: "model", logic: "dec:buy:buy", label: "Comprar quando a Decisão diz “Comprar”", why: "Ao vivo perde para a média do universo." },
  { src: "model", logic: "dec:buy-part:buy", label: "Comprar o recuo (“Comprar em partes”)", why: "Pior decisão do estudo (−0,19R por dia, 508 dias); pior ainda na baixa." },
  { src: "speed", logic: "ispd:pre-dn-vfast:sell", label: "Short na queda muito rápida do pré-mercado", why: "No estudo e ao vivo, aceleração para baixo não continua." },
  { src: "speed", logic: "spd:up-vfast:buy", label: "Comprar a tração muito rápida", why: "No estudo, comprar aceleração ficou perto de zero depois do custo." },
  { src: null, logic: null, label: "Comprar o inverso depois de um sinal de saída", why: "−0,4% a −1,7% em 20 pregões (10 anos, 40 ETFs): saiu não quer dizer que vai cair." },
]; // prettier-ignore

/** Placar ao vivo de uma lógica: { n, mean, lower, upper, status } ou null. */
export function scoreOf(src, logic, { model, speed } = {}) {
  if (!logic) return null;
  const l = src === "speed" ? speed?.logics?.[logic] : model?.logics?.[logic];
  const x = src === "speed" ? l?.x : l?.rx;
  if (!x || !(x.n > 0))
    return l ? { n: 0, mean: null, lower: null, upper: null, status: l.status } : null;
  return { n: x.n, mean: x.mean, lower: x.lower, upper: x.upper, status: l.status };
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * Filtro de alavancagem (H10, docs/ESTUDO-DINHEIRO.md): SPY acima da MM200 E vol. de 21 pregões < 20% ao ano → 2x;
 * acima da MM200 com vol. alta → 1x; abaixo da MM200 → caixa. close = fechamentos do SPY (último = preço atual).
 */
export function leverFilter(close) {
  const c = (close ?? []).filter((x) => x > 0);
  if (c.length < 201) return null;
  const price = c.at(-1);
  const ma200 = mean(c.slice(-200));
  const r = [];
  for (let i = c.length - 21; i < c.length; i++) r.push(Math.log(c[i] / c[i - 1]));
  const m = mean(r);
  const vol = Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1)) * Math.sqrt(252);
  const up = price > ma200;
  const level = !up ? 0 : vol < 0.2 ? 2 : 1;
  return { price, ma200, vol, up, level };
}

/**
 * Alertas de proteção por ativo. items: [{ sym, held, dec, codes, lev }] com dec = chave da Decisão do trader
 * ("reduce", "sell"…) e codes = códigos dos sinais de hoje (signals.js). Só volta quem tem algum alerta.
 */
export function protectRows(items) {
  const out = [];
  for (const it of items ?? []) {
    const hits = PROTECT.filter((p) =>
      p.id === "reduce" ? it.dec === "reduce" : it.codes?.includes(p.id),
    );
    if (hits.length) out.push({ ...it, hits: hits.map((h) => h.id) });
  }
  // posição antes de watchlist, alavancado antes, mais alertas antes
  return out.sort((a, b) => b.held - a.held || b.lev - a.lev || b.hits.length - a.hits.length || a.sym.localeCompare(b.sym)); // prettier-ignore
}

/**
 * Repique depois de queda muito rápida em "Perdendo força" (spd:rev-pf, aprovado no BH no estudo de 2 anos).
 * open: gatilhos ainda abertos (speed-model.json → open). live(sym) → preço atual ou null.
 */
export function reboundRows(open, live = () => null) {
  return (open ?? [])
    .map((e) => {
      const p = live(e.s);
      return { sym: e.s, date: e.d, entry: e.p, price: p, move: p > 0 && e.p > 0 ? p / e.p - 1 : null, bull: e.g === 1, rel: e.rel }; // prettier-ignore
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.rel - a.rel);
}
