import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const skill = fileURLToPath(new URL("../.agents/skills/review-pr/references/reviewer-prompt.md", import.meta.url));
export function reviewTemplate(markdown) {
  const start = "<!-- review-prompt:start -->", end = "<!-- review-prompt:end -->";
  if (markdown.split(start).length !== 2 || markdown.split(end).length !== 2 || markdown.indexOf(end) < markdown.indexOf(start)) throw new Error("Invalid review prompt boundaries");
  const block = markdown.slice(markdown.indexOf(start) + start.length, markdown.indexOf(end)).trim();
  if (block.split(/\r?\n/).some((line) => !line.startsWith(">"))) throw new Error("Review prompt must be one delimited blockquote");
  return block.split(/\r?\n/).map((line) => line.replace(/^> ?/, "")).join("\n");
}
export function buildReviewPrompt(context, markdown = fs.readFileSync(skill, "utf8")) {
  for (const key of ["writer", "reviewer"]) {
    if (typeof context[key] !== "string" || !/^[a-z][a-z0-9._:/-]*(?:\[[a-z0-9]+\])?$/.test(context[key]) || /^(?:(?:writer|reviewer|your|some)-model|writer|reviewer|model|model-id|unknown|tbd)$/.test(context[key])) throw new Error(`Missing or nonconcrete ${key} model route`);
  }
  const normalize = (value) => value.replace(/\[[^\]]+\]$/, "");
  if (normalize(context.writer) === normalize(context.reviewer)) throw new Error("Writer and reviewer routes must differ");
  if (typeof context.invocation !== "string" || !context.invocation.trim() || /^(?:(?:INVOCATION|METHOD)$|(?:TBD|UNKNOWN)\b|<.*>)/i.test(context.invocation.trim())) throw new Error("Missing or nonconcrete invocation method");
  if (/^(?:(?:method|invocation)\s*:\s*(?:TBD|UNKNOWN|<(?:method|invocation)>)|see\s+<(?:method|invocation)>)\s*[.!]?$/i.test(context.invocation.trim())) throw new Error("Missing or nonconcrete invocation method");
  for (const key of ["issue", "pr", "round"]) if (!(key === "issue" && context[key] === null) && (!Number.isSafeInteger(context[key]) || context[key] < 1)) throw new Error(`Invalid ${key}`);
  if (!/^[a-f0-9]{40}$/.test(context.head ?? "")) throw new Error("Supply the full reviewed head SHA");
  for (const key of ["worktree", "diff", "reviewDir"]) if (typeof context[key] !== "string" || !path.isAbsolute(context[key])) throw new Error(`Supply an absolute ${key}`);
  if (!context.lens || !context.previous) throw new Error("Supply lens and previous-round context");
  let prompt = reviewTemplate(markdown);
  const tokenPattern = /\\?<LENS\\?>|\b(?:WRITER|REVIEWER|ROUND|HEAD|WORKTREE|DIFF|REVDIR|PREVIOUS|P|N)\b/g;
  const tokenName = (value) => value.includes("LENS") ? "LENS" : value;
  const tokens = [...prompt.matchAll(tokenPattern)].map(([value]) => tokenName(value));
  const counts = { WRITER: 1, REVIEWER: 1, ROUND: 2, HEAD: 3, WORKTREE: 1, DIFF: 1, REVDIR: 2, PREVIOUS: 1, P: 4, N: 1, LENS: 2 };
  for (const [token, count] of Object.entries(counts)) if (tokens.filter((value) => value === token).length !== count) throw new Error(`Unsafe ${token} substitution template`);
  if (context.issue === null) {
    if (!prompt.includes("a fix for issue #N")) throw new Error("Unsafe issue-free review template");
    prompt = prompt.replace("a fix for issue #N", "a change with no linked issue");
  }
  const values = { WRITER: context.writer, REVIEWER: context.reviewer, ROUND: String(context.round), HEAD: context.head, WORKTREE: context.worktree, DIFF: context.diff, REVDIR: context.reviewDir, PREVIOUS: context.previous, P: String(context.pr), N: String(context.issue), LENS: context.lens };
  // Match only the original template: inserted paths, quoted tokens and dollar
  // sequences are literal data and must never be scanned for substitutions.
  prompt = prompt.replace(tokenPattern, (key) => values[tokenName(key)]);
  return `Invocation method: ${context.invocation}\n\n${prompt}\n`;
}
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { fs.writeFileSync(process.argv[3], buildReviewPrompt(JSON.parse(fs.readFileSync(process.argv[2], "utf8")))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
