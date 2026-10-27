import { NotFoundContent } from "@/components/not-found-content";

export default function OrderNotFound() {
  return (
    <NotFoundContent title="We couldn't find that order">
      <p>
        Order references look like <strong className="font-mono">SA-7K3M9Q2X</strong>: “SA-” followed by eight letters and numbers.
        Check for a typo, or return to the work. This is a demo store, so there is no order lookup and no email.
      </p>
    </NotFoundContent>
  );
}
