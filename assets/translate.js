// Tradução para o português (Google Translate público, sem chave). Usada no servidor (api/news, api/profile,
// cron de notícias). O texto original fica no item: a ligação com ativos e carteira usa palavras em inglês.
const URL_ = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=pt&dt=t";
const MAX = 4000; // caracteres por chamada

const PT_PT = [
  [/\bactua(l|is|lmente|lizad\w*|liza\w*)\b/gi, (m) => m.replace(/c(?=t)/i, "")],
  [/\bad(o|op)pt/gi, "adot"], [/\badopt/gi, "adot"], [/\bfacto\b/g, "fato"], [/\bfactos\b/g, "fatos"],
  [/\bac[çc](ão|ões)\b/gi, (m) => m.replace(/c(?=ç)/i, "")], [/\bregisto/gi, "registro"], [/\bequipa\b/g, "equipe"],
  [/\bdirec[çc]ão\b/gi, "direção"], [/\bsector(es)?\b/gi, (m) => m.replace(/c(?=t)/i, "")], [/\bobjectiv/gi, "objetiv"],
  [/\beléctric/gi, "elétric"], [/\bprojecto/gi, "projeto"], [/\bcontrolo\b/gi, "controle"], [/\bgestor de fundos\b/gi, "gestor de fundos"],
]; // prettier-ignore
const GER = { ar: "ando", er: "endo", ir: "indo", or: "ondo" };

/** Ajustes de português de Portugal para o do Brasil ("está a subir" -> "está subindo", "acções" -> "ações"). Puro. */
export function ptBR(t) {
  let s = String(t ?? "").replace(
    /\b(está|estão|estava|estavam|estar|esteve|continua|continuam|continuou|anda|andam|ficou|ficam|fica)\s+a\s+([a-zà-ú]+?)(ar|er|ir|or)\b/gi,
    (_, v, raiz, term) => `${v} ${raiz}${GER[term.toLowerCase()]}`,
  );
  for (const [re, to] of PT_PT) s = s.replace(re, to);
  return s;
}

/** Resposta do Google -> texto traduzido (junta os pedaços). Puro. */
export function parseGtx(json) {
  return Array.isArray(json?.[0]) ? json[0].map((p) => p?.[0] ?? "").join("") : null;
}

/** Agrupa textos (sem quebras internas) em lotes de até MAX caracteres. Puro. */
export function batches(texts, max = MAX) {
  const out = [];
  let cur = [];
  let len = 0;
  texts.forEach((t, i) => {
    if (cur.length && len + t.length + 1 > max) {
      out.push(cur);
      cur = [];
      len = 0;
    }
    cur.push(i);
    len += t.length + 1;
  });
  if (cur.length) out.push(cur);
  return out;
}

const cache = new Map(); // texto -> tradução (vive enquanto a função estiver quente)

/** Traduz uma lista de textos; o que falhar volta null. Respeita um prazo (ms epoch). */
export async function translateMany(texts, { deadline = null, timeout = 6000 } = {}) {
  const clean = texts.map((t) =>
    String(t ?? "")
      .replace(/\s+/g, " ")
      .trim(),
  );
  const out = clean.map((t) => (t ? (cache.get(t) ?? null) : null));
  const todo = clean.map((t, i) => (t && out[i] == null ? i : -1)).filter((i) => i >= 0);
  const groups = batches(todo.map((i) => clean[i]));
  await Promise.all(
    groups.map(async (g) => {
      const left = deadline ? deadline - Date.now() - 500 : timeout;
      if (left < 800) return;
      const idx = g.map((k) => todo[k]);
      try {
        const r = await fetch(URL_, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
          body: `q=${encodeURIComponent(idx.map((i) => clean[i]).join("\n"))}`,
          signal: AbortSignal.timeout(Math.min(timeout, left)),
        });
        if (!r.ok) return;
        const lines = (parseGtx(await r.json()) ?? "").split("\n");
        if (lines.length !== idx.length) return; // tradução embaralhou as linhas: fica o original
        idx.forEach((i, k) => {
          const t = ptBR(lines[k].trim());
          if (t) {
            out[i] = t;
            cache.set(clean[i], t);
          }
        });
      } catch {
        /* sem tradução: o app mostra o original */
      }
    }),
  );
  return out;
}

/** Acrescenta titlePt e dPt às manchetes que não são do Brasil. */
export async function translateItems(items, opts = {}) {
  const need = items.filter((x) => x.region !== "br" && !x.titlePt);
  if (!need.length) return items;
  const texts = need.flatMap((x) => [x.title ?? "", x.d ?? ""]);
  const tr = await translateMany(texts, opts);
  const by = new Map(
    need.map((x, i) => [
      x,
      { titlePt: tr[2 * i] ?? undefined, dPt: x.d ? (tr[2 * i + 1] ?? undefined) : undefined },
    ]),
  );
  return items.map((x) => (by.has(x) ? { ...x, ...by.get(x) } : x));
}

/** Título e resumo para mostrar: português quando houver. */
export const ptTitle = (it) => it?.titlePt || it?.title || "";
export const ptSum = (it) => it?.dPt || it?.d || "";
