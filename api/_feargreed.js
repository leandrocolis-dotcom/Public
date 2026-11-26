// Medo & Ganância da CNN (endpoint público do gráfico do site, grátis, sem chave). Arquivo com "_" não vira rota.
import { httpFetch } from "./_http.js";
import { parseCnn } from "../assets/fear-greed.js";

const URL_ = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata/";

/** -> { score, rating, at, prev, parts, hist } (a CNN pede navegador: User-Agent e Referer do site). */
export async function fetchFearGreed({ deadline = null } = {}) {
  const from = new Date(Date.now() - 120 * 864e5).toISOString().slice(0, 10); // sem data a CNN responde 307
  return httpFetch(
    URL_ + from,
    {
      timeout: 8000,
      deadline,
      headers: { Referer: "https://edition.cnn.com/", Accept: "application/json" },
    },
    async (r) => {
      // prettier-ignore
      if (!r.ok) throw new Error(`CNN HTTP ${r.status}`);
      const out = parseCnn(await r.json());
      if (!out) throw new Error("CNN: resposta sem nota");
      return out;
    },
  );
}
