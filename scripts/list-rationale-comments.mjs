import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { codeFile, exemptPath, judgeComments } from "../.agents/hooks/comment-policy.mjs";

export const RATIONALE_TERMS = [
  "decision", "decided", "on purpose", "intentional(?:ly)?", "deliberate(?:ly)?", "by design",
  "kept as", "has to be", "must be", "must stay", "would otherwise", "otherwise the",
  "because the", "so that the", "explicit", "belt", "defensive", "in case", "to be safe",
  "re-?assert", "forces", "silently", "workaround", "work around", "until", "for now",
  "guard against", "safety net", "hack", "kludge", "quirk", "papers? over",
  "instead of relying", "never trust", "just in case", "as a fallback", "the maintainer",
  "memory file", "memory/", "must not", "kept small", "capture phase", "our own",
];

export const rationalePattern = new RegExp(`(?<![A-Za-z])(?:${RATIONALE_TERMS.join("|")})`, "i");

export function listedFile(file) {
  return codeFile(file) && !exemptPath(file) && !/(?:\.test\.|\.spec\.)|(?:^|\/)(?:tests?|__tests__|dist)\//.test(file);
}

export function listRationaleComments(root) {
  const listed = spawnSync("git", ["-C", root, "ls-files", "-z"], { encoding: "utf8", windowsHide: true, maxBuffer: 1 << 28 });
  if (listed.status !== 0) throw new Error(`git ls-files failed in ${root}: ${listed.stderr.trim()}`);
  const files = listed.stdout.split("\0").filter((file) => file && listedFile(file));
  const rows = [];
  for (const file of files) {
    let text;
    try {
      text = fs.readFileSync(path.join(root, file), "utf8");
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    for (const comment of judgeComments(text, file, { root })) {
      if (comment.kind !== "refused") continue;
      comment.text.split(/\r?\n/).forEach((line, offset) => {
        if (rationalePattern.test(line)) rows.push({ path: file, line: comment.line + offset, commentLine: comment.line, text: line.trim() });
      });
    }
  }
  return { files: files.length, rows };
}

const csvCell = (value) => (/[",\r\n]/.test(String(value)) ? `"${String(value).replaceAll('"', '""')}"` : String(value));

export function toCsv(rows) {
  return ["path,line,comment_line,text", ...rows.map((row) => [row.path, row.line, row.commentLine, row.text].map(csvCell).join(","))].join("\n") + "\n";
}

function main(args) {
  let root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  let format = "csv";
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--root" && i + 1 < args.length) root = path.resolve(args[++i]);
    else if (arg === "--format" && ["csv", "json"].includes(args[i + 1])) format = args[++i];
    else throw new Error(`Unknown argument ${arg}; use --root <checkout> and --format csv|json`);
  }
  const { files, rows } = listRationaleComments(root);
  process.stdout.write(format === "json" ? JSON.stringify(rows, null, 1) + "\n" : toCsv(rows));
  const comments = new Set(rows.map((row) => `${row.path}:${row.commentLine}`)).size;
  process.stderr.write(`${files} files listed, ${comments} comments, ${rows.length} lines\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main(process.argv.slice(2));
