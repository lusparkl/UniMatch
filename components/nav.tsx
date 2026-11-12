"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bookmark, Compass, House, UserRound } from "lucide-react";
import { Button } from "./ui/button";
import { useCompare } from "./local-store";
const links = [
  { href: "/results", label: "Explore" },
  { href: "/profile", label: "My profile" },
  { href: "/shortlist", label: "Shortlist" },
  { href: "/deadlines", label: "Deadlines" },
];
const tabs = [
  { href: "/", label: "Home", Icon: House },
  { href: "/results", label: "Explore", Icon: Compass },
  { href: "/shortlist", label: "Shortlist", Icon: Bookmark },
  { href: "/profile", label: "Profile", Icon: UserRound },
];
// Accounts exist only outside PUBLIC_MODE; the public site keeps everything in the browser.
const account = { href: "/account", label: "Account" };
const current = (path: string, href: string) =>
  (href === "/" ? path === "/" : path.startsWith(href)) ? "page" : undefined;
export function MainNav({ accounts }: { accounts: boolean }) {
  const path = usePathname();
  return (
    <nav aria-label="Main navigation">
      {(accounts ? [...links, account] : links).map((l) => (
        <Link key={l.href} href={l.href} aria-current={current(path, l.href)}>
          {l.label}
        </Link>
      ))}
      <Button asChild size="sm" className="nav-cta">
        <Link href="/profile">
          <span className="cta-long">Find My Match</span>
          <span className="cta-short">Find Match</span>
        </Link>
      </Button>
    </nav>
  );
}
export function FooterNav({ admin }: { admin: boolean }) {
  return (
    <nav aria-label="Footer">
      {[...links, { href: "/compare", label: "Compare" }].map((l) => (
        <Link key={l.href} href={l.href}>
          {l.label}
        </Link>
      ))}
      {admin && <Link href="/admin">Research administration</Link>}
    </nav>
  );
}
export function TabBar() {
  const path = usePathname();
  return (
    <nav className="tabbar" aria-label="Primary">
      {tabs.map(({ href, label, Icon }) => (
        <Link key={href} href={href} aria-current={current(path, href)}>
          <Icon size={22} aria-hidden />
          {label}
        </Link>
      ))}
    </nav>
  );
}
/** Programmes picked to compare, kept in view on every page except the comparison itself. */
export function CompareBar() {
  const path = usePathname();
  const compare = useCompare();
  if (!compare.ids.length || path.startsWith("/compare")) return null;
  return (
    <div className="compare-dock" role="region" aria-label="Compare">
      <span>{compare.ids.length} selected to compare</span>
      <div className="actions" style={{ gap: 8 }}>
        <Button variant="light" size="sm" onClick={compare.clear}>
          Clear
        </Button>
        <Button asChild variant="light" size="sm">
          <Link href={"/compare?ids=" + compare.ids.join(",")}>Compare</Link>
        </Button>
      </div>
    </div>
  );
}
