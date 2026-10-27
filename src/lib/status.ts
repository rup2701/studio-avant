import { count, desc, gt } from "drizzle-orm";
import { db } from "../db";
import { products, systemEvents } from "../db/schema";
import { storageStatus } from "./storage";
import { TEMPLATE_VERSION } from "../config/store";

export async function getStatus() {
  let database: { ok: boolean; message: string; works?: number } = { ok: false, message: "" };
  try {
    const [{ n }] = await db.select({ n: count() }).from(products);
    database = { ok: true, message: "The database is reachable.", works: n };
  } catch (e) {
    database = { ok: false, message: "The database can't be reached right now. Shoppers see a “having a moment” page. Check the connection string and the database provider's status page." };
  }
  let events: { id: number; kind: string; message: string; createdAt: Date }[] = [];
  try {
    events = await db
      .select()
      .from(systemEvents)
      .where(gt(systemEvents.createdAt, new Date(Date.now() - 14 * 24 * 3600 * 1000)))
      .orderBy(desc(systemEvents.createdAt))
      .limit(20);
  } catch {}
  return { database, storage: storageStatus(), events, template: TEMPLATE_VERSION };
}
