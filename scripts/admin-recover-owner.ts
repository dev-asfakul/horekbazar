// npm run admin:recover-owner -- owner@example.com
// Clears the Owner's two-step verification and signs them out everywhere (lost authenticator and
// backup codes). Needs the deployment's database credentials, so only the deployer can run it. Audited.
import { closeDatabase, DatabaseNotReadyError, getDatabase } from "../lib/adapters/db/client.ts";
import { recoverOwner } from "../lib/modules/identity/staff.ts";

const email = process.argv[2];
if (!email || !email.includes("@")) {
  console.error("Usage: npm run admin:recover-owner -- owner@example.com");
  process.exit(1);
}
try {
  const db = await getDatabase();
  const result = await recoverOwner(db, email);
  if ("error" in result) {
    console.error(result.error === "not_owner" ? "That account is not an owner. Nothing changed." : "No account uses that email. Nothing changed.");
    process.exitCode = 1;
  } else {
    console.log("Two-step verification cleared and every session signed out. Sign in, then set up two-step verification again.");
  }
} catch (error) {
  console.error(error instanceof DatabaseNotReadyError ? `Cannot connect: ${error.message}` : "Recovery failed.");
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
