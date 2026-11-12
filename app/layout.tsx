import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "UniMatch — Asia’s universities, open to you",
  description:
    "For students applying to universities in Hong Kong and South Korea from abroad: published requirements, real costs and scholarships open to international applicants, each traced to an official source.",
};
// Destination names in their own script (香港, 서울 …), loaded as a subset of only these characters.
const CJK_FONTS =
  "https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@600&family=Noto+Serif+TC:wght@600&display=swap&text=" +
  encodeURIComponent("亞洲港香광국대산서시아울전주포한항");
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        <link rel="stylesheet" href={CJK_FONTS} />
      </head>
      <body>{children}</body>
    </html>
  );
}
