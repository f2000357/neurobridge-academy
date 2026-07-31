import { goToChildSection } from "@/lib/childSection";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ childId?: string }>;
}) {
  const { childId } = await searchParams;
  await goToChildSection("tests", childId);
  return null;
}
