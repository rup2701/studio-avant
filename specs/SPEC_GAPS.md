# How the v1 spec gaps are closed in this base

From Fernhollow v1's BUILD_NOTES, "Spec gaps". Status in the v2 base:

| # | Gap | Where it is closed |
| --- | --- | --- |
| 1 | Required options and defaults | `owner-product-form` (required and default per option) |
| 2 | The actual catalog | `brief.json` sample_catalog rules, and categories supplied |
| 3 | Imagery source | `brief.json` imagery: owner uploads, placeholder until then |
| 4 | Personalization rules | `brief.json` personalization |
| 5 | Demo charges | `brief.json` orders.shipping and tax |
| 6 | Quantity limits | `brief.json` orders.max_quantity_per_line |
| 7 | Address model | `brief.json` orders.countries |
| 8 | Brand inputs | `brief.json` store.brand_words and look |
| 9 | Data persistence | `brief.json` storage, and `stack.json` |
| 10 | Price and stock change between cart and checkout | edges E-033 and E-034 |
| 11 | Order reference format | `brief.json` orders.order_reference |
| 12 | Design intent | `brief.json` look (style and tone are chosen, not left to the builder) |
| 13 | Acceptance checks as executable tests | **Not closed.** The `verification` arrays are still prose. The agent is asked to write the tests from them. A structured form is a follow-up. |
