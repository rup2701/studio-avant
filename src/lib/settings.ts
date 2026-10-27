import { db } from "../db";
import { settings } from "../db/schema";
import { store } from "../config/store";

export type SiteSettings = {
  introLine: string;
  artistName: string;
  statement: string;
  bio: string;
  portraitUrl: string | null;
  portraitAlt: string;
  followLinks: { label: string; url: string }[];
};

export async function getSettings(): Promise<SiteSettings> {
  const rows = await db.select().from(settings);
  const m = new Map(rows.map((r) => [r.key, r.value]));
  let follow: { label: string; url: string }[] = [...store.defaults.followLinks];
  try {
    const raw = m.get("followLinks");
    if (raw) follow = JSON.parse(raw);
  } catch {}
  return {
    introLine: m.get("introLine") ?? store.defaults.introLine,
    artistName: m.get("artistName") ?? store.defaults.artistName,
    statement: m.get("statement") ?? store.defaults.statement,
    bio: m.get("bio") ?? store.defaults.bio,
    portraitUrl: m.get("portraitUrl") || null,
    portraitAlt: m.get("portraitAlt") ?? store.defaults.portraitAlt,
    followLinks: follow,
  };
}

export async function setSetting(key: string, value: string) {
  await db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } });
}
