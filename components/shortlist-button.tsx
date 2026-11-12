"use client";
import { Button } from "./ui/button";

export function ShortlistButton({
  saved,
  ready,
  onToggle,
}: {
  saved: boolean;
  ready: boolean;
  onToggle: () => void;
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={!ready}
      aria-pressed={saved}
      onClick={onToggle}
    >
      {saved ? "On your shortlist" : "Add To Shortlist"}
    </Button>
  );
}
