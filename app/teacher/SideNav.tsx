"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; match: (p: string) => boolean; icon: React.ReactNode };
type Group = { heading: string; items: Item[] };

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
    href: "/teacher/schedule",
    label: "Schedule",
    // The timetable: the day builder and the week grid are two views of it.
    match: (p) => p.startsWith("/teacher/schedule") || p === "/teacher/week",
    icon: icon("M4 5h16v16H4z|M4 9h16|M8 3v4|M16 3v4"),
  },
  {
    href: "/teacher/week-plan",
    label: "Weekly lessons",
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
    href: "/teacher/find",
    label: "Find help",
    match: (p) => p.startsWith("/teacher/find"),
    icon: icon("M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z|M20 20l-4-4"),
  },
  {
    href: "/teacher/specialists",
    label: "Teachers",
    match: (p) => p.startsWith("/teacher/specialists"),
    icon: icon("M12 3l9 5-9 5-9-5 9-5z|M5 11v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"),
  },
  {
    href: "/teacher/rewards",
    label: "Prizes",
    match: (p) => p.startsWith("/teacher/rewards"),
    icon: icon("M20 12v9H4v-9|M2 7h20v5H2z|M12 22V7|M12 7S9 2 6.5 3.5 8 7 12 7z|M12 7s3-5 5.5-3.5S16 7 12 7z"),
  },
  {
    href: "/teacher/iep",
    label: "IEP support",
    match: (p) => p.startsWith("/teacher/iep"),
    icon: icon("M4 19.5A2.5 2.5 0 0 1 6.5 17H20|M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"),
  },
  {
    href: "/teacher/standing",
    label: "Where they stand",
    match: (p) => p.startsWith("/teacher/standing"),
    icon: icon("M3 3v18h18|M7 15l4-4 3 3 5-6"),
  },
  {
    href: "/teacher/tests",
    label: "Check-ins",
    match: (p) => p.startsWith("/teacher/tests"),
    icon: icon("M9 11l3 3 8-8|M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"),
  },
  {
    href: "/teacher/settings",
    label: "Settings",
    match: (p) => p.startsWith("/teacher/settings"),
    icon: icon("M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z|M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 6.6 19l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 12.6H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 6l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V2a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"),
  },
];

// Three kinds of thing, and they were all one undifferentiated list.
//
// "The child" holds the work you come back to — the IEP review is what a parent
// carries into a meeting, not a setting. It used to be a chip inside a screen
// called Setup.
const byHref = (h: string) => {
  const found = items.find((i) => i.href === h);
  if (!found) throw new Error(`SideNav: no item for ${h}`);
  return found;
};
const groups: Group[] = [
  {
    heading: "Day to day",
    items: ["/teacher", "/teacher/schedule", "/teacher/week-plan", "/teacher/rewards"].map(byHref),
  },
  {
    heading: "The child",
    items: ["/teacher/admin", "/teacher/iep", "/teacher/standing", "/teacher/tests", "/teacher/performance"].map(byHref),
  },
  {
    heading: "Around them",
    items: ["/teacher/specialists", "/teacher/find", "/teacher/settings"].map(byHref),
  },
];

export default function SideNav({ approvals = 0 }: { approvals?: number }) {
  const pathname = usePathname();
  return (
    <nav className="console-side" aria-label="Guide portal">
      {groups.map((g) => (
      <ul className="console-nav" key={g.heading}>
        <li className="console-navhead" aria-hidden="true">{g.heading}</li>
        {g.items.map((it) => (
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
              {it.href === "/teacher" && approvals > 0 && (
                <span className="nav-badge" aria-label={`${approvals} awaiting approval`}>
                  {approvals}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
      ))}
    </nav>
  );
}
