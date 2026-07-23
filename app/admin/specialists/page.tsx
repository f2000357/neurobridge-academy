import { prisma } from "@/lib/prisma";
import { allSpecialists } from "@/lib/specialistQueries";
import SpecialistsPanel from "@/app/components/SpecialistsPanel";

export const dynamic = "force-dynamic";

// Neurable admin is the only place a teacher's code can be read back — and the
// only place that knows which codes still need to reach their teacher.

export default async function AdminSpecialists() {
  const [teachers, children] = await Promise.all([
    allSpecialists(),
    prisma.child.findMany({
      where: { archived: false },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const pending = teachers.filter((t) => !t.archived && !t.codeSent);

  return (
    <div>
      <p className="eyebrow">Neurable admin</p>
      <h1>Visiting teachers</h1>

      {pending.length > 0 && (
        <div className="card pending-card" style={{ marginTop: 16 }}>
          <h2 style={{ marginTop: 0 }}>Codes waiting to be sent · {pending.length}</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Automatic email and SMS delivery isn&apos;t built yet. Until it is, these teachers need
            their code passed on by hand — reveal it below and send it to the address or number
            shown. Nobody outside this page can see a code.
          </p>
          <div className="stack" style={{ gap: 6 }}>
            {pending.map((t) => (
              <div key={t.id} className="row assign-row">
                <span>{t.name}</span>
                <span className="muted">{t.email}</span>
                <span className="muted">{t.phone || "no mobile"}</span>
                <span className="code-inline">{t.code}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <SpecialistsPanel teachers={teachers} children={children} canSeeCode />
    </div>
  );
}
