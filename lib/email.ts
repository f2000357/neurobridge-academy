// Sending mail.
//
// Provider-agnostic on purpose: one `send()` the app calls, one place that knows
// about Resend. Swapping to Postmark or SES later is this file, nothing else.
//
// It degrades honestly. With no API key configured — local dev, or before the
// sending domain is verified — nothing is sent and `sent: false` comes back with
// the reason, so callers can surface the link on screen instead of pretending an
// email is in flight. That is exactly how the app behaves today, so wiring email
// in changes nothing until the key exists.

const KEY = process.env.RESEND_API_KEY;
const FROM = process.env.EMAIL_FROM || "NeuroBridge <hello@neurobridge-academy.com>";

export type SendResult = { sent: boolean; id?: string; reason?: string };

export function emailConfigured(): boolean {
  return Boolean(KEY);
}

/** The app's own base URL, for building links inside emails. */
export function appUrl(path = ""): string {
  const base =
    process.env.APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000");
  return `${base.replace(/\/$/, "")}${path}`;
}

export async function send(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<SendResult> {
  if (!KEY) return { sent: false, reason: "no RESEND_API_KEY — email is not configured yet" };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { sent: false, reason: `provider ${res.status}: ${body.slice(0, 200)}` };
    }
    const data = (await res.json()) as { id?: string };
    return { sent: true, id: data.id };
  } catch (e) {
    return { sent: false, reason: (e as Error).message };
  }
}

// ── templates ───────────────────────────────────────────────────────────────
// Plain and warm. These reach parents and therapists, not developers.

const shell = (heading: string, body: string, cta?: { label: string; url: string }) => `
<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.55;color:#1a2230;max-width:520px;margin:0 auto;padding:24px">
  <p style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#4a6fa5;margin:0 0 4px">NeuroBridge</p>
  <h1 style="font-size:20px;margin:0 0 12px">${heading}</h1>
  ${body}
  ${
    cta
      ? `<p style="margin:22px 0"><a href="${cta.url}" style="background:#1e5f9e;color:#fff;text-decoration:none;padding:11px 18px;border-radius:8px;display:inline-block;font-weight:600">${cta.label}</a></p>
         <p style="font-size:12px;color:#667">If the button doesn't work, paste this into your browser:<br><span style="color:#4a6fa5">${cta.url}</span></p>`
      : ""
  }
</div>`;

/** A parent asking someone to co-manage their child. */
export function guideInvite(opts: {
  childName: string;
  fromName: string;
  url: string;
}): { subject: string; html: string; text: string } {
  return {
    subject: `${opts.fromName} would like your help with ${opts.childName}`,
    html: shell(
      `Help guide ${opts.childName}`,
      `<p>${opts.fromName} has asked you to help manage ${opts.childName}'s learning on NeuroBridge — their schedule, lessons and progress.</p>
       <p>Setting up takes a minute: choose a password and you're in.</p>`,
      { label: "Accept the invitation", url: opts.url }
    ),
    text: `${opts.fromName} has asked you to help manage ${opts.childName}'s learning on NeuroBridge.\n\nAccept here: ${opts.url}\n\nThe link works once and expires in 14 days.`,
  };
}

/** A therapist or visiting teacher signing in — no password, no code to keep. */
export function teacherSignIn(opts: {
  teacherName: string;
  url: string;
  minutes: number;
}): { subject: string; html: string; text: string } {
  return {
    subject: "Your NeuroBridge sign-in link",
    html: shell(
      `Sign in, ${opts.teacherName}`,
      `<p>Here's your link into NeuroBridge, where you can see the learners you teach and leave a note after each session.</p>
       <p style="font-size:13px;color:#667">It works once and expires in ${opts.minutes} minutes. If you didn't ask for it, you can ignore this.</p>`,
      { label: "Open NeuroBridge", url: opts.url }
    ),
    text: `Sign in to NeuroBridge: ${opts.url}\n\nThe link works once and expires in ${opts.minutes} minutes.`,
  };
}

/** Telling a therapist a family has added them. */
export function teacherAdded(opts: {
  teacherName: string;
  childName: string;
  fromName: string;
  url: string;
}): { subject: string; html: string; text: string } {
  return {
    subject: `${opts.fromName} has added you to ${opts.childName}'s team`,
    html: shell(
      `You're now working with ${opts.childName}`,
      `<p>${opts.fromName} has added you on NeuroBridge. You'll be able to see ${opts.childName}'s day and leave a note after each session you run.</p>
       <p>Use the link below whenever you need to get in — no password to remember.</p>`,
      { label: "Open NeuroBridge", url: opts.url }
    ),
    text: `${opts.fromName} has added you to ${opts.childName}'s team on NeuroBridge.\n\nSign in: ${opts.url}`,
  };
}
