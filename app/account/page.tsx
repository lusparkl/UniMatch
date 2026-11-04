import { notFound } from "next/navigation";
import { Shell } from "@/components/shell";
import { AuthForm } from "@/components/auth-form";
import { AccountPanel } from "@/components/account-panel";
import { currentUser } from "@/lib/account";
import { demoMode, isPublicMode } from "@/lib/config";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (isPublicMode()) notFound();
  const user = await currentUser();
  const { next } = await searchParams;
  return (
    <Shell demo={demoMode()}>
      <main className="container">
        {user ? (
          <AccountPanel email={user.email} />
        ) : (
          <AuthForm next={next ?? null} />
        )}
      </main>
    </Shell>
  );
}
