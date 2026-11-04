"use client";
import { ListPlus, ListX } from "lucide-react";
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
    <Button variant="outline" size="sm" disabled={!ready} onClick={onToggle}>
      {saved ? <ListX size={14} /> : <ListPlus size={14} />}
      {saved ? "Remove from shortlist" : "Add to shortlist"}
    </Button>
  );
}
