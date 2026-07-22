import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Neurable — A school for neurodiverse learners",
  description:
    "A calm, AI-powered school where lessons are planned by a teacher, driven by a calendar, and delivered through executive-functioning-first routines.",
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
