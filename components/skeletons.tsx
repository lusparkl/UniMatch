// Placeholders shaped like the content they stand for, so nothing shifts when it arrives.
export function ResultsSkeleton() {
  return (
    <main className="container" aria-busy="true" aria-label="Loading results">
      <div className="skeleton" style={{ height: 40, width: "60%" }} />
      <div
        className="skeleton"
        style={{ height: 20, width: "40%", margin: "14px 0 28px" }}
      />
      {[0, 1, 2].map((i) => (
        <div className="skeleton skeleton-card" key={i} />
      ))}
    </main>
  );
}
export function DetailSkeleton() {
  return (
    <main className="container" aria-busy="true" aria-label="Loading programme">
      <div className="skeleton" style={{ height: 18, width: 120 }} />
      <div
        className="skeleton"
        style={{ height: 44, width: "55%", margin: "16px 0" }}
      />
      <div className="skeleton" style={{ height: 120, marginBottom: 24 }} />
      <div className="detail-grid">
        <div className="skeleton" style={{ height: 420 }} />
        <div className="skeleton" style={{ height: 420 }} />
      </div>
    </main>
  );
}
