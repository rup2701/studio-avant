/** Startup check: a deployed build refuses to start without object storage for photos. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { storageStatus } = await import("./lib/storage");
  const s = storageStatus();
  if (!s.ok) throw new Error(`Startup check failed: ${s.message}`);
}
