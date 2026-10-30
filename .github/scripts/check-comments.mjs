import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { bodyLines, codeFile, exemptPath, judgeComments, loadTypescript, loadYaml, rule, scanComments } from "../../.agents/hooks/comment-policy.mjs";

export const LISTING_LIMIT = 3000;
export const DUPLICATE_MIN_LENGTH = 30;

export function parsePatch(patch) {
  const added = new Set(), hunks = [];
  let line = null, hunk = null;
  for (const text of String(patch ?? "").split("\n")) {
    const header = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(text);
    if (header) {
      hunk = { newStart: Number(header[3]), newCount: header[4] === undefined ? 1 : Number(header[4]), lines: [] };
      hunks.push(hunk);
      line = hunk.newStart;
    } else if (!hunk || text.startsWith("\\")) continue;
    else {
      const op = text[0] === "+" || text[0] === "-" ? text[0] : " ";
      hunk.lines.push({ op, text: text.slice(1) });
      if (op === "+") added.add(line++);
      else if (op === " ") line++;
    }
  }
  return { added, hunks };
}

export function baseFromPatch(headText, hunks) {
  const head = headText.split("\n"), out = [];
  let at = 0;
  for (const hunk of hunks) {
    const start = hunk.newCount === 0 ? hunk.newStart : hunk.newStart - 1;
    if (start < at || start + hunk.newCount > head.length) throw new Error("its patch does not fit the head file");
    out.push(...head.slice(at, start));
    let k = start;
    for (const { op, text } of hunk.lines) {
      if (op !== "-" && head[k++] !== text) throw new Error(`its patch does not match the head file at line ${k}`);
      if (op !== "+") out.push(text);
    }
    if (k !== start + hunk.newCount) throw new Error("its patch's line counts do not match its hunks");
    at = k;
  }
  out.push(...head.slice(at));
  return out.join("\n");
}

function physicalLines(text) {
  const breaks = [];
  for (let i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", i + 1)) breaks.push(i);
  return (offset) => {
    let lo = 0, hi = breaks.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (breaks[mid] < offset) lo = mid + 1;
      else hi = mid;
    }
    return lo + 1;
  };
}

const normalize = (text) => text.replace(/\s+/g, " ").trim().toLowerCase();
const commentKey = (text) => normalize(bodyLines(text).join(" "));
const sameComment = (text) => text.replace(/\s+/g, " ").trim();
const letters = (text) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

function git(root, args) {
  return spawnSync("git", ["-C", root, ...args], { encoding: "utf8", windowsHide: true, maxBuffer: 1 << 30 });
}

function baseText(root, mergeBase, file, state) {
  if (!mergeBase) throw new Error(`${file} has no patch in the listing and no merge base was given to compare it with`);
  if (!state.fetched && git(root, ["cat-file", "-e", `${mergeBase}^{commit}`]).status !== 0) {
    state.fetched = true;
    const fetched = git(root, ["fetch", "--no-tags", "--depth=1", "origin", mergeBase]);
    if (fetched.status !== 0) throw new Error(`the merge base ${mergeBase} could not be fetched: ${fetched.stderr.trim()}`);
  }
  const shown = git(root, ["show", `${mergeBase}:${file}`]);
  if (shown.status === 0) return shown.stdout;
  if (git(root, ["cat-file", "-e", `${mergeBase}^{commit}`]).status !== 0) throw new Error(`the merge base ${mergeBase} is not in the checkout`);
  return "";
}

function corpus(root) {
  const listed = git(root, ["ls-files", "-z"]);
  if (listed.status !== 0) throw new Error(`git ls-files failed in ${root}: ${listed.stderr.trim()}`);
  const files = new Map();
  for (const file of listed.stdout.split("\0").filter(codeFile)) {
    try {
      const text = fs.readFileSync(path.join(root, file), "utf8");
      files.set(file, { text, letters: letters(text) });
    } catch {}
  }
  return files;
}

function duplicates(file, key, root, state) {
  state.corpus ??= corpus(root);
  const needle = letters(key);
  const found = [];
  for (const [other, entry] of state.corpus) {
    if (other === file || !entry.letters.includes(needle)) continue;
    const match = scanComments(entry.text, other, { root }).find((c) => commentKey(c.text) === key);
    if (match) found.push(`${other}:${physicalLines(entry.text)(match.start)}`);
  }
  return found;
}

export function judgedRecords(records) {
  return records.filter((record) => record.status !== "removed" && codeFile(record.filename) && !exemptPath(record.filename));
}

export function needsCheck(records, limit = LISTING_LIMIT) {
  return records.length >= limit || judgedRecords(records).length > 0;
}

export function checkComments({ root, records, mergeBase, limit = LISTING_LIMIT }) {
  const findings = [], problems = [], scanners = new Set();
  const state = {};
  const truncated = records.length >= limit;
  for (const record of judgedRecords(records)) {
    const file = record.filename;
    let text;
    try {
      text = fs.readFileSync(path.join(root, file), "utf8");
    } catch (error) {
      problems.push(`${file}: the pull request changes it, but the head checkout cannot read it (${error.code ?? error.message})`);
      continue;
    }
    let added, before;
    try {
      if (typeof record.patch === "string") {
        const parsed = parsePatch(record.patch);
        added = parsed.added;
        before = baseFromPatch(text, parsed.hunks);
      } else if ((record.additions ?? 1) > 0) {
        added = new Set(text.split("\n").map((_, k) => k + 1));
        before = baseText(root, mergeBase, record.previous_filename ?? file, state);
      } else continue;
    } catch (error) {
      problems.push(`${file}: ${error.message}`);
      continue;
    }
    const line = physicalLines(text);
    const comments = judgeComments(text, file, { root }).map((c) => ({ ...c, line: line(c.start), endLine: line(Math.max(c.start, c.end - 1)) }));
    const touches = (c) => {
      for (let k = c.line; k <= c.endLine; k++) if (added.has(k)) return true;
      return false;
    };
    const pool = new Map();
    for (const c of scanComments(before, file, { root })) pool.set(sameComment(c.text), (pool.get(sameComment(c.text)) ?? 0) + 1);
    for (const c of comments) if (!touches(c) && pool.get(sameComment(c.text)) > 0) pool.set(sameComment(c.text), pool.get(sameComment(c.text)) - 1);
    if (/\.(?:[cm]?js|tsx?)$/i.test(file)) scanners.add(scanComments("//", "probe.ts", { root })[0].scanner);
    for (const comment of comments) {
      scanners.add(comment.scanner);
      if (!touches(comment)) continue;
      const key = sameComment(comment.text);
      if (pool.get(key) > 0) {
        pool.set(key, pool.get(key) - 1);
        continue;
      }
      const reasons = [];
      if (comment.kind === "refused") reasons.push(comment.reason);
      if (!["directive", "workaround", "licence"].includes(comment.kind)) {
        const key = commentKey(comment.text);
        if (key.length >= DUPLICATE_MIN_LENGTH) {
          const elsewhere = duplicates(file, key, root, state);
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
    console.error("usage: check-comments.mjs --files <pull-request-files.json> [--detect | --merge-base <sha> [--root <checkout>]] [--limit <n>]");
    process.exit(2);
  }
  const limit = Number(option("--limit") ?? LISTING_LIMIT);
  if (args.includes("--detect")) {
    const records = JSON.parse(fs.readFileSync(filesPath, "utf8"));
    const judged = judgedRecords(records).map((r) => r.filename);
    console.log(`${records.length} changed file(s); ${judged.length} the comment rule judges`);
    for (const file of judged) console.log(`  ${file}`);
    if (records.length >= limit) console.log(`The listing may be incomplete at ${limit} files; the check runs and fails on it`);
    const line = `relevant=${needsCheck(records, limit)}`;
    console.log(line);
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, line + "\n");
    process.exit(0);
  }
  const root = path.resolve(option("--root") ?? process.cwd());
  if (process.env.COMMENT_POLICY_REQUIRE_TYPESCRIPT === "1" && !loadTypescript(root)) {
    console.log(`COMMENT_POLICY_REQUIRE_TYPESCRIPT is set, but typescript does not resolve from ${root} or its main checkout, so the check refuses to judge JavaScript and TypeScript with the fallback scanner.`);
    process.exit(1);
  }
  if (process.env.COMMENT_POLICY_REQUIRE_YAML === "1" && !loadYaml(root)) {
    console.log(`COMMENT_POLICY_REQUIRE_YAML is set, but yaml does not resolve from ${root} or its main checkout, so the check refuses to judge YAML with the fallback scanner.`);
    process.exit(1);
  }
  const records = JSON.parse(fs.readFileSync(filesPath, "utf8"));
  const result = checkComments({ root, records, mergeBase: option("--merge-base"), limit });
  const report = formatReport(result);
  console.log(report);
  for (const f of result.findings) console.log(`::error file=${f.file},line=${f.line},endLine=${f.endLine}::${escapeAnnotation(f.reasons.join("; "))}`);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Comment check\n\n\`\`\`\n${report}\n\`\`\`\n`);
  process.exit(result.findings.length || result.problems.length || result.truncated ? 1 : 0);
}
