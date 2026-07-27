import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NeuroBridge Academy — One view of your child, in school or at home",
  description:
    "For neurodiverse learners in traditional school or homeschooling. NeuroBridge connects the IEP, standardized tests, therapies, activities and home into one plan — and puts the parent in charge of it.",
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
