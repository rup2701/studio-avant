import "dotenv/config";
import { execFileSync } from "node:child_process";
import { db, pool } from "../src/db";
import { loginAttempts, settings } from "../src/db/schema";

/** Reload the sample catalog and reset owner-edited content so every run starts from the same store. */
export default async function globalSetup() {
  execFileSync("npx", ["tsx", "scripts/seed.ts", "--confirm"], { stdio: "inherit" });
  await db.delete(settings);
  await db.delete(loginAttempts);
  await pool.end();
}
