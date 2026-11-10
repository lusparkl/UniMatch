import { Shell } from "@/components/shell";
import { Deadlines } from "@/components/deadlines";
import { listPrograms } from "@/lib/catalog";
import { demoMode } from "@/lib/config";
export const dynamic = "force-dynamic";
export default async function Page() {
  return (
    <Shell demo={demoMode()}>
      <main className="container">
        <Deadlines programs={await listPrograms()} />
      </main>
    </Shell>
  );
}
