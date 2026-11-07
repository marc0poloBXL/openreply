/**
 * TMP — Vérifie si un pageToken est stocké en base pour IG_USER_ID.
 * Aucun secret affiché, juste un booléen.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
const { PrismaClient } = require("../app/generated/prisma/client");

const adapter = new PrismaPg(process.env["DATABASE_URL"]!);
const prisma = new PrismaClient({ adapter });

const IG_USER_ID = "17841438935909153";

async function main() {
  const account = await prisma.instagramAccount.findUnique({
    where: { instagramId: IG_USER_ID },
    select: { id: true, pageToken: true, accessToken: true },
  });
  if (!account) {
    console.log("InstagramAccount not found for", IG_USER_ID);
    process.exit(1);
  }
  console.log("Compte trouvé        :", account.id);
  console.log("pageToken présent     :", account.pageToken ? "OUI ✅" : "NON ❌");
  console.log("pageToken length      :", account.pageToken?.length ?? 0);
  console.log("accessToken présent   :", account.accessToken ? "OUI" : "NON");
}

main().catch((e) => {
  console.error("Failed:", e.message);
  process.exit(1);
});