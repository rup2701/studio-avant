import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { createWork, deleteE2EWorks } from "./helpers";
import { db } from "../src/db";
import { emailSignups, productImages, products } from "../src/db/schema";

test.beforeAll(async () => {
  await deleteE2EWorks();
});

test.describe("home and portfolio", () => {
  test("home is a composed page: intro, images, words, newsletter, footer — in that order; no filters, no grid, no hero", async ({ page }) => {
    await page.goto("/");
    const intro = page.getByTestId("intro");
    await expect(intro.getByRole("heading", { level: 1 })).toHaveText("Studio Avant");
    await expect(page.getByTestId("intro-by")).toHaveText("by Neil Patrick");
    await expect(page.getByTestId("intro-line")).not.toBeEmpty();
    const order = await page.evaluate(() => {
      const q = (s: string) => document.querySelector(s)!;
      const pos = (el: Element) => el.getBoundingClientRect().top + window.scrollY;
      return [
        pos(q("[data-testid=intro]")),
        pos(q("[data-testid=home-images]")),
        pos(q("[data-testid=home-words]")),
        pos(q("[data-testid=email-signup]")),
        pos(q("footer")),
      ];
    });
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // no filters and no uniform catalog grid on the home page
    await expect(page.getByRole("group", { name: "Filter works" })).toHaveCount(0);
    await expect(page.getByTestId("work-grid")).toHaveCount(0);
    await expect(page.getByTestId("work-card")).toHaveCount(0);
    // header menu per brief: Work is the full catalog, the wordmark links home
    const nav = page.getByRole("navigation", { name: "Main" }).first();
    for (const l of ["Work", "About", "Exhibitions", "Commissions"]) await expect(nav.getByRole("link", { name: l, exact: true })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Work", exact: true })).toHaveAttribute("href", "/work");
    await expect(page.getByRole("link", { name: /^shop$/i })).toHaveCount(0);
    await expect(page.locator("header").getByRole("link", { name: "Studio Avant" })).toHaveAttribute("href", "/");
    await expect(page.getByTestId("bag-count")).toHaveText("0");
    // no link to the owner area anywhere in the shopper experience
    const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href")));
    expect(hrefs.filter((h) => h?.includes("/admin"))).toEqual([]);
  });

  test("home images: only works marked 'show on home', in the owner's order, one featured full width, uneven placement, links to the work", async ({ page }) => {
    await page.goto("/");
    const items = page.getByTestId("home-work");
    await expect(items).toHaveCount(7);
    await expect(items).toContainText(["Low Tide, Morning", "Tide Line", "Orchard Light I", "Salt Flats at Dusk", "Windfall", "Grey Room", "Orchard Light II"]);
    // not shown on home: the unmarked original and every print
    await expect(page.getByTestId("home-images")).not.toContainText("Study for a Quiet Room");
    await expect(page.getByTestId("home-images")).not.toContainText("(print)");
    // every one links to its work page
    await expect(items.first()).toHaveAttribute("href", "/work/low-tide-morning");
    // 'Available' mark only where it applies (3 available originals; Tide Line, Low Tide Morning, Orchard Light I)
    await expect(page.getByTestId("home-available")).toHaveCount(3);
    await expect(page.getByTestId("home-work").filter({ hasText: "Salt Flats at Dusk" })).not.toContainText("Available");
    // title and year shown quietly
    await expect(items.first()).toContainText("2024");
    // geometry: contained column, a featured item as wide as the column, other widths varied, rows uneven
    const m = await page.evaluate(() => {
      const box = (el: Element) => el.getBoundingClientRect();
      const ul = document.querySelector("[data-testid=home-images]")!;
      const col = box(ul);
      const lis = [...ul.children] as HTMLElement[];
      return {
        colW: col.width,
        vw: window.innerWidth,
        items: lis.map((li) => ({ w: box(li).width, left: box(li).left - col.left, top: box(li).top, featured: li.dataset.featured })),
      };
    });
    expect(m.colW).toBeLessThanOrEqual(1200);
    expect(m.colW).toBeLessThan(m.vw);
    const featured = m.items.filter((i) => i.featured === "true");
    expect(featured).toHaveLength(1);
    expect(Math.abs(featured[0].w - m.colW)).toBeLessThan(2);
    const widths = new Set(m.items.map((i) => Math.round(i.w)));
    expect(widths.size).toBeGreaterThanOrEqual(3);
    const lefts = new Set(m.items.map((i) => Math.round(i.left)));
    expect(lefts.size).toBeGreaterThanOrEqual(3);
    // nothing sticks out of the column
    for (const i of m.items) expect(i.left + i.w).toBeLessThanOrEqual(m.colW + 1);
    // "See all work" leads to the Work page
    await page.getByTestId("see-all-work").click();
    await expect(page).toHaveURL(/\/work$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Work");
  });

  test("home images are never cropped: a photo's box follows its own proportions, tall or wide", async ({ page }) => {
    const wide = await createWork({ name: `E2E HomeWide ${Date.now()}`, priceCents: 5000 });
    const tall = await createWork({ name: `E2E HomeTall ${Date.now()}`, priceCents: 5000 });
    await db.insert(productImages).values([
      { productId: wide.id, url: "/uploads/none-w.jpg", originalUrl: "/uploads/none-w.jpg", alt: "Wide view", position: 0, width: 1600, height: 900 },
      { productId: tall.id, url: "/uploads/none-t.jpg", originalUrl: "/uploads/none-t.jpg", alt: "Tall view", position: 0, width: 900, height: 1600 },
    ]);
    await db.update(products).set({ showOnHome: true, homePosition: 90, featureOnHome: false }).where(eq(products.id, wide.id));
    await db.update(products).set({ showOnHome: true, homePosition: 91, featureOnHome: false }).where(eq(products.id, tall.id));
    await page.goto("/");
    for (const [n, ratio] of [["Wide view", 1600 / 900], ["Tall view", 900 / 1600]] as const) {
      const r = await page.getByRole("img", { name: n }).evaluate((el) => {
        const b = el.parentElement!.getBoundingClientRect();
        const i = getComputedStyle(el).objectFit;
        return { ratio: b.width / b.height, fit: i };
      });
      expect(Math.abs(r.ratio - ratio), n).toBeLessThan(0.02);
      expect(r.fit).toBe("contain");
    }
    await db.delete(products).where(eq(products.id, wide.id));
    await db.delete(products).where(eq(products.id, tall.id));
  });

  test("home words block: several paragraphs, no image until the owner adds one", async ({ page }) => {
    await page.goto("/");
    const words = page.getByTestId("home-words");
    expect(await words.locator("p").count()).toBeGreaterThanOrEqual(3);
    await expect(page.getByTestId("words-image")).toHaveCount(0);
  });

  test("newsletter block: heading, one line, one email field and a Subscribe button", async ({ page }) => {
    await page.goto("/");
    const n = page.getByTestId("email-signup");
    await expect(n.getByRole("heading", { name: "Newsletter" })).toBeVisible();
    await expect(n).toContainText("New work and studio news, now and then");
    await expect(n.locator("input:not([type=hidden])")).toHaveCount(1);
    await expect(n.getByRole("button", { name: "Subscribe" })).toBeVisible();
  });

  test("Work page: every published work in a grid, title and year, status mark; sample catalog matches the brief", async ({ page }) => {
    await page.goto("/work");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Work");
    await expect(page.getByTestId("work-card")).toHaveCount(12);
    await expect(page.locator("header").getByRole("link", { name: "Work", exact: true })).toHaveAttribute("aria-current", "page");
    const marks = await page.getByTestId("status-mark").allTextContents();
    expect(marks.filter((m) => m.startsWith("Available · ")).length).toBe(7); // 3 originals + 4 prints
    expect(marks.filter((m) => m === "Sold").length).toBe(3);
    expect(marks.filter((m) => m === "Private collection").length).toBe(1);
    expect(marks.filter((m) => m === "Not for sale").length).toBe(1);
    // sold works show no price
    const soldCard = page.getByTestId("work-card").filter({ hasText: "Salt Flats at Dusk" });
    await expect(soldCard).toContainText("Sold");
    await expect(soldCard).not.toContainText("$");
    await expect(page.getByTestId("work-card").filter({ hasText: "Low Tide, Morning," }).first()).toContainText("2024");
    // no photos invented: placeholders only
    await expect(page.locator("[data-testid=work-card] img")).toHaveCount(0);
    await expect(page.getByRole("img", { name: "No image yet" }).first()).toBeVisible();
    // each links to its work page
    await page.getByTestId("work-card").filter({ hasText: "Salt Flats at Dusk" }).click();
    await expect(page).toHaveURL(/\/work\/salt-flats-at-dusk$/);
  });

  test("Work page filters (All, one per series, Available) filter the grid without leaving the page", async ({ page }) => {
    await page.goto("/work");
    const group = page.getByRole("group", { name: "Filter works" });
    await expect(group.getByRole("button")).toHaveText(["All", "Low Tide", "Orchard Light", "Available"]);
    await group.getByRole("button", { name: "Low Tide" }).click();
    await expect(page.getByTestId("work-card")).toHaveCount(4);
    await expect(page).toHaveURL(/\/work$/);
    await group.getByRole("button", { name: "Orchard Light" }).click();
    await expect(page.getByTestId("work-card")).toHaveCount(5);
    await group.getByRole("button", { name: "Available" }).click();
    await expect(page.getByTestId("work-card")).toHaveCount(7);
    await group.getByRole("button", { name: "All" }).click();
    await expect(page.getByTestId("work-card")).toHaveCount(12);
    await expect(group.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
  });

  test("series page lists the series title, text and its works", async ({ page }) => {
    await page.goto("/series/low-tide");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Low Tide");
    await expect(page.getByText("turn of the tide")).toBeVisible();
    await expect(page.getByTestId("work-card")).toHaveCount(4);
    await page.goto("/series/not-a-series");
    await expect(page.getByTestId("not-found")).toBeVisible();
  });

  test("category pages, hidden empty categories and unknown categories", async ({ page }) => {
    await page.goto("/category/prints");
    await expect(page.getByTestId("work-card")).toHaveCount(4);
    await page.goto("/category/nothing-here");
    await expect(page.getByTestId("not-found")).toBeVisible();
  });
});

test.describe("work page", () => {
  test("available original: images beside details, price, quantity absent for one-of-a-kind, add to cart", async ({ page }) => {
    await page.goto("/work/low-tide-morning");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Low Tide, Morning");
    const details = page.getByTestId("work-details");
    await expect(details).toContainText("2024");
    await expect(details).toContainText("Oil on linen");
    await expect(details).toContainText("30 × 40 in");
    await expect(details.getByRole("link", { name: "Low Tide" })).toBeVisible();
    await expect(page.getByTestId("price")).toContainText("$2,400.00");
    await expect(page.getByRole("button", { name: "Add to cart" })).toBeVisible();
    await expect(page.getByText("One of a kind: only one can be bought.")).toBeVisible();
    // images left, details right
    const box = await page.evaluate(() => {
      const a = document.querySelector("[data-testid=work-images]")!.getBoundingClientRect();
      const b = document.querySelector("[data-testid=work-details]")!.getBoundingClientRect();
      return { imgRight: a.right, detLeft: b.left };
    });
    expect(box.detLeft).toBeGreaterThanOrEqual(box.imgRight);
    await page.getByTestId("add-to-cart").click();
    await expect(page.getByTestId("purchase-message")).toContainText("Added to your cart");
    await expect(page.getByTestId("bag-count")).toHaveText("1");
    await expect(page.getByRole("link", { name: "View your bag" })).toBeVisible();
  });

  test("sold, private collection and not-for-sale works stay visible with status and no buy button or price", async ({ page }) => {
    for (const [slug, status] of [
      ["salt-flats-at-dusk", "Sold"],
      ["grey-room", "Private collection"],
      ["study-for-a-quiet-room", "Not for sale"],
    ]) {
      await page.goto(`/work/${slug}`);
      await expect(page.getByTestId("status-text")).toHaveText(status);
      await expect(page.getByRole("button", { name: "Add to cart" })).toHaveCount(0);
      await expect(page.getByTestId("price")).toHaveCount(0);
    }
  });

  test("print: required size and paper with defaults, price follows the options, links to its original", async ({ page }) => {
    await page.goto("/work/low-tide-morning-print");
    await expect(page.getByTestId("price")).toContainText("$60.00");
    await expect(page.getByRole("radio", { name: /12 × 16 in/ })).toBeChecked();
    await expect(page.getByRole("radio", { name: /Fine art matte/ })).toBeChecked();
    await page.getByText("18 × 24 in").click();
    await expect(page.getByTestId("price")).toContainText("$105.00");
    await page.getByText("Textured cotton rag").click();
    await expect(page.getByTestId("price")).toContainText("$125.00");
    await expect(page.getByRole("link", { name: "Low Tide, Morning", exact: true })).toBeVisible();
    // original lists its prints
    await page.goto("/work/low-tide-morning");
    await expect(page.getByRole("heading", { name: "Prints of this painting" })).toBeVisible();
  });

  test("previous and next move within the series, or through all works", async ({ page }) => {
    await page.goto("/work/low-tide-morning");
    await page.getByRole("link", { name: /Next/ }).click();
    await expect(page).toHaveURL(/salt-flats-at-dusk/);
    await expect(page.getByRole("link", { name: /Previous/ })).toBeVisible();
    // a work with no series moves through all works
    await page.goto("/work/grey-room");
    await expect(page.getByRole("link", { name: /Next/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Previous/ })).toBeVisible();
  });

  test("a work with a series and category links to both", async ({ page }) => {
    await page.goto("/work/orchard-light-i");
    await page.getByTestId("work-details").getByRole("link", { name: "Orchard Light" }).click();
    await expect(page).toHaveURL(/\/series\/orchard-light/);
  });
});

test.describe("footer, policy and info pages", () => {
  for (const path of ["/", "/work", "/work/low-tide-morning", "/cart", "/checkout", "/help"]) {
    test(`footer and subfooter on ${path}`, async ({ page }) => {
      await page.goto(path);
      const footer = page.locator("footer");
      await expect(footer.getByRole("link", { name: "Help & FAQ" })).toBeVisible();
      await expect(footer.getByRole("link", { name: "Returns & refunds" })).toBeVisible();
      await expect(footer.getByRole("link", { name: "Contact", exact: true })).toBeVisible();
      for (const l of ["About", "Exhibitions", "Commissions"]) await expect(footer.getByRole("link", { name: l, exact: true })).toBeVisible();
      await expect(footer.getByRole("heading", { name: "Follow" })).toBeVisible();
      const sub = page.getByTestId("subfooter");
      await expect(sub).toContainText("demo");
      await expect(sub).toContainText("does not collect payment");
      await expect(sub.locator("img, svg")).toHaveCount(0);
      await expect(sub.getByRole("list", { name: /Payment methods/ }).getByRole("listitem")).not.toHaveCount(0);
    });
  }

  test("every footer link leads to a real page", async ({ page }) => {
    await page.goto("/");
    const hrefs = await page.locator("footer a[href^='/']").evaluateAll((as) => as.map((a) => a.getAttribute("href")!));
    expect(hrefs.length).toBeGreaterThanOrEqual(6);
    for (const h of hrefs) {
      const res = await page.goto(h);
      expect(res?.status(), h).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    }
  });

  test("returns page has every policy element and the demo notice", async ({ page }) => {
    await page.goto("/returns");
    for (const t of ["At a glance", "Return window and condition", "How to start a return", "Refund method and timing", "Return shipping costs", "Personalized and final-sale items", "Damaged or incorrect items"])
      await expect(page.getByRole("heading", { name: t })).toBeVisible();
    await expect(page.getByTestId("returns-demo-notice")).toContainText("demo store");
    await expect(page.getByText("14 days").first()).toBeVisible();
    await expect(page.getByText("Original paintings", { exact: false }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "contact the studio" })).toBeVisible();
  });

  test("help: topics, keyboard-expandable answers, route to contact", async ({ page }) => {
    await page.goto("/help");
    for (const t of ["Orders and shipping", "Returns", "Personalization", "Care", "This demo"]) await expect(page.getByRole("heading", { name: t, exact: true })).toBeVisible();
    const trigger = page.getByRole("button", { name: "How much does shipping cost?" });
    await trigger.focus();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await page.keyboard.press("Enter");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByText("flat $12.00")).toBeVisible();
    await expect(page.getByRole("link", { name: "Contact the studio" })).toBeVisible();
  });

  test("contact: email, response time, hours, links, demo notice, and no form", async ({ page }) => {
    await page.goto("/contact");
    await expect(page.getByTestId("contact-email")).toBeVisible();
    await expect(page.getByText("We reply within three working days.")).toBeVisible();
    await expect(page.getByText("Studio hours")).toBeVisible();
    await expect(page.getByRole("main").getByRole("link", { name: "Help & FAQ" })).toBeVisible();
    await expect(page.getByText("messages are not monitored")).toBeVisible();
    await expect(page.locator("main form")).toHaveCount(0);
  });

  test("about and exhibitions pages", async ({ page }) => {
    await page.goto("/about");
    await expect(page.getByRole("heading", { name: "Artist's statement" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Bio" })).toBeVisible();
    await expect(page.getByRole("img", { name: "Portrait placeholder" })).toBeVisible();
    await page.goto("/exhibitions");
    const years = await page.locator("main h2").allTextContents();
    expect(years).toEqual(["2025", "2024", "2023", "2022"]);
    await expect(page.getByText("Emerging Painter Prize")).toBeVisible();
  });

  test("commissions: explains how it works; inquiry validates, keeps typed values, then thanks", async ({ page }) => {
    await page.goto("/commissions");
    await expect(page.getByRole("heading", { name: "How it works" })).toBeVisible();
    await page.getByLabel("Your name").fill("Pat Patron");
    await page.getByLabel("Email address").fill("not-an-email");
    await page.getByRole("button", { name: "Send inquiry" }).click();
    await expect(page.getByText("Please enter a valid email address")).toBeVisible();
    await expect(page.getByText("at least 10 characters")).toBeVisible();
    await expect(page.getByLabel("Your name")).toHaveValue("Pat Patron");
    await page.getByLabel("Email address").fill("pat@example.com");
    await page.getByLabel("What do you have in mind?").fill("A large grey seascape for a hallway.");
    await page.getByLabel("Rough size (optional)").fill("40 x 60 in");
    await page.getByLabel("Budget range (optional)").selectOption("$2,500 to $5,000");
    await page.getByRole("button", { name: "Send inquiry" }).click();
    await expect(page.getByTestId("inquiry-thanks")).toContainText("Thank you");
  });

  test("newsletter: validates, stores once, thanks the same way for the same address twice", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Email address").fill("nope");
    await page.getByRole("button", { name: "Subscribe" }).click();
    await expect(page.getByText("Please enter a valid email address")).toBeVisible();
    const email = `fan-${Date.now()}@example.com`;
    await page.getByLabel("Email address").fill(email);
    await page.getByRole("button", { name: "Subscribe" }).click();
    await expect(page.getByTestId("signup-thanks")).toBeVisible();
    const thanks = await page.getByTestId("signup-thanks").textContent();
    await page.reload();
    await page.getByLabel("Email address").fill(email.toUpperCase());
    await page.getByRole("button", { name: "Subscribe" }).click();
    await expect(page.getByTestId("signup-thanks")).toHaveText(thanks!);
    const rows = await db.select().from(emailSignups).where(eq(emailSignups.email, email));
    expect(rows).toHaveLength(1);
  });
});

test.describe("layout and accessibility", () => {
  test("contained width: home and Work page content is a centred column of at most 1200px", async ({ page }) => {
    for (const vw of [1440, 1920]) {
      await page.setViewportSize({ width: vw, height: 900 });
      for (const [path, sel] of [["/work", "[data-testid=work-grid]"], ["/", "[data-testid=home-images]"], ["/", "[data-testid=email-signup]"], ["/", "[data-testid=intro]"]] as const) {
        await page.goto(path);
        const m = await page.evaluate((s) => {
          const b = document.querySelector(s)!.getBoundingClientRect();
          return { w: b.width, left: b.left, right: window.innerWidth - b.right };
        }, sel);
        expect(m.w, `${path} ${sel} at ${vw}`).toBeLessThanOrEqual(1200);
        expect(m.w, `${path} ${sel} at ${vw}`).toBeGreaterThanOrEqual(1100);
        expect(Math.abs(m.left - m.right), `${path} ${sel} centred at ${vw}`).toBeLessThan(2);
      }
    }
  });

  test("contained width: the column keeps comfortable side margins on small screens", async ({ page }) => {
    for (const vw of [375, 800]) {
      await page.setViewportSize({ width: vw, height: 900 });
      await page.goto("/work");
      const m = await page.getByTestId("work-grid").evaluate((e) => ({ left: e.getBoundingClientRect().left, right: window.innerWidth - e.getBoundingClientRect().right }));
      expect(m.left).toBeGreaterThanOrEqual(15);
      expect(m.right).toBeGreaterThanOrEqual(15);
    }
  });

  test("Work page columns grow with the screen but stop at 4 in the contained column: 2, 3, 4, 4, 4", async ({ page }) => {
    const expected: [number, number][] = [[375, 2], [800, 3], [1100, 4], [1400, 4], [1700, 4]];
    for (const [w, cols] of expected) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.goto("/work");
      const n = await page.getByTestId("work-grid").evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
      expect(n, `width ${w}`).toBe(cols);
    }
  });

  test("image-first cards: image ≥70% of the card, gaps ≤16px, one tab stop per card", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/work");
    const m = await page.evaluate(() => {
      const cards = [...document.querySelectorAll("[data-testid=work-card]")] as HTMLElement[];
      const c0 = cards[0].getBoundingClientRect();
      const imgBox = (cards[0].firstElementChild as HTMLElement).getBoundingClientRect();
      const c1 = cards[1].getBoundingClientRect();
      const grid = getComputedStyle(document.querySelector("[data-testid=work-grid]")!);
      return {
        ratio: imgBox.height / c0.height,
        hgap: c1.left - c0.right,
        gap: parseFloat(grid.columnGap),
        rowGap: parseFloat(grid.rowGap),
        imgW: imgBox.width,
        cardW: c0.width,
        borders: getComputedStyle(cards[0].firstElementChild as HTMLElement).borderTopWidth,
        inner: cards[0].querySelectorAll("a,button,input,[tabindex]").length,
      };
    });
    expect(m.ratio).toBeGreaterThanOrEqual(0.7);
    expect(m.gap).toBeLessThanOrEqual(16);
    expect(m.rowGap).toBeLessThanOrEqual(16);
    expect(Math.abs(m.imgW - m.cardW)).toBeLessThan(1);
    expect(m.borders).toBe("0px");
    expect(m.inner).toBe(0);
    // Tab moves from one card straight to the next
    await page.getByTestId("work-card").first().focus();
    await page.keyboard.press("Tab");
    const second = await page.evaluate(() => (document.activeElement as HTMLAnchorElement).getAttribute("href"));
    const expected = await page.getByTestId("work-card").nth(1).getAttribute("href");
    expect(second).toBe(expected);
  });

  test("reading pages keep a narrower column than the catalog", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/work");
    const grid = await page.getByTestId("work-grid").evaluate((e) => e.getBoundingClientRect().width);
    for (const p of ["/returns", "/help", "/contact", "/cart", "/checkout", "/about"]) {
      await page.goto(p);
      const w = await page.locator("main > div").first().evaluate((e) => e.getBoundingClientRect().width);
      expect(w, p).toBeLessThan(grid * 0.9);
    }
  });

  for (const path of ["/", "/work/low-tide-morning", "/work/low-tide-morning-print", "/cart", "/checkout", "/help", "/returns", "/commissions", "/about", "/exhibitions", "/contact", "/series/low-tide"]) {
    test(`no horizontal overflow at 375px: ${path}`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 800 });
      await page.goto(path);
      const o = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(o).toBeLessThanOrEqual(0);
    });
  }

  test("mobile: menu collapses behind a button", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
    const btn = page.getByRole("button", { name: "Menu" });
    await expect(btn).toHaveAttribute("aria-expanded", "false");
    await btn.click();
    await expect(page.getByRole("link", { name: "Commissions", exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Close" })).toHaveAttribute("aria-expanded", "true");
  });

  test("focus is visible on links and buttons", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab"); // skip link
    await page.keyboard.press("Tab");
    const outline = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle);
    expect(outline).not.toBe("none");
  });

  test("unknown work URL shows a helpful not-found with a way back", async ({ page }) => {
    const res = await page.goto("/work/does-not-exist");
    expect(res?.status()).toBe(404);
    await expect(page.getByTestId("not-found")).toContainText("couldn't find");
    await page.getByRole("link", { name: "Back to the work" }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("a draft work is not found for shoppers", async ({ page }) => {
    const w = await createWork({ name: `E2E Draft ${Date.now()}`, published: false });
    const res = await page.goto(`/work/${w.slug}`);
    expect(res?.status()).toBe(404);
    await page.goto("/");
    await expect(page.getByText(w.name)).toHaveCount(0);
  });
});
