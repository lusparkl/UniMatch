import { Shell } from "@/components/shell";
import { DetailSkeleton } from "@/components/skeletons";
import { demoMode } from "@/lib/config";
export default function Loading() {
  return (
    <Shell demo={demoMode()}>
      <DetailSkeleton />
    </Shell>
  );
}
