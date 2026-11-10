import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { queryRows, snapshotJson, snapshotPath } from "../lib/catalog";
// Writes the published catalog to data/catalog-snapshot.json (CATALOG_SNAPSHOT_PATH overrides), for
// CATALOG_SOURCE=snapshot. Rows are stored before read-time freshness, with each source's lastCheckedAt, so
// freshness still expires when the snapshot is read.
let commit: string | null = null;
try {
  commit = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
} catch {}
try {
  const rows = await queryRows();
  // Only the opening of each retrieved page is shown to students.
  for (const row of rows)
    for (const d of row.university.documents) d.text = d.text.slice(0, 220);
  const file = snapshotPath();
  mkdirSync(path.dirname(file), { recursive: true });
  const json = snapshotJson(rows, commit);
  writeFileSync(file, json);
  console.log(
    `Wrote ${rows.length} programmes (${(json.length / 1024 / 1024).toFixed(1)} MB) to ${path.relative(process.cwd(), file)}.`,
  );
  process.exit(0);
} catch (e) {
  console.error(e);
  process.exit(1);
}
