"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

// The child's introduction, as their parent writes it.
//
// Everything else in this console is machinery — levels, standards, providers.
// This is the human part: the picture and the few sentences a therapist reads
// before they meet him. Only the primary guardian can edit; everyone else sees
// the same page read-only, with the reason stated plainly.

export type IntroData = {
  childId: string;
  childName: string;
  aboutMe: string;
  likes: string;
  dislikes: string;
  hasPhoto: boolean;
  updatedAt: string | null;
};

/**
 * Shrink to at most 512px on the long edge before upload. A modern phone photo
 * is several megabytes; the profile shows it at ~120px. Doing this in the
 * browser keeps the database small and means no image library on the server.
 */
async function downscale(file: File): Promise<{ mimeType: string; data: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser couldn't process that image.");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  // JPEG for photographs; transparency isn't meaningful here.
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  return { mimeType: "image/jpeg", data: dataUrl.split(",")[1] ?? "" };
}

export default function Profile({
  intro,
  canEdit,
  editorName,
}: {
  intro: IntroData;
  canEdit: boolean;
  editorName: string | null;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [aboutMe, setAboutMe] = useState(intro.aboutMe);
  const [likes, setLikes] = useState(intro.likes);
  const [dislikes, setDislikes] = useState(intro.dislikes);
  const [hasPhoto, setHasPhoto] = useState(intro.hasPhoto);
  // Bumped after an upload so the browser refetches rather than showing the old picture.
  const [stamp, setStamp] = useState(0);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    aboutMe !== intro.aboutMe || likes !== intro.likes || dislikes !== intro.dislikes;

  async function post(payload: Record<string, unknown>) {
    const res = await fetch("/api/child-intro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ childId: intro.childId, ...payload }),
    });
    return res.json();
  }

  async function save() {
    setBusy(true);
    setError(null);
    setNote(null);
    const d = await post({ op: "saveIntro", aboutMe, likes, dislikes });
    setBusy(false);
    if (d.error) return setError(d.error);
    setNote("Saved. Everyone who works with " + intro.childName.split(" ")[0] + " sees this.");
    router.refresh();
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be chosen again after a failure
    if (!file) return;

    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const { mimeType, data } = await downscale(file);
      const d = await post({ op: "uploadPhoto", mimeType, data });
      if (d.error) {
        setError(d.error);
      } else {
        setHasPhoto(true);
        setStamp(Date.now());
        setNote("Picture updated.");
        router.refresh();
      }
    } catch {
      setError("That image couldn't be read. Try a JPEG or PNG.");
    }
    setBusy(false);
  }

  async function removePhoto() {
    if (!confirm(`Remove ${intro.childName.split(" ")[0]}'s picture?`)) return;
    setBusy(true);
    setError(null);
    const d = await post({ op: "removePhoto" });
    setBusy(false);
    if (d.error) return setError(d.error);
    setHasPhoto(false);
    setNote("Picture removed.");
    router.refresh();
  }

  const photoUrl = `/api/child-photo/${intro.childId}${stamp ? `?v=${stamp}` : ""}`;
  const firstName = intro.childName.split(" ")[0] || "your child";

  return (
    <>
      {!canEdit && (
        <div className="card" style={{ marginTop: 12, borderColor: "var(--warn)" }}>
          <p className="muted" style={{ margin: 0 }}>
            <strong>Read-only.</strong> Only {firstName}&apos;s main parent or guardian
            {editorName ? ` (${editorName})` : ""} can change this profile. You can read it and use
            it — ask them if something needs updating.
          </p>
        </div>
      )}

      <div className="card" style={{ marginTop: 12 }}>
        <h2>Picture</h2>
        <p className="muted" style={{ marginTop: 0, fontSize: "0.9rem" }}>
          Shown to everyone who works with {firstName} — guides and visiting therapists. Never
          public, and never shown to other families.
        </p>

        <div className="row" style={{ gap: 18, alignItems: "center", flexWrap: "wrap" }}>
          <div className="intro-photo" aria-hidden={!hasPhoto}>
            {hasPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt={`${intro.childName}`} />
            ) : (
              <span className="intro-initials">
                {intro.childName
                  .split(" ")
                  .map((p) => p[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </span>
            )}
          </div>

          {canEdit && (
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={onPick}
                style={{ display: "none" }}
              />
              <button className="btn quiet" onClick={() => fileRef.current?.click()} disabled={busy}>
                {hasPhoto ? "Change picture" : "Add a picture"}
              </button>
              {hasPhoto && (
                <button className="btn quiet" onClick={removePhoto} disabled={busy}>
                  Remove
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <h2>About {firstName}</h2>
        <p className="muted" style={{ marginTop: 0, fontSize: "0.9rem" }}>
          A few sentences in your own words — who they are, and how to be with them. This is the
          first thing a new therapist reads.
        </p>
        <textarea
          className="field"
          rows={5}
          value={aboutMe}
          disabled={!canEdit}
          maxLength={1500}
          onChange={(e) => setAboutMe(e.target.value)}
          placeholder={`${firstName} is funny and very literal. He warms up slowly with someone new — give him a few minutes before asking him to do anything. He tells you when he's had enough, and he means it.`}
        />

        <div className="row" style={{ gap: 14, marginTop: 14, flexWrap: "wrap" }}>
          <label className="inline muted" style={{ flex: "1 1 260px" }}>
            Likes
            <textarea
              className="field"
              rows={4}
              value={likes}
              disabled={!canEdit}
              maxLength={800}
              onChange={(e) => setLikes(e.target.value)}
              placeholder="Trains, drawing, being told what happens next, counting things"
            />
          </label>
          <label className="inline muted" style={{ flex: "1 1 260px" }}>
            Dislikes
            <textarea
              className="field"
              rows={4}
              value={dislikes}
              disabled={!canEdit}
              maxLength={800}
              onChange={(e) => setDislikes(e.target.value)}
              placeholder="Loud rooms, surprises, being rushed, hand-over-hand help"
            />
          </label>
        </div>

        <p className="muted" style={{ fontSize: "0.85rem", marginTop: 14 }}>
          Share what helps someone work with {firstName} well. You don&apos;t need to include
          diagnoses, medications, or clinical history — those belong in the IEP and evaluation
          documents, where access is tighter.
        </p>

        {error && (
          <p className="muted" role="alert" style={{ color: "var(--crit)" }}>
            {error}
          </p>
        )}
        {note && !error && (
          <p className="muted" role="status" style={{ color: "var(--good)" }}>
            {note}
          </p>
        )}

        {canEdit && (
          <button className="btn" style={{ marginTop: 8 }} onClick={save} disabled={busy || !dirty}>
            {busy ? "Saving…" : dirty ? "Save profile" : "Saved"}
          </button>
        )}

        {intro.updatedAt && (
          <p className="muted" style={{ fontSize: "0.8rem", marginTop: 12, marginBottom: 0 }}>
            Last updated {intro.updatedAt}.
          </p>
        )}
      </div>
    </>
  );
}
