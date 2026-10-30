import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { routeVendor, writerEfforts } from "./reviewer-defaults.mjs";
import { systemTemp } from "../.agents/skills/drive-web-editor/worktree-temp.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const writerRoutes = { "claude-agent": "claude", "claude-desktop": "claude", "claude-adopted": "claude", "claude-cli": "claude", "codex-cli": "codex", "codex-app": "codex" };
const retiredRoutes = (repo) => JSON.parse(fs.readFileSync(path.join(repo, ".claude", "writer-defaults.json"), "utf8")).retiredRoutes ?? {};

function claudeCliCheck(model, request) {
  const command = request.evidence?.claude ?? "claude";
  const [program, ...prefix] = Array.isArray(command) ? command : [command];
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^CLAUDE/i.test(key)));
  const probes = new Map();
  return (effort) => {
    if (!probes.has(effort)) {
      const result = spawnSync(program, [...prefix, "-p", "--model", model, "--effort", effort, "--output-format", "json", "--allowedTools", "Read"], { cwd: systemTemp(), env, input: "Reply with the single word ready.", encoding: "utf8", timeout: 180000, maxBuffer: 64 * 1024 * 1024, windowsHide: true });
      let reason = null;
      if (result.error) reason = `the Claude CLI probe could not run: ${result.error.message}`;
      else {
        let answer;
        try { answer = JSON.parse(result.stdout); } catch { answer = undefined; }
        const detail = (answer?.result || result.stderr || "").split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? "";
        if (result.status !== 0 || !answer || answer.is_error !== false) reason = `the Claude CLI probe exited ${result.status}${detail ? `: ${detail}` : ""}`;
        else if (!Object.hasOwn(answer.modelUsage ?? {}, model)) reason = `the Claude CLI probe answered with ${Object.keys(answer.modelUsage ?? {}).join(", ") || "no model"}, not ${model}`;
      }
      probes.set(effort, reason);
    }
    const reason = probes.get(effort);
    return reason ? { reason } : {};
  };
}

function codexCliCheck(model, request, repo, { probe = true } = {}) {
  const command = request.evidence?.codex ?? "codex";
  const [program, ...prefix] = Array.isArray(command) ? command : [command];
  const run = (args) => spawnSync(program, [...prefix, ...args], { cwd: systemTemp(), encoding: "utf8", timeout: 180000, maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
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
    if (!probe) return {};
    if (!probes.has(effort)) {
      const result = run(["exec", "--model", model, "-c", `model_reasoning_effort=${JSON.stringify(effort)}`, "--skip-git-repo-check", "--ephemeral", "--sandbox", "read-only", "Reply with the single word ready."]);
      probes.set(effort, result.error || result.status !== 0 ? failure("the Codex CLI probe", result) : null);
    }
    const reason = probes.get(effort);
    return reason ? { reason } : {};
  };
}

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

const checks = { "claude-cli": claudeCliCheck, "codex-cli": codexCliCheck, "codex-app": codexAppCheck };
const confirmChecks = { "codex-cli": (model, request, repo) => codexCliCheck(model, request, repo, { probe: false }), "codex-app": codexAppCheck };

function observedRoute(observed, number) {
  const pair = (value, source) => {
    if (typeof value?.model !== "string" || !value.model || typeof value?.effort !== "string" || !value.effort) throw new Error(`Ticket ${number} ${source} needs a model and an effort`);
    return { model: value.model, effort: value.effort };
  };
  if (observed === null || typeof observed !== "object" || Array.isArray(observed)) throw new Error(`Ticket ${number} observed must be { model, effort } or { rollout }`);
  if (!Object.hasOwn(observed, "rollout")) return pair(observed, "observed");
  if (typeof observed.rollout !== "string" || !path.isAbsolute(observed.rollout)) throw new Error(`Ticket ${number} observed.rollout must be an absolute path`);
  const text = fs.readFileSync(observed.rollout, "utf8");
  const context = text.slice(0, text.lastIndexOf("\n") + 1).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)).findLast((row) => row.type === "turn_context")?.payload;
  if (!context) throw new Error(`${observed.rollout} has no turn_context row`);
  return pair(context, "rollout turn_context");
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
  const observations = new Map(tickets.filter((ticket) => ticket.observed !== undefined).map((ticket) => [ticket, observedRoute(ticket.observed, ticket.number)]));
  let check, confirmCheck;
  const verdicts = tickets.map((ticket) => {
    const { number, effort } = ticket;
    if (observations.has(ticket)) {
      const actual = observations.get(ticket);
      if (actual.model !== model || actual.effort !== effort) return { ticket: number, effort, verdict: "blocked", reason: `the launched writer runs ${actual.model} at ${actual.effort}, not ${model} at ${effort}` };
      if (!confirmChecks[route]) return { ticket: number, effort, verdict: "confirmed" };
      confirmCheck ??= confirmChecks[route](model, request, repo);
      const { reason } = confirmCheck(effort);
      return reason ? { ticket: number, effort, verdict: "blocked", reason } : { ticket: number, effort, verdict: "confirmed" };
    }
    const retired = retiredRoutes(repo)[route];
    if (retired || !checks[route]) return { ticket: number, effort, verdict: "blocked", reason: `${route} is retired as a dispatch route: ${retired ?? "no dispatch check exists for it"}` };
    check ??= checks[route](model, request, repo);
    const { reason, launch } = check(effort);
    return reason ? { ticket: number, effort, verdict: "blocked", reason } : { ticket: number, effort, verdict: "available", ...(launch && { launch }) };
  });
  return { route, model, verdicts };
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const file = process.argv[2];
    if (!file || !path.isAbsolute(file)) throw new Error("Usage: node scripts/writer-route-preflight.mjs <absolute-request.json>");
    const result = preflight(JSON.parse(fs.readFileSync(file, "utf8")));
    console.log(JSON.stringify(result, null, 2));
    if (result.verdicts.some((v) => v.verdict === "blocked")) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 2; }
}
