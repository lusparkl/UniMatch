import { Shell } from "@/components/shell";
import { ProfileWizard } from "@/components/profile-wizard";
import { demoMode } from "@/lib/config";
export default function Page() {
  return (
    <Shell demo={demoMode()}>
      <main className="container">
        <ProfileWizard />
      </main>
    </Shell>
  );
}
