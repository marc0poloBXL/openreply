/**
 * TEMP helper (4 nov 2026) — LECTURE SEULE, AUCUN secret affiché.
 * Affiche les NOMS EXACTS des champs de la souscription webhook au niveau app
 * (object=instagram). Question décisive : "messages" y est-il coché ?
 */
import "dotenv/config";
import { requireEnv } from "../lib/env";

const API_VER = process.env.META_GRAPH_API_VERSION || "v25.0";

async function main() {
  const id = requireEnv("FACEBOOK_APP_ID");
  const secret = requireEnv("FACEBOOK_APP_SECRET");
  const url = `https://graph.facebook.com/${API_VER}/${id}/subscriptions?access_token=${id}|${secret}`;
  const r = await fetch(url);
  const d = await r.json();
  if (d.error) {
    console.log("ERREUR", d.error?.code, d.error?.message);
    return;
  }
  for (const s of d.data ?? []) {
    if (s.object !== "instagram") continue;
    const names = (s.fields ?? []).map((f: any) => f.name ?? f.field ?? "(?)");
    console.log("object=instagram");
    console.log("callback:", s.callback_url);
    console.log("active:", s.active);
    console.log("champs EXACTS:", JSON.stringify(names));
  }
}

main().catch((e) => {
  console.error("Failed:", e.message);
  process.exit(1);
});