import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import BrowseView, { type Shared } from "./BrowseView";

export const dynamic = "force-dynamic";

export default async function BrowsePage() {
  const me = await getCurrentUser();
  if (!me) return null;

  const plans = await prisma.lessonPlan.findMany({
    where: {
      published: true,
      teacherId: { not: me.id }, // not my own
      OR: [
        { visibility: "global" },
        { visibility: "center", centerId: me.centerId ?? "__none__" },
      ],
    },
    include: { teacher: { select: { name: true } }, center: { select: { name: true } } },
    orderBy: [{ subject: "asc" }, { title: "asc" }],
  });

  const shared: Shared[] = plans.map((p) => ({
    id: p.id,
    title: p.title,
    subject: p.subject,
    gradeLevel: p.gradeLevel,
    topic: p.topic,
    standardCode: p.standardCode,
    durationMin: p.durationMin,
    scope: p.visibility, // center | global
    author: p.teacher.name,
    center: p.center?.name ?? "NeuroBridge",
  }));

  return <BrowseView shared={shared} />;
}
