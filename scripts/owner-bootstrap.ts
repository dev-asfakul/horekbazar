// npm run owner:bootstrap [-- --sync-password]
// Creates the first Owner from OWNER_EMAIL / OWNER_PASSWORD / OWNER_NAME (deployment credentials;
// lib/modules/identity/bootstrap.ts). Never prints the password. With --sync-password, sets the
// matching Owner's password to OWNER_PASSWORD and signs them out everywhere. Audited.
import { closeDatabase, databaseConfig, getClient, getDatabase } from "../lib/adapters/db/client.ts";
import { bootstrapOwner } from "../lib/modules/identity/bootstrap.ts";

const args = process.argv.slice(2);
if (args.some((a) => a !== "--sync-password")) {
  console.error("Usage: npm run owner:bootstrap [-- --sync-password]");
  process.exit(2);
}
const MESSAGES: Record<string, string> = {
  created: "Owner created from OWNER_EMAIL. Sign in at /admin/login and set up two-step verification.",
  exists: "An Owner already exists. Nothing changed (use --sync-password to set the Owner's password from OWNER_PASSWORD).",
  password_synced: "Owner password set from OWNER_PASSWORD; every session was signed out.",
  not_configured: "OWNER_EMAIL and OWNER_PASSWORD are not set. Nothing changed.",
  invalid_email: "OWNER_EMAIL is not a valid address. Nothing changed.",
  weak_password: "OWNER_PASSWORD must be 10–128 characters. Nothing changed.",
  email_taken: "A customer account already uses OWNER_EMAIL. Nothing changed.",
  other_owner: "The existing Owner uses a different email than OWNER_EMAIL. Nothing changed.",
  not_owner: "That account is not the Owner. Nothing changed.",
};
try {
  const db = await getDatabase();
  const client = getClient(databaseConfig(process.env)!);
  const r = await bootstrapOwner(db, client, process.env, { syncPassword: args.includes("--sync-password") });
  const key = "reason" in r ? r.reason : r.result;
  console.log(`database: ${db.databaseName}\n${MESSAGES[key]}`);
  if (r.result === "refused") process.exitCode = 1;
} catch (error) {
  console.error(`Owner bootstrap failed: ${(error as Error).message}`);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
