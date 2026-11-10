import Link from "next/link";
import {
  CircleCheck,
  CircleHelp,
  CircleX,
  ExternalLink,
  ShieldCheck,
  ShieldQuestion,
  UserCheck,
} from "lucide-react";
import type { Action } from "@/lib/actions";
import type { Truth } from "@/lib/matching";
import { tierLabel, type TrustTier } from "@/lib/trust";

// One look for PASS, UNKNOWN and FAIL everywhere: colour, icon and words together, never colour alone.
const icons = { PASS: CircleCheck, UNKNOWN: CircleHelp, FAIL: CircleX };
export function StatusTag({
  state,
  children,
}: {
  state: Truth;
  children: React.ReactNode;
}) {
  const Icon = icons[state];
  return (
    <span className={"tag " + state}>
      <Icon size={14} aria-hidden />
      {children}
    </span>
  );
}

const tierIcons = { 1: UserCheck, 2: ShieldCheck, 3: ShieldQuestion };
export const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
/** Who checked a fact (human, machine against the official source, nobody yet) and when its source was read. */
export function TrustBadge({
  tier,
  date,
  programme = false,
}: {
  tier: TrustTier;
  date?: string | null;
  /** A whole programme: its weakest fact sets the tier. */
  programme?: boolean;
}) {
  const Icon = tierIcons[tier];
  return (
    <span className={"trust trust-" + tier}>
      <Icon size={13} aria-hidden />
      {programme && tier === 3
        ? "Some facts not yet verified"
        : tierLabel[tier]}
      {date && tier < 3 ? <> · verified on {shortDate(date)}</> : null}
    </span>
  );
}

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
