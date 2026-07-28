"use client";

import { useState } from "react";

// The specialist's own page, in three parts.
//
// It used to be one scrolling column: the directory question, then the roster,
// with nothing to separate them. The three things a visiting teacher comes here
// to do are unrelated to each other — answer a family, change their own details,
// open a learner — so they are three tabs rather than three sections you scroll
// past.
//
// Approvals leads because it is the only one that is someone else waiting.

export type TabKey = "approvals" | "profile" | "students";

export default function TeachTabs({
  approvals,
  profile,
  students,
  approvalCount,
  studentCount,
  initial = "approvals",
}: {
  approvals: React.ReactNode;
  profile: React.ReactNode;
  students: React.ReactNode;
  approvalCount: number;
  studentCount: number;
  initial?: TabKey;
}) {
  const [tab, setTab] = useState<TabKey>(initial);

  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: "approvals", label: "Approvals", count: approvalCount },
    { key: "profile", label: "Profile" },
    { key: "students", label: "Students", count: studentCount },
  ];

  return (
    <>
      <div className="row" role="tablist" aria-label="Your page" style={{ gap: 6, marginTop: 18, flexWrap: "wrap" }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            id={`tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls={`panel-${t.key}`}
            className={tab === t.key ? "btn" : "btn quiet"}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            {t.count ? <span className="pill good" style={{ marginLeft: 6 }}>{t.count}</span> : null}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
        style={{ marginTop: 14 }}
      >
        {tab === "approvals" && approvals}
        {tab === "profile" && profile}
        {tab === "students" && students}
      </div>
    </>
  );
}
