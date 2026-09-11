import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const skill = fileURLToPath(new URL("../.agents/skills/review-pr/SKILL.md", import.meta.url));
export function buildReviewPrompt(context, markdown = fs.readFileSync(skill, "utf8")) {
  for (const key of ["writer", "reviewer"]) {
    if (typeof context[key] !== "string" || !/^[a-z][a-z0-9.-]+(?:\[[a-z0-9]+\])?$/.test(context[key]) || !context[key].includes("-")) throw new Error(`Missing or nonconcrete ${key} model route`);
  }
  const normalize = (value) => value.replace(/\[[^\]]+\]$/, "");
  if (normalize(context.writer) === normalize(context.reviewer)) throw new Error("Writer and reviewer routes must differ");
  if (typeof context.invocation !== "string" || !context.invocation.trim() || /^(?:INVOCATION|METHOD|TBD|UNKNOWN|<.*>)$/i.test(context.invocation.trim())) throw new Error("Missing or nonconcrete invocation method");
  for (const key of ["issue", "pr", "round"]) if (!Number.isSafeInteger(context[key]) || context[key] < 1) throw new Error(`Invalid ${key}`);
  if (!/^[a-f0-9]{40}$/.test(context.head ?? "")) throw new Error("Supply the full reviewed head SHA");
  for (const key of ["worktree", "diff", "reviewDir"]) if (typeof context[key] !== "string" || !path.isAbsolute(context[key])) throw new Error(`Supply an absolute ${key}`);
  if (!context.lens || !context.previous) throw new Error("Supply lens and previous-round context");
  let prompt = markdown.split(/\r?\n/).filter((line) => line.startsWith(">")).map((line) => line.replace(/^> ?/, "")).join("\n");
  for (const token of ["WRITER", "REVIEWER"]) if ((prompt.match(new RegExp(`\\b${token}\\b`, "g")) ?? []).length !== 1) throw new Error(`Unsafe ${token} substitution template`);
  const values = { WRITER: context.writer, REVIEWER: context.reviewer, ROUND: String(context.round), HEAD: context.head, WORKTREE: context.worktree, DIFF: context.diff, REVDIR: context.reviewDir, PREVIOUS: context.previous };
  prompt = prompt.replace(/\b(?:WRITER|REVIEWER|ROUND|HEAD|WORKTREE|DIFF|REVDIR|PREVIOUS)\b/g, (key) => values[key]);
  prompt = prompt.replaceAll("#N", `#${context.issue}`).replaceAll("#P", `#${context.pr}`).replaceAll(" P ", ` ${context.pr} `).replaceAll("/P/", `/${context.pr}/`).replaceAll("\\<LENS\\>", context.lens).replaceAll("<LENS>", context.lens);
  return `Invocation method: ${context.invocation}\n\n${prompt}\n`;
}
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { fs.writeFileSync(process.argv[3], buildReviewPrompt(JSON.parse(fs.readFileSync(process.argv[2], "utf8")))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
