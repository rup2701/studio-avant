/** Startup check: a deployed build refuses to start without object storage for photos. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { assertStorageReady } = await import("./lib/startup-check");
  assertStorageReady();
}
