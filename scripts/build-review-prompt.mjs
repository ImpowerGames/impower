import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readSnapshot } from "./spec-snapshot.mjs";

const skill = fileURLToPath(new URL("../.agents/skills/review-pr/references/reviewer-prompt.md", import.meta.url));
const specSkill = fileURLToPath(new URL("../.agents/skills/references/spec-review-prompt.md", import.meta.url));

// One delimited blockquote per named block. The pull-request template is the
// `review-prompt` block; the spec template and its lens blocks have their own names.
export function reviewTemplate(markdown, name = "review-prompt") {
  const start = `<!-- ${name}:start -->`, end = `<!-- ${name}:end -->`;
  if (markdown.split(start).length !== 2 || markdown.split(end).length !== 2 || markdown.indexOf(end) < markdown.indexOf(start)) throw new Error(`Invalid ${name} boundaries`);
  const block = markdown.slice(markdown.indexOf(start) + start.length, markdown.indexOf(end)).trim();
  if (block.split(/\r?\n/).some((line) => !line.startsWith(">"))) throw new Error(`The ${name} block must be one delimited blockquote`);
  return block.split(/\r?\n/).map((line) => line.replace(/^> ?/, "")).join("\n");
}

export const specLenses = ["undirected", "feasibility", "slicing", "performance", "language", "interface", "player"];
// Token multiplicities of every template block. A block that gains or loses a
// token fails the build until its row here changes with it.
export const templateCounts = {
  review: { WRITER: 1, REVIEWER: 1, ROUND: 2, HEAD: 3, WORKTREE: 1, DIFF: 1, REVDIR: 2, PREVIOUS: 1, P: 4, N: 1, LENS: 2 },
  spec: { WRITER: 1, REVIEWER: 1, ROUND: 2, N: 4, SLICES: 1, SNAPSHOT: 1, DIGEST: 2, WORKTREE: 1, HEAD: 2, LENS: 2, PROCEDURE: 1, PREVIOUS: 1, REVDIR: 2 },
  lenses: { undirected: {}, feasibility: {}, slicing: {}, performance: { WORKTREE: 1 }, language: { REVDIR: 1, WORKTREE: 3 }, interface: { WORKTREE: 3, SNAPSHOT: 1 }, player: {} },
};
const tokenName = (value) => value.includes("LENS") ? "LENS" : value;
// Every token the pattern knows appears exactly as pinned, including zero times.
function checkCounts(text, pattern, tokens, counts, label) {
  const found = [...text.matchAll(pattern)].map(([value]) => tokenName(value));
  for (const token of tokens) if (found.filter((value) => value === token).length !== (counts[token] ?? 0)) throw new Error(`Unsafe ${token} substitution in the ${label}`);
}

const routeShape = /^[a-z][a-z0-9._:/-]*(?:\[[a-z0-9]+\])?$/;
const placeholderRoute = /^(?:(?:writer|reviewer|your|some)-model|writer|reviewer|model|model-id|unknown|tbd)$/;
const configuredRoute = (value) => value.replace(/\[[^\]]+\]$/, "");
function checkRoutes(context) {
  for (const key of ["writer", "reviewer"]) if (typeof context[key] !== "string" || !routeShape.test(context[key]) || placeholderRoute.test(context[key])) throw new Error(`Missing or nonconcrete ${key} model route`);
  if (configuredRoute(context.writer) === configuredRoute(context.reviewer)) throw new Error("Writer and reviewer routes must differ");
  if (typeof context.invocation !== "string" || !context.invocation.trim() || /^(?:(?:INVOCATION|METHOD)$|(?:TBD|UNKNOWN)\b|<.*>)/i.test(context.invocation.trim())) throw new Error("Missing or nonconcrete invocation method");
  if (/^(?:(?:method|invocation)\s*:\s*(?:TBD|UNKNOWN|<(?:method|invocation)>)|see\s+<(?:method|invocation)>)\s*[.!]?$/i.test(context.invocation.trim())) throw new Error("Missing or nonconcrete invocation method");
}
const fullSha = (value) => /^[a-f0-9]{40}$/.test(value ?? "");

const reviewTokens = /\\?<LENS\\?>|\b(?:WRITER|REVIEWER|ROUND|HEAD|WORKTREE|DIFF|REVDIR|PREVIOUS|P|N)\b/g;
export function buildReviewPrompt(context, markdown = fs.readFileSync(skill, "utf8")) {
  if (context.target !== undefined && context.target !== "pr") throw new Error('A pull-request review context declares no target other than "pr"; a spec review context declares target "issue"');
  if (context.snapshot !== undefined) throw new Error('A pull-request review context has no snapshot; a spec review context declares target "issue"');
  checkRoutes(context);
  for (const key of ["issue", "pr", "round"]) if (!(key === "issue" && context[key] === null) && (!Number.isSafeInteger(context[key]) || context[key] < 1)) throw new Error(`Invalid ${key}`);
  if (!fullSha(context.head)) throw new Error("Supply the full reviewed head SHA");
  for (const key of ["worktree", "diff", "reviewDir"]) if (typeof context[key] !== "string" || !path.isAbsolute(context[key])) throw new Error(`Supply an absolute ${key}`);
  if (!context.lens || !context.previous) throw new Error("Supply lens and previous-round context");
  let prompt = reviewTemplate(markdown);
  checkCounts(prompt, reviewTokens, Object.keys(templateCounts.review), templateCounts.review, "review template");
  if (context.issue === null) {
    if (!prompt.includes("a fix for issue #N")) throw new Error("Unsafe issue-free review template");
    prompt = prompt.replace("a fix for issue #N", "a change with no linked issue");
  }
  const values = { WRITER: context.writer, REVIEWER: context.reviewer, ROUND: String(context.round), HEAD: context.head, WORKTREE: context.worktree, DIFF: context.diff, REVDIR: context.reviewDir, PREVIOUS: context.previous, P: String(context.pr), N: String(context.issue), LENS: context.lens };
  // Match only the original template: inserted paths, quoted tokens and dollar
  // sequences are literal data and must never be scanned for substitutions.
  prompt = prompt.replace(reviewTokens, (key) => values[tokenName(key)]);
  return `Invocation method: ${context.invocation}\n\n${prompt}\n`;
}

const specTokens = /\\?<LENS\\?>|\b(?:WRITER|REVIEWER|ROUND|SLICES|SNAPSHOT|DIGEST|WORKTREE|HEAD|PROCEDURE|PREVIOUS|REVDIR|N)\b/g;
const specValueTokens = /\\?<LENS\\?>|\b(?:WRITER|REVIEWER|ROUND|SLICES|SNAPSHOT|DIGEST|WORKTREE|HEAD|PREVIOUS|REVDIR|N)\b/g;
// The spec prompt reviews a frozen snapshot of a Feature and its slices on the
// parent issue. The procedure of each lens the context names is inserted from
// the template file where PROCEDURE stands, so a reviewer receives its
// procedure verbatim and an unknown lens is refused before launch.
export function buildSpecReviewPrompt(context, markdown = fs.readFileSync(specSkill, "utf8"), { snapshot = readSnapshot } = {}) {
  if (context.target !== "issue") throw new Error('A spec review context declares target "issue"');
  if (context.pr !== undefined) throw new Error("A spec review context names an issue, not a pr");
  checkRoutes(context);
  if (!Number.isSafeInteger(context.issue) || context.issue < 1) throw new Error("Invalid issue");
  if (!Number.isSafeInteger(context.round) || context.round < 1) throw new Error("Invalid round");
  if (!Array.isArray(context.slices) || !context.slices.every((number) => Number.isSafeInteger(number) && number > 0 && number !== context.issue)) throw new Error("Invalid slices");
  if (!fullSha(context.head)) throw new Error("Supply the full reviewed head SHA");
  for (const key of ["worktree", "reviewDir"]) if (typeof context[key] !== "string" || !path.isAbsolute(context[key])) throw new Error(`Supply an absolute ${key}`);
  if (typeof context.snapshot !== "string" || !path.isAbsolute(context.snapshot)) throw new Error("Supply an absolute snapshot path");
  if (typeof context.previous !== "string" || !context.previous.trim()) throw new Error("Supply previous-round context");
  if (typeof context.lens !== "string" || !context.lens.trim()) throw new Error(`Supply the lens ids, comma-separated, from ${specLenses.join(", ")}`);
  const ids = context.lens.split(",").map((id) => id.trim());
  for (const id of ids) if (!specLenses.includes(id)) throw new Error(`Unknown lens ${JSON.stringify(id)}; the lenses are ${specLenses.join(", ")}`);
  if (new Set(ids).size !== ids.length || (ids.includes("undirected") && ids.length > 1)) throw new Error("A lens is named once, and the undirected lens stands alone");
  const frozen = snapshot(context.snapshot);
  if (frozen.parent !== context.issue) throw new Error(`Snapshot ${context.snapshot} is of #${frozen.parent}, not #${context.issue}`);
  const expected = [context.issue, ...context.slices].sort((a, b) => a - b), actual = frozen.tickets.map((ticket) => ticket.number).sort((a, b) => a - b);
  if (expected.length !== actual.length || expected.some((number, index) => number !== actual[index])) throw new Error(`Snapshot tickets (#${actual.join(", #")}) do not match the issue and slices (#${expected.join(", #")})`);
  const tokens = Object.keys(templateCounts.spec);
  const template = reviewTemplate(markdown, "spec-review-prompt");
  checkCounts(template, specTokens, tokens, templateCounts.spec, "spec review template");
  const procedure = ids.map((id) => {
    const block = reviewTemplate(markdown, `spec-lens:${id}`);
    checkCounts(block, specTokens, tokens, templateCounts.lenses[id], `${id} lens block`);
    return block;
  }).join(" ");
  const [before, after] = template.split(/\bPROCEDURE\b/);
  const values = { WRITER: context.writer, REVIEWER: context.reviewer, ROUND: String(context.round), N: String(context.issue), SLICES: context.slices.length ? context.slices.map((number) => `#${number}`).join(", ") : "none filed", SNAPSHOT: context.snapshot, DIGEST: frozen.digest, WORKTREE: context.worktree, HEAD: context.head, PREVIOUS: context.previous, REVDIR: context.reviewDir, LENS: ids.join(", ") };
  // One pass over the trusted template and lens blocks; inserted values are
  // never rescanned for substitutions.
  const prompt = (before + procedure + after).replace(specValueTokens, (key) => values[tokenName(key)]);
  return `Invocation method: ${context.invocation}\n\n${prompt}\n`;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const context = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
    fs.writeFileSync(process.argv[3], context.target === "issue" ? buildSpecReviewPrompt(context) : buildReviewPrompt(context));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
