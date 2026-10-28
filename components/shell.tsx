import Link from "next/link";
import { ArrowUpRight, Compass, GraduationCap } from "lucide-react";
export function Shell({
  children,
  demo = false,
}: {
  children: React.ReactNode;
  demo?: boolean;
}) {
  return (
    <>
      <header className="site-header">
        <Link href="/" className="brand">
          <span className="brand-icon">
            <GraduationCap size={24} />
          </span>
          UniMatch<span className="brand-ai">AI</span>
        </Link>
        <nav aria-label="Main navigation">
          <Link href="/results">Explore universities</Link>
          <Link href="/profile">My profile</Link>
          <Link className="nav-cta" href="/profile">
            Find my match <ArrowUpRight size={16} />
          </Link>
        </nav>
      </header>
      {demo && (
        <div className="demo-banner">
          <Compass size={14} /> Offline demo · All universities, requirements
          and funding shown in this mode are fictional.
        </div>
      )}
      {children}
      <footer>
        <Link href="/" className="brand">
          <GraduationCap size={20} /> UniMatch AI
        </Link>
        <p>A clearer path to your next chapter.</p>
        <Link href="/admin">Research administration</Link>
      </footer>
    </>
  );
}
