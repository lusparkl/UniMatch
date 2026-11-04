import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "UniMatch — Your next chapter, within reach",
  description:
    "Find out where you can really get in and afford to study in Asia, with every answer traced to an official source.",
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
