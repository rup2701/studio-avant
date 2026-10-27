import {
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** Old category slugs, so shopper URLs stay valid after a rename. */
export const categorySlugHistory = pgTable("category_slug_history", {
  oldSlug: text("old_slug").primaryKey(),
  categoryId: uuid("category_id")
    .notNull()
    .references(() => categories.id, { onDelete: "cascade" }),
});

/** A series is the same thing as a collection in the store. */
export const series = pgTable("series", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  text: text("text").notNull().default(""),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** A work and a product are the same record. */
export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  note: text("note").notNull().default(""),
  priceCents: integer("price_cents"),
  categoryId: uuid("category_id")
    .notNull()
    .references(() => categories.id, { onDelete: "restrict" }),
  seriesId: uuid("series_id").references(() => series.id, { onDelete: "set null" }),
  originalProductId: uuid("original_product_id"),
  year: integer("year"),
  medium: text("medium").notNull().default(""),
  sizeInches: text("size_inches").notNull().default(""),
  stock: integer("stock").notNull().default(0),
  published: boolean("published").notNull().default(false),
  /** available | sold | private_collection | not_for_sale */
  saleStatus: text("sale_status").notNull().default("available"),
  position: integer("position").notNull().default(0),
  isSample: boolean("is_sample").notNull().default(false),
  personalizationEnabled: boolean("personalization_enabled").notNull().default(false),
  personalizationMaxLength: integer("personalization_max_length").notNull().default(40),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const productImages = pgTable("product_images", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  originalUrl: text("original_url").notNull(),
  alt: text("alt").notNull(),
  position: integer("position").notNull().default(0),
  width: integer("width").notNull().default(0),
  height: integer("height").notNull().default(0),
});

export const productOptions = pgTable("product_options", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  required: boolean("required").notNull().default(false),
  position: integer("position").notNull().default(0),
});

export const optionValues = pgTable("option_values", {
  id: uuid("id").primaryKey().defaultRandom(),
  optionId: uuid("option_id")
    .notNull()
    .references(() => productOptions.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  priceDeltaCents: integer("price_delta_cents").notNull().default(0),
  soldOut: boolean("sold_out").notNull().default(false),
  isDefault: boolean("is_default").notNull().default(false),
  position: integer("position").notNull().default(0),
});

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  reference: text("reference").notNull().unique(),
  /** One-time token the cart carries; the same token always returns the same order. */
  token: text("token").notNull().unique(),
  status: text("status").notNull().default("demo_placed"),
  name: text("name").notNull(),
  email: text("email").notNull(),
  address: text("address").notNull(),
  city: text("city").notNull(),
  region: text("region").notNull(),
  postalCode: text("postal_code").notNull(),
  country: text("country").notNull(),
  subtotalCents: integer("subtotal_cents").notNull(),
  shippingCents: integer("shipping_cents").notNull(),
  totalCents: integer("total_cents").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** Snapshot of what was bought: editing or deleting a product never changes it. */
export const orderItems = pgTable("order_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  options: jsonb("options").$type<{ name: string; value: string }[]>().notNull().default([]),
  personalization: text("personalization"),
  unitPriceCents: integer("unit_price_cents").notNull(),
  quantity: integer("quantity").notNull(),
  lineTotalCents: integer("line_total_cents").notNull(),
  imageUrl: text("image_url"),
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const exhibitions = pgTable("exhibitions", {
  id: uuid("id").primaryKey().defaultRandom(),
  year: integer("year").notNull(),
  /** exhibition | award | press */
  kind: text("kind").notNull().default("exhibition"),
  text: text("text").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const commissionInquiries = pgTable("commission_inquiries", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  idea: text("idea").notNull(),
  roughSize: text("rough_size").notNull().default(""),
  budget: text("budget").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const emailSignups = pgTable("email_signups", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const ownerSessions = pgTable("owner_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const loginAttempts = pgTable("login_attempts", {
  id: serial("id").primaryKey(),
  ip: text("ip").notNull(),
  at: timestamp("at").notNull().defaultNow(),
});

/** Plain-words log of things the owner should know (failed checkouts, etc.). */
export const systemEvents = pgTable("system_events", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
