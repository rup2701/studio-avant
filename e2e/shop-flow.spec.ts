import { test, expect, request as pwRequest } from "@playwright/test";
import { addToCart, checkoutBody, CUSTOMER, createWork, fillCheckout, getWorkBySlugDb, orderItemsFor, ordersByEmail, postCheckout, uniq } from "./helpers";
import { db } from "../src/db";
import { orders, products } from "../src/db/schema";
import { eq } from "drizzle-orm";
import { execFileSync } from "node:child_process";

test("journey: discover, configure, add, review cart, checkout, confirmation", async ({ page }) => {
  const email = `${uniq("journey")}@example.com`;
  await page.goto("/work");
  await page.getByTestId("work-card").filter({ hasText: "Orchard Path (print)" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Orchard Path (print)");
  await page.getByText("12 × 16 in").click();
  await page.getByText("Textured cotton rag").click();
  await expect(page.getByTestId("price")).toContainText("$75.00");
  await page.getByTestId("add-to-cart").click();
  await expect(page.getByTestId("purchase-message")).toContainText("Added to your cart");
  await page.getByRole("link", { name: "View your bag" }).click();
  await expect(page).toHaveURL(/\/cart/);
  const line = page.getByTestId("cart-line");
  await expect(line).toHaveCount(1);
  await expect(line.getByTestId("line-options")).toContainText("Size: 12 × 16 in");
  await expect(line.getByTestId("line-options")).toContainText("Paper: Textured cotton rag");
  await expect(page.getByTestId("subtotal")).toHaveText("$75.00");
  await expect(page.getByTestId("shipping")).toHaveText("$12.00");
  await expect(page.getByText("Estimated shipping (demo)")).toBeVisible();
  await expect(page.getByTestId("total")).toHaveText("$87.00");
  await expect(page.getByRole("link", { name: "Returns & refunds" }).first()).toBeVisible();
  await page.getByTestId("to-checkout").click();
  await expect(page.getByTestId("demo-notice")).toContainText("simulated");
  // no card fields
  await expect(page.locator("input[autocomplete^='cc-'], input[name*='card' i]")).toHaveCount(0);
  await expect(page.getByTestId("summary-line")).toHaveCount(1);
  await expect(page.getByTestId("total")).toHaveText("$87.00");
  await fillCheckout(page, { email });
  await page.getByTestId("place-order").click();
  await expect(page).toHaveURL(/\/order\/SA-[A-Z0-9]{8}$/);
  await expect(page.getByTestId("demo-order-notice")).toContainText("demo order");
  const ref = await page.getByTestId("order-reference").textContent();
  expect(ref).toMatch(/^SA-[A-Z0-9]{8}$/);
  const item = page.getByTestId("order-item");
  await expect(item).toContainText("Orchard Path (print)");
  await expect(item).toContainText("Size: 12 × 16 in, Paper: Textured cotton rag");
  await expect(page.getByTestId("order-total")).toHaveText("$87.00");
  await expect(page.getByTestId("order-address")).toContainText("12 Harbour Road");
  await expect(page.getByRole("link", { name: "Back to the work" })).toBeVisible();
  // the cart is cleared
  await expect(page.getByTestId("bag-count")).toHaveText("0");
  const dbOrders = await ordersByEmail(email);
  expect(dbOrders).toHaveLength(1);
  expect(dbOrders[0].totalCents).toBe(dbOrders[0].subtotalCents + dbOrders[0].shippingCents);
});

test("E-020 refreshing or revisiting the confirmation shows the same order and creates none", async ({ page }) => {
  const email = `${uniq("refresh")}@example.com`;
  const w = await createWork({ name: `E2E Refresh ${uniq()}`, priceCents: 5000 });
  await addToCart(page, w.slug);
  await page.goto("/checkout");
  await fillCheckout(page, { email });
  await page.getByTestId("place-order").click();
  await expect(page).toHaveURL(/\/order\//);
  const ref = await page.getByTestId("order-reference").textContent();
  const url = page.url();
  await page.reload();
  await expect(page.getByTestId("order-reference")).toHaveText(ref!);
  await page.goto(url);
  await expect(page.getByTestId("order-reference")).toHaveText(ref!);
  expect(await ordersByEmail(email)).toHaveLength(1);
  // cart cleared
  await page.goto("/cart");
  await expect(page.getByTestId("empty-cart")).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("sa_cart_v1") || "{}").lines?.length ?? 0);
  expect(stored).toBe(0);
});

test("E-021 an unknown order reference explains the format and leads back", async ({ page }) => {
  const res = await page.goto("/order/SA-ZZZZZZZZ");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "We couldn't find that order" })).toBeVisible();
  await expect(page.getByText("SA-")).toBeVisible();
  await page.getByRole("link", { name: "Back to the work" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("E-026/E-027/E-028 defaults: confirmation says nothing ships and no email is sent; returns says to email the studio", async ({ page, request }) => {
  const w = await createWork({ name: `E2E Notice ${uniq()}`, priceCents: 5000 });
  const { json } = await postCheckout(request, checkoutBody(uniq("tok"), [{ productId: w.id }], { ...CUSTOMER, email: `${uniq("notice")}@example.com` }));
  expect(json.status).toBe("created");
  await page.goto(`/order/${json.reference}`);
  await expect(page.getByTestId("demo-order-notice")).toContainText("nothing will ship");
  await expect(page.getByTestId("demo-order-notice")).toContainText("no email is sent");
  await page.goto("/returns");
  await expect(page.getByText("Email the studio at")).toBeVisible();
});

test("E-014 checkout with an empty cart shows no form and a way to the shop", async ({ page }) => {
  await page.goto("/checkout");
  await expect(page.getByTestId("checkout-empty")).toContainText("There's nothing to check out yet");
  await expect(page.getByTestId("checkout-form")).toHaveCount(0);
  await page.getByRole("link", { name: "Browse the work" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("E-015 invalid checkout details: summary linking to fields, messages under fields, typed values kept", async ({ page }) => {
  const w = await createWork({ name: `E2E Valid ${uniq()}`, priceCents: 5000 });
  await addToCart(page, w.slug);
  await page.goto("/checkout");
  await page.getByLabel("Full name").fill("Ada");
  await page.getByLabel("Email address").fill("bad-email");
  await page.getByTestId("place-order").click();
  const summary = page.getByTestId("error-summary");
  await expect(summary).toBeVisible();
  await expect(summary).toContainText("valid email address");
  await expect(summary).toContainText("street address");
  await expect(page.locator("#err-city")).toContainText("Please enter your city");
  await expect(page.getByLabel("Full name")).toHaveValue("Ada");
  await expect(page.getByLabel("Email address")).toHaveValue("bad-email");
  await summary.getByRole("link", { name: /Street address/ }).click();
  await expect(page.getByLabel("Street address")).toBeFocused();
  await expect(page.getByLabel("Email address")).toHaveAttribute("aria-invalid", "true");
  // the server validates again
  const { json } = await postCheckout(page.request, checkoutBody(uniq("tok"), [{ productId: w.id }], { ...CUSTOMER, email: "nope" }));
  expect(json.status).toBe("invalid");
  expect(json.fieldErrors.email).toBeTruthy();
  // no card fields and nothing about payment is requested
  await expect(page.getByLabel(/card/i)).toHaveCount(0);
});

test("E-016 / E-033 an item that became unavailable before placing the order is named, with Remove, and no order is created", async ({ page }) => {
  const email = `${uniq("e16")}@example.com`;
  const a = await createWork({ name: `E2E Vanishing ${uniq()}`, priceCents: 5000 });
  const b = await createWork({ name: `E2E Staying ${uniq()}`, priceCents: 7000 });
  await addToCart(page, a.slug);
  await addToCart(page, b.slug);
  await page.goto("/checkout");
  await db.update(products).set({ published: false }).where(eq(products.id, a.id));
  await fillCheckout(page, { email });
  await page.getByTestId("place-order").click();
  const issue = page.getByTestId("line-issue");
  await expect(issue).toContainText(a.name);
  await expect(issue).toContainText("no longer available");
  expect(await ordersByEmail(email)).toHaveLength(0);
  await issue.getByRole("button", { name: /Remove .* and continue/ }).click();
  await expect(page.getByTestId("summary-line")).toHaveCount(1);
  await page.getByTestId("place-order").click();
  await expect(page).toHaveURL(/\/order\//);
  const [o] = await ordersByEmail(email);
  const items = await orderItemsFor(o.id);
  expect(items.map((i) => i.name)).toEqual([b.name]);
});

test("E-016 sold-out stock: asking for more than is left is refused and offers a lower quantity", async ({ page }) => {
  const email = `${uniq("e16b")}@example.com`;
  const w = await createWork({ name: `E2E Few ${uniq()}`, priceCents: 5000, stock: 3 });
  await addToCart(page, w.slug, { qty: 3 });
  await page.goto("/checkout");
  await db.update(products).set({ stock: 1 }).where(eq(products.id, w.id));
  await fillCheckout(page, { email });
  await page.getByTestId("place-order").click();
  await expect(page.getByTestId("line-issue")).toContainText("Only 1");
  await page.getByRole("button", { name: "Change quantity to 1" }).click();
  await page.getByTestId("place-order").click();
  await expect(page).toHaveURL(/\/order\//);
  expect((await getWorkBySlugDb(w.slug)).stock).toBe(0);
  expect((await getWorkBySlugDb(w.slug)).saleStatus).toBe("sold"); // no options: one-of-a-kind rule
  expect(await ordersByEmail(email)).toHaveLength(1);
});

test("E-017 a price that changed since adding: summary updates, no order at the old price, then order at the new price", async ({ page }) => {
  const email = `${uniq("e17")}@example.com`;
  const w = await createWork({ name: `E2E Reprice ${uniq()}`, priceCents: 5000 });
  await addToCart(page, w.slug);
  await page.goto("/checkout");
  await expect(page.getByTestId("total")).toHaveText("$62.00");
  await db.update(products).set({ priceCents: 6000 }).where(eq(products.id, w.id));
  await fillCheckout(page, { email });
  await page.getByTestId("place-order").click();
  await expect(page.getByTestId("checkout-banner")).toContainText("price changed");
  await expect(page.getByTestId("total")).toHaveText("$72.00");
  expect(await ordersByEmail(email)).toHaveLength(0);
  await page.getByTestId("place-order").click();
  await expect(page).toHaveURL(/\/order\//);
  await expect(page.getByTestId("order-total")).toHaveText("$72.00");
  const [o] = await ordersByEmail(email);
  expect(o.subtotalCents).toBe(6000);
});

test("E-012 / E-034 the cart page refreshes prices on load and says what changed", async ({ page }) => {
  const w = await createWork({ name: `E2E CartPrice ${uniq()}`, priceCents: 5000 });
  await addToCart(page, w.slug);
  await db.update(products).set({ priceCents: 8000 }).where(eq(products.id, w.id));
  await page.goto("/cart");
  await expect(page.getByTestId("price-notice")).toContainText("$50.00 to $80.00");
  await expect(page.getByTestId("line-unit")).toContainText("$80.00");
  await expect(page.getByTestId("subtotal")).toHaveText("$80.00");
});

test("E-018 the same one-time token always returns the same order (concurrent and repeated submits)", async ({ request, page }) => {
  const w = await createWork({ name: `E2E Token ${uniq()}`, priceCents: 5000, stock: 10 });
  const token = uniq("token");
  const email = `${uniq("e18")}@example.com`;
  const body = checkoutBody(token, [{ productId: w.id, quantity: 2 }], { ...CUSTOMER, email });
  const results = await Promise.all([postCheckout(request, body), postCheckout(request, body), postCheckout(request, body)]);
  const refs = new Set(results.map((r) => r.json.reference));
  expect(results.every((r) => r.json.status === "created")).toBe(true);
  expect(refs.size).toBe(1);
  expect(await ordersByEmail(email)).toHaveLength(1);
  expect((await getWorkBySlugDb(w.slug)).stock).toBe(8); // stock reduced once
  // UI double click
  const email2 = `${uniq("e18b")}@example.com`;
  const w2 = await createWork({ name: `E2E DoubleClick ${uniq()}`, priceCents: 5000, stock: 10 });
  await addToCart(page, w2.slug);
  await page.goto("/checkout");
  await fillCheckout(page, { email: email2 });
  await page.getByTestId("place-order").dblclick();
  await expect(page).toHaveURL(/\/order\//);
  expect(await ordersByEmail(email2)).toHaveLength(1);
});

test("E-023 two shoppers buy the last piece at the same time: exactly one succeeds, the other is told", async ({ request }) => {
  const w = await createWork({ name: `E2E LastPiece ${uniq()}`, priceCents: 90000, stock: 1 });
  const mk = (i: number) => postCheckout(request, checkoutBody(uniq(`race${i}`), [{ productId: w.id }], { ...CUSTOMER, email: `${uniq("race")}@example.com` }));
  const results = await Promise.all([mk(1), mk(2), mk(3)]);
  const created = results.filter((r) => r.json.status === "created");
  const refused = results.filter((r) => r.json.status === "issues");
  expect(created).toHaveLength(1);
  expect(refused).toHaveLength(2);
  expect(refused[0].json.lines[0].issue.message).toMatch(/sold|available/);
  const p = await getWorkBySlugDb(w.slug);
  expect(p.stock).toBe(0);
  expect(p.saleStatus).toBe("sold"); // Sold everywhere
});

test("E-022 editing, repricing or deleting a work never changes a past order", async ({ page, request }) => {
  const w = await createWork({ name: `E2E Snapshot ${uniq()}`, priceCents: 12345 });
  const { json } = await postCheckout(request, checkoutBody(uniq("snap"), [{ productId: w.id }], { ...CUSTOMER, email: `${uniq("snap")}@example.com` }));
  expect(json.status).toBe("created");
  await db.update(products).set({ priceCents: 99900, name: "E2E Renamed" }).where(eq(products.id, w.id));
  await page.goto(`/order/${json.reference}`);
  await expect(page.getByTestId("order-item")).toContainText(w.name);
  await expect(page.getByTestId("order-item")).toContainText("$123.45");
  await db.delete(products).where(eq(products.id, w.id));
  await page.reload();
  await expect(page.getByTestId("order-item")).toContainText(w.name);
  await expect(page.getByTestId("order-total")).toHaveText("$135.45");
});

test("E-019 when checkout fails behind the scenes the shopper is told nothing was charged and no order exists", async () => {
  const bad = await pwRequest.newContext({ baseURL: "http://localhost:3101" });
  const res = await bad.post("/api/checkout", { data: checkoutBody("token-for-failure-1", [{ productId: "11111111-1111-1111-1111-111111111111" }]) });
  expect(res.status()).toBe(500);
  const json = await res.json();
  expect(json.status).toBe("error");
  expect(json.message).toBe("Something went wrong placing your demo order. Nothing was charged. Please try again.");
  const [none] = await db.select().from(orders).where(eq(orders.token, "token-for-failure-1"));
  expect(none).toBeUndefined();
  await bad.dispose();
});

test("E-025 with the database unreachable, shoppers see a friendly page with Try again and a saved-cart reminder", async ({ browser }) => {
  const ctx = await browser.newContext({ baseURL: "http://localhost:3101" });
  const page = await ctx.newPage();
  await page.goto("/");
  await expect(page.getByTestId("shop-error")).toContainText("The shop is having a moment");
  await expect(page.getByTestId("shop-error")).toContainText("your bag is saved");
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("ECONNREFUSED");
  await ctx.close();
});

test("E-024 re-running the seed script on a store that has products is refused without --confirm", async () => {
  const before = await db.select().from(products);
  let code = 0;
  let out = "";
  try {
    execFileSync("npx", ["tsx", "scripts/seed.ts"], { stdio: "pipe", encoding: "utf8" });
  } catch (e) {
    const err = e as { status: number; stderr: string };
    code = err.status;
    out = err.stderr;
  }
  expect(code).not.toBe(0);
  expect(out).toContain("Refusing to seed");
  expect(out).toContain("--confirm");
  const after = await db.select().from(products);
  expect(after.length).toBe(before.length);
});
