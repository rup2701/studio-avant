/**
 * Owner-editable store settings that are not content: one file, separate from template code.
 * (Content the owner edits in the owner area — intro line, about page, links — lives in the
 * database `settings` table; the values below are the defaults and the fixed rules.)
 * Template version is recorded in TEMPLATE_VERSION.
 */
export const TEMPLATE_VERSION = "store-template 2.0 / gallery";

export const store = {
  name: "Studio Avant",
  tagline: "Original paintings and limited prints by one painter",
  email: "hello@studioavant.example",
  responseTime: "within three working days",
  hours: "Tuesday to Saturday, 10:00 to 16:00 (Eastern Time)",
  currency: "USD",
  /** The one restrained accent colour (burnt sienna). Also set in globals.css as --accent. */
  accent: "#8a4a2c",
  maxQuantityPerLine: 10,
  returnsWindowDays: 14,
  shipping: {
    flatCents: 1200,
    /** Shipping is free when the subtotal is strictly greater than this. */
    freeOverCents: 30000,
    label: "Estimated shipping (demo)",
  },
  countries: ["United States", "Canada", "United Kingdom"],
  acceptedPayments: ["Visa", "Mastercard", "American Express", "PayPal", "Apple Pay"],
  personalizationCharset: "Letters, numbers, spaces and & . , ' - only",
  defaults: {
    introLine: "A painter's work, shown quietly. Original paintings and limited prints, each one available from its page.",
    artistName: "Sample Artist",
    statement:
      "I paint what is left once the noise of a place has settled: the line a tide leaves on sand, the way light rests in an old orchard in the late afternoon. I work slowly, in layers, and I stop when the picture goes quiet.\n\nThis is sample wording. The owner replaces it from the owner area.",
    bio: "Sample Artist lives and works in a small studio by the water. Their paintings have been shown in group and solo exhibitions and are held in private collections. (Fictional sample biography.)",
    portraitAlt: "Portrait of the artist (placeholder until a photo is uploaded)",
    followLinks: [
      { label: "Instagram", url: "https://example.com/instagram" },
      { label: "Newsletter archive", url: "https://example.com/newsletter" },
      { label: "Studio journal", url: "https://example.com/journal" },
    ] as { label: string; url: string }[],
  },
} as const;

export const SALE_STATUSES = [
  { value: "available", label: "Available" },
  { value: "sold", label: "Sold" },
  { value: "private_collection", label: "Private collection" },
  { value: "not_for_sale", label: "Not for sale" },
] as const;

export type SaleStatus = (typeof SALE_STATUSES)[number]["value"];

export function saleStatusLabel(v: string) {
  return SALE_STATUSES.find((s) => s.value === v)?.label ?? v;
}

export const COMMISSION_BUDGETS = ["Under $1,000", "$1,000 to $2,500", "$2,500 to $5,000", "Over $5,000", "Not sure yet"] as const;
