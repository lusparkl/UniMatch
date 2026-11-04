import { Shell } from "@/components/shell";
import { Shortlist } from "@/components/shortlist";
import { getPrograms } from "@/lib/catalog";
import { demoMode } from "@/lib/config";
export const dynamic = "force-dynamic";
export default async function Page() {
  return (
    <Shell demo={demoMode()}>
      <main className="container">
        <Shortlist programs={await getPrograms()} />
      </main>
    </Shell>
  );
}
