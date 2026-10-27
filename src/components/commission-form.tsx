"use client";
import { useActionState } from "react";
import { submitInquiry, type FormState } from "@/app/actions/public";
import { COMMISSION_BUDGETS } from "@/config/store";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: FormState = { ok: false };

export function CommissionForm() {
  const [state, action, pending] = useActionState(submitInquiry, initial);
  if (state.ok) {
    return (
      <p role="status" className="border-l-4 border-accent bg-muted p-4" data-testid="inquiry-thanks">
        {state.message}
      </p>
    );
  }
  const v = state.values ?? {};
  const e = state.errors ?? {};
  const err = (k: string) => (e[k] ? <p id={`inq-${k}-err`} className="mt-1 text-sm text-destructive">{e[k]}</p> : null);
  const aria = (k: string) => ({ "aria-invalid": e[k] ? true : undefined, "aria-describedby": e[k] ? `inq-${k}-err` : undefined }) as const;
  return (
    <form action={action} noValidate className="space-y-4" data-testid="inquiry-form">
      {state.message && <p role="alert" className="text-sm text-destructive">{state.message}</p>}
      {Object.keys(e).length > 0 && (
        <p role="alert" className="text-sm text-destructive">Please check the highlighted fields below.</p>
      )}
      <div>
        <Label htmlFor="inq-name">Your name</Label>
        <Input id="inq-name" name="name" className="mt-1" autoComplete="name" defaultValue={v.name ?? ""} {...aria("name")} />
        {err("name")}
      </div>
      <div>
        <Label htmlFor="inq-email">Email address</Label>
        <Input id="inq-email" name="email" type="email" className="mt-1" autoComplete="email" defaultValue={v.email ?? ""} {...aria("email")} />
        {err("email")}
      </div>
      <div>
        <Label htmlFor="inq-idea">What do you have in mind?</Label>
        <Textarea id="inq-idea" name="idea" className="mt-1" rows={5} defaultValue={v.idea ?? ""} {...aria("idea")} />
        {err("idea")}
      </div>
      <div>
        <Label htmlFor="inq-size">Rough size (optional)</Label>
        <Input id="inq-size" name="roughSize" className="mt-1" placeholder="For example 24 x 36 inches" defaultValue={v.roughSize ?? ""} {...aria("roughSize")} />
        {err("roughSize")}
      </div>
      <div>
        <Label htmlFor="inq-budget">Budget range (optional)</Label>
        <Select id="inq-budget" name="budget" className="mt-1" defaultValue={v.budget ?? ""} {...aria("budget")}>
          <option value="">Choose a range</option>
          {COMMISSION_BUDGETS.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </Select>
        {err("budget")}
      </div>
      <Button type="submit" disabled={pending}>{pending ? "Sending…" : "Send inquiry"}</Button>
      <p className="text-sm text-muted-foreground">Demo store: your inquiry is saved for the painter to read in the owner area. Nothing is emailed.</p>
    </form>
  );
}
