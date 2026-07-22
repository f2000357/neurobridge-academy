"use client";

export default function ReportActions({ childName }: { childName: string }) {
  function emailReport() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const subject = `Progress report — ${childName}`;
    const body =
      `Hi,\n\n` +
      `Please find ${childName}'s Neurable progress report.\n\n` +
      `You can view it online here:\n${url}\n\n` +
      `(If you were sent a PDF, it's the printable version of this same report.)\n\n` +
      `Thank you.`;
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  return (
    <div className="row no-print" style={{ gap: 8 }}>
      <button className="btn quiet" onClick={() => window.print()}>
        ⎙ Print / Save PDF
      </button>
      <button className="btn quiet" onClick={emailReport}>
        ✉ Email
      </button>
    </div>
  );
}
