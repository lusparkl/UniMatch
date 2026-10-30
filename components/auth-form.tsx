"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { Button } from "./ui/button";

/** Only same-site paths are followed after sign-in. */
const safeNext = (next: string | null) =>
  next && next.startsWith("/") && !next.startsWith("//") ? next : "/account";

export function AuthForm({ next }: { next: string | null }) {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(form: FormData) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/" + mode, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? "Something went wrong. Try again.");
        return;
      }
      router.push(safeNext(next));
      router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel" style={{ maxWidth: 480 }}>
      <h2>{mode === "signup" ? "Create your account" : "Welcome back"}</h2>
      <p className="muted">
        An account keeps your profile, test results and documents together, so
        you can compare programs and plan your applications on any device.
      </p>
      <form
        className="stack"
        onSubmit={(e) => {
          // A React form action would clear the fields after a failed attempt.
          e.preventDefault();
          void submit(new FormData(e.currentTarget));
        }}
      >
        <label>
          Email
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete={
              mode === "signup" ? "new-password" : "current-password"
            }
            minLength={10}
            required
          />
        </label>
        {mode === "signup" && (
          <p className="tiny muted">
            At least 10 characters. We cannot send emails yet, so a lost
            password cannot be reset: keep it somewhere safe.
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy}>
          <LockKeyhole size={16} />
          {mode === "signup" ? "Create account" : "Sign in"}
        </Button>
      </form>
      <button
        className="back"
        style={{ marginTop: 16 }}
        onClick={() => {
          setError("");
          setMode(mode === "signup" ? "login" : "signup");
        }}
      >
        {mode === "signup"
          ? "I already have an account"
          : "Create a new account"}
      </button>
    </section>
  );
}
