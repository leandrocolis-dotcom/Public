// Custo de estrutura de quem NÃO é residente nos EUA e tem ETF domiciliado nos EUA (docs/ROADMAP-DINHEIRO.md D4).
// Puro. Duas contas, ambas aproximadas e educacionais (não é orientação tributária; confira com o seu tributarista):
//  1. Retenção na fonte sobre dividendos: 30% para não residente sem tratado (caso do Brasil) × ~15% num UCITS
//     irlandês que replica o mesmo índice (o fundo irlandês sofre 15% pelo tratado EUA-Irlanda e não retém do cotista).
//  2. Imposto sobre herança dos EUA (estate tax) para pessoa física não residente: ativos "US situs" (ETF americano,
//     ação americana) acima de US$ 60 mil, alíquota progressiva até 40%. Detido por empresa offshore ou trust bem
//     estruturado, em geral não se aplica; UCITS irlandês não é US situs.

export const WHT_US = 0.3;
export const WHT_UCITS = 0.15;
export const ESTATE_EXEMPT = 60_000;
export const ESTATE_TOP = 0.4;

/** Domiciliado nos EUA? Heurística: ticker sem sufixo de bolsa estrangeira (".L", ".AS", ".SA", ".DE"...). */
export const isUsSitus = (sym) => !/\.[A-Z]{1,3}$/.test(String(sym ?? "")) && !/^\^/.test(String(sym ?? "")); // prettier-ignore

/**
 * rows = [{ sym, value, dy }] (dy = dividend yield anual em fração, null se desconhecido).
 * Devolve totais e linhas: dividendos/ano, retenção a 30%, retenção num UCITS (15%), economia/ano e o pior caso do
 * imposto sobre herança (alíquota máxima sobre o que passa de US$ 60 mil, só se detido em nome da pessoa física).
 */
export function structureCost(rows, { wht = WHT_US, ucits = WHT_UCITS } = {}) {
  const lines = (rows ?? [])
    .filter((r) => r.value > 0)
    .map((r) => {
      const us = isUsSitus(r.sym);
      const dy = Number.isFinite(r.dy) && r.dy >= 0 ? r.dy : null;
      const divs = dy === null ? null : r.value * dy;
      const leak = us && divs !== null ? divs * wht : 0;
      const leakU = us && divs !== null ? divs * ucits : 0;
      return {
        sym: r.sym,
        value: r.value,
        us,
        dy,
        divs,
        leak,
        leakUcits: leakU,
        saving: leak - leakU,
      };
    })
    .sort((a, b) => b.saving - a.saving);
  const sum = (k) => lines.reduce((a, x) => a + (x[k] ?? 0), 0);
  const total = sum("value");
  const usValue = lines.filter((x) => x.us).reduce((a, x) => a + x.value, 0);
  const unknown = lines.filter((x) => x.us && x.dy === null).map((x) => x.sym);
  const saving = sum("saving");
  return {
    total,
    usValue,
    divs: sum("divs"),
    leak: sum("leak"),
    leakUcits: sum("leakUcits"),
    saving,
    savingPct: total > 0 ? saving / total : null, // em fração do patrimônio ao ano (como uma taxa de administração)
    estateBase: Math.max(0, usValue - ESTATE_EXEMPT),
    estateWorst: Math.max(0, usValue - ESTATE_EXEMPT) * ESTATE_TOP,
    unknown,
    lines,
  };
}
