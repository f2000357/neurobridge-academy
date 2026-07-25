import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NeuroBridge Academy — A learning path designed around your child",
  description:
    "AI-powered, standards-aligned education for neurodiverse learners — with families, educators, and specialists connected in one place.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
