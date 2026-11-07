/**
 * TEMP helper (3 nov 2026) — lire les souscriptions webhook AU NIVEAU APP
 * (GET graph.facebook.com /{app-id}/subscriptions) pour les deux apps Meta :
 *  - app webhook  stoiczodiac-dm (FACEBOOK_APP_ID / FACEBOOK_APP_SECRET)
 *  - app OAuth IG StoicZodiac-IG (INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET)
 *
 * Lecture seule, aucun secret affiché (seulement callback_url + champs).
 * But : voir si l'objet "instagram" est configuré au niveau app, avec QUELS
 * champs cochés ("comments" seul, ou "comments,messages,messaging_postbacks").
 * C'est LE filtre silencieux qui peut laisser passer les commentaires mais
 * bloquer les messages entrants.
 */
import "dotenv/config";
import { requireEnv } from "../lib/env";

const API_VER = process.env.META_GRAPH_API_VERSION || "v25.0";

async function checkApp(label: string, id: string, secret: string) {
  const url = `https://graph.facebook.com/${API_VER}/${id}/subscriptions?access_token=${id}|${secret}`;
  try {
    const r = await fetch(url);
    const d = await r.json();
    if (d.error) {
      console.log(`${label} (${id}) → ERREUR ${d.error.code}: ${d.error.message}`);
      return;
    }
    const rows = d.data ?? [];
    console.log(`${label} (${id}) : ${rows.length} souscription(s)`);
    for (const s of rows) {
      console.log(`  object=${s.object}`);
      console.log(`  callback=${s.callback_url}`);
      console.log(`  fields=[${(s.fields ?? []).join(", ")}]`);
    }
    if (rows.length === 0) console.log("  → AUCUNE souscription webhook configurée");
  } catch (e: any) {
    console.log(`${label} → FAILED ${e.message}`);
  }
}

async function main() {
  await checkApp("stoiczodiac-dm (webhook)", requireEnv("FACEBOOK_APP_ID"), requireEnv("FACEBOOK_APP_SECRET"));
  await checkApp("StoicZodiac-IG (OAuth IG)", requireEnv("INSTAGRAM_APP_ID"), requireEnv("INSTAGRAM_APP_SECRET"));
}

main().catch((e) => {
  console.error("Failed:", e.message);
  process.exit(1);
});