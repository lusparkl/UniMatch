"use client";
import { useEffect, useState, useCallback } from "react";
import { Button } from "./ui/button";
import { LogOut, RefreshCw, ShieldCheck } from "lucide-react";
import { countries } from "@/lib/domain";
type University = {
  id: string;
  name: string;
  country: string;
  city: string;
  officialWebsite: string;
  researchStatus: string;
  sources: { id: string; startUrl: string; purpose: string }[];
};
type Candidate = {
  id: string;
  status: string;
  issues: string[];
  payload: unknown;
  document: { url: string; title: string; text: string; retrievedAt: string };
};
type Job = {
  id: string;
  university: { name: string };
  stage: string;
  status: string;
  pagesProcessed: number;
  modelCalls: number;
  tokenUsage: number;
  errors: string[];
  logs: { id: string; message: string; createdAt: string; level: string }[];
};
type Dashboard = {
  universities: University[];
  jobs: Job[];
  candidates: Candidate[];
  tokens: number;
  reservedTokens: number;
  tokenLimit: number;
  sourceCount: number;
  liveEnabled: boolean;
  demo: boolean;
};
async function post(path: string, body: unknown) {
  const response = await fetch("/api/admin/" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Request failed");
  return data;
}
const adminTabs = [
  ["overview", "Overview"],
  ["unis", "Universities"],
  ["research", "Research"],
  ["review", "Review"],
] as const;
export function Admin({ authenticated }: { authenticated: boolean }) {
  const [signed, setSigned] = useState(authenticated),
    [data, setData] = useState<Dashboard | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState<(typeof adminTabs)[number][0]>("overview");
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [selected, setSelected] = useState(""),
    [target, setTarget] = useState(
      "Computer Science admissions and scholarships",
    );
  const [name, setName] = useState(""),
    [country, setCountry] = useState<string>(countries[0]),
    [city, setCity] = useState(""),
    [website, setWebsite] = useState(""),
    [editId, setEditId] = useState("");
  const [source, setSource] = useState(""),
    [purpose, setPurpose] = useState("admissions"),
    [subdomains, setSubdomains] = useState(false),
    [browser, setBrowser] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/dashboard");
      if (r.status === 401) {
        setSigned(false);
        return;
      }
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setData(d);
    } catch (e) {
      setError(String(e));
    }
  }, []);
  useEffect(() => {
    if (!signed) return;
    void refresh();
    const timer = setInterval(refresh, 4000);
    return () => clearInterval(timer);
  }, [signed, refresh]);
  async function act(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
      setMessage(success);
      if (signed) await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  if (!signed)
    return (
      <div className="wizard" style={{ maxWidth: 460 }}>
        <div className="eyebrow">Research workspace</div>
        <h1>Administrator sign-in</h1>
        <p className="muted">
          Manage approved sources, review evidence, and publish useful
          university information.
        </p>
        <form
          className="panel stack"
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () => {
              await post("login", { email, password });
              setPassword("");
              setSigned(true);
            }, "Signed in");
          }}
        >
          <label>
            Email
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <Button disabled={busy} type="submit">
            <ShieldCheck size={16} /> Sign in
          </Button>
          <p className="tiny muted">
            Credentials are configured by the developer in the server
            environment. There is no default password.
          </p>
        </form>
      </div>
    );
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Research workspace</div>
          <h1>Good decisions start with good data.</h1>
          <p className="muted">
            Research deliberately. Review the evidence. Publish with confidence.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() =>
            void act(async () => {
              await post("logout", {});
              setSigned(false);
            }, "Signed out")
          }
        >
          <LogOut size={15} /> Sign out
        </Button>
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {message && (
        <div className="notice" role="status">
          {message}
        </div>
      )}
      {!data ? (
        <div className="loading">Loading research workspace…</div>
      ) : (
        <>
          <div className="admin-shell">
            <nav className="admin-tabs" aria-label="Admin sections">
              {adminTabs.map(([key, label]) => (
                <button
                  key={key}
                  aria-current={tab === key ? "page" : undefined}
                  onClick={() => setTab(key)}
                >
                  {label}
                  {key === "review" && data.candidates.length > 0 && (
                    <span className="badge">{data.candidates.length}</span>
                  )}
                </button>
              ))}
            </nav>
            <div className="admin-body">
              {tab === "overview" && (
                <>
                  <div className="notice">
                    {data.liveEnabled
                      ? "OpenAI research is configured. Every extraction awaits review before publication."
                      : "Offline AI mode: OPENAI_API_KEY is absent. Live research is disabled; no simulated jobs are shown."}
                    {data.demo &&
                      " Student pages currently show fictional DEMO_FIXTURES. Switch DEMO_MODE=false to see published PostgreSQL records."}
                  </div>
                  <div className="stats">
                    <div className="panel stat">
                      <strong>{data.universities.length}</strong>
                      <span>Approved universities</span>
                    </div>
                    <div className="panel stat">
                      <strong>{data.candidates.length}</strong>
                      <span>Awaiting review</span>
                    </div>
                    <div className="panel stat">
                      <strong>{data.sourceCount}</strong>
                      <span>Source versions</span>
                    </div>
                    <div className="panel stat">
                      <strong>{data.tokens.toLocaleString()}</strong>
                      <span>
                        Reported tokens today /{" "}
                        {data.tokenLimit.toLocaleString()} budget
                        <br />
                        {data.reservedTokens.toLocaleString()} consumed or
                        reserved
                      </span>
                    </div>
                  </div>
                  <section className="panel">
                    <h3>Needs attention</h3>
                    <button
                      className="link-btn"
                      onClick={() => setTab("review")}
                    >
                      {data.candidates.length
                        ? data.candidates.length + " candidates awaiting review"
                        : "Review queue is clear"}{" "}
                      →
                    </button>
                  </section>
                </>
              )}
              {tab === "unis" && (
                <div className="admin-grid">
                  <section className="panel">
                    <h3>Approved institutions</h3>
                    {data.universities.map((u) => (
                      <div className="check" key={u.id}>
                        <div>
                          <strong>{u.name}</strong>
                          <p>
                            {u.country} · {u.researchStatus} ·{" "}
                            {u.sources.length} approved sources
                          </p>
                          <details>
                            <summary className="tiny muted">
                              Source list
                            </summary>
                            {u.sources.map((s) => (
                              <p className="source" key={s.id}>
                                {s.purpose}:{" "}
                                <a
                                  href={s.startUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  {s.startUrl}
                                </a>
                              </p>
                            ))}
                          </details>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditId(u.id);
                            setName(u.name);
                            setCountry(u.country);
                            setCity(u.city);
                            setWebsite(u.officialWebsite);
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                        >
                          Edit
                        </Button>
                      </div>
                    ))}
                  </section>
                  <section className="panel">
                    <h3>University management</h3>
                    <form
                      className="stack"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void act(async () => {
                          await post("universities", {
                            ...(editId ? { id: editId } : {}),
                            name,
                            country,
                            city,
                            officialWebsite: website,
                          });
                          setEditId("");
                          setName("");
                          setCity("");
                          setWebsite("");
                        }, "University saved. Approve specific research sources below.");
                      }}
                    >
                      <label>
                        University name
                        <input
                          required
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                        />
                      </label>
                      <div className="form-grid">
                        <label>
                          Country
                          <select
                            value={country}
                            onChange={(e) => setCountry(e.target.value)}
                          >
                            {countries.map((c) => (
                              <option key={c}>{c}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          City
                          <input
                            required
                            value={city}
                            onChange={(e) => setCity(e.target.value)}
                          />
                        </label>
                      </div>
                      <label>
                        Official website
                        <input
                          type="url"
                          required
                          placeholder="https://university.edu"
                          value={website}
                          onChange={(e) => setWebsite(e.target.value)}
                        />
                      </label>
                      <Button disabled={busy}>
                        {editId ? "Update university" : "Add university"}
                      </Button>
                    </form>
                  </section>
                </div>
              )}
              {tab === "research" && (
                <div className="admin-grid">
                  <section className="panel">
                    <h3>Launch controlled research</h3>
                    <div className="stack">
                      <label>
                        Approved university
                        <select
                          value={selected}
                          onChange={(e) => setSelected(e.target.value)}
                        >
                          <option value="">Select a university</option>
                          {data.universities.map((u) => (
                            <option value={u.id} key={u.id}>
                              {u.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Research target
                        <input
                          value={target}
                          onChange={(e) => setTarget(e.target.value)}
                        />
                      </label>
                      <Button
                        disabled={busy || !selected || !data.liveEnabled}
                        onClick={() =>
                          void act(
                            () =>
                              post("research", {
                                universityId: selected,
                                targets: [target],
                              }),
                            "Research queued. Start the worker to process it.",
                          )
                        }
                      >
                        <RefreshCw size={15} /> Research / refresh
                      </Button>
                      <details>
                        <summary className="tiny">
                          Approve an official research source
                        </summary>
                        <div className="stack" style={{ marginTop: 15 }}>
                          <label>
                            Official page or scholarship provider URL
                            <input
                              type="url"
                              value={source}
                              onChange={(e) => setSource(e.target.value)}
                            />
                          </label>
                          <label>
                            Source purpose
                            <select
                              value={purpose}
                              onChange={(e) => setPurpose(e.target.value)}
                            >
                              {[
                                "admissions",
                                "scholarship",
                                "deadline",
                                "metadata",
                              ].map((p) => (
                                <option key={p}>{p}</option>
                              ))}
                            </select>
                          </label>
                          <label className="checkbox-chip">
                            <input
                              type="checkbox"
                              checked={subdomains}
                              onChange={(e) => setSubdomains(e.target.checked)}
                            />
                            Approve official subdomains
                          </label>
                          <label className="checkbox-chip">
                            <input
                              type="checkbox"
                              checked={browser}
                              onChange={(e) => setBrowser(e.target.checked)}
                            />
                            Allow browser fallback for sparse HTML
                          </label>
                          <p className="tiny muted">
                            Approve only publicly accessible official sources
                            whose terms permit research.
                          </p>
                          <Button
                            variant="outline"
                            disabled={busy || !selected || !source}
                            onClick={() =>
                              void act(
                                () =>
                                  post("sources", {
                                    universityId: selected,
                                    startUrl: source,
                                    purpose,
                                    allowSubdomains: subdomains,
                                    browserRendering: browser,
                                  }),
                                "Source approved",
                              )
                            }
                          >
                            Approve source
                          </Button>
                        </div>
                      </details>
                    </div>
                  </section>
                  <section className="panel">
                    <h3>Research activity</h3>
                    {!data.jobs.length && (
                      <p className="muted">
                        No jobs yet. Research progresses only when the worker
                        performs real work.
                      </p>
                    )}
                    {data.jobs.map((j) => (
                      <div key={j.id} className="check">
                        <div style={{ width: "100%" }}>
                          <div className="actions">
                            <strong>{j.university.name}</strong>
                            <span
                              className={
                                "tag " +
                                (j.status === "FAILED" ? "FAIL" : "UNKNOWN")
                              }
                            >
                              {j.stage} · {j.status}
                            </span>
                          </div>
                          <p>
                            {j.pagesProcessed} pages processed · {j.modelCalls}{" "}
                            model attempts · {j.tokenUsage} tokens
                          </p>
                          <details>
                            <summary className="tiny">
                              View progress log & errors
                            </summary>
                            <pre>
                              {j.logs
                                .map(
                                  (l) =>
                                    new Date(l.createdAt).toLocaleTimeString() +
                                    " [" +
                                    l.level +
                                    "] " +
                                    l.message,
                                )
                                .join("\n") ||
                                "Queued; waiting for the worker."}
                            </pre>
                            {j.errors.length > 0 && (
                              <pre>{j.errors.join("\n")}</pre>
                            )}
                          </details>
                        </div>
                      </div>
                    ))}
                  </section>
                </div>
              )}
              {tab === "review" && (
                <section>
                  <h2>Evidence awaiting review</h2>
                  <p className="muted">
                    Read the source, correct the JSON if needed, then approve or
                    reject. Approval is the only path to administrator-verified
                    data.
                  </p>
                  {!data.candidates.length && (
                    <div className="panel muted">
                      The review queue is clear.
                    </div>
                  )}
                  {data.candidates.map((c) => (
                    <Review
                      key={c.id}
                      candidate={c}
                      busy={busy}
                      onReview={(action, payload, complete) =>
                        act(
                          () =>
                            post("review", {
                              id: c.id,
                              action,
                              payload,
                              requirementsComplete: complete,
                            }),
                          action === "APPROVE"
                            ? "Reviewed facts published to the real catalog."
                            : "Candidate rejected.",
                        )
                      }
                    />
                  ))}
                </section>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
function Review({
  candidate: c,
  busy,
  onReview,
}: {
  candidate: Candidate;
  busy: boolean;
  onReview: (
    action: "APPROVE" | "REJECT",
    payload: unknown,
    complete: boolean,
  ) => Promise<void>;
}) {
  const [json, setJson] = useState(JSON.stringify(c.payload, null, 2)),
    [complete, setComplete] = useState(false),
    [error, setError] = useState("");
  const submit = (action: "APPROVE" | "REJECT") => {
    try {
      setError("");
      void onReview(action, JSON.parse(json), complete);
    } catch {
      setError("Correct the JSON syntax before review.");
    }
  };
  return (
    <article className="panel" style={{ marginBottom: 18 }}>
      <h3>{c.document.title}</h3>
      <a
        className="source"
        href={c.document.url}
        target="_blank"
        rel="noopener noreferrer"
      >
        {c.document.url}
      </a>
      <p className="tiny muted">
        Retrieved {new Date(c.document.retrievedAt).toLocaleString()} ·{" "}
        {c.status}
      </p>
      {c.issues.length > 0 && (
        <div className="error">{c.issues.join(" · ")}</div>
      )}
      <details>
        <summary>Read retrieved source</summary>
        <pre>{c.document.text}</pre>
      </details>
      <label style={{ marginTop: 18 }}>
        Extracted facts (editable JSON)
        <textarea
          rows={12}
          value={json}
          onChange={(e) => setJson(e.target.value)}
          style={{ fontFamily: "monospace", fontSize: 12 }}
        />
      </label>
      <label className="checkbox-chip" style={{ margin: "16px 0" }}>
        <input
          type="checkbox"
          checked={complete}
          onChange={(e) => setComplete(e.target.checked)}
        />
        I verified the complete set of mandatory program requirements and all
        conditional pathways.
      </label>
      {error && <p className="error">{error}</p>}
      <div className="actions">
        <Button disabled={busy} onClick={() => submit("APPROVE")}>
          Approve & publish
        </Button>
        <Button
          disabled={busy}
          variant="outline"
          onClick={() => submit("REJECT")}
        >
          Reject candidate
        </Button>
      </div>
    </article>
  );
}
