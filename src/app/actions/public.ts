"use server";
import { z } from "zod";
import { db } from "@/db";
import { commissionInquiries, emailSignups } from "@/db/schema";
import { COMMISSION_BUDGETS } from "@/config/store";

export type FormState = {
  ok: boolean;
  message?: string;
  errors?: Record<string, string>;
  values?: Record<string, string>;
};

const emailSchema = z.string().trim().toLowerCase().min(1, "Please enter your email address.").max(200).email("Please enter a valid email address, like name@example.com.");

export async function subscribeEmail(_prev: FormState, formData: FormData): Promise<FormState> {
  const raw = String(formData.get("email") ?? "");
  const parsed = emailSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errors: { email: parsed.error.issues[0].message }, values: { email: raw } };
  }
  try {
    await db.insert(emailSignups).values({ email: parsed.data }).onConflictDoNothing({ target: emailSignups.email });
  } catch {
    return { ok: false, message: "We couldn't save your address just now. Please try again in a moment.", values: { email: raw } };
  }
  return { ok: true, message: "Thank you. Your address is saved. Nothing is sent in this demo." };
}

const inquirySchema = z.object({
  name: z.string().trim().min(1, "Please tell us your name.").max(120, "Name is too long."),
  email: emailSchema,
  idea: z.string().trim().min(10, "Please tell us a little about what you have in mind (at least 10 characters).").max(3000, "That is a little long. Please keep it under 3000 characters."),
  roughSize: z.string().trim().max(100, "Please keep the size short.").default(""),
  budget: z.string().refine((b) => b === "" || (COMMISSION_BUDGETS as readonly string[]).includes(b), "Please choose one of the budget ranges."),
});

export async function submitInquiry(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = {
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    idea: String(formData.get("idea") ?? ""),
    roughSize: String(formData.get("roughSize") ?? ""),
    budget: String(formData.get("budget") ?? ""),
  };
  const parsed = inquirySchema.safeParse(values);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const i of parsed.error.issues) {
      const k = String(i.path[0]);
      if (!errors[k]) errors[k] = i.message;
    }
    return { ok: false, errors, values };
  }
  try {
    await db.insert(commissionInquiries).values(parsed.data);
  } catch {
    return { ok: false, message: "We couldn't save your inquiry just now. Please try again in a moment.", values };
  }
  return { ok: true, message: "Thank you. Your inquiry is saved and the painter will read it. Nothing is sent by email in this demo." };
}
