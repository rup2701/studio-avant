import "server-only";
import crypto from "node:crypto";
import { cookies, headers } from "next/headers";
import { and, count, desc, eq, gt, lt } from "drizzle-orm";
import { db } from "../db";
import { loginAttempts, ownerSessions } from "../db/schema";

export const SESSION_COOKIE = "sa_owner";
const SESSION_DAYS = 7;
const MAX_FAILS = 5;
const WINDOW_MS = 15 * 60 * 1000;

/** Hash format: scrypt:<saltHex>:<hashHex>. Create one with `npm run hash-password`. */
export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string | undefined) {
  if (!stored) return false;
  const [kind, saltHex, hashHex] = stored.split(":");
  if (kind !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

function sha256(s: string) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

export async function clientIp() {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  return (fwd?.split(",")[0]?.trim() || h.get("x-real-ip") || "local").slice(0, 64);
}

export async function lockStatus(ip: string): Promise<{ locked: boolean; minutesLeft: number }> {
  const since = new Date(Date.now() - WINDOW_MS);
  const rows = await db
    .select()
    .from(loginAttempts)
    .where(and(eq(loginAttempts.ip, ip), gt(loginAttempts.at, since)))
    .orderBy(desc(loginAttempts.at));
  if (rows.length < MAX_FAILS) return { locked: false, minutesLeft: 0 };
  const until = rows[0].at.getTime() + WINDOW_MS;
  return { locked: true, minutesLeft: Math.max(1, Math.ceil((until - Date.now()) / 60000)) };
}

export type SignInResult = { ok: true } | { ok: false; message: string };

export async function signIn(email: string, password: string): Promise<SignInResult> {
  const ip = await clientIp();
  const lock = await lockStatus(ip);
  if (lock.locked) {
    return {
      ok: false,
      message: `Too many failed attempts. Sign-in is paused for ${lock.minutesLeft} more minute${lock.minutesLeft === 1 ? "" : "s"}. Please try again later.`,
    };
  }
  const ownerEmail = process.env.OWNER_EMAIL?.trim().toLowerCase();
  const emailOk = !!ownerEmail && email.trim().toLowerCase() === ownerEmail;
  // Always run the hash comparison so timing does not reveal which part was wrong.
  const passOk = verifyPassword(password, process.env.OWNER_PASSWORD_HASH);
  if (!(emailOk && passOk)) {
    await db.insert(loginAttempts).values({ ip });
    await db.delete(loginAttempts).where(lt(loginAttempts.at, new Date(Date.now() - 24 * 3600 * 1000)));
    return { ok: false, message: "That email or password is not right. Please check both and try again." };
  }
  await db.delete(loginAttempts).where(eq(loginAttempts.ip, ip));
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000);
  await db.insert(ownerSessions).values({ tokenHash: sha256(token), expiresAt });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: !!process.env.VERCEL,
    path: "/",
    expires: expiresAt,
  });
  return { ok: true };
}

export async function signOut() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(ownerSessions).where(eq(ownerSessions.tokenHash, sha256(token)));
  jar.delete(SESSION_COOKIE);
}

/** True when the request carries a valid owner session. */
export async function isOwner(): Promise<boolean> {
  try {
    const jar = await cookies();
    const token = jar.get(SESSION_COOKIE)?.value;
    if (!token) return false;
    const rows = await db
      .select({ n: count() })
      .from(ownerSessions)
      .where(and(eq(ownerSessions.tokenHash, sha256(token)), gt(ownerSessions.expiresAt, new Date())));
    return (rows[0]?.n ?? 0) > 0;
  } catch {
    return false;
  }
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
  }
}

/** Call at the top of every owner server action and API route. */
export async function requireOwner() {
  if (!(await isOwner())) throw new UnauthorizedError();
}
