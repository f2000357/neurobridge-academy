// How the child is introduced to the adults who work with them.
//
// Written by the parent (see /teacher/admin/[childId] → Profile) and read-only
// everywhere else. It sits above the day on purpose: a therapist meeting this
// child for the first time should read who they are before reading a timetable.
//
// Renders nothing at all when the parent hasn't written anything — an empty
// card would just be a reproach.

export default function IntroCard({
  childId,
  childName,
  hasPhoto,
  aboutMe,
  likes,
  dislikes,
  emergency,
  urgentNotes,
}: {
  childId: string;
  childName: string;
  hasPhoto: boolean;
  aboutMe: string;
  likes: string;
  dislikes: string;
  emergency: { name: string; relation: string; phone: string; altPhone: string } | null;
  urgentNotes: string;
}) {
  if (!hasPhoto && !aboutMe && !likes && !dislikes && !emergency && !urgentNotes) return null;

  const firstName = childName.split(" ")[0] || childName;
  const initials = childName
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <section className="card lift intro-card" style={{ marginTop: 16 }}>
      <div className="intro-head">
        <div className="intro-photo">
          {hasPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/child-photo/${childId}`} alt={childName} />
          ) : (
            <span className="intro-initials">{initials}</span>
          )}
        </div>
        <div className="intro-words">
          <p className="eyebrow" style={{ marginBottom: 6 }}>
            From {firstName}&apos;s family
          </p>
          {aboutMe ? (
            <p style={{ margin: 0 }}>{aboutMe}</p>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              {firstName}&apos;s family hasn&apos;t written an introduction yet.
            </p>
          )}
        </div>
      </div>

      {urgentNotes && (
        <p className="intro-urgent">
          <b>Before you start:</b> {urgentNotes}
        </p>
      )}

      {emergency && (
        <p className="intro-emergency">
          <b>In an emergency</b> call {emergency.name}
          {emergency.relation ? ` (${emergency.relation})` : ""}
          {emergency.phone ? (
            <>
              {" — "}
              <a href={`tel:${emergency.phone.replace(/[^\d+]/g, "")}`}>{emergency.phone}</a>
            </>
          ) : null}
          {emergency.altPhone ? (
            <>
              {" or "}
              <a href={`tel:${emergency.altPhone.replace(/[^\d+]/g, "")}`}>{emergency.altPhone}</a>
            </>
          ) : null}
        </p>
      )}

      {(likes || dislikes) && (
        <div className="intro-prefs">
          {likes && (
            <div className="intro-pref good">
              <p className="intro-pref-label">Likes</p>
              <p>{likes}</p>
            </div>
          )}
          {dislikes && (
            <div className="intro-pref warn">
              <p className="intro-pref-label">Dislikes</p>
              <p>{dislikes}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
