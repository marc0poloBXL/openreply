/**
 * TEMP helper (3 nov 2026) — FACTS ONLY (aucun secret affiché, que des booléens
 * et des comparaisons). Répond à trois questions :
 *  1. Quels champs EXACTS sont cochés sur la souscription app object=instagram ?
 *  2. Quelle app est utilisée pour l'OAuth IG (4481663008753999 ou autre) ?
 *  3. L'app OAuth IG (4481663008753999) a-t-elle une souscription webhook ?
 */
import "dotenv/config";
import { requireEnv } from "../lib/env";

const API_VER = process.env.META_GRAPH_API_VERSION || "v25.0";

function q(label: string, a: string | undefined, b: string) {
  console.log(`${label}: ${(a ?? "").trim() === b}`);
}

async function main() {
  const fba = (process.env.FACEBOOK_APP_ID ?? "").trim();
  const fbs = (process.env.FACEBOOK_APP_SECRET ?? "").trim();
  const iga = (process.env.INSTAGRAM_APP_ID ?? "").trim();
  const igs = (process.env.INSTAGRAM_APP_SECRET ?? "").trim();

  console.log("— Q2 : quelle app est utilisée pour l'OAuth IG ? —");
  q("INSTAGRAM_APP_ID === 4481663008753999 (app IG 'StoicZodiac-IG')", iga, "4481663008753999");
  q("INSTAGRAM_APP_ID === FACEBOOK_APP_ID (même app webhook)", iga, fba);
  console.log(`INSTAGRAM_APP_ID (longueur): ${iga.length}`);
  console.log(`INSTAGRAM_APP_ID (premiers chiffres): ${iga.slice(0, 4)}…${iga.slice(-4)}`);
  q("INSTAGRAM_APP_SECRET === FACEBOOK_APP_SECRET", igs, fbs);

  // Q1 : champs exacts de la souscription app object=instagram
  console.log("\n— Q1 : champs exacts (app 1051360407668084, object=instagram) —");
  const url = `https://graph.facebook.com/${API_VER}/${fba}/subscriptions?access_token=${fba}|${fbs}`;
  const r = await fetch(url);
  const d = await r.json();
  if (d.error) {
    console.log(`ERREUR ${d.error.code}: ${d.error.message}`);
  } else {
    for (const s of d.data ?? []) {
      if (s.object !== "instagram") continue;
      console.log("callback:", s.callback_url);
      console.log("verify_token:", s.verify_token ?? "(aucun)");
      console.log("fields exacts (JSON):", JSON.stringify(s.fields));
      console.log("names:", (s.fields ?? []).map((f: any) => f.name ?? f.field ?? JSON.stringify(f)).join(", "));
    }
  }

  // Q3 : l'app OAuth IG 4481663008753999 a-t-elle une souscription webhook ?
  // (via le token IGAA en BDD — souvent refusé, mais on tente)
  console.log("\n— Q3 : souscriptions de l'app OAuth IG 4481663008753999 —");
  const igaaUrl = `https://graph.facebook.com/${API_VER}/4481663008753999/subscriptions?access_token=IGAAlLSok3W1JBZAGFZA`;
  const ir = await fetch(igaaUrl);
  const id = await ir.json();
  if (id.error) {
    console.log(`(attendu) ERREUR ${id.error.code}: ${id.error.message}`);
  } else {
    console.log(JSON.stringify(id.data ?? []));
  }
}

main().catch((e) => {
  console.error("Failed:", e.message);
  process.exit(1);
});