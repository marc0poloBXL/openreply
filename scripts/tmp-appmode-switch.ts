/**
 * TEMP helper (3 nov 2026) — lire le mode actuel de l'app Meta et tenter de
 * basculer en mode "In Development" via l'API Graph, avec le token d'app
 * (APP_ID|APP_SECRET) lu depuis l'environnement. Aucun secret affiché.
 * Objectif : permettre la propagation de l'invitation testeur Instagram
 * (les invitations testeurs ne se propagent qu'en mode Development).
 */
import "dotenv/config";
import { requireEnv } from "../lib/env";

const APP_ID = requireEnv("FACEBOOK_APP_ID");
const APP_SECRET = requireEnv("FACEBOOK_APP_SECRET");
const API_VER = process.env.META_GRAPH_API_VERSION || "v26.0";
const TOKEN = `${APP_ID}|${APP_SECRET}`;
const readUrl = `https://graph.facebook.com/${API_VER}/${APP_ID}?fields=name,app_mode&access_token=${TOKEN}`;

async function readMode(label: string) {
  try {
    const r = await fetch(readUrl);
    const d = await r.json();
    console.log(`${label}:`, JSON.stringify({
      name: d.name ?? null,
      app_mode: d.app_mode ?? null,
      error: d.error?.message ?? null,
    }));
    return d.app_mode;
  } catch (e: any) {
    console.log(`${label}: FAILED ${e.message}`);
    return null;
  }
}

async function main() {
  const before = await readMode("Current");
  if (before === "development") {
    console.log("Déjà en mode développement — rien à faire.");
    return;
  }

  // Tente la bascule en développement
  const postUrl = `https://graph.facebook.com/${API_VER}/${APP_ID}?app_mode=development&access_token=${TOKEN}`;
  try {
    const p = await fetch(postUrl, { method: "POST" });
    const pd = await p.json();
    console.log("Switch attempt:", JSON.stringify(pd).slice(0, 300));
  } catch (e: any) {
    console.log("Switch attempt FAILED:", e.message);
  }

  await readMode("After");
}

main().catch((e) => {
  console.error("Failed:", e.message);
  process.exit(1);
});