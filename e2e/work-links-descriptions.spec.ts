import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { adminLogin, createWork, deleteE2EWorks, uniq } from "./helpers";
import { db } from "../src/db";
import { products } from "../src/db/schema";
import { excerpt } from "../src/lib/utils";

test.beforeAll(async () => {
  await deleteE2EWorks();
});
test.afterAll(async () => {
  await deleteE2EWorks();
});

test.describe("links that lead to the Work page", () => {
  test("'Browse the work' (empty bag, empty checkout), 'Continue browsing' (bag, after adding) and 'Back to the work' (not-found, order) lead to /work", async ({ page }) => {
    await page.goto("/cart");
    await expect(page.getByRole("link", { name: "Browse the work" })).toHaveAttribute("href", "/work");
    await page.getByRole("link", { name: "Browse the work" }).click();
    await expect(page).toHaveURL(/\/work$/);

    const w = await createWork({ name: `E2E Links ${uniq()}`, priceCents: 5000 });
    await page.goto(`/work/${w.slug}`);
    await page.getByTestId("add-to-cart").click();
    await expect(page.getByTestId("purchase-message")).toContainText("Added to your cart");
    await expect(page.getByRole("link", { name: "Continue browsing" })).toHaveAttribute("href", "/work");
    await page.goto("/cart");
    await expect(page.getByTestId("cart-line")).toHaveCount(1);
    await page.getByRole("link", { name: "Continue browsing" }).click();
    await expect(page).toHaveURL(/\/work$/);

    await page.goto("/order/SA-ZZZZZZZZ");
    await expect(page.getByRole("link", { name: "Back to the work" })).toHaveAttribute("href", "/work");
    await page.goto("/work/nothing-here-at-all");
    await expect(page.getByRole("link", { name: "Back to the work" })).toHaveAttribute("href", "/work");
  });

  test("'Show all work' on a category page leads to /work", async ({ page }) => {
    await page.goto("/category/prints");
    await page.getByRole("link", { name: "Show all work" }).click();
    await expect(page).toHaveURL(/\/work$/);
  });
});

test.describe("work page: back link and the Work menu item", () => {
  test("every work page has '← All work' near the top, going to /work", async ({ page }) => {
    for (const slug of ["low-tide-morning", "salt-flats-at-dusk", "grey-room", "study-for-a-quiet-room", "orchard-path-print"]) {
      await page.goto(`/work/${slug}`);
      const back = page.getByTestId("back-to-work");
      await expect(back, slug).toHaveText("← All work");
      await expect(back, slug).toHaveAttribute("href", "/work");
      const top = await back.evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
      expect(top, slug).toBeLessThan(260);
    }
    await page.goto("/work/tide-line");
    await page.getByTestId("back-to-work").click();
    await expect(page).toHaveURL(/\/work$/);
  });

  test("a visitor who came from a series page gets a link back to that series (also after Next/Previous)", async ({ page }) => {
    await page.goto("/series/low-tide");
    await page.getByTestId("work-card").filter({ hasText: "Tide Line" }).click();
    await expect(page).toHaveURL(/\/work\/tide-line/);
    const back = page.getByTestId("back-to-work");
    await expect(back).toHaveAttribute("href", "/series/low-tide");
    await expect(back).toContainText("Low Tide");
    await expect(back).not.toHaveText("← All work");
    await page.getByRole("link", { name: /Next|Previous/ }).first().click();
    await expect(page.getByTestId("back-to-work")).toHaveAttribute("href", "/series/low-tide");
    await page.getByTestId("back-to-work").click();
    await expect(page).toHaveURL(/\/series\/low-tide$/);
    // a made-up or wrong series in the address falls back to All work
    await page.goto("/work/tide-line?from=orchard-light");
    await expect(page.getByTestId("back-to-work")).toHaveAttribute("href", "/work");
    await page.goto("/work/tide-line?from=nonsense");
    await expect(page.getByTestId("back-to-work")).toHaveText("← All work");
  });

  test("the header 'Work' item is visible and marked current on the Work page and on every work page", async ({ page }) => {
    for (const path of ["/work", "/work/low-tide-morning", "/work/grey-room", "/work/orchard-path-print", "/work/tide-line?from=low-tide"]) {
      await page.goto(path);
      const item = page.locator("header").getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Work", exact: true });
      await expect(item, path).toBeVisible();
      await expect(item, path).toHaveAttribute("aria-current", "page");
      await expect(item, path).toHaveCSS("font-weight", "500");
      const border = await item.evaluate((el) => getComputedStyle(el).borderBottomColor);
      expect(border, path).not.toBe("rgba(0, 0, 0, 0)");
      // the other items are not marked
      await expect(page.locator("header").getByRole("navigation", { name: "Main" }).locator("[aria-current=page]")).toHaveCount(1);
    }
    // not current elsewhere
    await page.goto("/about");
    await expect(page.locator("header").getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Work", exact: true })).not.toHaveAttribute("aria-current", "page");
  });

  test("on a phone the Work item is in the menu, and marked current on a work page", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/work/low-tide-morning");
    await page.getByRole("button", { name: "Menu" }).click();
    const item = page.locator("#mobile-menu").getByRole("link", { name: "Work", exact: true });
    await expect(item).toBeVisible();
    await expect(item).toHaveAttribute("aria-current", "page");
  });
});

test.describe("home page price marks and About this work", () => {
  test("home shows the price on works for sale, 'Sold' on sold works, and nothing extra on the rest", async ({ page }) => {
    await page.goto("/");
    const item = (n: string) => page.getByTestId("home-work").filter({ hasText: n });
    await expect(item("Low Tide, Morning").getByTestId("home-mark")).toHaveText("$2,400.00");
    await expect(item("Tide Line").getByTestId("home-mark")).toHaveText("$400.00");
    await expect(page.getByTestId("home-work").filter({ hasText: /Orchard Light I,/ }).getByTestId("home-mark")).toHaveText("$3,200.00");
    for (const n of ["Salt Flats at Dusk", "Orchard Light II", "Windfall"]) await expect(item(n).getByTestId("home-mark")).toHaveText("Sold");
    // private collection: no mark, no price, no status word
    await expect(item("Grey Room").getByTestId("home-mark")).toHaveCount(0);
    await expect(item("Grey Room")).not.toContainText(/\$|Sold|Available|Private|Not for sale/);
    await expect(page.getByTestId("home-images")).not.toContainText("Available");
    // not for sale (marked on home by the owner): no mark either
    const w = await createWork({ name: `E2E HomeNfs ${uniq()}`, saleStatus: "not_for_sale", priceCents: 10000 });
    await db.update(products).set({ showOnHome: true, homePosition: 95 }).where(eq(products.id, w.id));
    await page.goto("/");
    await expect(item(w.name).getByTestId("home-mark")).toHaveCount(0);
    await expect(item(w.name)).not.toContainText(/\$|Sold|Available|Not for sale/);
    await db.delete(products).where(eq(products.id, w.id));
  });

  test("home shows a short excerpt (first sentence) of 'About this work' under the image; the Work page grid shows no description", async ({ page }) => {
    await page.goto("/");
    const lowTide = page.getByTestId("home-work").filter({ hasText: "Low Tide, Morning" });
    const ex = lowTide.getByTestId("home-excerpt");
    await expect(ex).toHaveText("Painted over three weeks on the flats at first light, when the sand is still wet and the sky sits in it like a second picture.");
    // the excerpt is below the image and does not repeat the second sentence
    await expect(lowTide).not.toContainText("The horizon is kept low");
    const [imgBox, exBox] = await Promise.all([lowTide.getByRole("img").first().boundingBox(), ex.boundingBox()]);
    expect(exBox!.y).toBeGreaterThan(imgBox!.y + imgBox!.height - 1);
    // every shown sample work has an excerpt of at most 140 characters
    const texts = await page.getByTestId("home-excerpt").allTextContents();
    expect(texts.length).toBe(7);
    for (const t of texts) expect(t.length).toBeLessThanOrEqual(140);
    // Work page grid: image, title, year, status or price only
    await page.goto("/work");
    await expect(page.getByTestId("home-excerpt")).toHaveCount(0);
    const card = page.getByTestId("work-card").filter({ hasText: "Low Tide, Morning" }).first();
    await expect(card).not.toContainText("Painted over three weeks");
    await expect(card.locator("p")).toHaveCount(2);
    // series and category grids do not show it either
    await page.goto("/series/low-tide");
    await expect(page.getByText("Painted over three weeks")).toHaveCount(0);
    await page.goto("/category/original-paintings");
    await expect(page.getByText("Painted over three weeks")).toHaveCount(0);
  });

  test("the work page shows 'About this work' in full; a work without one shows no such block", async ({ page }) => {
    await page.goto("/work/low-tide-morning");
    const about = page.getByTestId("about-work");
    await expect(about.getByRole("heading", { name: "About this work" })).toBeVisible();
    await expect(about).toContainText("Painted over three weeks on the flats at first light");
    await expect(about).toContainText("The horizon is kept low and almost lost. Most of the work is in the greys.");
    const w = await createWork({ name: `E2E NoAbout ${uniq()}`, priceCents: 5000 });
    await page.goto(`/work/${w.slug}`);
    await expect(page.getByTestId("about-work")).toHaveCount(0);
    await expect(page.getByText("About this work")).toHaveCount(0);
  });

  test("every sample work has a description of one to three sentences", async () => {
    const rows = await db.select().from(products).where(eq(products.isSample, true));
    expect(rows.length).toBe(12);
    for (const r of rows) {
      const sentences = r.description.trim().split(/(?<=[.!?])\s+/).filter(Boolean);
      expect(sentences.length, r.name).toBeGreaterThanOrEqual(1);
      expect(sentences.length, r.name).toBeLessThanOrEqual(3);
    }
  });

  test("excerpt rule: first sentence only; at most 140 characters; long sentences are cut at a word with an ellipsis", async () => {
    expect(excerpt("One. Two. Three.")).toBe("One.");
    expect(excerpt("  A line\nwith   breaks! And more.  ")).toBe("A line with breaks!");
    expect(excerpt("")).toBe("");
    expect(excerpt("No full stop here")).toBe("No full stop here");
    const long = `${"word ".repeat(60)}end. Next sentence.`;
    const e = excerpt(long);
    expect(e.length).toBeLessThanOrEqual(140);
    expect(e.endsWith("…")).toBe(true);
    expect(e).not.toContain("Next");
    expect(excerpt("x".repeat(300)).length).toBeLessThanOrEqual(140);
  });

  test("owner edits 'About this work'; the work page shows it in full and home shows the first sentence; clearing it removes both", async ({ page }) => {
    const w = await createWork({ name: `E2E About ${uniq()}`, priceCents: 7000 });
    await db.update(products).set({ showOnHome: true, homePosition: 96 }).where(eq(products.id, w.id));
    await adminLogin(page);
    await page.goto(`/admin/works/${w.id}`);
    const field = page.getByLabel("About this work (optional, 2000 characters at most)");
    await expect(field).toHaveValue("");
    const first = "This one began as a note on the back of a ticket.";
    const rest = "It took a year to finish.\n\nA second paragraph about the colour.";
    await field.fill(`${first} ${rest}`);
    await page.getByTestId("save-work").click();
    await expect(page.getByTestId("save-message")).toBeVisible();
    await page.reload();
    await expect(field).toHaveValue(`${first} ${rest}`);
    // shopper side
    await page.goto(`/work/${w.slug}`);
    const about = page.getByTestId("about-work");
    await expect(about).toContainText(first);
    await expect(about).toContainText("It took a year to finish.");
    await expect(about).toContainText("A second paragraph about the colour.");
    await page.goto("/");
    const home = page.getByTestId("home-work").filter({ hasText: w.name });
    await expect(home.getByTestId("home-excerpt")).toHaveText(first);
    await expect(home.getByTestId("home-mark")).toHaveText("$70.00");
    // too long is refused with a message
    await page.goto(`/admin/works/${w.id}`);
    await field.fill("x".repeat(2001));
    await page.getByTestId("save-work").click();
    await expect(page.getByTestId("error-description")).toContainText("2000 characters at most");
    // clear it
    await field.fill("");
    await page.getByTestId("save-work").click();
    await expect(page.getByTestId("save-message")).toBeVisible();
    await page.goto(`/work/${w.slug}`);
    await expect(page.getByTestId("about-work")).toHaveCount(0);
    await page.goto("/");
    await expect(page.getByTestId("home-work").filter({ hasText: w.name }).getByTestId("home-excerpt")).toHaveCount(0);
  });
});
