import { Shell } from "@/components/shell";
import { Results } from "@/components/results";
import { getPrograms } from "@/lib/catalog";
import { demoMode } from "@/lib/config";
export const dynamic = "force-dynamic";
export default async function Page() {
  return (
    <Shell demo={demoMode()}>
      <main className="container">
        <Results programs={await getPrograms()} />
      </main>
    </Shell>
  );
}
