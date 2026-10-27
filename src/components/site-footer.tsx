import Link from "next/link";
import { store } from "@/config/store";
import { getSettings } from "@/lib/settings";

export async function SiteFooter() {
  let follow: { label: string; url: string }[] = [...store.defaults.followLinks];
  try {
    follow = (await getSettings()).followLinks;
  } catch {}
  const linkCls = "inline-flex min-h-9 items-center hover:text-accent hover:underline underline-offset-4";
  return (
    <footer className="mt-20 border-t border-border bg-background">
      <div className="wide page-x grid gap-8 py-10 sm:grid-cols-3">
        <nav aria-label="Help">
          <h2 className="mb-2 font-serif text-lg">Help</h2>
          <ul>
            <li><Link className={linkCls} href="/help">Help &amp; FAQ</Link></li>
            <li><Link className={linkCls} href="/returns">Returns &amp; refunds</Link></li>
          </ul>
        </nav>
        <nav aria-label="Studio">
          <h2 className="mb-2 font-serif text-lg">Studio</h2>
          <ul>
            <li><Link className={linkCls} href="/about">About</Link></li>
            <li><Link className={linkCls} href="/exhibitions">Exhibitions</Link></li>
            <li><Link className={linkCls} href="/commissions">Commissions</Link></li>
            <li><Link className={linkCls} href="/contact">Contact</Link></li>
          </ul>
        </nav>
        <nav aria-label="Follow">
          <h2 className="mb-2 font-serif text-lg">Follow</h2>
          <ul>
            {follow.map((f) => (
              <li key={f.label + f.url}>
                <a className={linkCls} href={f.url} rel="noopener noreferrer">{f.label}</a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="border-t border-border" data-testid="subfooter">
        <div className="wide page-x py-5 text-sm text-muted-foreground">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-medium text-foreground">Accepted payment methods (demo information):</span>
            <ul className="flex flex-wrap gap-x-3 gap-y-1" aria-label="Payment methods planned for launch">
              {store.acceptedPayments.map((p) => (
                <li key={p} className="border border-border px-2 py-0.5">{p}</li>
              ))}
            </ul>
          </div>
          <p className="mt-2">
            These are the methods planned for launch, shown for demonstration only. This checkout is simulated and does not collect payment.
          </p>
          <p className="mt-2">
            © {new Date().getFullYear()} {store.name}. A demo store: nothing here ships and no payment is taken.
          </p>
        </div>
      </div>
    </footer>
  );
}
