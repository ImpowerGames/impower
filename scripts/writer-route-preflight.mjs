import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { efforts, routeVendor, writerEfforts } from "./reviewer-defaults.mjs";

// Decides, before an orchestrator dispatches a batch of writers, whether the
// chosen writer route can run exactly the requested model at each ticket's
// effort. A route that cannot is a per-ticket blocker; the preflight never
// proposes another model or effort in its place.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const writerRoutes = { "claude-agent": "claude", "claude-desktop": "claude", "codex-cli": "codex", "codex-app": "codex" };

// Each route's check returns null when the host provides the model at that
// effort, or the reason it does not.
const frontmatter = (text) => Object.fromEntries((/^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? "").split(/\r?\n/).map((line) => /^(\w+):\s*(.*?)\s*$/.exec(line)).filter(Boolean).map((m) => [m[1], m[2]]));

function claudeAgentCheck(model, request, repo) {
  const dir = path.join(repo, ".claude", "agents");
  const writers = fs.readdirSync(dir).filter((f) => f.endsWith(".md")).map((f) => frontmatter(fs.readFileSync(path.join(dir, f), "utf8"))).filter((d) => d.name?.startsWith("writer-"));
  return (effort) => {
    const match = writers.find((d) => d.model === model && d.effort === effort);
    return match ? { launch: { subagent_type: match.name } } : { reason: `no writer definition in .claude/agents pins ${model} at ${effort}; a subagent without one runs at the harness default effort` };
  };
}

// start_session ignores a model above the coordinator's and an effort above
// its own, so only the coordinator's model at or below its effort is certain.
function claudeDesktopCheck(model, request) {
  const coordinator = request.evidence?.coordinator;
  if (typeof coordinator?.model !== "string" || !efforts.includes(coordinator?.effort)) throw new Error("claude-desktop needs evidence.coordinator with the model and effort that get_session on self reports");
  return (effort) => {
    if (coordinator.model !== model) return { reason: `the coordinator runs ${coordinator.model}; a desktop session it starts is certain to run only that model, not ${model}` };
    if (efforts.indexOf(effort) > efforts.indexOf(coordinator.effort)) return { reason: `the coordinator runs at ${coordinator.effort}; a session it starts cannot exceed that effort, and ${effort} was requested` };
    return {};
  };
}

// The CLI accepts an effort its model does not support and records it in the
// rollout unchanged, so the model catalog is the only source for supported
// efforts. The catalog also lists models an account refuses, so a short
// launch with the exact model and effort proves the account accepts them.
function codexCliCheck(model, request) {
  const command = request.evidence?.codex ?? "codex";
  const [program, ...prefix] = Array.isArray(command) ? command : [command];
  const run = (args) => spawnSync(program, [...prefix, ...args], { cwd: os.tmpdir(), encoding: "utf8", timeout: 180000, maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  const failure = (what, result) => {
    if (result.error) return `${what} could not run: ${result.error.message}`;
    const detail = (result.stderr || result.stdout || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).find((line) => /error|not supported|unsupported|invalid/i.test(line)) ?? "";
    return `${what} exited ${result.status}${detail ? `: ${detail}` : ""}`;
  };
  let catalog;
  const probes = new Map();
  return (effort) => {
    if (catalog === undefined) {
      const result = run(["debug", "models"]);
      if (result.error || result.status !== 0) catalog = { reason: failure("the Codex CLI model catalog", result) };
      else {
        let models;
        try { models = JSON.parse(result.stdout).models; } catch { models = undefined; }
        const entry = Array.isArray(models) ? models.find((m) => m.slug === model) : undefined;
        catalog = !Array.isArray(models) ? { reason: "the Codex CLI model catalog printed no models list" } : entry ? { supported: (entry.supported_reasoning_levels ?? []).map((level) => level.effort) } : { reason: `the Codex CLI model catalog does not list ${model}` };
      }
    }
    if (catalog.reason) return { reason: catalog.reason };
    if (!catalog.supported.includes(effort)) return { reason: `the Codex CLI model catalog supports ${model} only at ${catalog.supported.join(", ")}, not ${effort}` };
    if (!probes.has(effort)) {
      const result = run(["exec", "--model", model, "-c", `model_reasoning_effort=${JSON.stringify(effort)}`, "--skip-git-repo-check", "--ephemeral", "--sandbox", "read-only", "Reply with the single word ready."]);
      probes.set(effort, result.error || result.status !== 0 ? failure("the Codex CLI probe", result) : null);
    }
    const reason = probes.get(effort);
    return reason ? { reason } : {};
  };
}

// The app's collaboration tools describe their model parameter as a list of
// "<model> (<description>; supported reasoning efforts: a, b, c)" entries.
export function parseAdvertisedModels(description) {
  const models = new Map();
  for (const m of description.matchAll(/([a-z0-9][a-z0-9.-]*) \((?:[^()]*?;\s*)?supported reasoning efforts:\s*([a-z, ]+)\)/g)) models.set(m[1], m[2].split(",").map((e) => e.trim()).filter(Boolean));
  return models;
}

function codexAppCheck(model, request) {
  const description = request.evidence?.modelParameter;
  if (typeof description !== "string") throw new Error("codex-app needs evidence.modelParameter, the collaboration tool's model parameter description from the host");
  const advertised = parseAdvertisedModels(description);
  if (!advertised.size) throw new Error("evidence.modelParameter lists no models with supported reasoning efforts");
  return (effort) => {
    if (!advertised.has(model)) return { reason: `the app collaboration host does not offer ${model} (offers ${[...advertised.keys()].join(", ")})` };
    return advertised.get(model).includes(effort) ? {} : { reason: `the app collaboration host offers ${model} only at ${advertised.get(model).join(", ")}, not ${effort}` };
  };
}

const checks = { "claude-agent": claudeAgentCheck, "claude-desktop": claudeDesktopCheck, "codex-cli": codexCliCheck, "codex-app": codexAppCheck };

// What the launched writer actually runs: the model and effort from its own
// metadata, or a Codex rollout file whose latest turn_context records them.
function observedRoute(observed) {
  if (typeof observed.rollout !== "string") return observed;
  if (!path.isAbsolute(observed.rollout)) throw new Error("observed.rollout must be an absolute path");
  const context = fs.readFileSync(observed.rollout, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)).findLast((row) => row.type === "turn_context")?.payload;
  if (!context) throw new Error(`${observed.rollout} has no turn_context row`);
  return { model: context.model, effort: context.effort };
}

export function preflight(request, repo = root) {
  const { route, model, tickets } = request ?? {};
  if (!Object.hasOwn(writerRoutes, route)) throw new Error(`route must be one of ${Object.keys(writerRoutes).join(", ")}`);
  if (typeof model !== "string" || routeVendor(model) !== writerRoutes[route]) throw new Error(`model must be a ${writerRoutes[route]} model id for the ${route} route`);
  if (!Array.isArray(tickets) || !tickets.length) throw new Error("tickets must list at least one { number, effort }");
  const allowed = writerEfforts(model);
  for (const ticket of tickets) {
    if (!Number.isInteger(ticket?.number) || ticket.number <= 0) throw new Error("Each ticket needs a positive integer number");
    if (!allowed.includes(ticket.effort)) throw new Error(`Ticket ${ticket.number} effort must be one of ${allowed.join(", ")}`);
  }
  // Built on first use, so a batch that only confirms launched writers needs
  // no pre-launch evidence.
  let check;
  const verdicts = tickets.map(({ number, effort, observed }) => {
    if (observed !== undefined) {
      const actual = observedRoute(observed);
      return actual.model === model && actual.effort === effort
        ? { ticket: number, effort, verdict: "confirmed" }
        : { ticket: number, effort, verdict: "blocked", reason: `the launched writer runs ${actual.model} at ${actual.effort}, not ${model} at ${effort}` };
    }
    check ??= checks[route](model, request, repo);
    const { reason, launch } = check(effort);
    return reason ? { ticket: number, effort, verdict: "blocked", reason } : { ticket: number, effort, verdict: "available", ...(launch && { launch }) };
  });
  return { route, model, verdicts };
}

// Prints the verdicts as JSON; exits 1 when any ticket is blocked and 2 when
// the request itself is malformed.
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const file = process.argv[2];
    if (!file || !path.isAbsolute(file)) throw new Error("Usage: node scripts/writer-route-preflight.mjs <absolute-request.json>");
    const result = preflight(JSON.parse(fs.readFileSync(file, "utf8")));
    console.log(JSON.stringify(result, null, 2));
    if (result.verdicts.some((v) => v.verdict === "blocked")) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 2; }
}
