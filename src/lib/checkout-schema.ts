import { z } from "zod";
import { store } from "../config/store";

export const customerSchema = z.object({
  name: z.string().trim().min(1, "Please enter your full name.").max(120, "Name is too long (120 characters at most)."),
  email: z
    .string()
    .trim()
    .min(1, "Please enter your email address.")
    .max(200, "Email is too long.")
    .email("Please enter a valid email address, like name@example.com."),
  address: z.string().trim().min(1, "Please enter your street address.").max(200, "Address is too long."),
  city: z.string().trim().min(1, "Please enter your city.").max(100, "City is too long."),
  region: z.string().trim().min(1, "Please enter your state, province or region.").max(100, "Region is too long."),
  postalCode: z.string().trim().min(1, "Please enter your postal code.").max(20, "Postal code is too long."),
  country: z
    .string()
    .refine((c) => (store.countries as readonly string[]).includes(c), {
      message: `Please choose a country: ${store.countries.join(", ")}.`,
    }),
});

export type CustomerInput = z.infer<typeof customerSchema>;
export const CUSTOMER_FIELDS = ["name", "email", "address", "city", "region", "postalCode", "country"] as const;

export function validateCustomer(raw: Record<string, unknown>) {
  const parsed = customerSchema.safeParse(raw);
  if (parsed.success) return { ok: true as const, data: parsed.data };
  const errors: Partial<Record<(typeof CUSTOMER_FIELDS)[number], string>> = {};
  for (const issue of parsed.error.issues) {
    const k = issue.path[0] as (typeof CUSTOMER_FIELDS)[number];
    if (k && !errors[k]) errors[k] = issue.message;
  }
  return { ok: false as const, errors };
}

export const checkoutRequestSchema = z.object({
  token: z.string().min(8).max(100),
  customer: z.record(z.string(), z.unknown()),
  lines: z
    .array(
      z.object({
        key: z.string().max(400),
        productId: z.string().max(60),
        valueIds: z.array(z.string().max(60)).max(20),
        personalization: z.string().max(200).nullable().optional(),
        quantity: z.number().int(),
        expectedUnitPriceCents: z.number().int().optional(),
      }),
    )
    .max(50),
});
