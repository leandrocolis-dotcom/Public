// Gera docs/design/kinetic-nocturne.svg (a "placa" da direção visual). Sem dependências além das fontes
// em node_modules. Uso: node docs/design/build-plate.mjs  (PNG: renderize o SVG em 2400x3200 no navegador)
import { readFileSync, writeFileSync } from "node:fs";

const W = 2400;
const H = 3200;
const font = (pkg, file) =>
  `data:font/woff2;base64,${readFileSync(`node_modules/@fontsource/${pkg}/files/${file}`).toString("base64")}`;
const JURA = font("jura", "jura-latin-300-normal.woff2");
const MONO = font("geist-mono", "geist-mono-latin-400-normal.woff2");

const C = {
  bg0: "#05070D",
  bg1: "#0A1020",
  mint: "#35E0A1",
  coral: "#FF6F83",
  amber: "#F2C265",
  ivory: "#E9EEF8",
};
const f = (x) => x.toFixed(2);
const rad = (d) => (d * Math.PI) / 180;

// ── geometria: um pêndulo, pivô no topo; o leque de arcos mede a oscilação amortecida ──
const PX = W / 2;
const PY = 470;
const R0 = 330;
const R1 = 1640;
const ARCS = 96;
const SPAN = 34; // graus de cada lado no máximo
const pt = (r, deg) => [PX + r * Math.sin(rad(deg)), PY + r * Math.cos(rad(deg))];
const arcPath = (r, a0, a1) => {
  const [x0, y0] = pt(r, a0);
  const [x1, y1] = pt(r, a1);
  return `M${f(x0)} ${f(y0)} A${f(r)} ${f(r)} 0 0 ${a1 > a0 ? 0 : 1} ${f(x1)} ${f(y1)}`;
};

let arcs = "";
let bobs = "";
let envMint = [];
let envCoral = [];
for (let k = 0; k < ARCS; k++) {
  const t = k / (ARCS - 1);
  const r = R0 + (R1 - R0) * t;
  // amplitude: oscilação amortecida das duas pontas, defasadas (as duas forças se respondem)
  const damp = Math.exp(-2.1 * t);
  const aR =
    SPAN * (0.16 + 0.84 * Math.abs(Math.cos(t * 9.4)) * damp + 0.0 * t) * (0.55 + 0.45 * (1 - t));
  const aL =
    SPAN * (0.16 + 0.84 * Math.abs(Math.sin(t * 9.4 + 0.9)) * damp) * (0.55 + 0.45 * (1 - t));
  const o = 0.22 + 0.62 * (1 - t) ** 0.8;
  arcs += `<path d="${arcPath(r, 0, aR)}" stroke="${C.mint}" stroke-opacity="${f(o)}" stroke-width="${f(1.1 + 1.4 * (1 - t))}" stroke-dasharray="${f(2 + 7 * t)} ${f(5 + 4 * t)}"/>`;
  arcs += `<path d="${arcPath(r, 0, -aL)}" stroke="${C.coral}" stroke-opacity="${f(o)}" stroke-width="${f(1.1 + 1.4 * (1 - t))}" stroke-dasharray="${f(2 + 7 * t)} ${f(5 + 4 * t)}"/>`;
  const [bx, by] = pt(r, aR);
  const [cx, cy] = pt(r, -aL);
  envMint.push([bx, by]);
  envCoral.push([cx, cy]);
  const br = 3.2 + 6.5 * (1 - t) ** 1.4;
  bobs += `<circle cx="${f(bx)}" cy="${f(by)}" r="${f(br)}" fill="${C.mint}" fill-opacity="${f(0.35 + 0.6 * (1 - t))}"/>`;
  bobs += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(br)}" fill="${C.coral}" fill-opacity="${f(0.35 + 0.6 * (1 - t))}"/>`;
}
const env = (pts, c) =>
  `<polyline points="${pts.map((p) => `${f(p[0])},${f(p[1])}`).join(" ")}" stroke="${c}" stroke-opacity=".5" stroke-width="1.2" fill="none"/>`;

// escala do aro externo: 1°, 5° e 10° (graduação de instrumento)
const RIM = R1 + 70;
let scale = "";
for (let d = -SPAN - 4; d <= SPAN + 4; d++) {
  const major = d % 10 === 0;
  const mid = d % 5 === 0;
  const len = major ? 44 : mid ? 28 : 14;
  const [x0, y0] = pt(RIM, d);
  const [x1, y1] = pt(RIM + len, d);
  scale += `<line x1="${f(x0)}" y1="${f(y0)}" x2="${f(x1)}" y2="${f(y1)}" stroke="${C.ivory}" stroke-opacity="${major ? 0.85 : mid ? 0.55 : 0.3}" stroke-width="${major ? 1.8 : 1.1}"/>`;
  if (major) {
    const [tx, ty] = pt(RIM + 96, d);
    scale += `<text x="${f(tx)}" y="${f(ty)}" class="mono" font-size="26" text-anchor="middle" dominant-baseline="middle" fill="${C.ivory}" fill-opacity=".62" transform="rotate(${-d} ${f(tx)} ${f(ty)})">${d === 0 ? "0" : (d > 0 ? "+" : "−") + Math.abs(d)}</text>`;
  }
}
// aro e eixo
const rim = `<path d="${arcPath(RIM, -SPAN - 4, SPAN + 4)}" stroke="${C.ivory}" stroke-opacity=".5" stroke-width="1.4"/>`;
const axis =
  `<line x1="${PX}" y1="${PY}" x2="${PX}" y2="${f(RIM + 44)}" stroke="${C.amber}" stroke-opacity=".7" stroke-width="1.4"/>` +
  Array.from({ length: 28 }, (_, i) => {
    const y = PY + 90 + i * 55;
    return `<line x1="${PX - (i % 5 === 0 ? 14 : 7)}" y1="${y}" x2="${PX + (i % 5 === 0 ? 14 : 7)}" y2="${y}" stroke="${C.amber}" stroke-opacity=".75" stroke-width="1.3"/>`;
  }).join("");
const pivot = `<circle cx="${PX}" cy="${PY}" r="9" fill="none" stroke="${C.amber}" stroke-width="2"/><circle cx="${PX}" cy="${PY}" r="2.6" fill="${C.amber}"/>`;

// ── matriz de "velas": o mesmo balanço, lido no tempo (96 colunas) ──
const MX0 = 300;
const MX1 = W - 300;
const MY = 2540;
const AMP = 230;
const N = 96;
const step = (MX1 - MX0) / (N - 1);
const series = (i) => {
  const t = i / (N - 1);
  return (
    (Math.sin(t * 17 + 0.4) * 0.62 + Math.sin(t * 6.3 + 1.7) * 0.38) * Math.exp(-1.15 * t) * AMP
  );
};
let candles = "";
let prev = series(-1 + 0);
for (let i = 0; i < N; i++) {
  const cl = series(i);
  const op = prev;
  const up = cl >= op;
  const ink = up ? C.mint : C.coral;
  const hi = Math.max(op, cl) + 14 + 22 * Math.abs(Math.sin(i * 1.9));
  const lo = Math.min(op, cl) - 14 - 22 * Math.abs(Math.cos(i * 1.3));
  const x = MX0 + i * step;
  const y = (v) => MY - v;
  candles += `<line x1="${f(x)}" y1="${f(y(hi))}" x2="${f(x)}" y2="${f(y(lo))}" stroke="${ink}" stroke-opacity=".75" stroke-width="1.4"/>`;
  const top = y(Math.max(op, cl));
  const bh = Math.max(2.5, Math.abs(cl - op));
  candles += `<rect x="${f(x - 4.4)}" y="${f(top)}" width="8.8" height="${f(bh)}" fill="${ink}" fill-opacity="${up ? 0.9 : 0.55}"/>`;
  prev = cl;
}
let grid = "";
for (let g = -2; g <= 2; g++) {
  const y = MY - g * (AMP / 2);
  grid += `<line x1="${MX0 - 40}" y1="${y}" x2="${MX1 + 40}" y2="${y}" stroke="${C.ivory}" stroke-opacity="${g === 0 ? 0.32 : 0.12}" stroke-width="1.2"${g === 0 ? "" : ' stroke-dasharray="3 9"'}/>`;
  grid += `<text x="${MX0 - 76}" y="${y}" class="mono" font-size="22" text-anchor="end" dominant-baseline="middle" fill="${C.ivory}" fill-opacity=".5">${g === 0 ? "0" : (g > 0 ? "+" : "−") + Math.abs(g)}</text>`;
}
const ticksX = Array.from({ length: 13 }, (_, i) => {
  const x = MX0 + (i * (MX1 - MX0)) / 12;
  return `<line x1="${f(x)}" y1="${MY + AMP + 70}" x2="${f(x)}" y2="${MY + AMP + (i % 4 === 0 ? 106 : 88)}" stroke="${C.ivory}" stroke-opacity=".5" stroke-width="1.2"/>`;
}).join("");

// ── texto: poucas palavras, sempre em faixas reservadas (nada toca a arte) ──
const M = 170;
const text = `
<text x="${M}" y="190" class="jura" font-size="64" letter-spacing="26" fill="${C.ivory}" fill-opacity=".92">PÊNDULO</text>
<text x="${W - M}" y="178" class="mono" font-size="24" letter-spacing="5" text-anchor="end" fill="${C.ivory}" fill-opacity=".55">PLACA 01</text>
<text x="${W - M}" y="214" class="mono" font-size="24" letter-spacing="5" text-anchor="end" fill="${C.ivory}" fill-opacity=".55">OSCILAÇÃO AMORTECIDA</text>
<line x1="${M}" y1="262" x2="${W - M}" y2="262" stroke="${C.ivory}" stroke-opacity=".18" stroke-width="1.2"/>
<text x="${M}" y="2960" class="jura" font-size="40" letter-spacing="9" fill="${C.ivory}" fill-opacity=".85">duas forças, um eixo</text>
<text x="${W - M}" y="2948" class="mono" font-size="22" letter-spacing="4" text-anchor="end" fill="${C.ivory}" fill-opacity=".5">θ ±${SPAN}°   n = ${ARCS}   Δt = ${N}</text>
<text x="${W - M}" y="2982" class="mono" font-size="22" letter-spacing="4" text-anchor="end" fill="${C.ivory}" fill-opacity=".5">▲ ${C.mint.slice(1)}   ▼ ${C.coral.slice(1)}</text>
<line x1="${M}" y1="3040" x2="${W - M}" y2="3040" stroke="${C.ivory}" stroke-opacity=".18" stroke-width="1.2"/>
`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
<style>
@font-face{font-family:"Jura";font-weight:300;src:url(${JURA}) format("woff2")}
@font-face{font-family:"Geist Mono";font-weight:400;src:url(${MONO}) format("woff2")}
.jura{font-family:"Jura",sans-serif;font-weight:300}
.mono{font-family:"Geist Mono",monospace;font-weight:400}
</style>
<radialGradient id="g" cx="50%" cy="${f((PY / H) * 100 + 14)}%" r="78%"><stop offset="0" stop-color="${C.bg1}"/><stop offset="1" stop-color="${C.bg0}"/></radialGradient>
<radialGradient id="glow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${C.mint}" stop-opacity=".10"/><stop offset="1" stop-color="${C.mint}" stop-opacity="0"/></radialGradient>
<radialGradient id="glow2" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${C.coral}" stop-opacity=".09"/><stop offset="1" stop-color="${C.coral}" stop-opacity="0"/></radialGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#g)"/>
<ellipse cx="${PX + 380}" cy="1250" rx="620" ry="620" fill="url(#glow)"/>
<ellipse cx="${PX - 380}" cy="1250" rx="620" ry="620" fill="url(#glow2)"/>
<g fill="none" stroke-linecap="round">${arcs}${env(envMint, C.mint)}${env(envCoral, C.coral)}${rim}${axis}</g>
${bobs}${scale}${pivot}
<g fill="none" stroke-linecap="round">${grid}${ticksX}</g>
${candles}
${text}
</svg>
`;
writeFileSync("docs/design/kinetic-nocturne.svg", svg);
