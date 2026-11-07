/**
 * TEMP helper (4 nov 2026) — LECTURE SEULE.
 * Vérifie si l'Instagram account @stoiczodiac (IG_USER_ID) est connecté
 * à une Facebook Page. C'est LE prérequis pour utiliser la Conversations API
 * (graph.facebook.com/me/conversations) avec un Page Token.
 *
 * Appel : GET /{ig-user-id}?fields=connected_page&access_token={app_token}
 * sur graph.facebook.com (PAS graph.instagram.com).
 *
 * Aucun secret affiché — juste le nom de la page et son ID.
 */
import "dotenv/config";

const API_VER = process.env.META_GRAPH_API_VERSION || "v26.0";
const IG_USER_ID = "17841438935909153";

async function main() {
  const fbId = (process.env.FACEBOOK_APP_ID ?? "").trim();
  const fbSecret = (process.env.FACEBOOK_APP_SECRET ?? "").trim();
  if (!fbId || !fbSecret) {
    console.error("FACEBOOK_APP_ID ou FACEBOOK_APP_SECRET manquants");
    process.exit(1);
  }

  // App Token (pas un User Token, pas un Page Token)
  const appToken = `${fbId}|${fbSecret}`;

  const url = `https://graph.facebook.com/${API_VER}/${IG_USER_ID}?fields=connected_page&access_token=${appToken}`;
  console.log(`GET graph.facebook.com/${API_VER}/${IG_USER_ID}?fields=connected_page`);

  const r = await fetch(url);
  const d = await r.json();

  if (d.error) {
    console.log(`\nERREUR ${d.error.code}: ${d.error.message}`);
    if (d.error.code === 100) {
      console.log("\n→ Le compte Instagram n'est probablement PAS connecté à une Facebook Page,");
      console.log("  OU le token app n'a pas les permissions suffisantes pour le lire.");
      console.log("\nSolution: https://business.facebook.com/settings/ → Instagram → connecter le compte.");
    }
    if (d.error.code === 190) {
      console.log("\n→ Token invalide.");
    }
    process.exit(1);
  }

  console.log(`ID Instagram     : ${d.id}`);

  if (d.connected_page) {
    console.log(`\n✅ CONNECTÉ à une Facebook Page !`);
    console.log(`   Page ID  : ${d.connected_page.id}`);
    console.log(`   Page name: ${d.connected_page.name}`);
    console.log(`\n→ Tu peux utiliser la Conversations API avec un Page Token.`);
    console.log(`→ Le Page Token s'obtient via GET /${d.connected_page.id}?fields=access_token`);
  } else {
    console.log(`\n❌ PAS de Facebook Page connectée.`);
    console.log(`\n→ Les messages 'requests' ne déclenchent PAS de webhook tant que`);
    console.log(`  le compte Instagram n'est pas lié à une Page.`);
    console.log(`\nSolution : https://business.facebook.com/settings/`);
    console.log(`  1. Va dans 'Instagram accounts'`);
    console.log(`  2. Connecte @stoiczodiac à une Page`);
  }
}

main().catch((e) => {
  console.error("Failed:", e.message);
  process.exit(1);
});