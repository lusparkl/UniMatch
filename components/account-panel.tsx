"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
import { api, loadDocuments, type TrackedDocuments } from "./account-client";
import { documentKinds } from "@/lib/documents";

const options = [
  ["NONE", "Not yet"],
  ["IN_PROGRESS", "In progress"],
  ["HAVE", "I have it"],
] as const;

export function AccountPanel({ email }: { email: string }) {
  const router = useRouter();
  const [docs, setDocs] = useState<TrackedDocuments>({});
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    void loadDocuments().then((d) => setDocs(d ?? {}));
  }, []);
  async function mark(kind: string, status: string) {
    const done = await api("/api/account/documents/" + kind, "PUT", { status });
    if (!done) return setMessage("Could not save. Try again.");
    setDocs((d) => {
      const next = { ...d };
      if (status === "NONE") delete next[kind];
      else next[kind] = status as "HAVE" | "IN_PROGRESS";
      return next;
    });
  }
  async function signOut() {
    await api("/api/auth/logout", "POST");
    router.push("/");
    router.refresh();
  }
  async function remove(form: FormData) {
    const response = await fetch("/api/account/me", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: form.get("password") }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      return setMessage(body?.error ?? "Could not delete the account.");
    }
    localStorage.removeItem("unimatch-profile-v1");
    router.push("/");
    router.refresh();
  }
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Your account</div>
          <h1>{email}</h1>
          <p className="muted">
            Your profile, test results and documents are saved to this account.
          </p>
        </div>
      </div>
      <div className="actions" style={{ gap: 10, marginBottom: 24 }}>
        <Button asChild>
          <Link href="/profile">Edit profile and test results</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/priorities">My priorities</Link>
        </Button>
        <Button variant="outline" onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
      <section className="panel">
        <h3>Documents</h3>
        <p className="muted">
          Mark what you already have. Programs show which of their required
          documents you still need to prepare. English and SAT/ACT results count
          automatically from your profile.
        </p>
        {documentKinds
          .filter((k) => k.id !== "english" && k.id !== "standardized")
          .map((k) => (
            <div className="check" key={k.id}>
              <strong className="tiny">{k.label}</strong>
              <select
                aria-label={"Status of " + k.label}
                value={docs[k.id] ?? "NONE"}
                onChange={(e) => void mark(k.id, e.target.value)}
              >
                {options.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          ))}
        {message && (
          <p className="error" role="alert">
            {message}
          </p>
        )}
      </section>
      <section className="panel">
        <h3>Delete account</h3>
        <p className="muted">
          Removes your account, profile, documents and priorities permanently.
        </p>
        {confirming ? (
          <form action={remove} className="stack" style={{ maxWidth: 360 }}>
            <label>
              Confirm with your password
              <input name="password" type="password" required />
            </label>
            <Button type="submit" variant="dark">
              Delete everything
            </Button>
          </form>
        ) : (
          <Button variant="outline" onClick={() => setConfirming(true)}>
            Delete my account
          </Button>
        )}
      </section>
    </>
  );
}
