"use client";
import { useRouter } from "next/navigation";
import { ListPlus, ListX } from "lucide-react";
import { Button } from "./ui/button";

export function PriorityButton({
  programId,
  saved,
  signedIn,
  toggle,
}: {
  programId: string;
  saved: boolean;
  signedIn: boolean | null;
  toggle: (programId: string) => Promise<boolean>;
}) {
  const router = useRouter();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={signedIn === null}
      onClick={() => {
        if (signedIn === false) router.push("/account?next=/priorities");
        else void toggle(programId);
      }}
    >
      {saved ? <ListX size={14} /> : <ListPlus size={14} />}
      {saved
        ? "Remove from priorities"
        : signedIn === false
          ? "Sign in to add to priorities"
          : "Add to priorities"}
    </Button>
  );
}
