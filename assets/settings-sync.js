// Edições do usuário na nuvem (tabela pendulo_settings): preferências, aparência, ordem das abas e dos quadros,
// filtros de tabela, linhas nos gráficos, avisos dispensados e preços manuais. Cada aparelho grava no
// localStorage como antes; aqui cada gravação ganha um carimbo de hora por chave e sobe para a nuvem. Na
// sincronia, chave a chave, a edição mais nova vence (dois aparelhos editando coisas diferentes não se apagam).
// Carteira, diário e 👍 trades têm tabela própria. Fica só no aparelho: aba aberta, zoom e marcas de "visto".

/** Guardadas inteiras. */
export const WHOLE = [
  "pendulo.tables",
  "pendulo.userLines",
  "pendulo.dismissed",
  "pendulo.manual",
  "dashLayout",
  "localLayout",
  "homeLayout",
  "railHidden",
  // Long & Short (docs/long-short/MAPEAMENTO.md): parâmetros alterados, plano do dia, pares e cadastro de ativos
  "pendulo.ls.params",
  "pendulo.ls.plan",
  "pendulo.ls.pairs",
  "pendulo.ls.assets",
];
/** Objetos sincronizados campo a campo, com os campos que ficam só no aparelho. */
export const FIELDS = {
  "pendulo.prefs": new Set(["tab", "groupLast", "setTab", "prefsV"]),
  "pendulo.ui": new Set(["zoom"]),
};
export const STAMPS_KEY = "pendulo.cloudStamps";
const SEP = "|";

export const tracked = (k) => WHOLE.includes(k) || k in FIELDS;
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const parse = (raw) => {
  try {
    return raw == null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
};

/** Gravação local em `key` (texto antigo → novo): carimba as chaves do pacote que mudaram. */
export function stampChanges(key, oldRaw, newRaw, stamps, now = Date.now()) {
  if (WHOLE.includes(key)) {
    if (!same(parse(oldRaw), parse(newRaw))) stamps[key] = now;
  } else if (FIELDS[key]) {
    const a = parse(oldRaw) ?? {};
    const b = parse(newRaw) ?? {};
    for (const f of new Set([...Object.keys(a), ...Object.keys(b)]))
      if (!FIELDS[key].has(f) && !same(a[f], b[f])) stamps[`${key}${SEP}${f}`] = now;
  }
  return stamps;
}

/** Pacote local { chave: { v, at } } a partir do armazenamento (get: chave → texto) e dos carimbos. */
export function localBundle(get, stamps = {}) {
  const out = {};
  for (const k of WHOLE) {
    const raw = get(k);
    if (raw != null || stamps[k]) out[k] = { v: parse(raw), at: stamps[k] ?? 0 };
  }
  for (const [k, skip] of Object.entries(FIELDS)) {
    const o = parse(get(k)) ?? {};
    for (const f of Object.keys(o))
      if (!skip.has(f)) out[`${k}${SEP}${f}`] = { v: o[f], at: stamps[`${k}${SEP}${f}`] ?? 0 };
    // campo apagado aqui depois de carimbado: vai como null
    for (const s of Object.keys(stamps))
      if (s.startsWith(`${k}${SEP}`) && !(s in out)) out[s] = { v: null, at: stamps[s] };
  }
  return out;
}

/**
 * Mescla local × nuvem chave a chave: a mais nova vence; empate fica com a nuvem (aparelho novo adota as
 * edições já salvas). Devolve o pacote final, as chaves a aplicar aqui e se a nuvem precisa ser regravada.
 */
export function mergeBundles(local = {}, remote = {}) {
  const merged = {};
  const pull = [];
  let push = false;
  for (const k of new Set([...Object.keys(local), ...Object.keys(remote)])) {
    const l = local[k];
    const r = remote[k];
    if (r && (!l || r.at >= l.at)) {
      merged[k] = r;
      if (!l || !same(l.v, r.v)) pull.push(k);
    } else {
      merged[k] = l;
      push = true;
    }
  }
  return { merged, pull, push };
}

/**
 * Aplica no armazenamento as chaves vindas da nuvem. get/set/del: texto por chave. Devolve as chaves de
 * armazenamento alteradas (ex.: "pendulo.prefs", "dashLayout").
 */
export function applyRemote(keys, remote, { get, set, del }) {
  const touched = new Set();
  const objs = {};
  for (const k of keys) {
    const { v } = remote[k];
    const i = k.indexOf(SEP);
    if (i < 0) {
      if (v == null) del(k);
      else set(k, JSON.stringify(v));
      touched.add(k);
      continue;
    }
    const sk = k.slice(0, i);
    const f = k.slice(i + 1);
    objs[sk] ??= parse(get(sk)) ?? {};
    if (v == null) delete objs[sk][f];
    else objs[sk][f] = v;
  }
  for (const [sk, o] of Object.entries(objs)) {
    set(sk, JSON.stringify(o));
    touched.add(sk);
  }
  return [...touched];
}
