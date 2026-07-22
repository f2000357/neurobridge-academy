"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; match: (p: string) => boolean; icon: React.ReactNode };

const icon = (d: string) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {d.split("|").map((path, i) => (
      <path key={i} d={path} />
    ))}
  </svg>
);

const items: Item[] = [
  {
    href: "/teacher",
    label: "Today",
    match: (p) => p === "/teacher",
    icon: icon("M3 12l9-9 9 9|M5 10v10h14V10"),
  },
  {
    href: "/teacher/admin",
    label: "Children",
    match: (p) => p.startsWith("/teacher/admin"),
    icon: icon("M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z|M17 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z|M3 20v-1a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v1|M16 15h1a4 4 0 0 1 4 4v1"),
  },
  {
    href: "/teacher/library",
    label: "Lessons",
    match: (p) => p.startsWith("/teacher/library") || p.startsWith("/teacher/plans"),
    icon: icon("M4 5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2z|M9 3v18"),
  },
  {
    href: "/teacher/schedule",
    label: "Plan a day",
    match: (p) => p.startsWith("/teacher/schedule"),
    icon: icon("M4 5h16v16H4z|M4 9h16|M8 3v4|M16 3v4"),
  },
  {
    href: "/teacher/week",
    label: "Week",
    match: (p) => p === "/teacher/week",
    icon: icon("M4 4h16v16H4z|M10 4v16|M16 4v16|M4 10h16"),
  },
  {
    href: "/teacher/week-plan",
    label: "Plan week",
    match: (p) => p.startsWith("/teacher/week-plan"),
    icon: icon("M12 3v18|M5 8l7-5 7 5|M5 8v8l7 4 7-4V8"),
  },
  {
    href: "/teacher/performance",
    label: "Performance",
    match: (p) => p.startsWith("/teacher/performance"),
    icon: icon("M4 20V10|M10 20V4|M16 20v-7|M22 20H2"),
  },
  {
    href: "/teacher/rewards",
    label: "Prizes",
    match: (p) => p.startsWith("/teacher/rewards"),
    icon: icon("M20 12v9H4v-9|M2 7h20v5H2z|M12 22V7|M12 7S9 2 6.5 3.5 8 7 12 7z|M12 7s3-5 5.5-3.5S16 7 12 7z"),
  },
];

export default function SideNav() {
  const pathname = usePathname();
  return (
    <nav className="console-side" aria-label="Guide portal">
      <ul className="console-nav">
        {items.map((it) => (
          <li key={it.href}>
            <Link
              href={it.href}
              className={`console-navlink ${it.match(pathname) ? "active" : ""}`}
              aria-current={it.match(pathname) ? "page" : undefined}
            >
              <span className="console-navicon" aria-hidden="true">
                {it.icon}
              </span>
              {it.label}
            </Link>
          </li>
        ))}
      </ul>
      <Link href="/teacher/plans/new" className="btn console-newbtn">
        ✦ New lesson
      </Link>
    </nav>
  );
}
