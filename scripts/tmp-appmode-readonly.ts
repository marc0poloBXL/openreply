/**
 * TEMP helper (4 nov 2026) — LECTURE SEULE.
 * Affiche le nom et le mode actuel (development/live) de l'app Meta.
 * Aucun POST, aucune modification.
 */
import "dotenv/config";
const id = process.env.FACEBOOK_APP_ID ?? "";
const secret = process.env.FACEBOOK_APP_SECRET ?? "";
const ver = process.env.META_GRAPH_API_VERSION || "v26.0";

async function main() {
  const url = `https://graph.facebook.com/${ver}/${id}?fields=name,app_mode&access_token=${id}|${secret}`;
  const r = await fetch(url);
  const d = await r.json();
  if (d.error) {
    console.log(`ERREUR ${d.error.code}: ${d.error.message}`);
  } else {
    console.log(`Nom     : ${d.name}`);
    console.log(`Mode    : ${d.app_mode}`);
  }
}

main().catch((e) => {
  console.error("Failed:", e.message);
  process.exit(1);
});