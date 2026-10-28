"use client";
import { useActionState } from "react";
import { subscribeEmail, type FormState } from "@/app/actions/public";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NEWSLETTER_LINE } from "@/config/store";

const initial: FormState = { ok: false };

/** The newsletter block on the home page: heading, one line, one email field, Subscribe. */
export function EmailSignup() {
  const [state, action, pending] = useActionState(subscribeEmail, initial);
  return (
    <section aria-labelledby="signup-heading" className="border-y border-border py-12 md:py-16" data-testid="email-signup">
      <div className="grid gap-5 md:grid-cols-2 md:items-center">
        <div>
          <h2 id="signup-heading" className="font-serif text-2xl md:text-3xl">Newsletter</h2>
          <p className="mt-1 text-muted-foreground">{NEWSLETTER_LINE}</p>
        </div>
        {state.ok ? (
          <p role="status" className="font-medium" data-testid="signup-thanks">{state.message}</p>
        ) : (
          <form action={action} noValidate className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <div className="flex-1">
              <Label htmlFor="signup-email" className="sr-only">Email address</Label>
              <Input
                id="signup-email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="Your email address"
                defaultValue={state.values?.email ?? ""}
                aria-invalid={state.errors?.email ? true : undefined}
                aria-describedby={state.errors?.email ? "signup-error" : undefined}
              />
              {state.errors?.email && (
                <p id="signup-error" role="alert" className="mt-1 text-sm text-destructive">{state.errors.email}</p>
              )}
              {state.message && !state.errors && (
                <p role="alert" className="mt-1 text-sm text-destructive">{state.message}</p>
              )}
            </div>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Subscribe"}</Button>
          </form>
        )}
      </div>
    </section>
  );
}
