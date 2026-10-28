import { notFound } from "next/navigation";
import { Shell } from "@/components/shell";
import { UniversityDetail } from "@/components/university-detail";
import { getPrograms } from "@/lib/catalog";
import { demoMode } from "@/lib/config";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ program?: string }>;
}) {
  const { id } = await params;
  const programs = (await getPrograms()).filter((p) => p.universityId === id);
  if (!programs.length) notFound();
  return (
    <Shell demo={demoMode()}>
      <main className="container">
        <UniversityDetail
          programs={programs}
          initialId={(await searchParams).program}
        />
      </main>
    </Shell>
  );
}
