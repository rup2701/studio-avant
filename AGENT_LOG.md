# AGENT_LOG — Studio Avant (painter's portfolio and shop)

## What I built and where

A Next.js 16 (App Router, React 19, TypeScript strict) store for a fictional painter, **Studio Avant**, built from `specs/brief.json`. One catalog of works serves the portfolio and the store; there is no separate Shop section.

- **Stack (fixed by `specs/stack.json`)**: Drizzle ORM + node-postgres, Tailwind CSS 4 with CSS-variable tokens, shadcn-style components in `src/components/ui` (button, input/select/textarea, label, accordion; Radix Slot, Label and Accordion), Zod at every boundary, Playwright in `e2e/`.
- **Database** (`src/db/schema.ts`, applied with `npm run db:push`): categories (+ slug history for redirects), series, products (a "work"), product_images, product_options, option_values, orders, order_items (snapshot), settings, exhibitions, commission_inquiries, email_signups, owner_sessions, login_attempts, system_events.
- **Seed** (`scripts/seed.ts`, `npm run seed`): 8 original paintings (3 Available, 3 Sold, 1 Private collection, 1 Not for sale; $400–$3,200), 4 prints (all Available, required Size and Paper options priced by option, $35–$180; three come from originals), 2 series (Low Tide, Orchard Light), 2 categories, 6 sample exhibition/press entries. All are flagged `is_sample` and labelled "Sample" in the owner area. No photos are invented: every work shows a neutral placeholder until the owner uploads one.
- **Shopper side** (`src/app/(shop)`): home = portfolio (one-line intro, filters All / one per series / Available that filter in place, work grid, email signup strip, footer), `/work/[slug]`, `/series/[slug]`, `/category/[slug]` (redirects from a renamed category's old name), `/cart`, `/checkout`, `/order/[reference]`, `/about`, `/exhibitions`, `/commissions`, `/help`, `/returns`, `/contact`, friendly not-found and "The shop is having a moment" error pages.
- **Cart**: browser-local (`src/lib/cart.ts`) with an in-memory fallback, cross-tab sync, per-cart one-time checkout token. Server code (`src/lib/cart-server.ts`, `src/lib/checkout.ts`) prices every line itself from the database; one shared `computeTotals` (`src/lib/pricing.ts`) is used by cart, checkout and the saved order.
- **Owner area** (`src/app/admin`, `src/proxy.ts`, `src/lib/auth.ts`): sign-in with one owner from env (`OWNER_EMAIL`, `OWNER_PASSWORD_HASH` as `scrypt:salt:hash`, made with `npm run hash-password -- "<password>"`), DB-backed 7-day sessions, rate limit (5 failures / 15 minutes per address). Pages: Works (list, search, category/status filters, reorder), work form (fields, options editor with required/default, photos), Series, Categories, Home & links, About page (with portrait upload), Exhibitions & press, Commission inquiries, Email sign-ups, Status.
- **Photos**: storage adapter in `src/lib/storage.ts` (local disk `.uploads/` for development, Vercel Blob when deployed); `src/lib/images.ts` validates with sharp, keeps the original, serves a ≤2000px-wide web version. `src/instrumentation.ts` + `src/lib/startup-check.ts` make a deployed build refuse to start without `BLOB_READ_WRITE_TOKEN`.
- **Settings file**: `src/config/store.ts` (shipping rule, max quantity, countries, accepted payments text, accent, template version). Owner-edited content (intro line, about text, links) is in the `settings` table.
- **Accent colour chosen**: burnt sienna `#8a4a2c` on off-white `#faf9f6` / near-black `#1b1b1a` (about 6:1 contrast on the background).
- **Tests**: 99 Playwright checks in `e2e/` (`shopper.spec.ts`, `edges-product-cart.spec.ts`, `shop-flow.spec.ts`, `owner.spec.ts`). Test names start with the edge id (E-001 … E-036) where a check proves that edge.

How to run: `npm install`, set `.env` (see `.env.example`), `npm run db:push`, `npm run seed`, `npm run build`, `npm run start`. Tests: `npm run build` then `npx playwright test` (starts the built store on port 3100 and a copy with a deliberately wrong database address on 3101, and re-seeds first).

## Beyond the specs

Each item below is built and has at least one check.

- **Work statuses (Available / Sold / Private collection / Not for sale)** — a `sale_status` column separate from the draft/published flag. Non-available works stay visible with a status mark and no price or buy button. Checks: `shopper.spec` "sold, private collection…", "each work shows … a status mark", E-006.
- **Originals are stock of one and cannot be bought twice** — stock is decremented in the order transaction with a conditional `UPDATE … WHERE stock >= qty`; a work with no options whose stock hits 0 becomes `sold` everywhere. Check: E-023 (three parallel buyers, exactly one wins, work flips to Sold).
- **Prints with required Size and Paper options priced by option, and a link to the original** — `original_product_id`; the print page links to its original and the original lists its prints. Checks: print page test, options test.
- **Series (= collections)** with title, text, own page `/series/[slug]`, and owner CRUD. Checks: series page test, owner series test.
- **Home page as the portfolio** — no hero, no marketing sections, no Shop link; sections in the order the brief lists; filters All / per series / Available that work without leaving the page. Checks: home order test, filters test.
- **Header and footer from the brief** — text wordmark left, menu Work / About / Exhibitions / Commissions, bag with item count on the right, menu behind a button on mobile; footer columns Help / Studio / Follow (Follow links owner-editable) plus the subfooter. Checks: home test, mobile menu test, footer tests, `owner.spec` follow-links test.
- **Email signup strip** — stores the address (unique, lower-cased), thanks, sends nothing; owner sees the list. Checks: signup test, owner inquiries/sign-ups test.
- **Commissions page with an inquiry form** (the brief overrides "contact page has no form"; the Contact page itself still has no form) — stored, thank-you shown, nothing sent, owner sees inquiries. Checks: commissions test, owner test.
- **About page** (statement, bio, portrait with upload, all owner editable), **Exhibitions & press** (list by year, owner add/edit/remove). Checks: about/exhibitions tests, owner tests.
- **Work page** with images large beside details (title, year, medium, size, series, note), previous/next within the series or through all works. Checks: work page tests.
- **Owner-editable intro line and work order** (Works list up/down; home grid follows). Checks: owner home test, reorder test.
- **Category pages and redirects** (`/category/[slug]`, hidden when no published works, old slug redirects after a rename). Checks: owner categories test.
- **Owner Status page and failed-checkout alert** — `system_events` table, shown as a banner in the owner area and on `/admin/status` (plus `/api/admin/status`, 401 when signed out). Chosen for E-019/E-025 where the owner's preference is unanswered ("show it on my dashboard only"). Check: status test.
- **Seed guard (E-024)** — `npm run seed` refuses to run on a store that already has products unless `--confirm` is passed.
- **Personalization (optional per work)** — the specs describe it, the brief does not; implemented as a per-work switch with a character limit, default off, none of the sample works use it. Checks: E-003, E-004.
- **Photo resizing note (E-036)** — originals kept, ≤2000px-wide web copy served.

## Decisions on ambiguous points

- **"Bag" vs "cart"**: header says "Bag (n)" as the brief asks; the route is `/cart`; the button on a work page says "Add to cart" as the brief asks; the page is titled "Your bag".
- **Draft vs status**: a *draft* work shows the standard not-found page to shoppers (owner-publish-and-stock beats E-006's "isn't available" wording); a Sold / Private / Not-for-sale / sold-out work that is published stays visible and explains its status. The owner sees a draft with a "Draft preview" banner.
- **Publish rules**: publishing is refused with no photo, or with no price when the sale status is Available. A price is not needed for works that are not for sale. Saving a draft without a price is allowed; saving a *published, available* work without a price is refused.
- **Seed works are published without photos** (the brief says they start with placeholders). The "no photo" rule is enforced when the owner presses Publish, and a published work cannot have its last photo removed.
- **Free shipping** is "over $300": strictly greater than $300.00 (a $300.00 subtotal still pays $12). Shipping label is "Estimated shipping (demo)"; tax is not shown.
- **One-of-a-kind rule**: a work with no options whose stock reaches 0 is set to Sold; a work with options (prints) that reaches 0 shows "Sold out". Quantity maximum per line is min(10, stock); originals show no quantity control.
- **Price shown on cards for prints** is "from $X" when options change the price.
- **Order management in the owner area is not built** (vision.md puts it out of scope; the brief's "owner's order handling keep the usual store shape" was read as not requiring it). E-026/27/28 are covered only by their stated defaults (confirmation page says nothing ships and no email is sent; returns page says to email the studio).
- **Timestamps** are stored as UTC wall-clock (`timezone('utc', now())` defaults) because the driver reads `timestamp` columns back as UTC.
- **Sessions** are rows in `owner_sessions` (hashed token) so sign-out ends a session immediately; the proxy only checks the cookie exists, every admin page, server action and owner API route re-checks the database.
- **Prefix for order references**: `SA-` plus 8 characters from an unambiguous alphabet. No lookup page and no email, per the brief.
- **Help page** answers about personalization even though sample works are not personalizable, because the specs require that topic.

## Not verified

- The **Vercel Blob adapter** was never run (no token available). Only the local adapter was exercised. What is checked: a deployed configuration without a token reports not-ok, `getStorage()` throws, and the startup check throws (E-031); with a token present the status switches to "blob".
- **Deployment** (Vercel, Neon, branch previews, publish script) was not done or tested.
- **E-019, owner alert part**: the shopper message and "no order created" are checked (against the copy with an unreachable database), and the owner banner/status listing is checked by inserting an event by hand. A real failure while the database is up (for example a failure halfway through the order transaction) was not provoked, so the code path that writes the `system_events` row on a live failure is untested. When the database itself is down the event cannot be saved at all.
- **E-012 owner_decision** (what happens to carts when a price changes) is implemented as "update on the cart page and at checkout, with a notice"; the owner was not asked.
- I did not look at the pages in a browser by eye. Layout is checked by measurements (widths, columns, gaps, image share, overflow at 375px, focus outline), not by visual review. No screenshots were reviewed; contrast was reasoned from the colour values, not measured with a tool.
- Keyboard-only use was checked for the help accordion, card tab order, and focus moves on required options; a full keyboard walkthrough of every page, and screen readers, were not tested.
- Only Chromium was used. The 12 MB upload is refused in the browser and by the server, but the exact request-size limits of a Vercel deployment were not tested.
- Upload progress is implemented with XHR progress events; the test sees the queue and results, not intermediate percentages. The retry button for a failed upload was not exercised in a test.
- The two-tab sync, storage-blocked fallback and double-click checks run in Chromium only.

## Unclear, missing or misleading in the specs

- `vision.md`, `requirements.json` and `experience.json` still describe a handmade-goods shop with a "Shop" page, "Shop all" footer link and "Contact us" link; the brief replaces them (no Shop section; footer columns). I followed the brief and labelled the footer link "Contact".
- `edges.json` says E-006 shows "This piece isn't available right now" for a no-longer-for-sale product, while `owner-publish-and-stock` says a draft shows the standard not-found page. These conflict for unpublished products; I chose not-found for drafts.
- The brief says Sold works show "no price" and prints/originals have a price "not needed when not for sale"; it does not say whether a Sold work keeps its price in the record. I kept the price in the record, never shown.
- Brief status values vs. spec's draft/published: the brief's "status" and the spec's "published" are different things; I kept both.
- The brief's `catalog.work_fields` includes "year, medium, size in inches, series, short note" but the spec's product form lists "description (2000 at most)". I used the 2000-character limit for the "short note".
- `edges.json` marks several edges `tested: yes` for tests that do not exist in this folder; I treated the file as a list of behaviours, not as evidence.
- The brief does not say whether the owner's own password may be shown in docs; I did not put it in this log (it is only in the git-ignored `.env`).
- `requirements.json` has no requirement for what "keeps the same left and right edges" means for the narrow reading pages; I only applied it to browsing pages.
- The brief says the photo storage adapter in production is Vercel Blob, but the spec's E-031 default says a deployed build must fail startup checks without it; I implemented both (startup check plus refusal of uploads).

## Mistakes made and fixed

- **Drizzle single-table qualifier bug**: the category and series product counts used columns inside a raw `sql` subquery; Drizzle drops table names in single-table selects, so every count showed 0. Found by the categories e2e test; fixed with explicitly qualified SQL.
- **Timezone bug in the sign-in lockout**: `login_attempts.at` defaulted to the database's local time while the cutoff was a UTC date, so on a machine behind UTC the lockout never triggered. Found by the E-035 test; fixed by making every timestamp default UTC (`timezone('utc', now())`) and re-pushing the schema.
- **Cart cleared after a timer**: I originally cleared the cart 50 ms after starting the redirect to the confirmation. An immediate refresh could leave the old cart behind (the E-020 check failed once in a full run). Fixed: the cart is cleared immediately and the checkout page shows a short "order placed" message with a link while it redirects.
- **Concurrent photo uploads** could assign the same position; uploads now run one at a time.
- **Test mistakes** (not product bugs): an arithmetic slip in a subtotal expectation (E-008), an ambiguous text locator (E-001), reading a stale error message in the login test (the form is cleared after an action, so the test now waits for that), clicking "Filter" before the "Clear" navigation finished, a published-only draft in the price-edit test, and a dynamic `import()` of TypeScript from a Playwright test (moved the startup check to a small module that tests import statically).

## Final results

Commands run at the end, in order, and what they printed:

```
npx tsc --noEmit
(exit code 0, no output)

npm run build --silent
✓ Compiled successfully … Running TypeScript … Finished TypeScript … ✓ Generating static pages (6/6)
Route table: 33 routes, all dynamic (ƒ), plus ƒ Proxy (Middleware). Exit code 0.

npx playwright test --reporter=dot
Seeded 8 original paintings, 4 prints, 2 categories, 2 series.
Running 99 tests using 1 worker
  99 passed (1.4m)
```

The stderr of that run contains stack traces ("Failed query … ECONNREFUSED"): they come from the second server on port 3101, started on purpose with an unreachable database for E-019 and E-025.

Earlier runs that did NOT pass, kept for honesty: I first ran the specs file by file (shopper 42/42; product/cart/checkout 30/32 with two test mistakes; owner 19/25 with two product bugs and four test problems). The first complete run after those fixes was 98/99 (a test-only mistake in the sign-in test: the form is cleared after a failed attempt, so the email had to be filled again). The next complete run was 98/99 (E-020, the cart-clear timer, a real bug fixed as described above). The last complete run passed 99/99. That was a single run; I did not repeat it to check for flakiness.

Edge coverage (a test whose name starts with the id exists for each, and passed in the final run): E-001 … E-018, E-020 … E-025 (E-019 partial, see Not verified), E-026/E-027/E-028 (default wording only), E-029 … E-036. E-010 is checked for the fallback and the new one-line notice ("Your cart won't be saved if you close this tab").


## Change: Composed home page and a Work page

What changed (the brief now asks for a composed home page, with the filtered grid moved to a Work page and everything in a contained column):

- **Home (`/`)** is now: intro (wordmark "Studio Avant", "by <artist>" beneath, then the owner-editable intro lines), an asymmetric image arrangement (`src/components/home-images.tsx`), the words block (several paragraphs, optional image beside), the Newsletter block, footer. No filters, no uniform grid. A "See all work" link goes to `/work`.
- **Work page (`/work`)** is new: the old filtered grid (All / one per series / Available, filtering in place) with the status marks. The header "Work" link now points to `/work` and is marked current on `/work`, work pages, series and category pages; the wordmark links home.
- **Contained width**: new `.contained` class (max 75rem = 1200px, centred, inside the usual side margins), used on the home page and the Work page only. Header and footer are unchanged and still span the wider area. The Work page grid stops at 4 columns (2, 3, 4) so cards stay readable in 1200px. Series, category, work, cart, checkout and the reading pages were not touched.
- **Database**: `products` gets `show_on_home`, `feature_on_home`, `home_position` (applied with `npm run db:push`, the way this project already changes its schema; there is no `drizzle/` migrations folder, so I did not create one). Settings keys `wordsText`, `wordsImageUrl`, `wordsImageAlt` are new (the settings table is key/value, so no table change).
- **Seed**: seven originals are marked show-on-home in a set order, Orchard Light I is featured full width; the seed now resets artistName, introLine and the words keys so the sample shows the new content. The sample artist is now "Neil Patrick" (the brief changed it from "Sample Artist"; default bio updated to match).
- **Owner area**: "Home & links" now has the intro lines, a list of works with Show on home / Feature full width / up-down order, the words block with an optional image upload, and the follow links (unchanged). The work form has "Show on home" and "Feature on home" checkboxes. "Email sign-ups" lists subscribers newest first and has a "Download CSV" button (`/api/admin/signups`, owner only, 401 when signed out).
- **Newsletter**: the strip is now headed "Newsletter" with the line "New work and studio news, now and then" and a "Subscribe" button. Storing once per address, and the same thank-you for a repeat, already worked; it now has a test.
- **Tests**: home order / no filters, home images (marked works only, order, one featured at full column width, varied widths and left offsets, links, Available marks), images never cropped, words, newsletter (including duplicate address), Work page content and filters, contained width at 1440 and 1920, side margins at 375 and 800, Work grid columns, owner home admin (show, feature, reorder, drafts never shown), work-form checkboxes, words block and image, subscriber list and CSV. Existing tests that looked for the grid, filters or cards on `/` now look on `/work`; the "Sign up" button became "Subscribe"; the artist/intro restore values were updated. Nothing was loosened except the one noted below.

Choices where the brief was unclear:

- Placement uses a repeating set of six column slots on a 12-column grid (8, 4, 4, 6, 6, 4 columns with offsets); featured works take all 12. Fewer or more than 6–9 works are allowed, the owner is only advised. On a phone, items stack, with some narrower and indented.
- With no photo yet, a work's placeholder takes its shape from the size text ("30 × 40 in" gives 3:4), otherwise 4:5, so the sample home still looks uneven.
- "Available" mark on home is just the word (no price); the Work page keeps "Available · price".
- Only published works can show on home, even if ticked.
- The words block and image are on the Home admin page; the newsletter line is fixed copy, not editable.
- The "Email sign-ups" nav label and page title were kept (an existing test uses them); the page text calls them newsletter subscribers.
- Links on other pages that said "Continue browsing", "Browse the work", "Back to the work" or "Show all work" still point to `/` (now the home page) because the instruction was to leave other pages alone. They would arguably be better pointing to `/work`.
- One existing check was changed: "reading pages keep a narrower column than the catalog" compared against 85% of the old, wider grid; the catalog is now 1200px, and the cart page is 1024px, so I compare against 90% (still strictly narrower). The old check "grid spans at least 90% of the viewport and shares edges with header and footer" was replaced by the contained-width checks, because the brief now says the opposite.

Not verified: no visual review in a browser (layout checked by measurements only); the home arrangement was only measured with the placeholder images and with two test photos, not with a full set of real photos; the home words image upload used the local storage adapter only (not Vercel Blob); the CSV was opened as text, not in a spreadsheet; mobile home layout was checked for overflow only.


## Change: Work-page links, back link, Newsletter label, home prices and About this work

What changed:

- **Links to /work**: "Continue browsing" (bag and the add-to-cart message), "Browse the work" (empty bag, empty checkout), "Back to the work" (not-found pages, unknown-order page, order confirmation) and "Show all work" (category page) now go to `/work`.
- **"← All work"** at the top of every work page (`data-testid=back-to-work`), going to `/work`. Series pages now link their cards as `/work/<slug>?from=<series>`; when the work belongs to that series the back link reads "← <series title>" and goes to the series page, and Previous/Next keep the `?from`. A wrong or unrelated `from` falls back to "← All work".
- **Header "Work"**: it was already linked and marked current (`aria-current`) on `/work`, work, series and category pages; I added a heavier font weight to the current item so it is clearly highlighted, and added checks for `/work` and several work pages (desktop and the phone menu).
- **Newsletter**: the admin navigation label, page title and heading are now "Newsletter" (URL `/admin/signups` and the CSV route unchanged). The owner test was updated to click the "Newsletter" nav link and check the heading.
- **Home marks**: price where the work is for sale ("from" prefix only if option prices differ), "Sold" for sold (and sold-out) works, nothing for private-collection and not-for-sale works. The Work page grid marks are unchanged. The old `home-available` test id became `home-mark`.
- **About this work**: new `products.description` column (text, default empty), applied with `npm run db:push` as before (this project has no `drizzle/` migrations folder, so I did not create one). Editable in the work form (2000 characters at most), shown in full under the details on the work page with the heading "About this work", and as an excerpt under the title line on the home page. Excerpt rule (`excerpt()` in `src/lib/utils.ts`): first sentence; if over 140 characters, cut at a word with an ellipsis so the total is at most 140. Not shown on the Work, series or category grids. Each of the 12 sample works has a one-to-three-sentence description in the seed.
- **Tests**: new `e2e/work-links-descriptions.spec.ts` (links, back link incl. series, header current state, home marks, excerpt, grid without descriptions, full text on work page, sample descriptions, excerpt rule, owner editing/clearing/too-long). Existing tests that expected those links to land on `/` now expect `/work`; the home Available-count check became a price/Sold check.

Choices where the brief was unclear:

- The existing "Short note" field stays as it was (still shown on the work page); "About this work" is a separate new field. Nothing was migrated from the note.
- "Came from a series" is detected from the link the visitor used (`?from=`), not from the browser referrer, because the referrer is unreliable with client-side navigation. A visitor arriving from the home page, Work page, a bookmark or a category sees "← All work".
- The "Back to the work" link on the not-found pages was also pointed at /work.
- "Sold" on home also covers a work with stock 0 ("sold out").
- On a phone the header menu is still behind the "Menu" button; I did not add a permanent Work link there.

Not verified: no visual review in a browser; the excerpt was tested with the sample text, a synthetic long sentence and one owner-edited work, not with real photos or long real descriptions; the back link was tested after Next/Previous and on a series page but not with the browser back button.

Results: `npx tsc --noEmit` exit 0; `npm run build` exit 0; `npx playwright test --reporter=dot`: 121 passed (the first run had 1 failure, a test locator that matched both "Orchard Light I" and "Orchard Light II"; fixed in the test, then 121/121 once).
