"use server";
import { redirect } from "next/navigation";
import { and, asc, count, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  categories,
  categorySlugHistory,
  commissionInquiries,
  emailSignups,
  exhibitions,
  optionValues,
  productImages,
  productOptions,
  products,
  series,
} from "@/db/schema";
import { isOwner, signIn, signOut } from "@/lib/auth";
import { getStorage } from "@/lib/storage";
import { setSetting } from "@/lib/settings";
import { SLUG_RE, parsePriceToCents, slugify } from "@/lib/utils";
import { SALE_STATUSES } from "@/config/store";

async function guard() {
  if (!(await isOwner())) redirect("/admin/login");
}

function back(path: string, kind: "msg" | "err", text: string, extra?: Record<string, string>): never {
  const q = new URLSearchParams({ [kind]: text, ...(extra ?? {}) });
  redirect(`${path}?${q.toString()}`);
}

/* ---------------------------------------------------------------- sign in / out */

export type SignInState = { message?: string };

export async function signInAction(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const res = await signIn(email, password);
  if (!res.ok) return { message: res.message };
  redirect("/admin");
}

export async function signOutAction() {
  await signOut();
  redirect("/admin/login");
}

/* ---------------------------------------------------------------- works */

export type WorkFormState = {
  ok: boolean;
  message?: string;
  errors?: Record<string, string>;
};

const deltaRe = /^[+-]?\d+(\.\d{1,2})?$/;

const optionsSchema = z
  .array(
    z.object({
      id: z.string().optional(),
      name: z.string().trim().min(1, "Every option needs a name, such as Size or Paper.").max(40, "Option names can be 40 characters at most."),
      required: z.boolean(),
      values: z
        .array(
          z.object({
            id: z.string().optional(),
            label: z.string().trim().min(1, "Every option value needs a label.").max(40, "Value labels can be 40 characters at most."),
            priceDelta: z.string().trim(),
            soldOut: z.boolean(),
            isDefault: z.boolean(),
          }),
        )
        .min(1, "Each option needs at least one value.")
        .max(20, "An option can have 20 values at most."),
    }),
  )
  .max(5, "A work can have 5 options at most.");

export async function saveWork(_prev: WorkFormState, formData: FormData): Promise<WorkFormState> {
  await guard();
  const id = String(formData.get("id") ?? "") || null;
  const errors: Record<string, string> = {};
  const name = String(formData.get("name") ?? "").trim();
  let slug = String(formData.get("slug") ?? "").trim();
  const note = String(formData.get("note") ?? "");
  const priceRaw = String(formData.get("price") ?? "").trim();
  const categoryId = String(formData.get("categoryId") ?? "");
  const seriesId = String(formData.get("seriesId") ?? "") || null;
  const originalProductId = String(formData.get("originalProductId") ?? "") || null;
  const yearRaw = String(formData.get("year") ?? "").trim();
  const medium = String(formData.get("medium") ?? "").trim();
  const sizeInches = String(formData.get("sizeInches") ?? "").trim();
  const stockRaw = String(formData.get("stock") ?? "").trim();
  const saleStatus = String(formData.get("saleStatus") ?? "available");
  const personalizationEnabled = formData.get("personalizationEnabled") === "on";
  const maxLenRaw = String(formData.get("personalizationMaxLength") ?? "40").trim();

  if (!name) errors.name = "Please enter a title for the work.";
  else if (name.length > 80) errors.name = "The title can be 80 characters at most.";

  if (!slug && name) slug = slugify(name);
  if (!slug) errors.slug = errors.slug ?? "Please enter a slug (lowercase letters, numbers and hyphens).";
  else if (!SLUG_RE.test(slug) || slug.length > 80)
    errors.slug = "Use lowercase letters, numbers and single hyphens only, for example “low-tide-morning”.";

  if (note.length > 2000) errors.note = `The note can be 2000 characters at most (it is ${note.length}).`;

  let priceCents: number | null = null;
  if (priceRaw !== "") {
    priceCents = parsePriceToCents(priceRaw);
    if (priceCents == null) errors.price = "Enter a price greater than 0 in US dollars with at most two decimals, for example 120.00.";
  }

  let year: number | null = null;
  if (yearRaw !== "") {
    const y = Number(yearRaw);
    if (!Number.isInteger(y) || y < 1000 || y > 2100) errors.year = "Enter a four-digit year, for example 2024.";
    else year = y;
  }
  if (medium.length > 120) errors.medium = "Medium can be 120 characters at most.";
  if (sizeInches.length > 60) errors.sizeInches = "Size can be 60 characters at most.";

  let stock = 0;
  if (!/^\d+$/.test(stockRaw) || Number(stockRaw) > 100000) errors.stock = "Stock must be a whole number, 0 or more.";
  else stock = Number(stockRaw);

  if (!SALE_STATUSES.some((s) => s.value === saleStatus)) errors.saleStatus = "Choose one of the sale statuses.";

  const [cat] = categoryId ? await db.select().from(categories).where(eq(categories.id, categoryId)) : [];
  if (!cat) errors.categoryId = "Please choose a category.";
  if (seriesId) {
    const [s] = await db.select().from(series).where(eq(series.id, seriesId));
    if (!s) errors.seriesId = "That series no longer exists.";
  }
  if (originalProductId) {
    const [o] = await db.select().from(products).where(eq(products.id, originalProductId));
    if (!o || o.id === id) errors.originalProductId = "Choose a different work as the original.";
  }
  let maxLen = 40;
  if (personalizationEnabled) {
    const m = Number(maxLenRaw);
    if (!Number.isInteger(m) || m < 1 || m > 100) errors.personalizationMaxLength = "Enter a limit between 1 and 100 characters.";
    else maxLen = m;
  }

  // Options (as JSON from the options editor)
  type OptIn = z.infer<typeof optionsSchema>;
  let opts: OptIn = [];
  try {
    const raw = JSON.parse(String(formData.get("optionsJson") ?? "[]"));
    const parsed = optionsSchema.safeParse(raw);
    if (!parsed.success) errors.options = parsed.error.issues[0].message;
    else {
      opts = parsed.data;
      for (const o of opts) {
        if (o.values.filter((v) => v.isDefault).length > 1) errors.options = `Option “${o.name}” can have only one default value.`;
        for (const v of o.values) {
          if (v.priceDelta !== "" && !deltaRe.test(v.priceDelta))
            errors.options = `The price change “${v.priceDelta}” for “${v.label}” is not valid. Use an amount like 20.00 or -5.00.`;
        }
        const labels = o.values.map((v) => v.label.toLowerCase());
        if (new Set(labels).size !== labels.length) errors.options = `Option “${o.name}” has two values with the same label.`;
      }
    }
  } catch {
    errors.options = "The options could not be read. Please reload the page and try again.";
  }

  // Slug uniqueness
  if (!errors.slug) {
    const clash = await db
      .select({ id: products.id, name: products.name })
      .from(products)
      .where(id ? and(eq(products.slug, slug), ne(products.id, id)) : eq(products.slug, slug));
    if (clash.length > 0) {
      let n = 2;
      let suggestion = `${slug}-${n}`;
      while ((await db.select({ id: products.id }).from(products).where(eq(products.slug, suggestion))).length > 0) {
        n++;
        suggestion = `${slug}-${n}`;
      }
      errors.slug = `The slug “${slug}” is already used by “${clash[0].name}”. Try “${suggestion}” instead.`;
    }
  }

  // A published work that can be bought must have a price.
  let existing: typeof products.$inferSelect | undefined;
  if (id) {
    [existing] = await db.select().from(products).where(eq(products.id, id));
    if (!existing) return { ok: false, message: "That work no longer exists.", errors };
    if (existing.published && saleStatus === "available" && priceCents == null && !errors.price)
      errors.price = "A published work that is available needs a price. Enter one, or unpublish the work first.";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, message: "The work was not saved. Please fix the problems marked below.", errors };
  }

  const values = {
    slug,
    name,
    note,
    priceCents,
    categoryId,
    seriesId,
    originalProductId,
    year,
    medium,
    sizeInches,
    stock,
    saleStatus,
    personalizationEnabled,
    personalizationMaxLength: maxLen,
    updatedAt: new Date(),
  };

  let workId = id;
  await db.transaction(async (tx) => {
    if (!workId) {
      const [{ m }] = await tx.select({ m: sql<number>`coalesce(max(${products.position}), -1)::int` }).from(products);
      const [row] = await tx.insert(products).values({ ...values, position: m + 1, published: false }).returning({ id: products.id });
      workId = row.id;
    } else {
      await tx.update(products).set(values).where(eq(products.id, workId));
    }
    // Sync options by id so cart lines that reference existing values stay valid.
    const existingOpts = await tx.select().from(productOptions).where(eq(productOptions.productId, workId!));
    const keepOptIds = new Set(opts.map((o) => o.id).filter((x): x is string => !!x && existingOpts.some((e) => e.id === x)));
    for (const e of existingOpts) if (!keepOptIds.has(e.id)) await tx.delete(productOptions).where(eq(productOptions.id, e.id));
    for (const [oi, o] of opts.entries()) {
      let optionId = o.id && keepOptIds.has(o.id) ? o.id : null;
      if (optionId) {
        await tx.update(productOptions).set({ name: o.name, required: o.required, position: oi }).where(eq(productOptions.id, optionId));
      } else {
        const [row] = await tx
          .insert(productOptions)
          .values({ productId: workId!, name: o.name, required: o.required, position: oi })
          .returning({ id: productOptions.id });
        optionId = row.id;
      }
      const existingVals = await tx.select().from(optionValues).where(eq(optionValues.optionId, optionId));
      const keepVals = new Set(o.values.map((v) => v.id).filter((x): x is string => !!x && existingVals.some((e) => e.id === x)));
      for (const e of existingVals) if (!keepVals.has(e.id)) await tx.delete(optionValues).where(eq(optionValues.id, e.id));
      for (const [vi, v] of o.values.entries()) {
        const delta = v.priceDelta === "" ? 0 : Math.round(parseFloat(v.priceDelta) * 100);
        const vals = { label: v.label, priceDeltaCents: delta, soldOut: v.soldOut, isDefault: v.isDefault, position: vi };
        if (v.id && keepVals.has(v.id)) await tx.update(optionValues).set(vals).where(eq(optionValues.id, v.id));
        else await tx.insert(optionValues).values({ optionId, ...vals });
      }
    }
  });

  if (!id) redirect(`/admin/works/${workId}?created=1`);
  const [photos] = await db.select({ n: count() }).from(productImages).where(eq(productImages.productId, workId!));
  const next = photos.n === 0 ? "Next: add photos below, then publish." : existing?.published ? "The change is live on the store." : "Next: publish it when you are ready.";
  return { ok: true, message: `Saved “${name}”. ${next}` };
}

export async function setPublished(workId: string, publish: boolean): Promise<WorkFormState> {
  await guard();
  const [p] = await db.select().from(products).where(eq(products.id, workId));
  if (!p) return { ok: false, message: "That work no longer exists." };
  if (publish) {
    const [photos] = await db.select({ n: count() }).from(productImages).where(eq(productImages.productId, workId));
    if (photos.n === 0) return { ok: false, message: "This work can't be published yet: it has no photo. Add at least one photo first." };
    if (p.saleStatus === "available" && p.priceCents == null)
      return { ok: false, message: "This work can't be published yet: it has no price. Set a price and save first." };
  }
  await db.update(products).set({ published: publish, updatedAt: new Date() }).where(eq(products.id, workId));
  return {
    ok: true,
    message: publish ? `“${p.name}” is published and visible to shoppers.` : `“${p.name}” is now a draft and hidden from shoppers.`,
  };
}

export async function deleteWork(workId: string) {
  await guard();
  const imgs = await db.select().from(productImages).where(eq(productImages.productId, workId));
  await db.delete(products).where(eq(products.id, workId));
  try {
    const storage = getStorage();
    for (const i of imgs) {
      await storage.remove(i.url);
      if (i.originalUrl !== i.url) await storage.remove(i.originalUrl);
    }
  } catch {}
  back("/admin", "msg", "The work was deleted. Past orders keep their own record of it.");
}

export async function moveWork(workId: string, dir: "up" | "down") {
  await guard();
  const rows = await db.select({ id: products.id }).from(products).orderBy(asc(products.position), asc(products.createdAt));
  const i = rows.findIndex((r) => r.id === workId);
  const j = dir === "up" ? i - 1 : i + 1;
  if (i === -1 || j < 0 || j >= rows.length) return;
  [rows[i], rows[j]] = [rows[j], rows[i]];
  for (const [pos, r] of rows.entries()) await db.update(products).set({ position: pos }).where(eq(products.id, r.id));
  redirect("/admin");
}

/* ---------------------------------------------------------------- photos */

export async function updatePhotoAlt(imageId: string, alt: string): Promise<WorkFormState> {
  await guard();
  const [img] = await db.select().from(productImages).where(eq(productImages.id, imageId));
  if (!img) return { ok: false, message: "That photo no longer exists." };
  const [p] = await db.select().from(products).where(eq(products.id, img.productId));
  const text = alt.trim().slice(0, 200) || p.name;
  await db.update(productImages).set({ alt: text }).where(eq(productImages.id, imageId));
  return { ok: true, message: "Alt text saved." };
}

async function orderedImages(productId: string) {
  return db.select().from(productImages).where(eq(productImages.productId, productId)).orderBy(asc(productImages.position));
}

export async function movePhoto(imageId: string, dir: "earlier" | "later" | "cover"): Promise<WorkFormState> {
  await guard();
  const [img] = await db.select().from(productImages).where(eq(productImages.id, imageId));
  if (!img) return { ok: false, message: "That photo no longer exists." };
  const list = await orderedImages(img.productId);
  const i = list.findIndex((x) => x.id === imageId);
  if (dir === "cover") {
    const [m] = list.splice(i, 1);
    list.unshift(m);
  } else {
    const j = dir === "earlier" ? i - 1 : i + 1;
    if (j < 0 || j >= list.length) return { ok: true, message: "" };
    [list[i], list[j]] = [list[j], list[i]];
  }
  for (const [pos, r] of list.entries()) await db.update(productImages).set({ position: pos }).where(eq(productImages.id, r.id));
  return { ok: true, message: dir === "cover" ? "That photo is now the cover." : "Photo order saved." };
}

export async function removePhoto(imageId: string): Promise<WorkFormState> {
  await guard();
  const [img] = await db.select().from(productImages).where(eq(productImages.id, imageId));
  if (!img) return { ok: false, message: "That photo no longer exists." };
  const [p] = await db.select().from(products).where(eq(products.id, img.productId));
  const list = await orderedImages(img.productId);
  if (p?.published && list.length === 1)
    return { ok: false, message: "A published work needs at least one photo. Unpublish it first, or add another photo before removing this one." };
  await db.delete(productImages).where(eq(productImages.id, imageId));
  try {
    const storage = getStorage();
    await storage.remove(img.url);
    if (img.originalUrl !== img.url) await storage.remove(img.originalUrl);
  } catch {}
  const rest = list.filter((x) => x.id !== imageId);
  for (const [pos, r] of rest.entries()) await db.update(productImages).set({ position: pos }).where(eq(productImages.id, r.id));
  return { ok: true, message: "Photo removed." };
}

/* ---------------------------------------------------------------- categories */

async function uniqueSlug(table: "categories" | "series", base: string, ignoreId?: string) {
  const root = base || "item";
  let slug = root;
  let n = 2;
  for (;;) {
    const t = table === "categories" ? categories : series;
    const rows = await db.select({ id: t.id }).from(t).where(eq(t.slug, slug));
    const history = table === "categories" ? await db.select().from(categorySlugHistory).where(eq(categorySlugHistory.oldSlug, slug)) : [];
    if (rows.every((r) => r.id === ignoreId) && history.length === 0) return slug;
    slug = `${root}-${n++}`;
  }
}

export async function addCategory(formData: FormData) {
  await guard();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) back("/admin/categories", "err", "Please enter a name for the category.");
  if (name.length > 60) back("/admin/categories", "err", "Category names can be 60 characters at most.", { name });
  const dup = await db.select({ id: categories.id }).from(categories).where(sql`lower(${categories.name}) = ${name.toLowerCase()}`);
  if (dup.length) back("/admin/categories", "err", `There is already a category called “${name}”.`, { name });
  const [{ m }] = await db.select({ m: sql<number>`coalesce(max(${categories.position}), -1)::int` }).from(categories);
  await db.insert(categories).values({ name, slug: await uniqueSlug("categories", slugify(name)), position: m + 1 });
  back("/admin/categories", "msg", `Added the category “${name}”. Assign works to it from the work form; it shows to shoppers once it has a published work.`);
}

export async function renameCategory(formData: FormData) {
  await guard();
  const id = String(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  if (!name) back("/admin/categories", "err", "Please enter a name for the category.");
  if (name.length > 60) back("/admin/categories", "err", "Category names can be 60 characters at most.");
  const [c] = await db.select().from(categories).where(eq(categories.id, id));
  if (!c) back("/admin/categories", "err", "That category no longer exists.");
  const dup = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(sql`lower(${categories.name}) = ${name.toLowerCase()}`, ne(categories.id, id)));
  if (dup.length) back("/admin/categories", "err", `There is already a category called “${name}”.`);
  const newSlug = await uniqueSlug("categories", slugify(name), id);
  if (newSlug !== c.slug) {
    await db.insert(categorySlugHistory).values({ oldSlug: c.slug, categoryId: id }).onConflictDoNothing();
    // The new slug is live again, so it must not also redirect elsewhere.
    await db.delete(categorySlugHistory).where(eq(categorySlugHistory.oldSlug, newSlug));
  }
  await db.update(categories).set({ name, slug: newSlug }).where(eq(categories.id, id));
  back("/admin/categories", "msg", `Renamed to “${name}”. Every work in it follows, and the old web address still works.`);
}

export async function moveCategory(id: string, dir: "up" | "down") {
  await guard();
  const rows = await db.select({ id: categories.id }).from(categories).orderBy(asc(categories.position), asc(categories.name));
  const i = rows.findIndex((r) => r.id === id);
  const j = dir === "up" ? i - 1 : i + 1;
  if (i === -1 || j < 0 || j >= rows.length) return;
  [rows[i], rows[j]] = [rows[j], rows[i]];
  for (const [pos, r] of rows.entries()) await db.update(categories).set({ position: pos }).where(eq(categories.id, r.id));
  redirect("/admin/categories");
}

export async function deleteCategory(formData: FormData) {
  await guard();
  const id = String(formData.get("id"));
  const [c] = await db.select().from(categories).where(eq(categories.id, id));
  if (!c) back("/admin/categories", "err", "That category no longer exists.");
  const [{ n }] = await db.select({ n: count() }).from(products).where(eq(products.categoryId, id));
  if (n > 0) {
    back(
      "/admin/categories",
      "err",
      `“${c.name}” can't be deleted yet: ${n} ${n === 1 ? "work is" : "works are"} still in it. Move ${n === 1 ? "that work" : `those ${n} works`} to another category first.`,
    );
  }
  await db.delete(categories).where(eq(categories.id, id));
  back("/admin/categories", "msg", `Deleted the category “${c.name}”.`);
}

/* ---------------------------------------------------------------- series */

export async function addSeries(formData: FormData) {
  await guard();
  const title = String(formData.get("title") ?? "").trim();
  const text = String(formData.get("text") ?? "").trim();
  if (!title) back("/admin/series", "err", "Please enter a title for the series.", { text });
  if (title.length > 80) back("/admin/series", "err", "Series titles can be 80 characters at most.", { title, text });
  if (text.length > 1000) back("/admin/series", "err", "The series text can be 1000 characters at most.", { title });
  const [{ m }] = await db.select({ m: sql<number>`coalesce(max(${series.position}), -1)::int` }).from(series);
  await db.insert(series).values({ title, text, slug: await uniqueSlug("series", slugify(title)), position: m + 1 });
  back("/admin/series", "msg", `Added the series “${title}”. Choose it on a work to put the work in it.`);
}

export async function updateSeries(formData: FormData) {
  await guard();
  const id = String(formData.get("id"));
  const title = String(formData.get("title") ?? "").trim();
  const text = String(formData.get("text") ?? "").trim();
  if (!title) back("/admin/series", "err", "A series needs a title.");
  if (title.length > 80) back("/admin/series", "err", "Series titles can be 80 characters at most.");
  if (text.length > 1000) back("/admin/series", "err", "The series text can be 1000 characters at most.");
  await db.update(series).set({ title, text }).where(eq(series.id, id));
  back("/admin/series", "msg", `Saved “${title}”.`);
}

export async function moveSeries(id: string, dir: "up" | "down") {
  await guard();
  const rows = await db.select({ id: series.id }).from(series).orderBy(asc(series.position), asc(series.title));
  const i = rows.findIndex((r) => r.id === id);
  const j = dir === "up" ? i - 1 : i + 1;
  if (i === -1 || j < 0 || j >= rows.length) return;
  [rows[i], rows[j]] = [rows[j], rows[i]];
  for (const [pos, r] of rows.entries()) await db.update(series).set({ position: pos }).where(eq(series.id, r.id));
  redirect("/admin/series");
}

export async function deleteSeries(formData: FormData) {
  await guard();
  const id = String(formData.get("id"));
  const [s] = await db.select().from(series).where(eq(series.id, id));
  if (!s) back("/admin/series", "err", "That series no longer exists.");
  await db.delete(series).where(eq(series.id, id));
  back("/admin/series", "msg", `Deleted the series “${s.title}”. Its works stay in the store without a series.`);
}

/* ---------------------------------------------------------------- about, intro, links */

export async function saveAbout(formData: FormData) {
  await guard();
  const artistName = String(formData.get("artistName") ?? "").trim();
  const statement = String(formData.get("statement") ?? "").trim();
  const bio = String(formData.get("bio") ?? "").trim();
  const portraitAlt = String(formData.get("portraitAlt") ?? "").trim();
  if (!artistName) back("/admin/about", "err", "Please enter the artist's name.");
  if (artistName.length > 80) back("/admin/about", "err", "The artist's name can be 80 characters at most.");
  if (statement.length > 4000) back("/admin/about", "err", "The statement can be 4000 characters at most.");
  if (bio.length > 2000) back("/admin/about", "err", "The bio can be 2000 characters at most.");
  await setSetting("artistName", artistName);
  await setSetting("statement", statement);
  await setSetting("bio", bio);
  await setSetting("portraitAlt", portraitAlt || `Portrait of ${artistName}`);
  back("/admin/about", "msg", "Saved the About page. Open the store's About page to check it.");
}

export async function removePortrait() {
  await guard();
  await setSetting("portraitUrl", "");
  redirect("/admin/about?msg=" + encodeURIComponent("Portrait removed. The About page shows a placeholder."));
}

export async function saveHome(formData: FormData) {
  await guard();
  const intro = String(formData.get("introLine") ?? "").trim();
  if (!intro) back("/admin/home", "err", "Please write a line for the top of the home page.");
  if (intro.length > 200) back("/admin/home", "err", `The intro line can be 200 characters at most (it is ${intro.length}).`, { introLine: intro });
  await setSetting("introLine", intro);
  back("/admin/home", "msg", "Saved the intro line. It now shows at the top of the home page.");
}

export async function saveFollowLinks(formData: FormData) {
  await guard();
  const links: { label: string; url: string }[] = [];
  for (let i = 0; i < 6; i++) {
    const label = String(formData.get(`label${i}`) ?? "").trim();
    const url = String(formData.get(`url${i}`) ?? "").trim();
    if (!label && !url) continue;
    if (!label || !url) back("/admin/home", "err", `Link ${i + 1} needs both a label and a web address.`);
    if (label.length > 40) back("/admin/home", "err", `Link ${i + 1}: the label can be 40 characters at most.`);
    if (!/^https?:\/\/[^\s]+$/i.test(url)) back("/admin/home", "err", `Link ${i + 1}: the web address must start with http:// or https://.`);
    links.push({ label, url });
  }
  await setSetting("followLinks", JSON.stringify(links));
  back("/admin/home", "msg", "Saved the Follow links in the footer.");
}

/* ---------------------------------------------------------------- exhibitions */

const entrySchema = z.object({
  year: z.coerce.number().int().min(1900, "Enter a year from 1900.").max(2100, "Enter a year up to 2100."),
  kind: z.enum(["exhibition", "award", "press"]),
  text: z.string().trim().min(1, "Please describe the entry.").max(300, "Entries can be 300 characters at most."),
});

export async function addEntry(formData: FormData) {
  await guard();
  const parsed = entrySchema.safeParse({ year: formData.get("year"), kind: formData.get("kind"), text: formData.get("text") });
  if (!parsed.success) back("/admin/exhibitions", "err", parsed.error.issues[0].message);
  await db.insert(exhibitions).values(parsed.data);
  back("/admin/exhibitions", "msg", "Added the entry. It shows on the Exhibitions page.");
}

export async function updateEntry(formData: FormData) {
  await guard();
  const id = String(formData.get("id"));
  const parsed = entrySchema.safeParse({ year: formData.get("year"), kind: formData.get("kind"), text: formData.get("text") });
  if (!parsed.success) back("/admin/exhibitions", "err", parsed.error.issues[0].message);
  await db.update(exhibitions).set(parsed.data).where(eq(exhibitions.id, id));
  back("/admin/exhibitions", "msg", "Saved the entry.");
}

export async function deleteEntry(formData: FormData) {
  await guard();
  await db.delete(exhibitions).where(eq(exhibitions.id, String(formData.get("id"))));
  back("/admin/exhibitions", "msg", "Removed the entry.");
}

/* ---------------------------------------------------------------- inquiries and signups */

export async function deleteInquiry(formData: FormData) {
  await guard();
  await db.delete(commissionInquiries).where(eq(commissionInquiries.id, String(formData.get("id"))));
  back("/admin/inquiries", "msg", "Removed the inquiry.");
}

export async function deleteSignup(formData: FormData) {
  await guard();
  await db.delete(emailSignups).where(eq(emailSignups.id, String(formData.get("id"))));
  back("/admin/signups", "msg", "Removed the address.");
}
