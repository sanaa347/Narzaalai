import { LinkButton } from "@/components/ui/primitives";

export function ActionBar() {
  return (
    <p className="mt-4 text-xs text-muted">
      “—” means the value was not provided; it is never treated as zero or as included. Totals per kWp are informational only. To put quotations in front of a customer, create a proposal from the project page.
      <span className="ml-2"><LinkButton href="/ops/quotes" size="sm">Back to quotations</LinkButton></span>
    </p>
  );
}
