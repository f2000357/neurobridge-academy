import Builder, { type PlanState } from "@/app/teacher/plans/Builder";

export const dynamic = "force-dynamic";

// NeuroBridge admin authors a generic lesson for the global shelf.
export default async function NewGlobalLesson({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string; grade?: string; topic?: string }>;
}) {
  const sp = await searchParams;
  const initial: PlanState = {
    title: "",
    subject: sp.subject || "Math",
    gradeLevel: sp.grade || "",
    topic: sp.topic || "",
    standardCode: "",
    standardText: "",
    goal: "",
    whyItMatters: "",
    workUrl: "",
    durationMin: 25,
    childId: null,
    published: false,
    visibility: "global",
    chunks: [],
  };
  return <Builder initial={initial} canGlobal children={[]} />;
}
