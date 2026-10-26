import "dotenv/config";
import pg from "pg";

async function main() {
  const pool = new pg.Pool({ connectionString: process.env["DATABASE_URL"] });
  const r = await pool.query("SELECT 1 AS ok");
  console.log("DB OK:", JSON.stringify(r.rows));
  await pool.end();
}

main().catch((e) => {
  console.error("DB FAIL:", e.message);
  process.exit(1);
});