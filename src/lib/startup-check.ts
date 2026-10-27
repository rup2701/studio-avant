import { storageStatus } from "./storage";

/** A deployed build refuses to start without object storage for photos (E-031). */
export function assertStorageReady() {
  const s = storageStatus();
  if (!s.ok) throw new Error(`Startup check failed: ${s.message}`);
}
