import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { Action } from "@/lib/actions";

export const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
export function ActionLink({ action }: { action: Action }) {
  return action.external ? (
    <a
      className="action-link"
      href={action.href}
      target="_blank"
      rel="noopener noreferrer"
    >
      {action.label}
      <ExternalLink size={12} aria-hidden />
      <span className="sr-only"> (opens the official site)</span>
    </a>
  ) : (
    <Link className="action-link" href={action.href}>
      {action.label}
    </Link>
  );
}
