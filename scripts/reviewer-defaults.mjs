import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Default writer-to-reviewer routes live in repository configuration, not in
// the shared skills. A row is keyed by writer route, writer effort and ticket
// effort; each column is an ordered list of serial reviewers.
export const reviewerDefaultsFile = ".claude/reviewer-defaults.json";
export const reviewerModelsFile = ".claude/reviewer-models.json";
export const efforts = ["low", "medium", "high", "xhigh", "max"];
export const ticketEfforts = ["low", "medium", "high", "correctness-critical"];
const stripContext = (value) => value.replace(/\[[^\]]+\]$/, "");
const isClaude = (route) => route.startsWith("claude-");

export function validateReviewerDefaults(defaults, models) {
  const claudeRoutes = new Map(models.map(({ name, model }) => [model, name]));
  const codexRoutes = new Set(defaults.codexModels ?? []);
  if (!codexRoutes.size || ![...codexRoutes].every((route) => /^gpt-[a-z0-9][a-z0-9.-]*$/.test(route))) throw new Error("Reviewer defaults need a codexModels list of gpt- routes");
  if (!Array.isArray(defaults.rows) || !defaults.rows.length) throw new Error("Reviewer defaults need rows");
  const keys = new Set();
  const checkColumn = (row, column) => {
    const list = row[column];
    if (!Array.isArray(list) || !list.length) throw new Error(`Row ${row.writer}/${row.writerEffort} needs a ${column} reviewer list`);
    for (const { route, effort } of list) {
      if (!efforts.includes(effort)) throw new Error(`Unsupported reviewer effort ${effort}`);
      if (route === row.writer) throw new Error(`Row ${row.writer}/${row.writerEffort} names the writer as its own reviewer`);
      if (!claudeRoutes.has(route) && !codexRoutes.has(route)) throw new Error(`Reviewer route ${route} is neither a registered reviewer definition nor a listed Codex model`);
    }
  };
  for (const row of defaults.rows) {
    if (typeof row.writer !== "string" || !/^[a-z0-9][a-z0-9.-]+$/.test(row.writer)) throw new Error("Each row needs a writer route");
    if (!efforts.includes(row.writerEffort) || !ticketEfforts.includes(row.ticketEffort)) throw new Error(`Row ${row.writer} has an unsupported writer or ticket effort`);
    const key = `${row.writer}/${row.writerEffort}/${row.ticketEffort}`;
    if (keys.has(key)) throw new Error(`Duplicate reviewer default row ${key}`);
    keys.add(key);
    checkColumn(row, "primary");
    checkColumn(row, "fallback");
    if (row.fallback.some(({ route }) => isClaude(route) !== isClaude(row.writer))) throw new Error(`Row ${key} fallback must stay with the writer's vendor`);
  }
  return claudeRoutes;
}

export function readReviewerDefaults(root) {
  const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
  const defaults = read(reviewerDefaultsFile), models = read(reviewerModelsFile);
  return { defaults, agents: validateReviewerDefaults(defaults, models) };
}

// Returns the reviewer a plan selects: its explicit route unchanged, or the
// default resolved from writer, writerEffort and optional ticketEffort.
export function resolveReviewer(config, root) {
  if (config.reviewer !== undefined) return { reviewer: config.reviewer, reviewerEffort: config.reviewerEffort, resolved: false };
  if (typeof config.writer !== "string" || !efforts.includes(config.writerEffort)) throw new Error("Supply the writer route and writerEffort, or an explicit reviewer route");
  if (config.reviewerFallback !== undefined && typeof config.reviewerFallback !== "boolean") throw new Error("reviewerFallback must be a boolean");
  if (config.ticketEffort !== undefined && !ticketEfforts.includes(config.ticketEffort)) throw new Error(`ticketEffort must be one of ${ticketEfforts.join(", ")}`);
  const index = config.reviewerIndex ?? 0;
  const { defaults, agents } = readReviewerDefaults(root);
  const writer = stripContext(config.writer);
  const rows = defaults.rows.filter((row) => row.writer === writer && row.writerEffort === config.writerEffort && (config.ticketEffort === undefined || row.ticketEffort === config.ticketEffort));
  if (!rows.length) throw new Error(`No reviewer default for ${writer} at ${config.writerEffort} effort; supply an explicit reviewer`);
  if (rows.length > 1) throw new Error(`Several reviewer defaults match ${writer} at ${config.writerEffort} effort; supply ticketEffort (${rows.map((row) => row.ticketEffort).join(" or ")})`);
  const column = rows[0][config.reviewerFallback ? "fallback" : "primary"];
  if (!Number.isInteger(index) || index < 0 || index >= column.length) throw new Error(`reviewerIndex must be from 0 through ${column.length - 1} for this default`);
  const { route, effort } = column[index];
  return { reviewer: route, reviewerEffort: effort, agent: agents.get(route), resolved: true, ticketEffort: rows[0].ticketEffort, fallback: config.reviewerFallback === true, index };
}

// Adds the resolved route and effort to a review step whose plan left both to
// the defaults. Claude steps select the pinned definition; Codex steps take
// the model and reasoning effort as exec arguments.
export function applyResolvedReviewer(step, selection) {
  if (step.model !== undefined) throw new Error("A review step resolved from defaults must not declare its own model");
  const selecting = ["--model", "-m", "--agent", "--effort"];
  if (step.args.some((arg) => selecting.includes(arg) || /^model_reasoning_effort=/.test(arg))) throw new Error("A review step resolved from defaults must not select its own model or effort");
  if (isClaude(selection.reviewer)) {
    if (step.nativeResult === "codex-jsonl" || step.args[0] === "exec") throw new Error(`Resolved reviewer ${selection.reviewer} needs a Claude reviewer step`);
    return { ...step, model: selection.reviewer, args: [...step.args, "--agent", selection.agent, "--effort", selection.reviewerEffort] };
  }
  if (step.nativeResult === "claude-json" || step.args[0] !== "exec") throw new Error(`Resolved reviewer ${selection.reviewer} needs a Codex exec reviewer step`);
  if (step.effort !== undefined) throw new Error("A review step resolved from defaults must not declare its own effort");
  return { ...step, model: selection.reviewer, effort: selection.reviewerEffort, args: ["exec", "--model", selection.reviewer, "-c", `model_reasoning_effort=${JSON.stringify(selection.reviewerEffort)}`, ...step.args.slice(1)] };
}

// Prints the reviewer a plan resolves to, so the coordinator can fill the
// reviewer prompt with the same route the launcher will select.
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const plan = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
    const { reviewer, reviewerEffort, agent, ticketEffort, fallback, index } = resolveReviewer(plan, fs.realpathSync.native(plan.worktree));
    console.log(JSON.stringify({ reviewer, reviewerEffort, agent, ticketEffort, fallback, index }));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
