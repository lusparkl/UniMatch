"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, House, ListChecks, UserRound } from "lucide-react";
import { Button } from "./ui/button";
const links = [
  { href: "/results", label: "Explore" },
  { href: "/profile", label: "My profile" },
  { href: "/priorities", label: "Priorities" },
  { href: "/account", label: "Account" },
];
const tabs = [
  { href: "/", label: "Home", Icon: House },
  { href: "/results", label: "Explore", Icon: Compass },
  { href: "/priorities", label: "Priorities", Icon: ListChecks },
  { href: "/account", label: "Account", Icon: UserRound },
];
const current = (path: string, href: string) =>
  (href === "/" ? path === "/" : path.startsWith(href)) ? "page" : undefined;
export function MainNav() {
  const path = usePathname();
  return (
    <nav aria-label="Main navigation">
      {links.map((l) => (
        <Link key={l.href} href={l.href} aria-current={current(path, l.href)}>
          {l.label}
        </Link>
      ))}
      <Button asChild size="sm" className="nav-cta">
        <Link href="/profile">Find my match</Link>
      </Button>
    </nav>
  );
}
export function TabBar() {
  const path = usePathname();
  return (
    <nav className="tabbar" aria-label="Primary">
      {tabs.map(({ href, label, Icon }) => (
        <Link key={href} href={href} aria-current={current(path, href)}>
          <Icon size={22} />
          {label}
        </Link>
      ))}
    </nav>
  );
}
