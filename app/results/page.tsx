import { Shell } from "@/components/shell";
import { Results } from "@/components/results";
import { listPrograms } from "@/lib/catalog";
import { demoMode } from "@/lib/config";
import { countries } from "@/lib/domain";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ country?: string }>;
}) {
  const { country } = await searchParams;
  return (
    <Shell demo={demoMode()}>
      <main className="container">
        <Results
          programs={await listPrograms()}
          initialCountry={countries.find((c) => c === country) ?? ""}
        />
      </main>
    </Shell>
  );
}
