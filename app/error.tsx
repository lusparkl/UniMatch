"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="container">
      <h1>We couldn’t load this page.</h1>
      <p>
        Please check that PostgreSQL is running when using the real catalog.
        Offline demo mode is available without services.
      </p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
