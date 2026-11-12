import Link from "next/link";
import Image from "next/image";
import { Compass } from "lucide-react";
import { CompareBar, FooterNav, MainNav, TabBar } from "./nav";
import { isPublicMode } from "@/lib/config";
export function Shell({
  children,
  demo = false,
}: {
  children: React.ReactNode;
  demo?: boolean;
}) {
  const local = !isPublicMode();
  return (
    <>
      {demo && (
        <div className="demo-banner">
          <Compass size={14} aria-hidden /> Offline demo · All universities,
          requirements and funding are fictional.
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
          <span>UniMatch</span>
        </Link>
        <MainNav accounts={local} />
      </header>
      {children}
      <footer className="site-footer">
        <div className="footer-inner">
          <div className="footer-top">
            <div className="footer-brand">
              <Link href="/" className="brand">
                <span className="brand-tile">
                  <Image
                    src="/assets/logo-mark.png"
                    alt=""
                    width={33}
                    height={28}
                    unoptimized
                  />
                </span>
                UniMatch
              </Link>
              <p>Your way into Hong Kong and South Korea’s universities.</p>
            </div>
            <FooterNav admin={local} />
          </div>
          <div className="footer-bottom">
            <span>
              UniMatch never predicts admission. Always confirm on the official
              page.
            </span>
            <span className="cjk footer-mark" lang="zh-HK">
              香港 · <span lang="ko">한국</span>
            </span>
          </div>
        </div>
      </footer>
      <CompareBar />
      <TabBar />
    </>
  );
}
