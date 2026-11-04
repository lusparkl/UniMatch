import { notFound } from "next/navigation";
import { isPublicMode } from "@/lib/config";
import { Shell } from "@/components/shell";
import { Admin } from "@/components/admin";
import { adminSession } from "@/lib/auth";
export const dynamic = "force-dynamic";
export default async function Page() {
  if (isPublicMode()) notFound();
  return (
    <Shell>
      <main className="container">
        <Admin authenticated={!!(await adminSession())} />
      </main>
    </Shell>
  );
}
