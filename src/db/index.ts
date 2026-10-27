import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { __pool?: Pool };

function createPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return new Pool({ connectionString: url, max: 10, connectionTimeoutMillis: 5000 });
}

export const pool = globalForDb.__pool ?? (globalForDb.__pool = createPool());
export const db = drizzle(pool, { schema });
export { schema };
