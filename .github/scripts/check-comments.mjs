import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { bodyLines, codeFile, exemptPath, judgeComments, loadTypescript, rule, scanComments } from "../../.agents/hooks/comment-policy.mjs";

export const LISTING_LIMIT = 3000;
export const DUPLICATE_MIN_LENGTH = 30;

export function addedLines(patch) {
  const added = new Set(), removed = [];
  let line = null;
  for (const text of String(patch ?? "").split("\n")) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(text);
    if (hunk) line = Number(hunk[1]);
    else if (line === null || text.startsWith("\\")) continue;
    else if (text.startsWith("+")) added.add(line++);
    else if (text.startsWith("-")) removed.push(text.slice(1).replace(/\r$/, ""));
    else line++;
  }
  return { added, removed };
}

const normalize = (text) => text.replace(/\s+/g, " ").trim().toLowerCase();
const commentKey = (text) => normalize(bodyLines(text).join(" "));

function git(root, args) {
  return spawnSync("git", ["-C", root, ...args], { encoding: "utf8", windowsHide: true, maxBuffer: 1 << 30 });
}

function holds(line, piece) {
  const at = line.lastIndexOf(piece);
  if (at < 0 || (at > 0 && /[/*#<!-]/.test(line[at - 1]))) return false;
  return !/^(?:\/\/|#)/.test(piece) || at + piece.length === line.length;
}

function preexisting(comment, removed) {
  const pieces = comment.text.split(/\r?\n|\p{Zl}|\p{Zp}/u).map((l) => l.trim()).filter(Boolean);
  const taken = new Set();
  for (const piece of pieces) {
    const found = removed.findIndex((r, k) => !r.used && !taken.has(k) && holds(r.text, piece));
    if (found < 0) return false;
    taken.add(found);
  }
  for (const k of taken) removed[k].used = true;
  return true;
}

function baseText(root, base, file, state) {
  if (!base) throw new Error(`${file} has no patch in the listing and no base commit was given to compare it with`);
  if (!state.fetched && git(root, ["cat-file", "-e", `${base}^{commit}`]).status !== 0) {
    state.fetched = true;
    const fetched = git(root, ["fetch", "--no-tags", "--depth=1", "origin", base]);
    if (fetched.status !== 0) throw new Error(`the base commit ${base} could not be fetched: ${fetched.stderr.trim()}`);
  }
  const shown = git(root, ["show", `${base}:${file}`]);
  if (shown.status === 0) return shown.stdout.replace(/\r\n/g, "\n");
  if (git(root, ["cat-file", "-e", `${base}^{commit}`]).status !== 0) throw new Error(`the base commit ${base} is not in the checkout`);
  return "";
}

function corpus(root) {
  const listed = git(root, ["ls-files", "-z"]);
  if (listed.status !== 0) throw new Error(`git ls-files failed in ${root}: ${listed.stderr.trim()}`);
  const files = new Map();
  for (const file of listed.stdout.split("\0").filter(codeFile)) {
    try {
      const text = fs.readFileSync(path.join(root, file), "utf8");
      files.set(file, { text, normalized: normalize(text) });
    } catch {}
  }
  return files;
}

function duplicates(comment, file, key, root, state) {
  state.corpus ??= corpus(root);
  const needle = bodyLines(comment.text).map(normalize).sort((a, b) => b.length - a.length)[0];
  const found = [];
  for (const [other, entry] of state.corpus) {
    if (other === file || !entry.normalized.includes(needle)) continue;
    const match = scanComments(entry.text, other, { root }).find((c) => commentKey(c.text) === key);
    if (match) found.push(`${other}:${match.line}`);
  }
  return found;
}

export function checkComments({ root, records, base, limit = LISTING_LIMIT }) {
  const findings = [], problems = [], scanners = new Set();
  const state = {};
  const truncated = records.length >= limit;
  for (const record of records) {
    const file = record.filename;
    if (record.status === "removed" || !codeFile(file) || exemptPath(file)) continue;
    let text;
    try {
      text = fs.readFileSync(path.join(root, file), "utf8");
    } catch (error) {
      problems.push(`${file}: the pull request changes it, but the head checkout cannot read it (${error.code ?? error.message})`);
      continue;
    }
    let added, removed;
    try {
      if (typeof record.patch === "string") ({ added, removed } = addedLines(record.patch));
      else if ((record.additions ?? 1) > 0) {
        added = new Set(text.split(/\n/).map((_, k) => k + 1));
        removed = baseText(root, base, record.previous_filename ?? file, state).split("\n");
      } else continue;
    } catch (error) {
      problems.push(`${file}: ${error.message}`);
      continue;
    }
    const pool = removed.map((r) => ({ text: r.trim(), used: false }));
    const comments = judgeComments(text, file, { root });
    if (/\.(?:[cm]?js|tsx?)$/i.test(file)) scanners.add(scanComments("//", "probe.ts", { root })[0].scanner);
    for (const comment of comments) {
      scanners.add(comment.scanner);
      let touched = false;
      for (let line = comment.line; line <= comment.endLine && !touched; line++) touched = added.has(line);
      if (!touched || preexisting(comment, pool)) continue;
      const reasons = [];
      if (comment.kind === "refused") reasons.push(comment.reason);
      if (comment.kind !== "directive" && comment.kind !== "workaround") {
        const key = commentKey(comment.text);
        if (key.length >= DUPLICATE_MIN_LENGTH) {
          const elsewhere = duplicates(comment, file, key, root, state);
          if (elsewhere.length) reasons.push(`the same text is already a comment in ${elsewhere.slice(0, 3).join(", ")}${elsewhere.length > 3 ? ` and ${elsewhere.length - 3} more` : ""}; ${file}:${comment.line} repeats it`);
        }
      }
      if (reasons.length) findings.push({ file, line: comment.line, endLine: comment.endLine, text: comment.text, reasons });
    }
  }
  return { findings, problems, scanners, truncated, count: records.length, limit };
}

export function formatReport(result) {
  const out = [];
  const scanned = [...result.scanners];
  out.push(scanned.length ? `Scanned with ${scanned.join(", ")}.` : "No changed code file outside the exempt paths holds a comment.");
  if (result.truncated) out.push(`The pull request lists ${result.count} files, the files endpoint's limit of ${result.limit} files, so the listing may be incomplete and this check cannot pass it.`);
  for (const problem of result.problems) out.push(`Could not judge ${problem}`);
  if (result.findings.length) {
    out.push(`${result.findings.length} added comment(s) break the rule. ${rule}`, "");
    for (const f of result.findings) {
      for (const reason of f.reasons) out.push(`${f.file}:${f.line}: ${reason}`);
      const first = f.text.split(/\r?\n/)[0].trim();
      out.push(`    ${first.length > 160 ? first.slice(0, 157) + "..." : first}`);
    }
  } else if (!result.truncated && !result.problems.length) out.push("No added comment breaks the rule.");
  return out.join("\n");
}

const escapeAnnotation = (text) => text.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const option = (name) => {
    const at = args.indexOf(name);
    return at < 0 ? undefined : args[at + 1];
  };
  const filesPath = option("--files");
  if (!filesPath) {
    console.error("usage: check-comments.mjs --files <pull-request-files.json> [--base <sha>] [--root <checkout>] [--limit <n>]");
    process.exit(2);
  }
  const root = path.resolve(option("--root") ?? process.cwd());
  if (process.env.COMMENT_POLICY_REQUIRE_TYPESCRIPT === "1" && !loadTypescript(root)) {
    console.log(`COMMENT_POLICY_REQUIRE_TYPESCRIPT is set, but typescript does not resolve from ${root} or its main checkout, so the check refuses to judge JavaScript and TypeScript with the fallback scanner.`);
    process.exit(1);
  }
  const records = JSON.parse(fs.readFileSync(filesPath, "utf8"));
  const result = checkComments({ root, records, base: option("--base"), limit: Number(option("--limit") ?? LISTING_LIMIT) });
  const report = formatReport(result);
  console.log(report);
  for (const f of result.findings) console.log(`::error file=${f.file},line=${f.line},endLine=${f.endLine}::${escapeAnnotation(f.reasons.join("; "))}`);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Comment check\n\n\`\`\`\n${report}\n\`\`\`\n`);
  process.exit(result.findings.length || result.problems.length || result.truncated ? 1 : 0);
}
