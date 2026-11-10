import { Shell } from "@/components/shell";
import { ResultsSkeleton } from "@/components/skeletons";
import { demoMode } from "@/lib/config";
export default function Loading() {
  return (
    <Shell demo={demoMode()}>
      <ResultsSkeleton />
    </Shell>
  );
}
