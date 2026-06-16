// Generates report/index.html — a static, browsable summary of every captured
// checkpoint: side-by-side baseline / port / diff thumbnails + the mismatch
// ratio + any computed-style deltas. No server needed; open the file directly.
// Run: `npm run parity:report:build` (after a `npm run parity` run).
import fs from "node:fs";
import path from "node:path";
import { ARTIFACTS_DIR, REPORT_DIR } from "../parity.config";

interface Row {
  scenario: string;
  checkpoint: string;
  ratio: number | null;
  sizeMismatch: { a: [number, number]; b: [number, number] } | null;
  dir: string;
}

function collect(): Row[] {
  const rows: Row[] = [];
  if (!fs.existsSync(ARTIFACTS_DIR)) return rows;
  for (const scenario of fs.readdirSync(ARTIFACTS_DIR)) {
    const sDir = path.join(ARTIFACTS_DIR, scenario);
    if (!fs.statSync(sDir).isDirectory()) continue;
    for (const checkpoint of fs.readdirSync(sDir)) {
      const cDir = path.join(sDir, checkpoint);
      const metaPath = path.join(cDir, "meta.json");
      if (!fs.existsSync(metaPath)) continue;
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
      rows.push({
        scenario,
        checkpoint,
        ratio: meta.sizeMismatch ? null : meta.ratio,
        sizeMismatch: meta.sizeMismatch ?? null,
        dir: path.relative(REPORT_DIR, cDir).replace(/\\/g, "/"),
      });
    }
  }
  return rows.sort((a, b) => a.scenario.localeCompare(b.scenario));
}

function styleDeltas(scenario: string, checkpoint: string): string {
  const p = path.join(REPORT_DIR, "style-diffs", scenario, `${checkpoint}.json`);
  if (!fs.existsSync(p)) return "";
  const data = JSON.parse(fs.readFileSync(p, "utf8"));
  const lines: string[] = [];
  for (const probe of data.probes ?? []) {
    if (probe.unresolved) {
      lines.push(`<div class="delta warn">${probe.name}: unresolved (baseline=${probe.unresolved.baseline} port=${probe.unresolved.port})</div>`);
    }
    for (const d of probe.kept ?? []) {
      lines.push(`<div class="delta">${probe.name}.<b>${d.prop}</b>: <span class="bl">${escape(d.baseline)}</span> → <span class="pt">${escape(d.port)}</span></div>`);
    }
  }
  return lines.join("");
}

function escape(s: string): string {
  return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
}

function pct(r: number | null): string {
  return r == null ? "—" : (r * 100).toFixed(3) + "%";
}

const rows = collect();
const meta = (() => {
  const p = path.join(REPORT_DIR, "run-meta.json");
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
})();

const body = rows
  .map((r) => {
    const label = r.sizeMismatch
      ? `SIZE ${r.sizeMismatch.a.join("x")} vs ${r.sizeMismatch.b.join("x")}`
      : pct(r.ratio);
    const cls = r.sizeMismatch ? "bad" : (r.ratio ?? 0) <= 0.005 ? "good" : (r.ratio ?? 0) <= 0.02 ? "ok" : "hi";
    return `
    <section>
      <h2>${escape(r.scenario)} <small>${escape(r.checkpoint)}</small> <span class="ratio ${cls}">${label}</span></h2>
      <div class="imgs">
        <figure><figcaption>baseline (main)</figcaption><img loading="lazy" src="${r.dir}/baseline.png"></figure>
        <figure><figcaption>port</figcaption><img loading="lazy" src="${r.dir}/port.png"></figure>
        <figure><figcaption>diff</figcaption><img loading="lazy" src="${r.dir}/diff.png"></figure>
      </div>
      <div class="deltas">${styleDeltas(r.scenario, r.checkpoint) || '<span class="none">no computed-style deltas</span>'}</div>
    </section>`;
  })
  .join("\n");

const html = `<!doctype html><html><head><meta charset="utf-8"><title>Visual parity report</title>
<style>
  body{font:14px/1.5 system-ui,sans-serif;margin:0;background:#0d1117;color:#e6edf3}
  header{padding:16px 24px;background:#161b22;border-bottom:1px solid #30363d}
  h1{margin:0;font-size:18px} .meta{color:#8b949e;font-size:12px;margin-top:4px}
  section{padding:16px 24px;border-bottom:1px solid #21262d}
  h2{font-size:15px;display:flex;align-items:center;gap:10px;margin:0 0 10px}
  h2 small{color:#8b949e;font-weight:400}
  .ratio{margin-left:auto;font-variant-numeric:tabular-nums;padding:2px 8px;border-radius:6px}
  .good{background:#0f5132;color:#7ee2b8}.ok{background:#664d03;color:#ffe08a}
  .hi{background:#5a1e02;color:#ffb380}.bad{background:#5a1116;color:#ff9aa2}
  .imgs{display:flex;gap:12px;flex-wrap:wrap}
  figure{margin:0;flex:1;min-width:280px}
  figcaption{font-size:11px;color:#8b949e;margin-bottom:4px}
  img{width:100%;border:1px solid #30363d;border-radius:6px;display:block;background:#000}
  .deltas{margin-top:10px;font-size:12px;font-family:ui-monospace,monospace}
  .delta{padding:1px 0}.delta .bl{color:#7ee2b8}.delta .pt{color:#ffb380}
  .delta.warn{color:#ffe08a}.none{color:#6e7681}
</style></head><body>
<header><h1>Visual-parity report — port vs main</h1>
<div class="meta">${meta ? escape(JSON.stringify(meta)) : ""}${rows.length} checkpoint(s)</div></header>
${body}
</body></html>`;

fs.mkdirSync(REPORT_DIR, { recursive: true });
const out = path.join(REPORT_DIR, "index.html");
fs.writeFileSync(out, html);
console.log(`wrote ${out} (${rows.length} checkpoints)`);
