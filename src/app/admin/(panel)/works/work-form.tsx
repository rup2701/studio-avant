"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { deleteWork, saveWork, setPublished, type WorkFormState } from "../../actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SALE_STATUSES } from "@/config/store";
import { slugify } from "@/lib/utils";

export type OptionValueInput = { uid: string; id?: string; label: string; priceDelta: string; soldOut: boolean; isDefault: boolean };
export type OptionInput = { uid: string; id?: string; name: string; required: boolean; values: OptionValueInput[] };

export type WorkValues = {
  name: string;
  slug: string;
  note: string;
  price: string;
  categoryId: string;
  seriesId: string;
  originalProductId: string;
  year: string;
  medium: string;
  sizeInches: string;
  stock: string;
  saleStatus: string;
  personalizationEnabled: boolean;
  personalizationMaxLength: string;
  options: OptionInput[];
};

type Props = {
  id: string | null;
  published: boolean;
  initial: WorkValues;
  categories: { id: string; name: string }[];
  series: { id: string; title: string }[];
  originals: { id: string; name: string }[];
  photoCount: number;
  created: boolean;
  isSample: boolean;
  slugForView: string | null;
};

let uidCounter = 0;
const newUid = () => `n${++uidCounter}`;

export function WorkForm(p: Props) {
  const router = useRouter();
  const [values, setValues] = useState<WorkValues>(p.initial);
  const baseline = useRef(JSON.stringify(p.initial));
  const [slugTouched, setSlugTouched] = useState(!!p.id);
  const [state, formAction, pending] = useActionState<WorkFormState, FormData>(saveWork, { ok: false });
  const [pubMsg, setPubMsg] = useState<WorkFormState | null>(null);
  const [publishing, startPublish] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const errors = state.errors ?? {};
  const dirty = JSON.stringify(values) !== baseline.current;

  useEffect(() => {
    if (state.ok) {
      baseline.current = JSON.stringify(values);
      router.refresh();
    } else if (state.errors && Object.keys(state.errors).length) {
      formRef.current?.querySelector<HTMLElement>("[aria-invalid=true]")?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // After a save the server re-renders with the stored values (including new option ids).
  const initialSig = JSON.stringify(p.initial);
  useEffect(() => {
    setValues(p.initial);
    baseline.current = initialSig;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSig]);

  // Unsaved changes: confirm before leaving the page, and before following in-app links.
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.getAttribute("href")?.startsWith("#")) return;
      if (!window.confirm("You have unsaved changes. Leave this page and lose them?")) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  const set = <K extends keyof WorkValues>(k: K, v: WorkValues[K]) => setValues((s) => ({ ...s, [k]: v }));

  const fieldProps = (k: string) => ({
    "aria-invalid": errors[k] ? (true as const) : undefined,
    "aria-describedby": errors[k] ? `err-${k}` : undefined,
  });
  const err = (k: string) =>
    errors[k] ? (
      <p id={`err-${k}`} className="mt-1 text-sm text-destructive" data-testid={`error-${k}`}>{errors[k]}</p>
    ) : null;

  function updateOption(uid: string, patch: Partial<OptionInput>) {
    set("options", values.options.map((o) => (o.uid === uid ? { ...o, ...patch } : o)));
  }
  function updateValue(ouid: string, vuid: string, patch: Partial<OptionValueInput>) {
    set(
      "options",
      values.options.map((o) =>
        o.uid !== ouid
          ? o
          : {
              ...o,
              values: o.values.map((v) => {
                if (v.uid === vuid) return { ...v, ...patch };
                // only one default per option
                return patch.isDefault ? { ...v, isDefault: false } : v;
              }),
            },
      ),
    );
  }

  const optionsJson = JSON.stringify(
    values.options.map((o) => ({
      id: o.id,
      name: o.name,
      required: o.required,
      values: o.values.map((v) => ({ id: v.id, label: v.label, priceDelta: v.priceDelta, soldOut: v.soldOut, isDefault: v.isDefault })),
    })),
  );

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm"><Link href="/admin" className="underline underline-offset-4">← All works</Link></p>
          <h1 className="mt-1 font-serif text-3xl" data-testid="work-heading">
            {p.id ? values.name || "Untitled work" : "New work"}
          </h1>
          {p.id && (
            <p className="mt-1 text-sm" data-testid="work-status-line">
              <span className={p.published ? "font-medium" : "text-muted-foreground"}>{p.published ? "Published" : "Draft"}</span>
              {p.isSample && <span className="ml-2 border border-border px-1.5 py-0.5 text-xs text-muted-foreground">Sample</span>}
              {p.published && p.slugForView && (
                <> · <Link href={`/work/${p.slugForView}`} target="_blank" className="underline underline-offset-4">View on the store</Link></>
              )}
              {!p.published && p.slugForView && (
                <> · <Link href={`/work/${p.slugForView}`} target="_blank" className="underline underline-offset-4">Preview draft</Link></>
              )}
            </p>
          )}
        </div>
        {p.id && (
          <div className="flex gap-2">
            <Button
              type="button"
              variant={p.published ? "outline" : "default"}
              disabled={publishing}
              data-testid="publish-toggle"
              onClick={() =>
                startPublish(async () => {
                  const res = await setPublished(p.id!, !p.published);
                  setPubMsg(res);
                  router.refresh();
                })
              }
            >
              {p.published ? "Unpublish" : "Publish"}
            </Button>
          </div>
        )}
      </div>

      <div className="mt-4 space-y-3" aria-live="polite">
        {p.created && !state.message && (
          <p role="status" className="border-l-4 border-accent bg-muted p-3 text-sm" data-testid="created-message">
            Work created as a draft. Next: add photos below, then publish.
          </p>
        )}
        {state.message && (
          <p
            role={state.ok ? "status" : "alert"}
            className={`border-l-4 p-3 text-sm ${state.ok ? "border-accent bg-muted" : "border-destructive bg-destructive/5 text-destructive"}`}
            data-testid="save-message"
          >
            {state.message}
          </p>
        )}
        {pubMsg?.message && (
          <p
            role={pubMsg.ok ? "status" : "alert"}
            className={`border-l-4 p-3 text-sm ${pubMsg.ok ? "border-accent bg-muted" : "border-destructive bg-destructive/5 text-destructive"}`}
            data-testid="publish-message"
          >
            {pubMsg.message}
          </p>
        )}
        {dirty && <p className="text-sm text-muted-foreground" data-testid="unsaved-note">You have unsaved changes.{p.id && " Publish and Unpublish use the saved version."}</p>}
      </div>

      <form ref={formRef} action={formAction} noValidate className="mt-6 grid gap-5 lg:grid-cols-2" data-testid="work-form">
        <input type="hidden" name="id" value={p.id ?? ""} />
        <input type="hidden" name="optionsJson" value={optionsJson} />

        <div className="lg:col-span-2">
          <Label htmlFor="name">Title (required, 80 characters at most)</Label>
          <Input
            id="name"
            name="name"
            className="mt-1"
            value={values.name}
            onChange={(e) => {
              set("name", e.target.value);
              if (!slugTouched) set("slug", slugify(e.target.value));
            }}
            {...fieldProps("name")}
          />
          {err("name")}
        </div>

        <div>
          <Label htmlFor="slug">Slug (web address)</Label>
          <Input
            id="slug"
            name="slug"
            className="mt-1"
            value={values.slug}
            onChange={(e) => {
              setSlugTouched(true);
              set("slug", e.target.value);
            }}
            {...fieldProps("slug")}
          />
          <p className="mt-1 text-xs text-muted-foreground">/work/{values.slug || "…"} · lowercase letters, numbers and hyphens</p>
          {err("slug")}
        </div>

        <div>
          <Label htmlFor="price">Price in US dollars</Label>
          <Input id="price" name="price" inputMode="decimal" className="mt-1" value={values.price} onChange={(e) => set("price", e.target.value)} placeholder="120.00" {...fieldProps("price")} />
          <p className="mt-1 text-xs text-muted-foreground">Greater than 0, two decimals. Not needed for works that are not for sale. Option price changes are added to this.</p>
          {err("price")}
        </div>

        <div>
          <Label htmlFor="categoryId">Category</Label>
          <Select id="categoryId" name="categoryId" className="mt-1" value={values.categoryId} onChange={(e) => set("categoryId", e.target.value)} {...fieldProps("categoryId")}>
            <option value="">Choose a category</option>
            {p.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          {err("categoryId")}
        </div>

        <div>
          <Label htmlFor="seriesId">Series (optional)</Label>
          <Select id="seriesId" name="seriesId" className="mt-1" value={values.seriesId} onChange={(e) => set("seriesId", e.target.value)} {...fieldProps("seriesId")}>
            <option value="">No series</option>
            {p.series.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </Select>
          {err("seriesId")}
        </div>

        <div>
          <Label htmlFor="saleStatus">Sale status</Label>
          <Select id="saleStatus" name="saleStatus" className="mt-1" value={values.saleStatus} onChange={(e) => set("saleStatus", e.target.value)} {...fieldProps("saleStatus")}>
            {SALE_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
          <p className="mt-1 text-xs text-muted-foreground">Only “Available” works can be bought. The others stay visible, with no buy button.</p>
          {err("saleStatus")}
        </div>

        <div>
          <Label htmlFor="stock">Stock (whole number, 0 or more)</Label>
          <Input id="stock" name="stock" inputMode="numeric" className="mt-1" value={values.stock} onChange={(e) => set("stock", e.target.value)} {...fieldProps("stock")} />
          <p className="mt-1 text-xs text-muted-foreground">An original is one of a kind: stock 1. At 0 the work shows as sold out and cannot be added to the cart.</p>
          {err("stock")}
        </div>

        <div>
          <Label htmlFor="year">Year (optional)</Label>
          <Input id="year" name="year" inputMode="numeric" className="mt-1" value={values.year} onChange={(e) => set("year", e.target.value)} {...fieldProps("year")} />
          {err("year")}
        </div>

        <div>
          <Label htmlFor="medium">Medium (optional)</Label>
          <Input id="medium" name="medium" className="mt-1" value={values.medium} onChange={(e) => set("medium", e.target.value)} {...fieldProps("medium")} />
          {err("medium")}
        </div>

        <div>
          <Label htmlFor="sizeInches">Size in inches (optional)</Label>
          <Input id="sizeInches" name="sizeInches" className="mt-1" value={values.sizeInches} onChange={(e) => set("sizeInches", e.target.value)} placeholder="30 × 40 in" {...fieldProps("sizeInches")} />
          {err("sizeInches")}
        </div>

        <div>
          <Label htmlFor="originalProductId">Print of an original (optional)</Label>
          <Select id="originalProductId" name="originalProductId" className="mt-1" value={values.originalProductId} onChange={(e) => set("originalProductId", e.target.value)} {...fieldProps("originalProductId")}>
            <option value="">Not a print of an original</option>
            {p.originals.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </Select>
          {err("originalProductId")}
        </div>

        <div className="lg:col-span-2">
          <Label htmlFor="note">Short note (optional, 2000 characters at most)</Label>
          <Textarea id="note" name="note" rows={4} className="mt-1" value={values.note} onChange={(e) => set("note", e.target.value)} {...fieldProps("note")} />
          <p className="mt-1 text-xs text-muted-foreground">{values.note.length} / 2000</p>
          {err("note")}
        </div>

        <fieldset className="lg:col-span-2 border border-border p-4">
          <legend className="px-1 text-sm font-medium">Personalization (optional)</legend>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" name="personalizationEnabled" checked={values.personalizationEnabled} onChange={(e) => set("personalizationEnabled", e.target.checked)} className="h-5 w-5" />
            Shoppers can add personalization text to this work (final sale)
          </label>
          {values.personalizationEnabled && (
            <div className="mt-2 max-w-xs">
              <Label htmlFor="personalizationMaxLength">Character limit</Label>
              <Input id="personalizationMaxLength" name="personalizationMaxLength" inputMode="numeric" className="mt-1" value={values.personalizationMaxLength} onChange={(e) => set("personalizationMaxLength", e.target.value)} {...fieldProps("personalizationMaxLength")} />
              {err("personalizationMaxLength")}
            </div>
          )}
        </fieldset>

        <fieldset className="lg:col-span-2 border border-border p-4" aria-describedby={errors.options ? "err-options" : undefined}>
          <legend className="px-1 text-sm font-medium">Options (such as size or paper)</legend>
          <p className="text-sm text-muted-foreground">Each option has values with an optional price change. Mark an option required to make shoppers choose, and pick a default value.</p>
          <div className="mt-3 space-y-5" data-testid="options-editor">
            {values.options.map((o, oi) => (
              <div key={o.uid} className="border border-border bg-muted/30 p-3" data-testid="option-block">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-40 flex-1">
                    <Label htmlFor={`opt-${o.uid}-name`}>Option {oi + 1} name</Label>
                    <Input id={`opt-${o.uid}-name`} className="mt-1" value={o.name} onChange={(e) => updateOption(o.uid, { name: e.target.value })} />
                  </div>
                  <label className="flex min-h-11 items-center gap-2 text-sm">
                    <input type="checkbox" className="h-5 w-5" checked={o.required} onChange={(e) => updateOption(o.uid, { required: e.target.checked })} />
                    Required
                  </label>
                  <Button type="button" variant="outline" size="sm" onClick={() => set("options", values.options.filter((x) => x.uid !== o.uid))}>
                    Remove option {oi + 1}
                  </Button>
                </div>
                <ul className="mt-3 space-y-2">
                  {o.values.map((v, vi) => (
                    <li key={v.uid} className="flex flex-wrap items-end gap-3">
                      <div className="min-w-32 flex-1">
                        <Label htmlFor={`val-${v.uid}-label`} className="text-xs">Value {vi + 1}</Label>
                        <Input id={`val-${v.uid}-label`} className="mt-1" value={v.label} onChange={(e) => updateValue(o.uid, v.uid, { label: e.target.value })} />
                      </div>
                      <div className="w-32">
                        <Label htmlFor={`val-${v.uid}-delta`} className="text-xs">Price change ($)</Label>
                        <Input id={`val-${v.uid}-delta`} inputMode="decimal" className="mt-1" placeholder="0.00" value={v.priceDelta} onChange={(e) => updateValue(o.uid, v.uid, { priceDelta: e.target.value })} />
                      </div>
                      <label className="flex min-h-11 items-center gap-2 text-sm">
                        <input type="radio" className="h-5 w-5" name={`default-${o.uid}`} checked={v.isDefault} onChange={() => updateValue(o.uid, v.uid, { isDefault: true })} />
                        Default<span className="sr-only"> for {o.name || `option ${oi + 1}`}, value {vi + 1}</span>
                      </label>
                      <label className="flex min-h-11 items-center gap-2 text-sm">
                        <input type="checkbox" className="h-5 w-5" checked={v.soldOut} onChange={(e) => updateValue(o.uid, v.uid, { soldOut: e.target.checked })} />
                        Sold out
                      </label>
                      <Button type="button" variant="ghost" size="sm" onClick={() => updateOption(o.uid, { values: o.values.filter((x) => x.uid !== v.uid) })}>
                        Remove value {vi + 1}
                      </Button>
                    </li>
                  ))}
                </ul>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => updateOption(o.uid, { values: [...o.values, { uid: newUid(), label: "", priceDelta: "", soldOut: false, isDefault: false }] })}
                >
                  Add a value to option {oi + 1}
                </Button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            className="mt-4"
            data-testid="add-option"
            onClick={() =>
              set("options", [
                ...values.options,
                { uid: newUid(), name: "", required: false, values: [{ uid: newUid(), label: "", priceDelta: "", soldOut: false, isDefault: false }] },
              ])
            }
          >
            Add an option
          </Button>
          {err("options")}
        </fieldset>

        <div className="lg:col-span-2 flex flex-wrap items-center gap-3 border-t border-border pt-5">
          <Button type="submit" disabled={pending} data-testid="save-work">{pending ? "Saving…" : "Save"}</Button>
          <Link
            href="/admin"
            className={buttonVariants({ variant: "outline" })}
            onClick={(e) => {
              /* the document-level guard asks for confirmation when there are unsaved changes */
              void e;
            }}
          >
            Cancel
          </Link>
        </div>
      </form>

      {p.id && (
        <form
          action={deleteWork.bind(null, p.id)}
          className="mt-10 border-t border-border pt-5"
          onSubmit={(e) => {
            if (!window.confirm("Delete this work for good? Past orders keep their own record of it.")) e.preventDefault();
          }}
        >
          <Button type="submit" variant="destructive" size="sm">Delete this work</Button>
        </form>
      )}
    </div>
  );
}
