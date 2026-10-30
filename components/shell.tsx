import Link from "next/link";
import Image from "next/image";
import { Compass } from "lucide-react";
import { MainNav, TabBar } from "./nav";
export function Shell({
  children,
  demo = false,
}: {
  children: React.ReactNode;
  demo?: boolean;
}) {
  return (
    <>
      {demo && (
        <div className="demo-banner">
          <Compass size={14} /> Offline demo · All universities, requirements
          and funding shown in this mode are fictional.
        </div>
      )}
      <header className="site-header">
        <Link href="/" className="brand" aria-label="UniMatch home">
          <Image
            src="/assets/logo-mark.png"
            alt=""
            width={44}
            height={38}
            unoptimized
          />
          UniMatch
        </Link>
        <MainNav />
      </header>
      {children}
      <footer>
        <Link href="/" className="brand">
          <Image
            src="/assets/logo-mark.png"
            alt=""
            width={33}
            height={28}
            unoptimized
          />
          UniMatch
        </Link>
        <p>A clearer path to your next chapter.</p>
        <Link href="/admin">Research administration</Link>
      </footer>
      <TabBar />
    </>
  );
}
