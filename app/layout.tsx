import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "UniMatch — Your next chapter, within reach",
  description:
    "Evidence-led university research and personalized international study matching.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}
      >
        {children}
      </body>
    </html>
  );
}
