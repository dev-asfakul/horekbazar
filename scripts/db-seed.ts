// npm run db:seed — loads the generated sample catalogue (catalogue/horekbazar/) into a DEVELOPMENT
// database (name ending in "_dev"; refused otherwise). Owner change to D11, 2026-10-22.
//   npm run db:seed                         dry run: prints what would be created, writes nothing
//   npm run db:seed -- --confirm            creates missing sample categories, products, variants
//   npm run db:seed -- --remove-samples     dry run of removing every sample: true record
//   npm run db:seed -- --remove-samples --confirm
// Prints the database name and counts, never the URI. See lib/db/seed-samples.ts for the guarantees.
import { readFile } from "node:fs/promises";
import { closeDatabase, databaseConfig, DatabaseNotReadyError, getClient, getDatabase } from "../lib/adapters/db/client.ts";
import { removeSamples, seedSamples, SeedRefusedError, type SamplePackage } from "../lib/db/seed-samples.ts";

const args = new Set(process.argv.slice(2));
const unknown = [...args].filter((a) => a !== "--confirm" && a !== "--remove-samples");
if (unknown.length) {
  console.error(`Unknown option(s): ${unknown.join(" ")}. Use --confirm and/or --remove-samples.`);
  process.exit(2);
}
const confirm = args.has("--confirm");

try {
  const db = await getDatabase();
  const client = getClient(databaseConfig(process.env)!);
  console.log(`database: ${db.databaseName}`);
  console.log(`mode:     ${confirm ? "WRITE (--confirm)" : "dry run (add --confirm to write)"}`);
  if (args.has("--remove-samples")) {
    const r = await removeSamples(db, client, { confirm });
    console.log(`${confirm ? "removed" : "would remove"}: ${r.categories} categories, ${r.products} products, ${r.variants} variants, ${r.stock} stock rows, ${r.ledger} ledger rows (sample: true only)`);
  } else {
    const root = new URL("../catalogue/horekbazar/", import.meta.url);
    const pkg: SamplePackage = {
      categories: JSON.parse(await readFile(new URL("categories.json", root), "utf8")).categories,
      products: JSON.parse(await readFile(new URL("products.json", root), "utf8")).products,
    };
    console.log(`package:  ${pkg.categories.length} categories, ${pkg.products.length} products, ${pkg.products.reduce((n, p) => n + p.variants.length, 0)} variants`);
    const r = await seedSamples(db, client, pkg, { confirm });
    for (const k of ["categories", "products", "variants"] as const) {
      const x = r[k];
      console.log(`${k.padEnd(10)} ${confirm ? "created" : "to create"}: ${x.create}, already present (sample): ${x.existingSample}, skipped (slug/SKU used by a real record): ${x.conflict.length}${x.conflict.length ? ` → ${x.conflict.slice(0, 10).join(", ")}` : ""}`);
    }
  }
} catch (error) {
  if (error instanceof SeedRefusedError) console.error(`Refused: ${error.message}`);
  else if (error instanceof DatabaseNotReadyError) console.error(`Cannot seed: ${error.message}. See README.md → Database.`);
  else console.error(`Seed failed: ${error instanceof Error ? error.message.replace(/\/\/[^/\s@]+@/g, "//***@") : "unknown error"}`);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
