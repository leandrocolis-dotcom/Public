// Envio manual de push (o automático é a Edge Function supabase/functions/push, chamada a cada 20 min).
// Uso: SUPABASE_SERVICE_KEY=… node scripts/send-push.mjs [--dry]
import { readFileSync } from "node:fs";
import { mergeItems } from "../assets/news.js";
import webpush from "web-push";
import { sendPush } from "./lib/push-send.mjs";

const KEY = process.env.SUPABASE_SERVICE_KEY;
if (!KEY) {
  console.log("Falta SUPABASE_SERVICE_KEY. Nada a enviar.");
  process.exit(0);
}
const readJSON = (f) => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), "utf8"));
let cron = [];
try {
  cron = readJSON("news.json").items ?? [];
} catch {
  /* sem arquivo de notícias */
}
const out = await sendPush({
  webpush,
  key: KEY,
  flow: readJSON("flow.json"),
  news: mergeItems([cron]),
  dry: process.argv.includes("--dry"),
});
console.log(`${out.users} usuário(s) inscrito(s); ${out.sent} aviso(s) enviado(s).`);
