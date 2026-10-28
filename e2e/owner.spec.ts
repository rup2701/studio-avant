import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { eq, inArray } from "drizzle-orm";
import sharp from "sharp";
import { adminLogin, createWork, deleteE2EWorks, image, OWNER_EMAIL, OWNER_PASSWORD, postCheckout, checkoutBody, CUSTOMER, uniq, getWorkBySlugDb } from "./helpers";
import { db } from "../src/db";
import { storageStatus, getStorage } from "../src/lib/storage";
import { assertStorageReady } from "../src/lib/startup-check";
import { categories, emailSignups, loginAttempts, productImages, products, settings, systemEvents } from "../src/db/schema";

test.beforeAll(async () => {
  await deleteE2EWorks();
});

test.beforeEach(async ({ page }) => {
  // The owner area asks before destructive actions; accept them.
  page.on("dialog", (d) => d.accept());
});

async function tryLogin(page: Page, email: string, password: string, expectFailure = true) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/admin/login")),
    page.getByRole("button", { name: "Sign in" }).click(),
  ]);
  // React clears the form once the server has answered
  if (expectFailure) await expect(page.getByLabel("Password")).toHaveValue("");
}

async function fillWork(page: Page, v: { name: string; price?: string; stock?: string; slug?: string; category?: string }) {
  await page.locator("#name").fill(v.name);
  if (v.slug !== undefined) await page.locator("#slug").fill(v.slug);
  if (v.price !== undefined) await page.locator("#price").fill(v.price);
  if (v.stock !== undefined) await page.locator("#stock").fill(v.stock);
  if (v.category) await page.locator("#categoryId").selectOption({ label: v.category });
}

async function createViaForm(page: Page, v: { name: string; price?: string; stock?: string; slug?: string; category?: string }) {
  await page.goto("/admin/works/new");
  await fillWork(page, { stock: "1", price: "250.00", category: "Original paintings", ...v });
  await page.getByTestId("save-work").click();
  await page.waitForURL(/\/admin\/works\/[0-9a-f-]{36}/);
}

test.describe("sign-in", () => {
  test("signed out, /admin redirects to sign-in and owner API routes return 401", async ({ page, request }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login/);
    await expect(page.getByRole("heading", { name: "Owner sign-in" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to the store" })).toBeVisible();
    for (const p of ["/admin/works/new", "/admin/categories", "/admin/status", "/admin/inquiries"]) {
      await page.goto(p);
      await expect(page).toHaveURL(/\/admin\/login/);
    }
    expect((await request.get("/api/admin/status")).status()).toBe(401);
    expect((await request.post("/api/admin/works/11111111-1111-1111-1111-111111111111/photos", { multipart: { file: await image(900, 900) } })).status()).toBe(401);
    expect((await request.post("/api/admin/portrait", { multipart: { file: await image(900, 900) } })).status()).toBe(401);
    // a made-up cookie is not a session
    await page.context().addCookies([{ name: "sa_owner", value: "forged", url: "http://localhost:3100" }]);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test("wrong email and wrong password give the same generic message; the right one lands on the works list; sign-out ends the session", async ({ page, context }) => {
    await page.goto("/admin/login");
    await tryLogin(page, "someone@else.example", OWNER_PASSWORD);
    await expect(page.getByTestId("login-error")).toBeVisible();
    const m1 = await page.getByTestId("login-error").textContent();
    await tryLogin(page, OWNER_EMAIL, "wrong-password-123");
    await expect(page.getByTestId("login-error")).toBeVisible();
    const m2 = await page.getByTestId("login-error").textContent();
    expect(m1).toBe(m2);
    expect(m1!.toLowerCase()).not.toContain("password is wrong");
    await tryLogin(page, OWNER_EMAIL, OWNER_PASSWORD, false);
    await expect(page.getByTestId("works-heading")).toBeVisible();
    await expect(page).toHaveURL(/\/admin$/);
    // session lasts 7 days
    const cookie = (await context.cookies()).find((c) => c.name === "sa_owner")!;
    const days = (cookie.expires - Date.now() / 1000) / 86400;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
    expect(cookie.httpOnly).toBe(true);
    // sign out ends the session immediately, even for a copied cookie
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/admin\/login/);
    await context.addCookies([{ name: cookie.name, value: cookie.value, url: "http://localhost:3100", expires: cookie.expires, httpOnly: true }]);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test("E-035 after 5 failed attempts from one address, sign-in is paused for 15 minutes with a clear message", async ({ page }) => {
    const ip = `203.0.113.${Math.floor(Math.random() * 200) + 20}`;
    await page.setExtraHTTPHeaders({ "x-forwarded-for": ip });
    await page.goto("/admin/login");
    for (let i = 0; i < 5; i++) {
      await tryLogin(page, OWNER_EMAIL, `wrong-${i}-password`);
      await expect(page.getByTestId("login-error")).toBeVisible();
      await expect(page.getByTestId("login-error")).not.toContainText("paused");
    }
    // even the right password is refused now
    await tryLogin(page, OWNER_EMAIL, OWNER_PASSWORD);
    await expect(page.getByTestId("login-error")).toContainText("paused for 15 more minutes");
    await expect(page).toHaveURL(/\/admin\/login/);
    // a different address is not affected
    await page.setExtraHTTPHeaders({ "x-forwarded-for": "198.51.100.7" });
    await adminLogin(page);
    await db.delete(loginAttempts).where(eq(loginAttempts.ip, ip));
  });

  test("no credentials live in the code or repo files, and no shopper page links to the owner area", async ({ page }) => {
    const hash = process.env.OWNER_PASSWORD_HASH!;
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        if (["node_modules", ".next", ".git", ".uploads", "test-results"].includes(e.name)) return [];
        const p = path.join(dir, e.name);
        return e.isDirectory() ? walk(p) : [p];
      });
    const files = walk(process.cwd()).filter((f) => !f.endsWith(".env") && !f.includes("package-lock"));
    for (const f of files) {
      const text = fs.readFileSync(f, "utf8");
      expect(text.includes(hash), f).toBe(false);
      expect(text.includes(OWNER_PASSWORD) && !f.includes("AGENT_LOG"), f).toBe(false);
    }
    for (const p of ["/", "/about", "/help", "/cart", "/work/low-tide-morning"]) {
      await page.goto(p);
      const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href")));
      expect(hrefs.filter((h) => h?.startsWith("/admin"))).toEqual([]);
    }
  });
});

test.describe("works list", () => {
  test("list shows every product with cover, title, category, price, stock and status; search and filters work", async ({ page }) => {
    await adminLogin(page);
    await expect(page.getByTestId("works-heading")).toContainText("(12)");
    const rows = page.getByTestId("work-row");
    await expect(rows).toHaveCount(12);
    const headers = await page.locator("table thead th").allTextContents();
    expect(headers.slice(0, 6)).toEqual(["Photo", "Title", "Category", "Price", "Stock", "Status"]);
    const first = rows.filter({ hasText: "Low Tide, Morning" }).first();
    await expect(first).toContainText("Original paintings");
    await expect(first).toContainText("$2,400.00");
    await expect(first).toContainText("Published");
    await expect(first).toContainText("Sample");
    await expect(rows.filter({ hasText: "Salt Flats at Dusk" })).toContainText("Sold");
    // search by part of a name
    await page.getByLabel("Search by title").fill("orchard");
    await page.getByRole("button", { name: "Filter" }).click();
    await expect(rows).toHaveCount(4);
    await page.getByRole("link", { name: "Clear" }).click();
    await expect(page).toHaveURL(/\/admin$/);
    // category filter
    await page.getByLabel("Category").selectOption({ label: "Prints" });
    await page.getByRole("button", { name: "Filter" }).click();
    await expect(rows).toHaveCount(4);
    // draft filter, with a next-step hint
    const d = await createWork({ name: `E2E ListDraft ${uniq()}`, published: false });
    await page.goto("/admin");
    await page.getByLabel("Status").selectOption("draft");
    await page.getByRole("button", { name: "Filter" }).click();
    await expect(rows.filter({ hasText: d.name })).toContainText("Draft: add a photo, then publish");
    await page.getByLabel("Search by title").fill("zzzzzz-nothing");
    await page.getByRole("button", { name: "Filter" }).click();
    await expect(page.getByTestId("no-results")).toBeVisible();
    // each row opens the product; a visible button adds a new one
    await page.goto("/admin");
    await page.getByTestId("work-link").first().click();
    await expect(page.getByTestId("work-form")).toBeVisible();
    await page.goto("/admin");
    await page.getByTestId("add-work").click();
    await expect(page.getByTestId("work-heading")).toHaveText("New work");
  });

  test("empty store shows the first step: add your first work (then the sample store is restored)", async ({ page }) => {
    try {
      await db.delete(products);
      await adminLogin(page);
      await expect(page.getByTestId("empty-store")).toContainText("add your first work");
      await expect(page.getByRole("link", { name: "Add your first work" })).toBeVisible();
      await page.goto("/");
      await expect(page.getByText("New work is on its way")).toBeVisible();
    } finally {
      execFileSync("npx", ["tsx", "scripts/seed.ts", "--confirm"], { stdio: "pipe" });
    }
  });

  test("owner can reorder works and the Work page grid follows", async ({ page }) => {
    await adminLogin(page);
    const rows = page.getByTestId("work-row");
    const firstName = await rows.nth(0).getByTestId("work-link").textContent();
    const secondName = await rows.nth(1).getByTestId("work-link").textContent();
    await page.getByRole("button", { name: `Move ${firstName} down` }).click();
    await expect(rows.nth(0).getByTestId("work-link")).toHaveText(secondName!);
    await page.goto("/work");
    await expect(page.getByTestId("work-card").first()).toContainText(secondName!);
    await page.goto("/admin");
    await page.getByRole("button", { name: `Move ${firstName} up` }).click();
    await expect(rows.nth(0).getByTestId("work-link")).toHaveText(firstName!);
  });
});

test.describe("work form", () => {
  test("owner adds a work, uploads photos, picks the cover, publishes, and the shopper finds it in its category", async ({ page }) => {
    const name = `E2E Journey ${uniq()}`;
    await adminLogin(page);
    await page.getByTestId("add-work").click();
    await fillWork(page, { name, price: "480.00", stock: "1", category: "Prints" });
    await expect(page.locator("#slug")).toHaveValue(/^e2e-journey-/); // generated from the name
    await page.getByTestId("save-work").click();
    await page.waitForURL(/\/admin\/works\/[0-9a-f-]{36}\?created=1/);
    await expect(page.getByTestId("created-message")).toContainText("Next: add photos");
    await expect(page.getByTestId("work-status-line")).toContainText("Draft");
    const workId = page.url().match(/works\/([0-9a-f-]{36})/)![1];
    const slug = (await db.select().from(products).where(eq(products.id, workId)))[0].slug;
    // a draft is not visible to shoppers
    const anon = await page.context().browser()!.newContext({ baseURL: "http://localhost:3100" });
    const anonPage = await anon.newPage();
    expect((await anonPage.goto(`/work/${slug}`))?.status()).toBe(404);
    // upload three photos (one narrow)
    const a = await image(1200, 900);
    const b = await image(900, 1200, "png");
    const c = await image(500, 400, "webp");
    await page.getByTestId("photo-input").setInputFiles([
      { ...a, name: "one.jpg" },
      { ...b, name: "two.png" },
      { ...c, name: "three.webp" },
    ]);
    await expect(page.getByTestId("photo-item")).toHaveCount(3);
    await expect(page.getByTestId("upload-warning")).toContainText("only 500 pixels wide");
    // default alt text is the product name, editable
    await expect(page.getByRole("img", { name: name }).first()).toBeVisible();
    // make the second photo the cover
    await page.getByTestId("photo-item").nth(1).getByRole("button", { name: "Make cover" }).click();
    await expect(page.getByTestId("photo-item").nth(0).getByTestId("cover-badge")).toBeVisible();
    await expect(page.getByTestId("photo-item").nth(0).locator("img")).toHaveAttribute("src", /\.png$/);
    // edit alt text
    await page.getByTestId("photo-item").nth(0).getByLabel("Alt text").fill("Grey sea at dusk");
    await page.getByTestId("photo-item").nth(0).getByRole("button", { name: "Save" }).click();
    await expect(page.getByTestId("photo-message")).toContainText("Alt text saved");
    // reload: photos persist in order
    await page.reload();
    await expect(page.getByTestId("photo-item")).toHaveCount(3);
    await expect(page.getByTestId("photo-item").nth(0).locator("img")).toHaveAttribute("alt", "Grey sea at dusk");
    // publish
    await page.getByTestId("publish-toggle").click();
    await expect(page.getByTestId("publish-message")).toContainText("is published");
    await expect(page.getByTestId("work-status-line")).toContainText("Published");
    // shopper sees it in its category with the cover photo and every photo on the page
    expect((await anonPage.goto(`/work/${slug}`))?.status()).toBe(200);
    await expect(anonPage.getByTestId("work-images").getByRole("img")).toHaveCount(3);
    await anonPage.goto("/category/prints");
    const card = anonPage.getByTestId("work-card").filter({ hasText: name });
    await expect(card.locator("img")).toHaveAttribute("src", /\.png$/);
    await expect(card).toContainText("Available");
    // photos are real files that load
    const src = await card.locator("img").getAttribute("src");
    expect((await anonPage.request.get(src!)).status()).toBe(200);
    // remove one photo
    await page.getByTestId("photo-item").nth(2).getByRole("button", { name: "Remove" }).click();
    await expect(page.getByTestId("photo-item")).toHaveCount(2);
    await anon.close();
  });

  test("E-030 wrong type or too large photos are refused with a message naming the problem, other photos still upload", async ({ page }) => {
    await adminLogin(page);
    const w = await createWork({ name: `E2E Photos30 ${uniq()}`, published: false });
    await page.goto(`/admin/works/${w.id}`);
    const pdf = { name: "brochure.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 test") };
    const big = { name: "huge.jpg", mimeType: "image/jpeg", buffer: Buffer.alloc(12 * 1024 * 1024, 1) };
    await page.getByTestId("photo-input").setInputFiles([pdf, big, { ...(await image(1000, 800)), name: "fine.jpg" }]);
    const errors = page.getByTestId("upload-error");
    await expect(errors).toHaveCount(2);
    await expect(errors.nth(0)).toContainText("only JPEG, PNG and WebP");
    await expect(errors.nth(1)).toContainText("5 MB");
    await expect(page.getByTestId("photo-item")).toHaveCount(1);
    // the server refuses too, whatever the browser does
    const r1 = await page.request.post(`/api/admin/works/${w.id}/photos`, { multipart: { file: pdf } });
    expect(r1.status()).toBe(415);
    expect((await r1.json()).error).toContain("JPEG, PNG and WebP");
    const r2 = await page.request.post(`/api/admin/works/${w.id}/photos`, { multipart: { file: big } });
    expect(r2.status()).toBe(413);
    expect((await r2.json()).error).toContain("5 MB");
    // a renamed non-image with an image type is refused too
    const r3 = await page.request.post(`/api/admin/works/${w.id}/photos`, { multipart: { file: { name: "fake.jpg", mimeType: "image/jpeg", buffer: Buffer.from("not really an image") } } });
    expect(r3.status()).toBe(415);
  });

  test("at most 8 photos per work", async ({ page }) => {
    await adminLogin(page);
    const w = await createWork({ name: `E2E Eight ${uniq()}`, published: false });
    const img = await image(900, 700);
    for (let i = 0; i < 8; i++) {
      const r = await page.request.post(`/api/admin/works/${w.id}/photos`, { multipart: { file: img } });
      expect(r.status()).toBe(200);
    }
    const r = await page.request.post(`/api/admin/works/${w.id}/photos`, { multipart: { file: img } });
    expect(r.status()).toBe(400);
    expect((await r.json()).error).toContain("8 photos at most");
    await page.goto(`/admin/works/${w.id}`);
    await page.getByTestId("photo-input").setInputFiles([{ ...img, name: "ninth.jpg" }]);
    await expect(page.getByTestId("upload-error")).toContainText("8 photos at most");
  });

  test("E-036 a very large photo is resized for the web, the original is kept, and the owner is told", async ({ page }) => {
    await adminLogin(page);
    const w = await createWork({ name: `E2E Big ${uniq()}`, published: false });
    await page.goto(`/admin/works/${w.id}`);
    await page.getByTestId("photo-input").setInputFiles([{ ...(await image(3200, 2400)), name: "large.jpg" }]);
    await expect(page.getByTestId("upload-warning")).toContainText("resized for the web");
    await expect(page.getByTestId("photo-item")).toHaveCount(1);
    const [img] = await db.select().from(productImages).where(eq(productImages.productId, w.id));
    expect(img.width).toBe(2000);
    expect(img.url).not.toBe(img.originalUrl);
    const web = await sharp(await (await page.request.get(img.url)).body()).metadata();
    const orig = await sharp(await (await page.request.get(img.originalUrl)).body()).metadata();
    expect(web.width).toBe(2000);
    expect(orig.width).toBe(3200);
  });

  test("validation: messages beside fields, typed values kept; E-029 duplicate slug suggests an alternative", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin/works/new");
    await page.locator("#price").fill("0");
    await page.locator("#stock").fill("-3");
    await page.getByTestId("save-work").click();
    await expect(page.getByTestId("error-name")).toContainText("Please enter a title");
    await expect(page.getByTestId("error-price")).toContainText("greater than 0");
    await expect(page.getByTestId("error-stock")).toContainText("whole number");
    await expect(page.getByTestId("save-message")).toContainText("was not saved");
    await expect(page.locator("#price")).toHaveValue("0");
    await expect(page.locator("#stock")).toHaveValue("-3");
    await expect(page.locator("#name")).toHaveAttribute("aria-invalid", "true");
    // title length
    await page.locator("#name").fill("x".repeat(81));
    await page.locator("#price").fill("12.345");
    await page.locator("#stock").fill("1");
    await page.getByTestId("save-work").click();
    await expect(page.getByTestId("error-name")).toContainText("80 characters");
    await expect(page.getByTestId("error-price")).toBeVisible();
    // duplicate slug
    await page.locator("#name").fill(`E2E Dup ${uniq()}`);
    await page.locator("#price").fill("120.00");
    await page.locator("#slug").fill("low-tide-morning");
    await page.getByTestId("save-work").click();
    const slugErr = page.getByTestId("error-slug");
    await expect(slugErr).toContainText("already used by “Low Tide, Morning”");
    await expect(slugErr).toContainText("Try “low-tide-morning-2”");
    await expect(page.locator("#price")).toHaveValue("120.00");
    await page.locator("#slug").fill("Bad Slug!");
    await page.getByTestId("save-work").click();
    await expect(page.getByTestId("error-slug")).toContainText("lowercase letters, numbers and single hyphens");
  });

  test("saving says what happened and what comes next; editing a price never changes an earlier order", async ({ page, request }) => {
    await adminLogin(page);
    const w = await createWork({ name: `E2E Edit ${uniq()}`, priceCents: 10000 });
    const { json } = await postCheckout(request, checkoutBody(uniq("edit"), [{ productId: w.id }], { ...CUSTOMER, email: `${uniq("edit")}@example.com` }));
    expect(json.status).toBe("created");
    await page.goto(`/admin/works/${w.id}`);
    await page.locator("#price").fill("999.00");
    await page.getByTestId("save-work").click();
    await expect(page.getByTestId("save-message")).toContainText("Saved");
    await expect(page.getByTestId("save-message")).toContainText("Next: add photos");
    await page.goto(`/order/${json.reference}`);
    await expect(page.getByTestId("order-item")).toContainText("$100.00");
    expect((await getWorkBySlugDb(w.slug)).priceCents).toBe(99900);
  });

  test("leaving with unsaved changes asks for confirmation", async ({ page }) => {
    await adminLogin(page);
    const w = await createWork({ name: `E2E Unsaved ${uniq()}`, published: false });
    await page.goto(`/admin/works/${w.id}`);
    await page.locator("#medium").fill("Changed medium");
    await expect(page.getByTestId("unsaved-note")).toBeVisible();
    let message = "";
    page.removeAllListeners("dialog");
    page.once("dialog", async (d) => {
      message = d.message();
      await d.dismiss();
    });
    await page.getByRole("link", { name: "Cancel" }).click();
    await expect(page).toHaveURL(new RegExp(w.id));
    expect(message).toContain("unsaved changes");
    page.once("dialog", (d) => d.accept());
    await page.getByRole("link", { name: "Cancel" }).click();
    await expect(page).toHaveURL(/\/admin$/);
  });

  test("options: add a required option with values, prices and a default; the shopper page honours them", async ({ page }) => {
    await adminLogin(page);
    const name = `E2E Options ${uniq()}`;
    await createViaForm(page, { name, price: "60.00", category: "Prints" });
    await page.getByTestId("add-option").click();
    const block = page.getByTestId("option-block").first();
    await block.getByLabel("Option 1 name").fill("Size");
    await block.getByRole("checkbox", { name: "Required" }).check();
    await block.getByLabel("Value 1", { exact: true }).fill("Small");
    await block.getByRole("button", { name: "Add a value to option 1" }).click();
    await block.getByLabel("Value 2", { exact: true }).fill("Large");
    await block.getByLabel("Price change ($)").nth(1).fill("25.00");
    await block.getByRole("radio", { name: /Default for Size, value 1/ }).check();
    await page.getByTestId("save-work").click();
    await expect(page.getByTestId("save-message")).toContainText("Saved");
    // option ids are kept on a second save
    await page.getByTestId("save-work").click();
    await expect(page.getByTestId("save-message")).toContainText("Saved");
    // a bad option is refused beside the options
    await block.getByLabel("Value 2", { exact: true }).fill("");
    await page.getByTestId("save-work").click();
    await expect(page.getByTestId("error-options")).toContainText("needs a label");
    await block.getByLabel("Value 2", { exact: true }).fill("Large");
    await page.getByTestId("save-work").click();
    await expect(page.getByTestId("save-message")).toContainText("Saved");
    // shopper page: publish (needs a photo)
    await page.getByTestId("photo-input").setInputFiles([{ ...(await image(1000, 1000)), name: "p.jpg" }]);
    await expect(page.getByTestId("photo-item")).toHaveCount(1);
    await page.getByTestId("publish-toggle").click();
    await expect(page.getByTestId("publish-message")).toContainText("is published");
    const slug = await page.locator("#slug").inputValue();
    const anon = await page.context().browser()!.newContext({ baseURL: "http://localhost:3100" });
    const s = await anon.newPage();
    await s.goto(`/work/${slug}`);
    await expect(s.getByRole("radio", { name: /Small/ })).toBeChecked(); // the default
    await expect(s.getByTestId("price")).toContainText("$60.00");
    await s.getByText("Large").click();
    await expect(s.getByTestId("price")).toContainText("$85.00");
    await anon.close();
  });

  test("publishing and stock: publish/unpublish, no photo or no price is refused, stock 0 shows Sold out", async ({ page }) => {
    await adminLogin(page);
    const name = `E2E Publish ${uniq()}`;
    await createViaForm(page, { name, price: "150.00", stock: "2", category: "Prints" });
    // no photo -> refused with a reason
    await page.getByTestId("publish-toggle").click();
    await expect(page.getByTestId("publish-message")).toContainText("no photo");
    await expect(page.getByTestId("work-status-line")).toContainText("Draft");
    // add a photo then publish
    await page.getByTestId("photo-input").setInputFiles([{ ...(await image(1000, 1000)), name: "p.jpg" }]);
    await expect(page.getByTestId("photo-item")).toHaveCount(1);
    await page.getByTestId("publish-toggle").click();
    await expect(page.getByTestId("work-status-line")).toContainText("Published");
    const slug = await page.locator("#slug").inputValue();
    const anon = await page.context().browser()!.newContext({ baseURL: "http://localhost:3100" });
    const s = await anon.newPage();
    await s.goto(`/work/${slug}`);
    await expect(s.getByRole("button", { name: "Add to cart" })).toBeVisible();
    // stock 0 -> Sold out, cannot be added
    await page.locator("#stock").fill("0");
    await page.getByTestId("save-work").click();
    await expect(page.getByTestId("save-message")).toContainText("Saved");
    await s.goto(`/work/${slug}`);
    await expect(s.getByTestId("status-text")).toHaveText("Sold out");
    await expect(s.getByRole("button", { name: "Add to cart" })).toHaveCount(0);
    await s.goto("/category/prints");
    await expect(s.getByTestId("work-card").filter({ hasText: name })).toContainText("Sold out");
    // unpublish -> hidden
    await page.getByTestId("publish-toggle").click();
    await expect(page.getByTestId("publish-message")).toContainText("now a draft");
    expect((await s.goto(`/work/${slug}`))?.status()).toBe(404);
    // the owner can still preview the draft
    await page.goto(`/work/${slug}`);
    await expect(page.getByText("Draft preview")).toBeVisible();
    await anon.close();
  });

  test("publishing an available work with no price is refused with a reason", async ({ page }) => {
    await adminLogin(page);
    const w = await createWork({ name: `E2E NoPrice ${uniq()}`, priceCents: null, published: false });
    await db.insert(productImages).values({ productId: w.id, url: "/uploads/x.jpg", originalUrl: "/uploads/x.jpg", alt: w.name, position: 0, width: 900, height: 900 });
    await page.goto(`/admin/works/${w.id}`);
    await page.getByTestId("publish-toggle").click();
    await expect(page.getByTestId("publish-message")).toContainText("no price");
    expect((await getWorkBySlugDb(w.slug)).published).toBe(false);
  });

  test("sale status Sold stays visible without a price or buy button", async ({ page }) => {
    await adminLogin(page);
    const w = await createWork({ name: `E2E Status ${uniq()}`, priceCents: 70000, stock: 1 });
    await page.goto(`/admin/works/${w.id}`);
    await page.locator("#saleStatus").selectOption("private_collection");
    await page.getByTestId("save-work").click();
    await expect(page.getByTestId("save-message")).toContainText("Saved");
    await page.goto(`/work/${w.slug}`);
    await expect(page.getByTestId("status-text")).toHaveText("Private collection");
    await expect(page.getByTestId("price")).toHaveCount(0);
  });
});

test.describe("categories, series and pages", () => {
  test("categories: add, rename keeps the old URL working, reorder, empty ones hidden, E-032 delete blocked with a count", async ({ page }) => {
    await adminLogin(page);
    const name = `E2E Cat ${uniq()}`;
    await page.goto("/admin/categories");
    await page.getByLabel("New category name").fill(name);
    await page.getByRole("button", { name: "Add category" }).click();
    await expect(page.getByTestId("flash-message")).toContainText(`Added the category “${name}”`);
    const [cat] = await db.select().from(categories).where(eq(categories.name, name));
    // empty category is hidden from shoppers
    expect((await page.request.get(`/category/${cat.slug}`)).status()).toBe(404);
    // assign two works and publish
    const w1 = await createWork({ name: `E2E InCat1 ${uniq()}` });
    const w2 = await createWork({ name: `E2E InCat2 ${uniq()}` });
    await db.update(products).set({ categoryId: cat.id }).where(eq(products.id, w1.id));
    await db.update(products).set({ categoryId: cat.id }).where(eq(products.id, w2.id));
    expect((await page.request.get(`/category/${cat.slug}`)).status()).toBe(200);
    await page.goto("/admin/categories");
    const rowFor = (n: string) => page.getByTestId("category-row").filter({ has: page.locator(`input[value="${n}"]`) });
    await expect(rowFor(name)).toContainText("2 works");
    // delete blocked, says how many must move
    await page.getByRole("button", { name: `Delete ${name}` }).click();
    await expect(page.getByTestId("flash-error")).toContainText("2 works are still in it");
    await expect(page.getByTestId("flash-error")).toContainText("Move those 2 works");
    expect(await db.select().from(categories).where(eq(categories.id, cat.id))).toHaveLength(1);
    // rename: every product follows, the old URL redirects
    const newName = `E2E Renamed ${uniq()}`;
    await rowFor(name).getByLabel("Name").fill(newName);
    await rowFor(name).getByRole("button", { name: "Rename" }).click();
    await expect(page.getByTestId("flash-message")).toContainText(`Renamed to “${newName}”`);
    await page.goto(`/category/${cat.slug}`);
    await expect(page).toHaveURL(new RegExp(`/category/${newName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(newName);
    await page.goto(`/work/${w1.slug}`);
    await expect(page.getByTestId("work-details")).toContainText(newName);
    // reorder
    await page.goto("/admin/categories");
    const names = async () => page.getByTestId("category-row").evaluateAll((els) => els.map((e) => (e.querySelector("input[name=name]") as HTMLInputElement).value));
    const before = await names();
    expect(before.at(-1)).toBe(newName);
    await page.getByRole("button", { name: `Move ${newName} up` }).click();
    await expect.poll(async () => (await names()).at(-2)).toBe(newName);
    // delete once empty
    await db.delete(products).where(eq(products.id, w1.id));
    await db.delete(products).where(eq(products.id, w2.id));
    await page.getByRole("button", { name: `Delete ${newName}` }).click();
    await expect(page.getByTestId("flash-message")).toContainText("Deleted the category");
  });

  test("series: add, edit and delete; the series page follows", async ({ page }) => {
    await adminLogin(page);
    const title = `E2E Series ${uniq()}`;
    await page.goto("/admin/series");
    await page.getByLabel("Title", { exact: true }).last().fill(title);
    await page.getByLabel("Short text").last().fill("Sample series text.");
    await page.getByRole("button", { name: "Add series" }).click();
    await expect(page.getByTestId("flash-message")).toContainText("Added the series");
    const row = page.getByTestId("series-row").filter({ has: page.locator(`input[value="${title}"]`) });
    await row.getByLabel("Short text").fill("Edited text.");
    await row.getByRole("button", { name: "Save" }).click();
    await expect(page.getByTestId("flash-message")).toContainText(`Saved “${title}”`);
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    await page.goto(`/series/${slug}`);
    await expect(page.getByText("Edited text.")).toBeVisible();
    await page.goto("/admin/series");
    await page.getByRole("button", { name: `Delete ${title}` }).click();
    await expect(page.getByTestId("flash-message")).toContainText("Deleted the series");
  });

  test("home intro line, About page and follow links are owner editable", async ({ page }) => {
    await adminLogin(page);
    const intro = `A new quiet line ${uniq()}.`;
    await page.goto("/admin/home");
    await page.getByLabel("Intro line (200 characters at most)").fill("x".repeat(201));
    await page.getByRole("button", { name: "Save intro line" }).click();
    await expect(page.getByTestId("flash-error")).toContainText("200 characters");
    await page.getByLabel("Intro line (200 characters at most)").fill(intro);
    await page.getByRole("button", { name: "Save intro line" }).click();
    await expect(page.getByTestId("flash-message")).toContainText("Saved the intro line");
    await page.goto("/");
    await expect(page.getByTestId("intro")).toContainText(intro);
    // follow links
    await page.goto("/admin/home");
    await page.getByLabel("Label 1").fill("Studio diary");
    await page.getByLabel("Web address 1").fill("https://example.com/diary");
    await page.getByRole("button", { name: "Save links" }).click();
    await expect(page.getByTestId("flash-message")).toContainText("Saved the Follow links");
    await page.goto("/");
    await expect(page.locator("footer").getByRole("link", { name: "Studio diary" })).toHaveAttribute("href", "https://example.com/diary");
    await page.goto("/admin/home");
    await page.getByLabel("Web address 1").fill("javascript:alert(1)");
    await page.getByRole("button", { name: "Save links" }).click();
    await expect(page.getByTestId("flash-error")).toContainText("must start with http");
    // about page + portrait
    await page.goto("/admin/about");
    await page.getByLabel("Artist's name").fill("Maren Test");
    await page.getByLabel("Artist's statement").fill("My new statement.");
    await page.getByRole("button", { name: "Save About page" }).click();
    await expect(page.getByTestId("flash-message")).toContainText("Saved the About page");
    await page.setInputFiles("#portrait-file", { ...(await image(900, 1100)), name: "portrait.jpg" });
    await expect(page.getByText("Portrait saved.")).toBeVisible();
    await page.goto("/about");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("About Maren Test");
    await expect(page.getByText("My new statement.")).toBeVisible();
    await expect(page.getByTestId("portrait")).toBeVisible();
    await page.goto("/");
    await expect(page.getByTestId("intro")).toContainText("Maren Test");
    // restore defaults for later tests
    await page.goto("/admin/about");
    await page.getByLabel("Artist's name").fill("Neil Patrick");
    await page.getByRole("button", { name: "Save About page" }).click();
    await page.getByRole("button", { name: "Remove portrait" }).click();
    await page.goto("/admin/home");
    await page.getByLabel("Label 1").fill("Instagram");
    await page.getByLabel("Web address 1").fill("https://example.com/instagram");
    await page.getByRole("button", { name: "Save links" }).click();
    await page.getByLabel("Intro line (200 characters at most)").fill("Quiet, considered paintings of tide flats and old orchards, and a few limited prints of them. Each available work can be bought from its page.");
    await page.getByRole("button", { name: "Save intro line" }).click();
  });

  test("exhibitions and press: add, edit and remove entries", async ({ page }) => {
    await adminLogin(page);
    const text = `E2E Show ${uniq()}`;
    await page.goto("/admin/exhibitions");
    await page.locator("#y-new").fill("2031");
    await page.locator("#k-new").selectOption("award");
    await page.locator("#t-new").fill(text);
    await page.getByRole("button", { name: "Add entry" }).click();
    await expect(page.getByTestId("flash-message")).toContainText("Added the entry");
    await page.goto("/exhibitions");
    await expect(page.locator("main h2").first()).toHaveText("2031");
    await expect(page.getByText(text)).toBeVisible();
    await page.goto("/admin/exhibitions");
    const row = page.getByTestId("entry-row").filter({ has: page.locator(`input[value="${text}"]`) });
    await row.locator("input[name=text]").fill(text + " edited");
    await row.getByRole("button", { name: "Save" }).click();
    await expect(page.getByTestId("flash-message")).toContainText("Saved the entry");
    await page.getByRole("button", { name: `Remove entry: ${text} edited` }).click();
    await expect(page.getByTestId("flash-message")).toContainText("Removed the entry");
    await page.goto("/exhibitions");
    await expect(page.getByText(text)).toHaveCount(0);
  });

  test("commission inquiries and newsletter sign-ups are stored and visible to the owner", async ({ page, browser }) => {
    const anon = await browser.newContext({ baseURL: "http://localhost:3100" });
    const s = await anon.newPage();
    const email = `${uniq("patron")}@example.com`;
    await s.goto("/commissions");
    await s.getByLabel("Your name").fill("Pat Owner-Test");
    await s.getByLabel("Email address").fill(email);
    await s.getByLabel("What do you have in mind?").fill("A diptych of the harbour at low water.");
    await s.getByRole("button", { name: "Send inquiry" }).click();
    await expect(s.getByTestId("inquiry-thanks")).toBeVisible();
    const signup = `${uniq("fan")}@example.com`;
    await s.goto("/");
    await s.getByLabel("Email address").fill(signup);
    await s.getByRole("button", { name: "Subscribe" }).click();
    await expect(s.getByTestId("signup-thanks")).toBeVisible();
    await anon.close();
    await adminLogin(page);
    await page.goto("/admin/inquiries");
    await expect(page.getByTestId("inquiry-row").filter({ hasText: email })).toContainText("A diptych of the harbour");
    await page.getByRole("navigation", { name: "Owner area" }).getByRole("link", { name: "Newsletter" }).click();
    await expect(page).toHaveURL(/\/admin\/signups$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Newsletter");
    await expect(page.getByRole("navigation", { name: "Owner area" }).getByRole("link", { name: "Email sign-ups" })).toHaveCount(0);
    await expect(page.getByTestId("signup-row").filter({ hasText: signup })).toBeVisible();
  });
});

test.describe("storage and status", () => {
  test("E-031 a deployed build with no object storage refuses uploads and fails its startup check", async () => {
    const saved = { v: process.env.VERCEL, t: process.env.BLOB_READ_WRITE_TOKEN, r: process.env.NEXT_RUNTIME };
    try {
      process.env.VERCEL = "1";
      delete process.env.BLOB_READ_WRITE_TOKEN;
      process.env.NEXT_RUNTIME = "nodejs";
      const s = storageStatus();
      expect(s.ok).toBe(false);
      expect(s.message).toContain("Vercel Blob");
      expect(() => getStorage()).toThrow(/not set up/);
      expect(() => assertStorageReady()).toThrow(/Startup check failed/);
      process.env.BLOB_READ_WRITE_TOKEN = "token";
      expect(storageStatus().kind).toBe("blob");
      expect(() => assertStorageReady()).not.toThrow();
    } finally {
      if (saved.v === undefined) delete process.env.VERCEL; else process.env.VERCEL = saved.v;
      if (saved.t === undefined) delete process.env.BLOB_READ_WRITE_TOKEN; else process.env.BLOB_READ_WRITE_TOKEN = saved.t;
      if (saved.r === undefined) delete process.env.NEXT_RUNTIME; else process.env.NEXT_RUNTIME = saved.r;
    }
    // development uses local disk, never silently in a deployed build
    expect(storageStatus().kind).toBe("local");
  });

  test("status page and failed-checkout alert tell the owner in plain words", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin/status");
    await expect(page.getByTestId("status-list")).toContainText("The database is reachable");
    await expect(page.getByTestId("status-list")).toContainText("Photo storage");
    const api = await page.request.get("/api/admin/status");
    expect(api.status()).toBe(200);
    expect((await api.json()).database.ok).toBe(true);
    const [ev] = await db.insert(systemEvents).values({ kind: "checkout_failed", message: "A shopper's checkout failed and no order was created. (test)" }).returning();
    await page.goto("/admin");
    await expect(page.getByTestId("failure-alert")).toContainText("checkout failed");
    await page.getByRole("link", { name: "See what happened" }).click();
    await expect(page.getByTestId("events")).toContainText("no order was created");
    await db.delete(systemEvents).where(eq(systemEvents.id, ev.id));
  });
});

test.describe("home page and newsletter (owner)", () => {
  test("owner chooses which works show on home, features one, reorders them, and the home page follows; drafts never show", async ({ page }) => {
    const a = await createWork({ name: `E2E HomeA ${uniq()}` });
    const b = await createWork({ name: `E2E HomeB ${uniq()}` });
    const draft = await createWork({ name: `E2E HomeDraft ${uniq()}`, published: false });
    try {
      await adminLogin(page);
      await page.goto("/admin/home");
      const rowFor = (n: string) => page.getByTestId("home-work-row").filter({ hasText: n });
      for (const w of [a, b]) {
        const row = rowFor(w.name);
        await expect(row).toHaveAttribute("data-shown", "false");
        await row.getByLabel(`Show on home: ${w.name}`).check();
        if (w === b) await row.getByLabel(`Feature full width: ${w.name}`).check();
        await row.getByRole("button", { name: `Save ${w.name}` }).click();
        await expect(page.getByTestId("flash-message")).toContainText(`Saved “${w.name}” for the home page.`);
      }
      await rowFor(draft.name).getByLabel(`Show on home: ${draft.name}`).check();
      await rowFor(draft.name).getByRole("button", { name: `Save ${draft.name}` }).click();
      await expect(page.getByTestId("flash-message")).toContainText("for the home page");

      // shopper: A then B (each goes to the end), B full width of the column, the draft is not shown
      await page.goto("/");
      const items = page.getByTestId("home-work");
      await expect(items).toHaveCount(9);
      await expect(items.nth(7)).toContainText(a.name);
      await expect(items.nth(8)).toContainText(b.name);
      await expect(page.getByText(draft.name)).toHaveCount(0);
      const widths = await page.evaluate((nm) => {
        const col = document.querySelector("[data-testid=home-images]")!.getBoundingClientRect().width;
        const li = [...document.querySelectorAll("[data-testid=home-work]")].find((e) => e.textContent!.includes(nm))!.closest("li")!;
        return { col, w: li.getBoundingClientRect().width, featured: li.dataset.featured };
      }, b.name);
      expect(widths.featured).toBe("true");
      expect(Math.abs(widths.w - widths.col)).toBeLessThan(2);

      // reorder: move B earlier
      await page.goto("/admin/home");
      await Promise.all([
        page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/admin/home")),
        page.getByRole("button", { name: `Move ${b.name} earlier on home` }).click(),
      ]);
      await page.goto("/");
      await expect(items.nth(7)).toContainText(b.name);
      await expect(items.nth(8)).toContainText(a.name);

      // un-tick: the work leaves the home page but stays on the Work page
      await page.goto("/admin/home");
      await rowFor(a.name).getByLabel(`Show on home: ${a.name}`).uncheck();
      await rowFor(a.name).getByRole("button", { name: `Save ${a.name}` }).click();
      await expect(page.getByTestId("flash-message")).toContainText("for the home page");
      await page.goto("/");
      await expect(page.getByTestId("home-images").getByText(a.name)).toHaveCount(0);
      await page.goto("/work");
      await expect(page.getByTestId("work-card").filter({ hasText: a.name })).toHaveCount(1);
    } finally {
      for (const w of [a, b, draft]) await db.delete(products).where(eq(products.id, w.id));
    }
  });

  test("the work form has Show on home and Feature on home, and saves them", async ({ page }) => {
    const w = await createWork({ name: `E2E HomeForm ${uniq()}` });
    try {
      await adminLogin(page);
      await page.goto(`/admin/works/${w.id}`);
      await page.getByLabel("Show on home", { exact: true }).check();
      await page.getByLabel(/^Feature on home/).check();
      await page.getByTestId("save-work").click();
      await expect(page.getByTestId("save-message")).toContainText("Saved");
      const [row] = await db.select().from(products).where(eq(products.id, w.id));
      expect(row.showOnHome).toBe(true);
      expect(row.featureOnHome).toBe(true);
      await page.reload();
      await expect(page.getByLabel("Show on home", { exact: true })).toBeChecked();
    } finally {
      await db.delete(products).where(eq(products.id, w.id));
    }
  });

  test("words block and its optional image are owner editable", async ({ page }) => {
    const p1 = `First paragraph ${uniq()}.`;
    const p2 = `Second paragraph ${uniq()}.`;
    await adminLogin(page);
    await page.goto("/admin/home");
    await page.getByLabel("Words (5000 characters at most)").fill(`${p1}\n\n${p2}`);
    await page.getByRole("button", { name: "Save words" }).click();
    await expect(page.getByTestId("flash-message")).toContainText("Saved the words block");
    await page.goto("/");
    const words = page.getByTestId("home-words");
    await expect(words.locator("p")).toHaveText([p1, p2]);
    await expect(page.getByTestId("words-image")).toHaveCount(0);
    // too long is refused with a message
    await page.goto("/admin/home");
    await page.getByLabel("Words (5000 characters at most)").fill("x".repeat(5001));
    await page.getByRole("button", { name: "Save words" }).click();
    await expect(page.getByTestId("flash-error")).toContainText("5000 characters");
    // image beside the words
    await page.goto("/admin/home");
    await page.getByLabel("Description of the image beside the words (for screen readers)").fill("The studio window");
    await page.getByRole("button", { name: "Save words" }).click();
    await expect(page.getByTestId("flash-message")).toContainText("Saved the words block");
    await page.setInputFiles("#words-image-file", { ...(await image(900, 1100)), name: "words.jpg" });
    await expect(page.getByText("Image saved.")).toBeVisible();
    await page.goto("/");
    const img = page.getByTestId("words-image");
    await expect(img).toBeVisible();
    await expect(img).toHaveAttribute("alt", "The studio window");
    const src = await img.getAttribute("src");
    expect((await page.request.get(src!)).status()).toBe(200);
    // remove the image again; the words stay
    await page.goto("/admin/home");
    await page.getByRole("button", { name: "Remove the image" }).click();
    await expect(page.getByTestId("flash-message")).toContainText("Image removed");
    await page.goto("/");
    await expect(page.getByTestId("words-image")).toHaveCount(0);
    await expect(words.locator("p")).toHaveText([p1, p2]);
    // back to the sample words for later tests
    await db.delete(settings).where(inArray(settings.key, ["wordsText", "wordsImageAlt", "wordsImageUrl"]));
  });

  test("newsletter subscribers: owner sees them newest first and downloads a CSV; the CSV is closed to the public", async ({ page, browser }) => {
    const older = `${uniq("older")}@example.com`;
    const newer = `${uniq("newer")}@example.com`;
    await db.insert(emailSignups).values([
      { email: older, createdAt: new Date("2030-01-01T10:00:00Z") },
      { email: newer, createdAt: new Date("2030-01-02T10:00:00Z") },
    ]);
    try {
      await adminLogin(page);
      await page.goto("/admin/signups");
      await expect(page.getByRole("heading", { level: 1 })).toContainText("Newsletter");
      await expect(page.getByRole("heading", { level: 1 })).not.toContainText("Email sign-ups");
      const rows = await page.getByTestId("signup-row").allTextContents();
      const iNew = rows.findIndex((r) => r.includes(newer));
      const iOld = rows.findIndex((r) => r.includes(older));
      expect(iNew).toBeGreaterThanOrEqual(0);
      expect(iNew).toBeLessThan(iOld);
      const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("signups-csv").click()]);
      expect(dl.suggestedFilename()).toBe("newsletter-subscribers.csv");
      const text = fs.readFileSync((await dl.path())!, "utf8");
      const lines = text.trim().split(/\r?\n/);
      expect(lines[0]).toBe("email,subscribed_at");
      expect(lines.findIndex((l) => l.includes(newer))).toBeLessThan(lines.findIndex((l) => l.includes(older)));
      expect(text).toContain(`"${older}","2030-01-01T10:00:00.000Z"`);
      // signed out: refused
      const anon = await browser.newContext({ baseURL: "http://localhost:3100" });
      const res = await anon.request.get("/api/admin/signups");
      expect(res.status()).toBe(401);
      expect(await res.text()).not.toContain(older);
      await anon.close();
    } finally {
      await db.delete(emailSignups).where(eq(emailSignups.email, older));
      await db.delete(emailSignups).where(eq(emailSignups.email, newer));
    }
  });
});
