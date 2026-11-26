// Servidor local: arquivos estáticos + /api/quotes, /api/intraday e /api/history, /api/search (mesmas funções da Vercel). Uso: npm run dev
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import quotes from "../api/quotes.js";
import intraday from "../api/intraday.js";
import history from "../api/history.js";
import analyze from "../api/analyze.js";
import verify from "../api/verify.js";
import yields from "../api/yields.js";
import news from "../api/news.js";
import profile from "../api/profile.js";
import search from "../api/search.js";
import instrument from "../api/instrument.js";
import calendar from "../api/calendar.js";

const API = {
  "/api/quotes": quotes,
  "/api/calendar": calendar,
  "/api/profile": profile,
  "/api/search": search,
  "/api/instrument": instrument,
  "/api/intraday": intraday,
  "/api/history": history,
  "/api/analyze": analyze,
  "/api/yields": yields,
  "/api/news": news,
  "/api/verify": verify,
};

const ROOT = new URL("..", import.meta.url).pathname;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
};
const PORT = Number(process.env.PORT ?? 8080);

createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (API[url.pathname]) {
    res.status = (c) => ((res.statusCode = c), res);
    res.json = (o) => (
      res.setHeader("Content-Type", "application/json"),
      res.end(JSON.stringify(o))
    );
    return API[url.pathname](req, res);
  }
  const path = normalize(join(ROOT, url.pathname === "/" ? "index.html" : url.pathname));
  if (!path.startsWith(ROOT)) return res.writeHead(403).end();
  try {
    const body = await readFile(path);
    res
      .writeHead(200, { "Content-Type": TYPES[extname(path)] ?? "application/octet-stream" })
      .end(body);
  } catch {
    res.writeHead(404).end("não encontrado");
  }
}).listen(PORT, () => console.log(`http://localhost:${PORT}`));
