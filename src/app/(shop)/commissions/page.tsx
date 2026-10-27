import type { Metadata } from "next";
import { CommissionForm } from "@/components/commission-form";

export const metadata: Metadata = { title: "Commissions" };

export default function CommissionsPage() {
  return (
    <div className="reading page-x pt-8 md:pt-12">
      <h1 className="font-serif text-3xl md:text-4xl">Commissions</h1>
      <div className="prose-quiet mt-4 text-lg">
        <p>
          Some paintings begin with a request. If you have a place, a colour or a memory you would like painted, tell the
          painter about it below.
        </p>
        <h2>How it works</h2>
        <ul>
          <li>You send an inquiry with a few lines about what you have in mind, a rough size and a budget range.</li>
          <li>The painter replies to say whether the commission is a fit, and agrees size, price and timing with you.</li>
          <li>A commission usually takes six to ten weeks. You see progress photos along the way.</li>
        </ul>
        <p className="text-base text-muted-foreground">
          Sample wording for a demo store. There is no deposit and no payment here, and nothing is emailed: the inquiry is
          stored for the painter to read.
        </p>
      </div>
      <h2 className="mt-8 mb-4 font-serif text-xl">Send an inquiry</h2>
      <CommissionForm />
    </div>
  );
}
