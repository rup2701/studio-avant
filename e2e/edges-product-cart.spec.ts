import { test, expect } from "@playwright/test";
import { addToCart, createWork, fillCheckout, uniq } from "./helpers";
import { db } from "../src/db";
import { optionValues, productImages } from "../src/db/schema";
import { eq } from "drizzle-orm";

test("E-001 a required option left unchosen blocks the add, names the choice, moves focus and keeps other choices", async ({ page }) => {
  const w = await createWork({
    name: `E2E Required ${uniq()}`,
    options: [{ name: "Size", required: true, values: [{ label: "Small" }, { label: "Medium", delta: 500 }] }],
  });
  await page.goto(`/work/${w.slug}`);
  await page.getByLabel("Quantity").fill("3");
  await page.getByTestId("add-to-cart").click();
  await expect(page.getByTestId("purchase-message")).toContainText("Please choose a size before adding to your cart");
  await expect(page.getByRole("radio", { name: "Small" })).toBeFocused();
  await expect(page.getByTestId("bag-count")).toHaveText("0");
  await expect(page.getByLabel("Quantity")).toHaveValue("3"); // other choices kept
  await page.locator("label", { hasText: "Medium" }).click();
  await expect(page.getByTestId("price")).toContainText("$105.00");
  await page.getByTestId("add-to-cart").click();
  await expect(page.getByTestId("purchase-message")).toContainText("Added to your cart");
  await page.goto("/cart");
  await expect(page.getByTestId("line-options")).toContainText("Size: Medium");
  await expect(page.getByTestId("line-qty")).toHaveText("3");
});

test("a required option with a default is preselected and honoured; an optional option may stay empty", async ({ page }) => {
  const w = await createWork({
    name: `E2E Default ${uniq()}`,
    options: [
      { name: "Finish", required: true, values: [{ label: "Matte", isDefault: true }, { label: "Gloss", delta: 300 }] },
      { name: "Frame", required: false, values: [{ label: "Oak", delta: 2000 }] },
    ],
  });
  await page.goto(`/work/${w.slug}`);
  await expect(page.getByRole("radio", { name: "Matte" })).toBeChecked();
  await expect(page.getByRole("radio", { name: /Oak/ })).not.toBeChecked();
  await page.getByTestId("add-to-cart").click();
  await expect(page.getByTestId("purchase-message")).toContainText("Added to your cart");
  await page.goto("/cart");
  await expect(page.getByTestId("line-options")).toContainText("Finish: Matte");
  await expect(page.getByTestId("line-options")).not.toContainText("Frame");
});

test("E-002 a sold-out option value is struck through, labelled and cannot be chosen; a stale page is still caught", async ({ page }) => {
  const w = await createWork({
    name: `E2E SoldOutOpt ${uniq()}`,
    options: [{ name: "Finish", required: true, values: [{ label: "Matte", isDefault: true }, { label: "Gloss" }, { label: "Satin", soldOut: true }] }],
  });
  await page.goto(`/work/${w.slug}`);
  const satin = page.getByRole("radio", { name: /Satin/ });
  await expect(satin).toBeDisabled();
  await expect(page.getByText("— Sold out")).toBeVisible();
  await expect(page.locator("label", { hasText: "Satin" })).toHaveClass(/line-through/);
  // Gloss sells out after the page was loaded; adding anyway is refused, other choices stay.
  await page.getByLabel("Quantity").fill("2");
  await db.update(optionValues).set({ soldOut: true }).where(eq(optionValues.id, w.optionIds["Finish"].values["Gloss"]));
  await page.getByText("Gloss").click();
  await page.getByTestId("add-to-cart").click();
  await expect(page.getByTestId("purchase-message")).toContainText("sold out");
  await expect(page.getByTestId("purchase-message")).toContainText("other choices have been kept");
  await expect(page.getByLabel("Quantity")).toHaveValue("2");
  await expect(page.getByRole("radio", { name: /Gloss/ })).toBeChecked();
  await expect(page.getByTestId("bag-count")).toHaveText("0");
});

test("E-003 personalization: live count, max length, charset, with the final-sale note only where supported", async ({ page }) => {
  const w = await createWork({ name: `E2E Personal ${uniq()}`, personalization: { maxLength: 10 } });
  await page.goto(`/work/${w.slug}`);
  const field = page.getByLabel("Personalization (optional)");
  await expect(field).toHaveAttribute("maxlength", "10");
  await expect(page.getByTestId("personal-count")).toHaveText("0 / 10");
  await field.fill("Hello");
  await expect(page.getByTestId("personal-count")).toHaveText("5 / 10");
  await expect(page.getByText("final sale unless they arrive damaged or incorrect")).toBeVisible();
  await field.fill("Ann·Bob");
  await page.getByTestId("add-to-cart").click();
  await expect(page.getByTestId("purchase-message")).toContainText("letters, numbers, spaces and & . , ' - only");
  await expect(page.getByTestId("bag-count")).toHaveText("0");
  await field.evaluate((el) => el.removeAttribute("maxlength"));
  await field.fill("ABCDEFGHIJKL");
  await page.getByTestId("add-to-cart").click();
  await expect(page.getByTestId("purchase-message")).toContainText("at most 10 characters");
  await field.fill("Ann & Bob");
  await page.getByTestId("add-to-cart").click();
  await expect(page.getByTestId("purchase-message")).toContainText("Added to your cart");
  await page.goto("/cart");
  await expect(page.getByTestId("line-personalization")).toContainText("Ann & Bob");
  // a work without personalization has no field and no final-sale note
  const plain = await createWork({ name: `E2E Plain ${uniq()}` });
  await page.goto(`/work/${plain.slug}`);
  await expect(page.getByLabel("Personalization (optional)")).toHaveCount(0);
  await expect(page.getByText("final sale")).toHaveCount(0);
});

test("E-004 spaces-only personalization is not stored as personalization", async ({ page }) => {
  const w = await createWork({ name: `E2E Spaces ${uniq()}`, personalization: { maxLength: 20 } });
  await page.goto(`/work/${w.slug}`);
  await page.getByLabel("Personalization (optional)").fill("     ");
  await page.getByTestId("add-to-cart").click();
  await expect(page.getByTestId("purchase-message")).toContainText("Added to your cart");
  await page.goto("/cart");
  await expect(page.getByTestId("line-personalization")).toHaveCount(0);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("sa_cart_v1")!).lines[0].personalization);
  expect(stored).toBeNull();
  // whitespace is collapsed in real text
  await page.goto(`/work/${w.slug}`);
  await page.getByLabel("Personalization (optional)").fill("  Ann    Bob ");
  await page.getByTestId("add-to-cart").click();
  await expect(page.getByTestId("purchase-message")).toContainText("Added");
  await page.goto("/cart");
  await expect(page.getByTestId("line-personalization")).toContainText("“Ann Bob”");
});

test("E-005 unknown product URL: not-found with a path back", async ({ page }) => {
  const res = await page.goto("/work/no-such-work-anywhere");
  expect(res?.status()).toBe(404);
  await expect(page.getByTestId("not-found")).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to the work" })).toHaveAttribute("href", "/work");
});

test("E-006 a bookmarked work that cannot be bought explains itself and has no buy button", async ({ page }) => {
  const sold = await createWork({ name: `E2E Gone ${uniq()}`, saleStatus: "sold", stock: 0 });
  await page.goto(`/work/${sold.slug}`);
  await expect(page.getByTestId("status-text")).toHaveText("Sold");
  await expect(page.getByText("can no longer be bought")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add to cart" })).toHaveCount(0);
  const soldOut = await createWork({ name: `E2E SoldOut ${uniq()}`, stock: 0 });
  await page.goto(`/work/${soldOut.slug}`);
  await expect(page.getByTestId("status-text")).toHaveText("Sold out");
  await expect(page.getByRole("button", { name: "Add to cart" })).toHaveCount(0);
  // a draft shows the standard not-found page to shoppers
  const draft = await createWork({ name: `E2E Hidden ${uniq()}`, published: false });
  const res = await page.goto(`/work/${draft.slug}`);
  expect(res?.status()).toBe(404);
  await expect(page.getByTestId("not-found")).toBeVisible();
});

test("E-007 buying beyond the per-item maximum of 10 is refused with a message and no false confirmation", async ({ page }) => {
  const w = await createWork({ name: `E2E Max ${uniq()}`, priceCents: 1000, stock: 50, category: "prints" });
  await page.goto(`/work/${w.slug}`);
  await page.getByLabel("Quantity").fill("10");
  await page.getByTestId("add-to-cart").click();
  await expect(page.getByTestId("purchase-message")).toContainText("Added to your cart");
  await expect(page.getByTestId("bag-count")).toHaveText("10");
  await page.getByLabel("Quantity").fill("1");
  await page.getByTestId("add-to-cart").click();
  const msg = page.getByTestId("purchase-message");
  await expect(msg).toContainText("already have 10");
  await expect(msg).not.toContainText("Added to your cart");
  await expect(page.getByTestId("bag-count")).toHaveText("10");
  await page.getByRole("link", { name: /Bag/ }).click();
  await expect(page.getByTestId("line-qty")).toHaveText("10");
  await expect(page.getByRole("button", { name: /Increase quantity/ })).toBeDisabled();
  await expect(page.getByTestId("max-note")).toContainText("Most you can buy: 10");
});

test("one-of-a-kind originals cannot be added twice", async ({ page }) => {
  const w = await createWork({ name: `E2E Original ${uniq()}`, stock: 1 });
  await addToCart(page, w.slug);
  await page.goto(`/work/${w.slug}`);
  await page.getByTestId("add-to-cart").click();
  await expect(page.getByTestId("purchase-message")).toContainText("one of a kind and is already in your bag");
  await expect(page.getByTestId("bag-count")).toHaveText("1");
});

test("E-008 identical configurations merge into one line; different options or personalization stay separate", async ({ page }) => {
  const w = await createWork({
    name: `E2E Merge ${uniq()}`,
    priceCents: 2000,
    personalization: { maxLength: 20 },
    options: [{ name: "Size", required: true, values: [{ label: "Small", isDefault: true }, { label: "Large", delta: 1000 }] }],
  });
  await addToCart(page, w.slug); // Small
  await addToCart(page, w.slug); // Small again
  await page.goto(`/work/${w.slug}`);
  await page.getByLabel("Personalization (optional)").fill("Ann");
  await page.getByTestId("add-to-cart").click();
  await expect(page.getByTestId("purchase-message")).toContainText("Added");
  await page.getByText("Large").click();
  await page.getByTestId("add-to-cart").click();
  await expect(page.getByTestId("purchase-message")).toContainText("Added");
  await page.goto("/cart");
  await expect(page.getByTestId("cart-line")).toHaveCount(3);
  await expect(page.getByTestId("line-qty").first()).toHaveText("2");
  await expect(page.getByTestId("subtotal")).toHaveText("$90.00"); // 2×20 + 20 + 30
  await expect(page.getByTestId("item-count")).toHaveText("4");
});

test("E-009 quantity: minus disabled at 1, changes update line and subtotal, remove is separate", async ({ page }) => {
  const a = await createWork({ name: `E2E QtyA ${uniq()}`, priceCents: 1999, stock: 20 });
  const b = await createWork({ name: `E2E QtyB ${uniq()}`, priceCents: 3000, stock: 20 });
  await addToCart(page, a.slug);
  await addToCart(page, b.slug);
  await page.goto("/cart");
  const lineA = page.getByTestId("cart-line").filter({ hasText: a.name });
  await expect(lineA.getByRole("button", { name: /Decrease quantity/ })).toBeDisabled();
  await lineA.getByRole("button", { name: /Increase quantity/ }).click();
  await lineA.getByRole("button", { name: /Increase quantity/ }).click();
  await expect(lineA.getByTestId("line-qty")).toHaveText("3");
  await expect(lineA.getByTestId("line-total")).toHaveText("$59.97"); // 3 × 19.99
  await expect(page.getByTestId("subtotal")).toHaveText("$89.97");
  await expect(page.getByTestId("bag-count")).toHaveText("4");
  await lineA.getByRole("button", { name: /Decrease quantity/ }).click();
  await expect(lineA.getByTestId("line-qty")).toHaveText("2");
  await page.getByRole("button", { name: `Remove ${a.name} from your bag` }).click();
  await expect(page.getByTestId("cart-line")).toHaveCount(1);
  await expect(page.getByTestId("subtotal")).toHaveText("$30.00");
  await expect(page.getByTestId("bag-count")).toHaveText("1");
  // cart persists across navigation
  await page.goto("/");
  await expect(page.getByTestId("bag-count")).toHaveText("1");
  await page.getByRole("link", { name: /Bag/ }).click();
  await expect(page.getByTestId("cart-line")).toHaveCount(1);
  await page.getByRole("button", { name: /Remove/ }).click();
  await expect(page.getByTestId("empty-cart")).toContainText("Your bag is empty");
  await expect(page.getByRole("link", { name: "Browse the work" })).toHaveAttribute("href", "/work");
});

test("E-010 when browser storage is blocked the cart still works for the visit and a notice says it won't be saved", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", { get() { throw new DOMException("blocked", "SecurityError"); } });
  });
  const w = await createWork({ name: `E2E Blocked ${uniq()}`, priceCents: 4000 });
  await page.goto(`/work/${w.slug}`);
  await page.getByTestId("add-to-cart").click();
  await expect(page.getByTestId("purchase-message")).toContainText("Added to your cart");
  await expect(page.getByTestId("bag-count")).toHaveText("1");
  await page.getByRole("link", { name: "View your bag" }).click(); // client-side navigation keeps the in-memory cart
  await expect(page.getByTestId("cart-line")).toHaveCount(1);
  await expect(page.getByTestId("storage-notice")).toContainText("Your cart won't be saved if you close this tab");
  expect(errors).toEqual([]);
});

test("E-011 two tabs stay in sync without a reload", async ({ context }) => {
  const w = await createWork({ name: `E2E Tabs ${uniq()}`, priceCents: 4000 });
  const p1 = await context.newPage();
  const p2 = await context.newPage();
  await p2.goto("/");
  await expect(p2.getByTestId("bag-count")).toHaveText("0");
  await addToCart(p1, w.slug);
  await expect(p2.getByTestId("bag-count")).toHaveText("1");
});

test("E-013 shipping appears or disappears at the free-shipping line and cart and checkout agree", async ({ page }) => {
  const w = await createWork({ name: `E2E Ship ${uniq()}`, priceCents: 20000, stock: 10 });
  await addToCart(page, w.slug);
  await page.goto("/cart");
  await expect(page.getByTestId("shipping")).toHaveText("$12.00");
  await expect(page.getByTestId("total")).toHaveText("$212.00");
  await page.getByRole("button", { name: /Increase quantity/ }).click();
  await expect(page.getByTestId("shipping")).toHaveText("Free");
  await expect(page.getByTestId("total")).toHaveText("$400.00");
  await page.getByTestId("to-checkout").click();
  await expect(page.getByTestId("shipping")).toHaveText("Free");
  await expect(page.getByTestId("total")).toHaveText("$400.00");
  await page.goto("/cart");
  await page.getByRole("button", { name: /Decrease quantity/ }).click();
  await expect(page.getByTestId("shipping")).toHaveText("$12.00");
  await page.goto("/checkout");
  await expect(page.getByTestId("shipping")).toHaveText("$12.00");
  await expect(page.getByTestId("total")).toHaveText("$212.00");
  // exactly $300 is not "over" $300
  const w2 = await createWork({ name: `E2E ShipEdge ${uniq()}`, priceCents: 15000, stock: 10 });
  await page.evaluate(() => localStorage.removeItem("sa_cart_v1"));
  await addToCart(page, w2.slug, { qty: 2 });
  await page.goto("/cart");
  await expect(page.getByTestId("subtotal")).toHaveText("$300.00");
  await expect(page.getByTestId("shipping")).toHaveText("$12.00");
});

test("a work with photos shows its cover on the card and every photo on the work page", async ({ page }) => {
  const w = await createWork({ name: `E2E Photos ${uniq()}`, priceCents: 4000 });
  await db.insert(productImages).values([
    { productId: w.id, url: "/uploads/none-1.jpg", originalUrl: "/uploads/none-1.jpg", alt: "First view", position: 0, width: 800, height: 600 },
    { productId: w.id, url: "/uploads/none-2.jpg", originalUrl: "/uploads/none-2.jpg", alt: "Second view", position: 1, width: 600, height: 800 },
  ]);
  await page.goto(`/work/${w.slug}`);
  await expect(page.getByTestId("work-images").getByRole("img")).toHaveCount(2);
  await expect(page.getByRole("img", { name: "Second view" })).toBeVisible();
  await page.goto("/work");
  const card = page.getByTestId("work-card").filter({ hasText: w.name });
  await expect(card.getByRole("img", { name: "First view" })).toHaveAttribute("src", "/uploads/none-1.jpg");
  // uncropped: the image box follows the photo's own proportions
  const ratio = await card.locator("img").evaluate((el) => el.parentElement!.getBoundingClientRect().width / el.parentElement!.getBoundingClientRect().height);
  expect(Math.abs(ratio - 800 / 600)).toBeLessThan(0.02);
});

test("checkout fields: country list is limited to the supported countries", async ({ page }) => {
  const w = await createWork({ name: `E2E Countries ${uniq()}`, priceCents: 4000 });
  await addToCart(page, w.slug);
  await page.goto("/checkout");
  const options = await page.getByLabel("Country").locator("option").allTextContents();
  expect(options).toEqual(["United States", "Canada", "United Kingdom"]);
  await fillCheckout(page, { country: "Canada" });
  await expect(page.getByLabel("Country")).toHaveValue("Canada");
});
