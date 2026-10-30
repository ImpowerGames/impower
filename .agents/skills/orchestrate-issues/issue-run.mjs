import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { spawnDetached as spawnDetachedProcess } from "../../../scripts/detached-launch.mjs";
import { writeExclusive, readJson, alive, currentIdentity } from "../../../scripts/review-job-store.mjs";
import { processIdentity } from "../../../scripts/reviewer-slots.mjs";
import { routeVendor, writerEfforts } from "../../../scripts/reviewer-defaults.mjs";
import { writerRoutes } from "../../../scripts/writer-route-preflight.mjs";
import { reviewJobFiles } from "../../../scripts/review-job-root.mjs";
import { liveDeps, usersOf } from "../clean-worktrees/clean-worktrees.mjs";
import { readRepos, reviewThread, ticketsRepo } from "../../repos.mjs";
import { autoCheckpoint, ensureSaved } from "./checkpoint.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const RECORD_VERSION = 2;
export const BEFORE_RENAME = {
  skill: "orchestrate-feature",
  commit: "b3dd72d54c9a821731f8b7795b05e692547ad0f6",
  stateBranch: (issue) => `orchestrate-state/feature-${issue}`,
  get how() { return `continue that run from a checkout of commit ${this.commit}, the last commit before the rename, with its .agents/skills/${this.skill} helpers; this version does not read it`; },
};

export const readWriterDefaults = (repo = repoRoot) => JSON.parse(fs.readFileSync(path.join(repo, ".claude", "writer-defaults.json"), "utf8"));

export function resolveWriterModel(harness, override, defaults) {
  if (typeof override === "string" && /fable/i.test(override)) throw new Error(`Writer model ${override} is refused: agents launch Opus and below only`);
  if (override !== undefined) {
    if (typeof override !== "string" || !routeVendor(override) || !defaults.routes[routeVendor(override)]) throw new Error(`Writer model ${override} has no supported writer route`);
    return { model: override, source: "invocation" };
  }
  const entry = defaults.orchestrators[harness];
  if (!entry) throw new Error(`--harness must be one of ${Object.keys(defaults.orchestrators).join(", ")}`);
  return { model: entry.model, source: `${harness} orchestrator default` };
}

export function routeOptions(model, defaults) {
  const routes = defaults.routes[routeVendor(model)];
  if (!routes) throw new Error(`No writer routes for ${model}`);
  return routes.map((r) => {
    if (!Object.hasOwn(writerRoutes, r.route)) throw new Error(`Writer default route ${r.route} is unknown to the route preflight`);
    if (defaults.retiredRoutes?.[r.route]) throw new Error(`Writer default route ${r.route} is also listed as retired`);
    return { route: r.route, selfCheck: r.selfCheck };
  });
}
export const retiredReason = (route, defaults) => (defaults.retiredRoutes?.[route] ? `${route} is retired as a dispatch route: ${defaults.retiredRoutes[route]}` : null);

export const PERMISSION_MODES = ["default", "acceptEdits", "plan", "auto", "bypassPermissions"];
export const BYPASS = "bypassPermissions";
const modeBlock = (record) => (record.coordinator.permissionMode === BYPASS ? null : `the coordinator runs in ${record.coordinator.permissionMode ?? "an unrecorded"} permission mode, not ${BYPASS}: writers launch in the coordinator's own mode, and writers on agent-launch tooling need bypass because auto mode's classifier refuses their edits; switch this session to bypass permissions, then record it with init --coordinator-mode ${BYPASS}`);

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const COORDINATOR_IDS = { claude: [new RegExp(`^local_${UUID}$`, "i"), "the desktop app's session id, local_<uuid>"], codex: [new RegExp(`^${UUID}$`, "i"), "the Codex thread id, a bare <uuid>"] };
export function checkCoordinatorId(harness, id) {
  const [shape, name] = COORDINATOR_IDS[harness] ?? [];
  if (!shape) throw new Error(`--harness must be one of ${Object.keys(COORDINATOR_IDS).join(", ")}`);
  if (!shape.test(id ?? "")) throw new Error(`--coordinator must be this session's own id, ${name}, which its writers message; ${JSON.stringify(id ?? "")} is not one, and a path, a directory name or a scratchpad id reaches no session`);
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+){1,3}$/;
export function orchestrationTitle(issue, slug) {
  if (!SLUG.test(slug ?? "")) throw new Error(`--slug must be two to four lowercase words from the parent issue's title joined by hyphens, such as resumable-feature-orchestration; ${JSON.stringify(slug ?? "")} is not`);
  return `ORCH #${issue}: ${slug.replaceAll("-", " ")}`;
}

export const writerEffortOf = (name) => ({ Low: "low", Medium: "medium", High: "high" })[name] ?? null;

export const WRITER_DISK = 6 * 2 ** 30;
export const WRITER_MEMORY = 4 * 2 ** 30;
export const MAX_WRITERS = 3;
export function defaultConcurrency({ totalMemory }) {
  const byMemory = Math.floor(totalMemory / WRITER_MEMORY);
  return { limit: Math.max(0, Math.min(MAX_WRITERS, byMemory)), basis: `the smaller of ${MAX_WRITERS} (reviewer slots) and ${byMemory} by memory at 4 GB per writer; each plan also admits only as many writers as free disk allows at 6 GB per writer` };
}
export const freeBytesAt = (dir) => { const s = fs.statfsSync(dir); return s.bavail * s.bsize; };

export function readRecord(file) {
  const record = readJson(file);
  if (record?.version === 1 && Number.isSafeInteger(record.revision) && typeof record.coordinator?.session === "string") throw new Error(`${file} is a version 1 run record of ${BEFORE_RENAME.skill}: ${BEFORE_RENAME.how}`);
  if (record?.version !== RECORD_VERSION || !Number.isSafeInteger(record.revision) || typeof record.coordinator?.session !== "string") throw new Error(`${file} is not a version ${RECORD_VERSION} issue run record`);
  return record;
}

function writeAtomic(file, value) {
  const temp = `${file}.${randomUUID()}.tmp`;
  writeExclusive(temp, value);
  fs.renameSync(temp, file);
}

function acquire(file, identify) {
  const lock = `${file}.lock`, token = randomUUID();
  try { writeExclusive(lock, { token, identity: currentIdentity() }); }
  catch (error) {
    if (error.code !== "EEXIST") throw error;
    throw new Error(`${lockState(file, identify)}; nothing was changed`);
  }
  const release = () => {
    let held;
    try { held = readJson(lock).token === token; } catch { held = false; }
    if (held) fs.unlinkSync(lock);
  };
  if (fs.existsSync(`${lock}.recovery`)) { release(); throw new Error(`Recovery of ${lock} is in progress or was interrupted; nothing was changed`); }
  return release;
}

export function updateRecord(file, { expectRevision, coordinator }, mutate, { identify = processIdentity } = {}) {
  const release = acquire(file, identify);
  try {
    const record = readRecord(file);
    if (record.revision !== expectRevision) throw new Error(`The run record is at revision ${record.revision}, not ${expectRevision}; plan again from the current record`);
    if (record.coordinator.session !== coordinator) throw new Error(`Issue #${record.issue} is coordinated by ${record.coordinator.session} on ${record.coordinator.host}; ${coordinator} may not change its run record`);
    let pointer;
    try { pointer = readJson(pointerFile(record.checkout, repositoriesOf(record).tickets, record.issue)); } catch { pointer = null; }
    if (!pointer || path.resolve(pointer.record) !== path.resolve(file)) throw new Error(`The coordinator pointer for issue #${record.issue} ${pointer ? `names ${pointer.record} (coordinator ${pointer.coordinator})` : "is missing or unreadable"}; this record no longer coordinates the parent issue`);
    const next = structuredClone(record);
    const output = mutate(next);
    next.revision = record.revision + 1;
    next.updated = new Date().toISOString();
    writeAtomic(file, next);
    return { record: next, output };
  } finally { release(); }
}

function lockState(file, identify) {
  const lock = `${file}.lock`;
  let owner;
  try { owner = readJson(lock); } catch { return `The lock ${lock} is unreadable; preserve it and inspect it`; }
  let running;
  try { running = alive(owner.identity, identify); } catch (error) { return `The lock ${lock} names an owner whose state is unknown (${error.message}); preserve it`; }
  return running ? `Process ${owner.identity.pid} holds ${lock}; retry after it exits` : `The lock ${lock} was left by process ${owner.identity.pid}, which has exited; run recover-lock --record ${file}`;
}

export function recoverLock(file, { identify = processIdentity } = {}) {
  const lock = `${file}.lock`, marker = `${lock}.recovery`;
  try { writeExclusive(marker, { identity: currentIdentity() }); }
  catch (error) { if (error.code === "EEXIST") throw new Error(`Another recovery of ${lock} is running or was interrupted (${marker}); inspect it before removing it by hand`); throw error; }
  try {
    if (!fs.existsSync(lock)) return "no lock";
    const owner = readJson(lock);
    if (alive(owner.identity, identify)) throw new Error(`Process ${owner.identity.pid} still holds ${lock}`);
    if (readJson(lock).token !== owner.token) throw new Error(`${lock} changed during recovery; nothing was removed`);
    fs.unlinkSync(lock);
    return `removed the lock of exited process ${owner.identity.pid}`;
  } finally { fs.unlinkSync(marker); }
}

const log = (record, event, details) => record.log.push({ time: new Date().toISOString(), event, ...details });
const ticketOf = (record, number) => (record.tickets[number] ??= { owner: null, pending: null, history: [], results: [] });

export function pointerFile(checkout, repository, issue) {
  const common = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: checkout, encoding: "utf8", windowsHide: true }).trim();
  return path.join(common, "orchestrate-issues", `${repository.replace(/[^A-Za-z0-9.-]+/g, "_")}-${issue}.json`);
}

export function startRepositories(repository, repos = readRepos()) {
  const tickets = ticketsRepo(repos);
  return tickets !== repos.code && sameRepository(repository, repos.code) ? { ticketsRepository: tickets } : {};
}

export function repositoriesOf({ repository, ticketsRepository }) {
  const tickets = ticketsRepository ?? repository, split = tickets !== repository;
  const repos = { code: repository, internal: tickets, cutover: split };
  return Object.freeze({
    code: repository, tickets, split,
    thread: (pr, ticket) => reviewThread(split ? { pr, ticket } : { pr }, repos),
    commentUrl: (thread, comment) => `https://github.com/${thread.repo}/${split ? "issues" : "pull"}/${thread.number}#issuecomment-${comment}`,
  });
}
export const sameRepository = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

export const closingIn = (refs, tickets, code) => (refs ?? []).filter((r) => sameRepository(r.repository?.name ? `${r.repository.owner?.login}/${r.repository.name}` : code, tickets));

export const prRef = (names, pr) => (names.split ? `${names.code}#${pr}` : `#${pr}`);
export const qualifyPrs = (names, text) => (names.split ? String(text).replace(/\b(PRs?) (#\d+(?:(?:, |,? and )#\d+)*)/g, (_, word, list) => `${word} ${list.replace(/#(\d+)/g, `${names.code}#$1`)}`) : text);

export const DISCOVERY_TYPES = ["fix", "feat", "perf", "docs", "test", "refactor", "ci", "chore"];

export const AUTHORITY = { reviewRounds: "the coordinator's checkpoint decision after round 3's verified fixes and after every later round's, published on the PR through review-checkpoint.mjs, with this invocation as the authority for an extension within ten rounds or an acceptance of verified final corrections", merge: "the maintainer merges ready PRs", diskRecovery: "the guarded clean-worktrees classifier's merged-and-removable entries only, on blocked disk headroom or after a confirmed merge, plus worktrees and safely deletable branches this run created and no longer needs, each recorded here" };
export const MERGE_GRANT = "the coordinator merges this parent issue's PRs that pass integration.mjs's merge gate, with an expected-head merge call and never a bypass of branch protection";
export const MERGING = ["coordinator", "maintainer"];
export const STOP_AT_READY = /stop(?:s|ping)? at (?:the )?ready|do(?:n't| not) merge|without merging|leave (?:the )?merg|maintainer merges/i;
export const stopsAtReady = (text) => STOP_AT_READY.test(String(text ?? "").replace(/[-_]+/g, " "));
export const SHELL_REWRITTEN = /^[A-Za-z]:[\\/]/;
export function mergingFor(invocation, merging = "maintainer") {
  if (SHELL_REWRITTEN.test(String(invocation ?? ""))) throw new Error(`The request "${invocation}" was rewritten by the shell: Git Bash turns a leading slash into its install path. Pass it intact with MSYS_NO_PATHCONV=1 before the command, or run the command through PowerShell`);
  if (!MERGING.includes(merging)) throw new Error(`--merging must be ${MERGING.join(" or ")}: coordinator when the request explicitly asks to orchestrate the parent issue, maintainer when it stops at ready PRs`);
  if (merging === "coordinator" && stopsAtReady(invocation)) throw new Error(`The request "${invocation}" asks to stop at ready PRs or not to merge; record --merging maintainer`);
  return merging;
}
export const authorityFor = (merging = "maintainer") => (merging === "coordinator" ? { ...AUTHORITY, merge: MERGE_GRANT } : AUTHORITY);
export const coordinatorMerges = (record) => record.invocation?.merging === "coordinator" && record.authority?.merge === MERGE_GRANT && !stopsAtReady(record.invocation?.text);
export function applyInvocation(file, { coordinator, invocation, merging }) {
  const record = readRecord(file);
  if (record.invocation?.text === invocation && record.invocation?.merging === merging) return { record, changed: false };
  const { record: next } = updateRecord(file, { expectRevision: record.revision, coordinator }, (r) => {
    r.log.push({ time: new Date().toISOString(), event: "invocation", coordinator, replaced: { text: r.invocation?.text, merging: r.invocation?.merging }, merging });
    r.invocation = { ...r.invocation, text: invocation, merging };
    r.authority = authorityFor(merging);
  });
  return { record: next, changed: true };
}

export function applyCoordinatorMode(file, { coordinator, permissionMode, title }) {
  const record = readRecord(file);
  const switched = permissionMode !== undefined && record.coordinator.permissionMode !== permissionMode, titled = title !== undefined && !record.title;
  if (!switched && !titled) return record;
  return updateRecord(file, { expectRevision: record.revision, coordinator }, (r) => {
    if (switched) r.log.push({ time: new Date().toISOString(), event: "coordinator-mode", from: r.coordinator.permissionMode ?? null, to: permissionMode });
    if (switched) r.coordinator.permissionMode = permissionMode;
    if (titled) r.title = title;
  }).record;
}

export const CHECK_IN_MINUTES = 30;
export const scheduleCommand = (file) => {
  if (file.includes("'")) throw new Error(`The run record path ${file} holds a single quote, which the recorded schedule command cannot carry; keep the record under a path without one`);
  return `node .agents/skills/orchestrate-issues/issue-run.mjs schedule --record '${file}'`;
};
export function scheduleSpec(record, file, defaults) {
  const capability = defaults.orchestrators[record.coordinator.harness]?.checkIn ?? null;
  const minute = record.issue % CHECK_IN_MINUTES;
  return {
    interval: CHECK_IN_MINUTES, cron: `${minute},${minute + CHECK_IN_MINUTES} * * * *`, recurring: true,
    prompt: `Orchestrate-issues check-in for issue #${record.issue}, run record ${file}: run the wake routine in .agents/skills/orchestrate-issues/references/writer-reports.md, act on what it finds, and record the outcome with issue-run.mjs checked-in.`,
    command: scheduleCommand(file), capability: capability?.capability ?? null, expiresAfterDays: capability?.expiresAfterDays ?? null,
  };
}
export function runnerInstance(capability, { env = process.env, identify = processIdentity } = {}) {
  const name = capability?.instance?.pidEnv;
  if (!name) return null;
  const pid = Number(env[name]);
  if (!Number.isSafeInteger(pid) || pid < 1) return { unknown: `${name} is ${env[name] === undefined ? "unset" : `${JSON.stringify(env[name])}, not a process id`}` };
  try { return identify(pid) ?? { unknown: `runner process ${pid} from ${name} is not running` }; } catch (error) { return { unknown: `runner process ${pid} from ${name} could not be probed: ${error.message}` }; }
}
const sameInstance = (a, b) => Boolean(a?.start && b?.start && a.pid === b.pid && a.start === b.start);
export function trackingOf(capability, { job, session, env = process.env }) {
  const confirm = capability?.confirm;
  if (!confirm || (confirm.where && env[confirm.where.env] !== confirm.where.equals)) return "unavailable";
  const line = confirm.line.replace("{session}", session).replace("{job}", job);
  const found = confirm.logs.some((log) => {
    try { return fs.readFileSync(log.replace(/%(\w+)%/g, (_, name) => env[name] ?? ""), "utf8").includes(line); } catch { return false; }
  });
  return found ? "confirmed" : "unconfirmed";
}
const checkInCapability = (record, defaults) => defaults.orchestrators[record.coordinator.harness]?.checkIn ?? null;
export function recordCheckIn(record, { job, none, file, defaults, env = process.env, identify = processIdentity }) {
  if (Boolean(job) === Boolean(none)) throw new Error("Record the check-in with --job <the job id the runner returned>, or with --none <why the runner cannot schedule one>");
  const spec = scheduleSpec(record, file, defaults), since = new Date();
  const days = job ? spec.expiresAfterDays : null;
  const capability = checkInCapability(record, defaults);
  const instance = job ? runnerInstance(capability, { env, identify }) : null;
  const tracked = job ? trackingOf(capability, { job, session: record.coordinator.session, env }) : null;
  record.checkIn = { interval: spec.interval, cron: spec.cron, prompt: spec.prompt, command: spec.command, job: job ?? null, none: none ?? null, state: job ? "scheduled" : "none", since: since.toISOString(), expires: days ? new Date(since.getTime() + days * 86400000).toISOString() : null, instance, tracked };
  log(record, "check-in-scheduled", { job: job ?? null, none: none ?? null, instance, tracked });
}
export function checkedIn(record, { outcome }) {
  if (!outcome) throw new Error("--outcome must say what the check-in did, or \"no change\"");
  log(record, "check-in", { outcome });
}
function checkInStatus(record, now, { defaults, env, identify }) {
  const c = record.checkIn;
  const status = baseCheckInStatus(c, now);
  if (status.state !== "scheduled") return status;
  const capability = checkInCapability(record, defaults);
  const rearm = (why, state = "rearm") => ({ state, job: c.job, next: `job ${c.job} ${why}; remove it with ${capability.remove}, create it again with ${c.command}, and record the new job with check-in --job <id>` });
  const current = runnerInstance(capability, { env, identify });
  if (current?.unknown) return rearm(`may have outlived its runner process, which cannot be identified now (${current.unknown}), and is re-armed from a shell where ${capability.instance.pidEnv} names the runner process`, "unidentified");
  if (current && !sameInstance(current, c.instance)) return rearm(`was armed by ${c.instance?.start ? `runner process ${c.instance.pid}` : "an unidentified runner process"}, not this one (${current.pid}), and the runner stops tracking a job across a restart`);
  const days = capability?.trackedForDays;
  if (days && c.since && now > Date.parse(c.since) + days * 86400000) return rearm(`was armed at ${c.since}, more than ${days} days ago, past the runner's tracking window`);
  if (c.tracked === "unconfirmed" && trackingOf(capability, { job: c.job, session: record.coordinator.session, env }) !== "confirmed") return rearm("is not confirmed as tracked by the runner", "unconfirmed");
  return status;
}
function baseCheckInStatus(c, now) {
  if (!c) return { state: "missing", next: `schedule the periodic check-in now: run issue-run.mjs schedule --record <this run record>, create the job it prints with your runner's scheduling capability, and record it with check-in --job <id>, or --none <reason> when the runner has none` };
  if (c.state === "none") return { state: "none", next: `the runner schedules no check-in (${c.none}); run the wake routine at the start of every turn` };
  if (!c.job) return { state: "recreate", next: `the check-in ended with the previous coordinator; recreate it with ${c.command} and record it with check-in --job <id>` };
  if (c.expires && now > Date.parse(c.expires)) return { state: "expired", next: `job ${c.job} expired at ${c.expires}; create it again with ${c.command} and record the new job with check-in --job <id>` };
  return { state: "scheduled", job: c.job, interval: c.interval };
}

export function carriedRun(prev, { file, record, defaults }) {
  const spec = scheduleSpec(record, file, defaults);
  return {
    ...(prev.checkIn && { checkIn: { ...prev.checkIn, interval: spec.interval, cron: spec.cron, prompt: spec.prompt, command: spec.command, job: null, state: "recreate on this coordinator's runner", since: null, expires: null, instance: null, tracked: null } }),
    ...(prev.title && { title: prev.title }),
  };
}

export function initRecord(options, { defaults = readWriterDefaults(), freeBytes, totalMemory = os.totalmem(), host = os.hostname(), identify = processIdentity } = {}) {
  const { record: file, checkout, repository, ticketsRepository, issue, coordinator, harness, invocation } = options;
  for (const [name, value] of Object.entries({ record: file, checkout })) if (typeof value !== "string" || !path.isAbsolute(value)) throw new Error(`--${name} must be an absolute path`);
  scheduleCommand(file);
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository ?? "")) throw new Error("--repo must be owner/name");
  if (ticketsRepository !== undefined && (!/^[\w.-]+\/[\w.-]+$/.test(ticketsRepository) || sameRepository(ticketsRepository, repository))) throw new Error("The tickets repository must be another owner/name than --repo");
  if (!Number.isSafeInteger(issue) || issue <= 0) throw new Error("--issue must be the parent issue's issue number");
  if (!coordinator) throw new Error("--coordinator must name the coordinator's session");
  if (!invocation) throw new Error("--invocation must quote the user's request that invoked the skill");
  const merging = mergingFor(invocation, options.merging);
  if (!options.coordinatorModel || !writerEfforts(options.coordinatorModel).includes(options.coordinatorEffort)) throw new Error("--coordinator-model and --coordinator-effort must be the coordinator's own metadata");
  if (options.coordinatorMode !== undefined && !PERMISSION_MODES.includes(options.coordinatorMode)) throw new Error(`--coordinator-mode must be the coordinator's own permission mode: ${PERMISSION_MODES.join(", ")}`);
  const title = options.slug === undefined ? undefined : orchestrationTitle(issue, options.slug);
  const writer = resolveWriterModel(harness, options.writerModel, defaults);
  let concurrency = defaultConcurrency({ totalMemory });
  const diskAdmits = Math.floor((freeBytes ?? freeBytesAt(checkout)) / WRITER_DISK);
  if (options.concurrency !== undefined) {
    if (!Number.isSafeInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 8) throw new Error("--concurrency must be 1 to 8");
    concurrency = { limit: options.concurrency, basis: `invocation override (default would be ${concurrency.limit}: ${concurrency.basis})` };
  }
  const pointer = pointerFile(checkout, ticketsRepository ?? repository, issue);
  const self = { session: coordinator, host, harness, model: options.coordinatorModel, effort: options.coordinatorEffort, ...(options.coordinatorMode !== undefined && { permissionMode: options.coordinatorMode }), since: new Date().toISOString() };
  const fresh = (carried = {}) => ({
    version: RECORD_VERSION, revision: 1, runId: randomUUID(), repository, ...(ticketsRepository !== undefined && { ticketsRepository }), issue, checkout, coordinator: self,
    invocation: { text: invocation, merging, ...(options.writerModel !== undefined && { writerModel: options.writerModel }), ...(options.concurrency !== undefined && { concurrency: options.concurrency }) },
    authority: authorityFor(merging),
    writer, concurrency, tickets: carried.tickets ?? {}, diskRecoveries: carried.diskRecoveries ?? [], previousCoordinators: carried.previousCoordinators ?? [], ...(carried.filed && { filed: carried.filed }), ...(carried.filedDismissed && { filedDismissed: carried.filedDismissed }),
    ...(title && { title }), ...carried.run,
    log: [{ time: self.since, event: carried.tickets ? "takeover" : "init", coordinator, writer: writer.model, concurrency: concurrency.limit }],
  });
  fs.mkdirSync(path.dirname(pointer), { recursive: true });
  const releasePointer = acquire(pointer, identify);
  try {
    let existing;
    try { existing = readJson(pointer); } catch (error) { if (error.code !== "ENOENT") throw new Error(`The coordinator pointer ${pointer} is unreadable; preserve it and inspect it`); }
    if (!existing) {
      writeExclusive(file, fresh());
      writeAtomic(pointer, { record: file, coordinator, host, since: self.since });
      return { action: "init", record: readRecord(file), pointer, diskAdmits };
    }
    if (existing.coordinator === coordinator && existing.record === file) {
      applyInvocation(file, { coordinator, invocation, merging });
      return { action: "resume", record: applyCoordinatorMode(file, { coordinator, permissionMode: options.coordinatorMode, title }), pointer };
    }
    if (!options.takeover) throw new Error(`Issue #${issue} already has coordinator ${existing.coordinator} on ${existing.host} (record ${existing.record}); a second coordinator would duplicate writers. Continue in that session, or confirm it ended and run init --takeover with an observation of it`);
    const prior = ownerStatus({ handle: { kind: "session", id: existing.coordinator } }, options.observations ?? {}, { host, identify });
    if (prior.status !== "exited") throw new Error(`Takeover refused: the previous coordinator ${existing.coordinator} is ${prior.status} (${prior.reason})`);
    const releaseOld = acquire(existing.record, identify);
    try {
      const old = readRecord(existing.record);
      if (!sameRepository(repositoriesOf(old).tickets, ticketsRepository ?? repository)) throw new Error(`Takeover refused: the run's tickets live in ${repositoriesOf(old).tickets}, but this takeover would read them from ${ticketsRepository ?? repository}; the cutover switch in .agents/repos.json moved since the run started, so finish the run where it started`);
      writeExclusive(file, fresh({ tickets: old.tickets, diskRecoveries: old.diskRecoveries, filed: old.filed, filedDismissed: old.filedDismissed, previousCoordinators: [...old.previousCoordinators, { ...old.coordinator, record: existing.record, ended: prior.reason }], run: carriedRun(old, { file, record: { issue, coordinator: self }, defaults }) }));
      writeAtomic(pointer, { record: file, coordinator, host, since: self.since });
    } finally { releaseOld(); }
    return { action: "takeover", record: readRecord(file), pointer };
  } finally { releasePointer(); }
}

const EXITED = new Set(["archived", "absent", "completed", "failed", "stopped"]);
const processCensus = () => { const r = liveDeps.processes(); return r.ok ? r.list : null; };
export function ownerStatus(owner, observations = {}, { host = os.hostname(), identify = processIdentity, census = processCensus } = {}) {
  const handle = owner.handle;
  const foreign = Boolean(handle.host) && handle.host !== host;
  if (handle.kind === "process") {
    if (handle.host !== host) {
      const seen = observations.processes?.[handle.pid];
      const writerGone = !handle.launchDir || seen?.launchDirUnused === true;
      if (seen?.host === handle.host && seen.start === handle.start && (seen.state === "exited" || EXITED.has(seen.state))) return writerGone ? { status: "exited", reason: `process ${handle.pid} on ${handle.host} was observed ${seen.state} there${handle.launchDir ? ", with no process naming its launch directory" : ""}${seen.source ? ` (${seen.source})` : ""}` } : { status: "unknown", reason: `process ${handle.pid} on ${handle.host} was observed ${seen.state}, but not that no process there still names its launch directory ${handle.launchDir}; observe that on ${handle.host} (launchDirUnused)` };
      if (seen?.host === handle.host && seen.start === handle.start && seen.state === "running") return { status: "live", reason: `process ${handle.pid} on ${handle.host} was observed running there` };
      return { status: "unknown", reason: `process ${handle.pid} runs on ${handle.host}; this host cannot observe it` };
    }
    let now = null;
    if (handle.pid != null) { try { now = identify(handle.pid); } catch (error) { return { status: "unknown", reason: `process ${handle.pid} could not be probed: ${error.message}` }; } }
    if (now && !handle.start) return { status: "unknown", reason: `process ${handle.pid} has no recorded start identity` };
    if (now && now.start === handle.start) return { status: "live", reason: `process ${handle.pid} started ${handle.start} is running` };
    if (handle.launchDir) {
      let list;
      try { list = census(); } catch { list = null; }
      if (!Array.isArray(list)) return { status: "unknown", reason: `process ${handle.pid} is gone, but the process census failed, so a writer naming ${handle.launchDir} may still run` };
      const users = usersOf(handle.launchDir, list, process.pid);
      if (users.length) return { status: "live", reason: `process ${users.map((p) => p.pid).join(", ")} still names launch directory ${handle.launchDir}` };
    }
    return { status: "exited", reason: `process ${handle.pid} ${now ? "now belongs to another process" : "is gone"}${handle.launchDir ? " and no process names its launch directory" : ""}` };
  }
  const seen = (handle.kind === "session" ? observations.sessions : observations.tasks)?.[handle.id];
  if (!seen) return { status: "unknown", reason: `no observation of ${handle.kind} ${handle.id}; read its state before deciding` };
  if (foreign && seen.host !== handle.host) return { status: "unknown", reason: `${handle.kind} ${handle.id} belongs to ${handle.host}; an observation from ${seen.host ?? "this host"} proves nothing about it, so observe it on ${handle.host}` };
  if (seen.state === "running") return { status: "live", reason: `${handle.kind} ${handle.id} is running` };
  if (seen.state === "idle" && handle.kind === "session") return { status: "waiting", reason: `session ${handle.id} ended its turn; read its report or answer it` };
  if (EXITED.has(seen.state)) return { status: "exited", reason: `${handle.kind} ${handle.id} is ${seen.state}` };
  return { status: "unknown", reason: `${handle.kind} ${handle.id} is ${seen.state}, which does not prove it stopped` };
}

export const branchTicket = (branch) => Number(/(?:^|\/)[a-z]+\/(\d+)-[^/]*$/.exec(branch ?? "")?.[1]) || null;
export const ownsPull = (p, n, split, ticketCreated = null) => {
  const refs = p.closingIssuesReferences ?? [], branch = branchTicket(p.headRefName);
  const closes = (k) => refs.some((r) => r.number === k);
  if (!split) return closes(n) || branch === n;
  const predates = Boolean(ticketCreated && p.createdAt) && Date.parse(p.createdAt) < Date.parse(ticketCreated);
  return refs.length === 0 ? branch === n && !predates : closes(n) && (branch === n || !closes(branch));
};

export function parseWorktrees(text) {
  return text.split(/\r?\n\r?\n/).map((block) => Object.fromEntries(block.split(/\r?\n/).filter(Boolean).map((line) => { const i = line.indexOf(" "); return i < 0 ? [line, true] : [line.slice(0, i), line.slice(i + 1)]; }))).filter((w) => w.worktree).map((w) => ({ path: w.worktree, head: w.HEAD ?? null, branch: typeof w.branch === "string" ? w.branch.replace(/^refs\/heads\//, "") : null }));
}

export function githubClient(names, checkout, { run = (cmd, args) => execFileSync(cmd, args, { cwd: checkout, encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 }) } = {}) {
  const { code, tickets, split, thread } = repositoriesOf(names);
  const pages = (args) => JSON.parse(run("gh", ["api", "--paginate", "--slurp", ...args])).flat();
  const fields = "number,state,isDraft,headRefName,headRefOid,baseRefName,closingIssuesReferences,mergeCommit,createdAt";
  let account;
  const accountPulls = (n) => {
    account ??= run("gh", ["api", "user", "--jq", ".login"]).trim();
    const heads = DISCOVERY_TYPES.map((type) => `head:${type}/${n}-`).join(" ");
    const found = new Map();
    for (const search of [heads, String(n)]) for (const p of JSON.parse(run("gh", ["pr", "list", "--repo", code, "--author", "@me", "--state", "all", "--search", search, "--limit", "100", "--json", `${fields},author`]))) found.set(p.number, p);
    return [...found.values()].sort((a, b) => b.number - a.number)
      .filter((p) => p.author?.login === account)
      .map(({ author, ...p }) => ({ ...p, closingIssuesReferences: closingIn(p.closingIssuesReferences, tickets, code) }))
      .filter((p) => ownsPull(p, n, true));
  };
  return {
    issue: (n) => JSON.parse(run("gh", ["api", `repos/${tickets}/issues/${n}`])),
    subIssues: (n) => pages([`repos/${tickets}/issues/${n}/sub_issues`]),
    blockedBy: (n) => pages([`repos/${tickets}/issues/${n}/dependencies/blocked_by`]),
    effort: (n) => pages(["-H", "X-GitHub-Api-Version: 2026-03-10", `repos/${tickets}/issues/${n}/issue-field-values`]).find((v) => v.issue_field_name === "Effort")?.single_select_option?.name ?? null,
    pulls: (n) => (split ? accountPulls(n) : JSON.parse(run("gh", ["pr", "list", "--repo", code, "--state", "all", "--search", String(n), "--limit", "100", "--json", fields]))),
    comments: (pr, ticket) => { const t = thread(pr, ticket); return pages([`repos/${t.repo}/issues/${t.number}/comments`]); },
    checks: (pr) => JSON.parse(run("gh", ["pr", "view", String(pr), "--repo", code, "--json", "statusCheckRollup"])).statusCheckRollup.map((c) => ({ name: c.name ?? c.context, state: c.conclusion || c.state || c.status })),
    fetchMain: () => { run("git", ["fetch", "-q", "origin", "main"]); return run("git", ["rev-parse", "origin/main"]).trim(); },
    onMain: (sha) => spawnSync("git", ["merge-base", "--is-ancestor", sha, "origin/main"], { cwd: checkout, windowsHide: true }).status === 0,
    worktrees: () => parseWorktrees(run("git", ["worktree", "list", "--porcelain"])),
  };
}

export const MAX_SUB_ISSUE_DEPTH = 8;
export const reviewRounds = (comments) => Math.max(0, ...comments.map((c) => [...(c.body ?? "").matchAll(/^#{2,4} Review round (\d+) state\b/gm)].map((m) => Number(m[1]))).flat());

const CLOSING_REFERENCE = /\b(?:clos(?:e|es|ed)|fix(?:es|ed)?|resolv(?:e|es|ed))\s*:?\s+(?:https?:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/issues\/(\d+)|(?:([\w.-]+\/[\w.-]+))?#(\d+))/gi;
export function closingReferences(body) {
  const seen = new Map();
  const visible = String(body ?? "").replace(/<!--[\s\S]*?-->/g, "");
  for (const m of visible.matchAll(CLOSING_REFERENCE)) {
    const repository = m[1] ?? m[3] ?? null, number = Number(m[2] ?? m[4]);
    const key = `${repository ?? ""}#${number}`;
    if (!seen.has(key)) seen.set(key, { number, repository });
  }
  return [...seen.values()];
}
const PR_PREFERENCE = { MERGED: 0, OPEN: 1 };
const byPreference = (a, b) => (PR_PREFERENCE[a.state] ?? 2) - (PR_PREFERENCE[b.state] ?? 2);
const viablePr = (p) => p.state === "MERGED" || p.state === "OPEN";

export function walkSubIssues(issue, client, { tickets = null, split = false, pullsOf = pullsFilter(client, tickets, split) } = {}) {
  const nodes = [];
  const isBug = (c) => (c.type?.name ?? null) === "Bug";
  const visit = (parent, depth) => {
    for (const sub of client.subIssues(parent)) {
      const children = client.subIssues(sub.number);
      const closes = closingReferences(sub.body).filter((r) => r.repository === null || (tickets !== null && sameRepository(r.repository, tickets))).map((r) => r.number);
      nodes.push({ number: sub.number, title: sub.title, state: sub.state, stateReason: sub.state_reason ?? null, closedAt: sub.closed_at ?? null, type: sub.type?.name ?? null, parent, depth, children: children.map((c) => ({ number: c.number, bug: isBug(c) })), closes });
      if (children.length && depth < MAX_SUB_ISSUE_DEPTH) visit(sub.number, depth + 1);
    }
  };
  visit(issue, 1);
  const listed = new Map(nodes.map((n) => [n.number, n]));
  const claims = new Map();
  const claimOf = (n) => { if (!claims.has(n)) claims.set(n, { pr: [], body: [] }); return claims.get(n); };
  for (const s of nodes) {
    s.ownPrs = pullsOf(s.number).filter((p) => branchTicket(p.headRefName) === s.number && viablePr(p)).sort(byPreference);
    for (const p of s.ownPrs) for (const r of p.closingIssuesReferences ?? []) if (r.number !== s.number && listed.has(r.number)) claimOf(r.number).pr.push({ ticket: s.number, pr: p.number, state: p.state });
    for (const n of s.closes) if (n !== s.number && listed.has(n) && !claimOf(n).body.includes(s.number)) claimOf(n).body.push(s.number);
  }
  const distinct = (xs) => [...new Set(xs)].sort((a, b) => a - b);
  const resolved = new Map(nodes.map((node) => {
    if (node.ownPrs.length) return [node.number, { kind: "own" }];
    const k = claims.get(node.number) ?? { pr: [], body: [] };
    const byPr = distinct(k.pr.map((x) => x.ticket));
    if (byPr.length > 1) return [node.number, { kind: "conflict", tickets: byPr }];
    if (byPr.length === 1) { const best = k.pr.filter((x) => x.ticket === byPr[0]).sort(byPreference)[0]; return [node.number, { kind: "pr", ticket: best.ticket, pr: best.pr }]; }
    const byBody = distinct(k.body.filter((x) => x !== node.parent));
    if (byBody.length > 1) return [node.number, { kind: "conflict", tickets: byBody }];
    if (byBody.length === 1) return [node.number, { kind: "body", ticket: byBody[0] }];
    return [node.number, null];
  }));
  for (const node of nodes) {
    const claimedElsewhere = (c) => { const r = resolved.get(c.number); return Boolean(r && (r.kind === "conflict" || ((r.kind === "pr" || r.kind === "body") && r.ticket !== node.number))); };
    const allBugs = node.children.length > 0 && node.type !== null && node.type !== "Bug" && node.children.every((c) => c.bug);
    const ownResolution = resolved.get(node.number);
    node.delivers = allBugs && !(ownResolution && ownResolution.kind !== "own") && node.children.every((c) => !claimedElsewhere(c));
    node.container = node.children.length > 0 && !node.delivers;
    if (node.container && node.depth >= MAX_SUB_ISSUE_DEPTH) node.truncated = true;
  }
  const deliveredItself = (c) => { const r = resolved.get(c.number); return Boolean((r && r.kind !== "own") || (!r && c.type === "Bug" && listed.get(c.parent)?.delivers)); };
  const cannotDeliver = (ticket) => { const c = listed.get(ticket); return c.container ? "a container, planned through its own sub-issues" : deliveredItself(c) ? "itself delivered by another slice or contested" : null; };
  return nodes.map(({ children, closes, depth, delivers, ownPrs, ...node }) => {
    const r = resolved.get(node.number);
    if (node.container) return r && r.kind !== "own" ? { ...node, claimedContainer: r.kind === "conflict" ? { tickets: r.tickets } : { ticket: r.ticket, via: r.kind } } : node;
    if (r?.kind === "own") return node;
    if (r?.kind === "conflict") return { ...node, deliveryConflict: r.tickets };
    if (r?.kind === "pr" || r?.kind === "body") {
      const why = cannotDeliver(r.ticket);
      if (why) return { ...node, claimInvalid: { ticket: r.ticket, via: r.kind, reason: why } };
      return { ...node, deliveredBy: r.kind === "pr" ? { ticket: r.ticket, via: "pr", pr: r.pr } : { ticket: r.ticket, via: "body", pr: null } };
    }
    if (listed.get(node.parent)?.delivers && node.type === "Bug") return { ...node, deliveredBy: { ticket: node.parent, via: "sub-issue", pr: null } };
    return node;
  });
}

export const runStartedAt = (record) => [...(record.previousCoordinators ?? []), record.coordinator].map((c) => c?.since).filter(Boolean).sort()[0] ?? null;

export const HISTORY = "closed before the run, delivered outside it";
export function closedBeforeRun(record, t) {
  const start = runStartedAt(record), own = record.tickets?.[t.number] ?? {};
  if (t.state !== "closed" || t.stateReason !== "completed" || !t.closedAt || !start || !(Date.parse(t.closedAt) + 1000 <= Date.parse(start))) return false;
  if (own.owner || own.pending || t.worktrees?.length) return false;
  return !(t.prs ?? []).some((p) => branchTicket(p.branch) === t.number && (p.state === "OPEN" || p.state === "MERGED"));
}

const plannedNodes = (nodes) => nodes.filter((t) => !t.container || t.truncated);

const pullsFilter = (client, tickets = null, split = false) => {
  const cache = new Map(), created = new Map();
  const refsOf = (p) => (tickets === null ? (p.closingIssuesReferences ?? []).filter((r) => !r.repository?.name) : closingIn(p.closingIssuesReferences, tickets, tickets));
  const createdOf = (n) => { if (!created.has(n)) created.set(n, client.issue?.(n)?.created_at ?? null); return created.get(n); };
  const owns = (p, n) => ownsPull(p, n, split, split && p.closingIssuesReferences.length === 0 && branchTicket(p.headRefName) === n && p.createdAt ? createdOf(n) : null);
  return (n) => {
    if (!cache.has(n)) cache.set(n, client.pulls(n).map((p) => ({ ...p, closingIssuesReferences: refsOf(p) })).filter((p) => owns(p, n)));
    return cache.get(n);
  };
};

export function takeSnapshot({ repository, issue, tickets: ticketsRepository = repository }, client) {
  const originMain = client.fetchMain();
  const worktrees = client.worktrees();
  const pullsOf = pullsFilter(client, ticketsRepository, repositoriesOf({ repository, ticketsRepository }).split);
  const delivered = (n) => pullsOf(n).some((p) => p.state === "MERGED" && p.mergeCommit?.oid && client.onMain(p.mergeCommit.oid));
  const parent = client.issue(issue);
  const tickets = walkSubIssues(issue, client, { tickets: ticketsRepository, pullsOf }).map((node) => {
    const n = node.number;
    const prs = pullsOf(n).map((p) => ({ number: p.number, state: p.state, isDraft: p.isDraft, branch: p.headRefName, head: p.headRefOid, base: p.baseRefName, mergeCommit: p.mergeCommit?.oid ?? null, closes: (p.closingIssuesReferences ?? []).map((r) => r.number), ...(p.state === "OPEN" && { rounds: reviewRounds(client.comments(p.number, n)), checks: client.checks(p.number) }) }));
    return {
      ...node, effort: client.effort(n),
      delivered: node.state === "closed" && delivered(n),
      blockers: client.blockedBy(n).map((b) => ({ number: b.number, state: b.state, delivered: b.state === "closed" && delivered(b.number) })),
      prs, worktrees: worktrees.filter((w) => branchTicket(w.branch) === n),
    };
  });
  const byNumber = new Map(tickets.map((t) => [t.number, t]));
  for (const t of tickets) {
    if (!t.deliveredBy) continue;
    const s = byNumber.get(t.deliveredBy.ticket);
    if (t.deliveredBy.pr === null) t.deliveredBy.pr = s.prs.filter((p) => branchTicket(p.branch) === s.number && viablePr(p)).sort(byPreference)[0]?.number ?? null;
    const pr = t.deliveredBy.pr === null ? null : s.prs.find((p) => p.number === t.deliveredBy.pr);
    t.deliveredBy.merged = Boolean(pr && pr.state === "MERGED" && pr.mergeCommit && client.onMain(pr.mergeCommit));
    t.delivered = t.state === "closed" && t.deliveredBy.merged;
  }
  for (const t of tickets) for (const b of t.blockers) { const x = byNumber.get(b.number); if (x?.deliveredBy) b.delivered = x.delivered; }
  return { repository, issue: { number: issue, state: parent.state, title: parent.title, type: parent.type?.name ?? null, criteria: parseCriteria(parent.body), acceptanceSha256: acceptanceHash(parent.body) }, observedAt: new Date().toISOString(), originMain, tickets };
}

const scopeLine = (t) => [`#${t.number}`, t.state, ...(t.state === "closed" ? [t.stateReason, t.closedAt].filter(Boolean) : [])].join(" ");

export function readIssueScope({ issue, tickets = null, split = false }, client) {
  const slices = plannedNodes(walkSubIssues(issue, client, { tickets, split })).map(scopeLine);
  return { slices: slices.sort(), acceptanceSha256: acceptanceHash(client.issue(issue).body) };
}
export const snapshotScope = (snapshot) => ({ slices: plannedNodes(snapshot.tickets).map(scopeLine).sort(), acceptanceSha256: snapshot.issue.acceptanceSha256 ?? null });

function openPending(owner) {
  const o = owner.opened, last = o?.steps?.at(-1);
  if (!o || o.session || !last || last.state === "failed") return null;
  const app = `local_${o.sessionId}`;
  if (last.state === "requested") return `the open of session ${o.sessionId} was requested; confirm ${app} in the app's session list and record it with opened --session ${app}`;
  return `the open of session ${o.sessionId} has ${last.state === "intent" ? "no recorded outcome" : `an uncertain outcome (${last.reason})`}; look for ${app} in the app's session list and record it with opened if it is there, and never run open again`;
}

function transcriptOf(owner) {
  const handle = owner.handle;
  if (handle.kind === "process") return handle.launchDir ? path.join(handle.launchDir, "out.jsonl") : `process ${handle.pid}'s output`;
  return `${handle.kind} ${handle.id}`;
}

const launcherLogs = (plan, journal, kind) => [...new Set([path.dirname(plan), path.dirname(journal)])].map((dir) => path.join(dir, `${path.basename(plan, path.extname(plan))}.coordinator.${kind}.log`));
function launchPlans(files) {
  const plans = [];
  for (const { file, size } of files) {
    if (size === 0 || size > 4 * 2 ** 20) continue;
    let plan;
    try { plan = readJson(file); } catch { continue; }
    if (typeof plan?.journal === "string" && plan.steps && typeof plan.steps === "object") plans.push({ file, journal: path.resolve(path.dirname(file), plan.journal) });
  }
  return plans;
}
export function deadLaunches(jobRoot, prs, census = processCensus) {
  const dead = [];
  let list;
  for (const { ticket, pr } of prs) {
    const files = reviewJobFiles(path.join(jobRoot, `pr-${pr}`));
    const sizes = new Map(files.map(({ file, size }) => [file, size]));
    for (const { file, journal } of launchPlans(files)) {
      const started = ["out", "err"].some((kind) => launcherLogs(file, journal, kind).some((log) => fs.existsSync(log)));
      if (!started || (sizes.get(journal) || fs.statSync(journal, { throwIfNoEntry: false })?.size) > 0) continue;
      if (list === undefined) { try { list = census(); } catch { list = null; } }
      if (!Array.isArray(list)) return [];
      if (usersOf(file, list, process.pid).length) continue;
      const errLogs = launcherLogs(file, journal, "err");
      const errLog = errLogs.find((log) => fs.existsSync(log)) ?? errLogs[0];
      let error = "";
      try { error = fs.readFileSync(errLog, "utf8").trim().split(/\r?\n/).slice(-5).join("\n"); } catch (failure) { if (failure.code !== "ENOENT") throw failure; }
      dead.push({ ticket, pr, plan: file, journal, errLog, error });
    }
  }
  return dead;
}

const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
function fencedLines(lines) {
  let fence = null, comment = false;
  return lines.map((l) => {
    if (comment) { if (l.includes("-->")) comment = false; return true; }
    if (!fence && /^\s{0,3}<!--/.test(l)) { comment = !l.slice(l.indexOf("<!--") + 4).includes("-->"); return true; }
    const f = FENCE.exec(l);
    if (f) { if (!fence) fence = f[1]; else if (f[1][0] === fence[0] && f[1].length >= fence.length) fence = null; return true; }
    return fence !== null;
  });
}
const headingLevels = (lines) => { const fenced = fencedLines(lines); return lines.map((l, i) => (fenced[i] ? 0 : /^(#{1,6})\s/.exec(l)?.[1].length ?? 0)); };
export function acceptanceSection(body) {
  const lines = String(body ?? "").split(/\r?\n/), levels = headingLevels(lines);
  const start = lines.findIndex((l, i) => levels[i] > 0 && /^#{1,6}\s+Acceptance criteria\s*$/i.test(l.trim()));
  if (start < 0) return null;
  const end = levels.findIndex((level, i) => i > start && level > 0 && level <= levels[start]);
  return lines.slice(start + 1, end < 0 ? undefined : end);
}
export const acceptanceHash = (body) => { const s = acceptanceSection(body); return s === null ? null : createHash("sha256").update(s.map((l) => l.trimEnd()).join("\n").trim()).digest("hex"); };
const LIST_MARKER = String.raw`^\s*(?:>\s*)*(?:[-+*]|\d{1,9}[.)])`;
const LIST_ITEM = new RegExp(String.raw`${LIST_MARKER}\s`);
const TASK_ITEM = new RegExp(String.raw`${LIST_MARKER}\s+\[[ xX]\]\s+(.*\S)\s*$`);
export function parseCriteria(body) {
  const items = [];
  let open = false;
  const section = acceptanceSection(body) ?? [], fenced = fencedLines(section);
  for (const [i, l] of section.entries()) {
    if (fenced[i]) { open = false; continue; }
    const m = TASK_ITEM.exec(l);
    if (m) { items.push([m[1]]); open = true; continue; }
    if (open && /^\s+\S/.test(l) && !LIST_ITEM.test(l)) { items.at(-1).push(l.trim()); continue; }
    if (/\S/.test(l)) open = false;
  }
  return items.map((parts, i) => ({ index: i + 1, text: parts.join(" ") }));
}
const sameCriteria = (a, b) => JSON.stringify(a.map((c) => c.text ?? c.criterion)) === JSON.stringify(b.map((c) => c.text ?? c.criterion));

export function verificationGaps(record, snapshot, { running = null } = {}) {
  const v = (record.verifications ?? []).at(-1);
  if (v?.verdict !== "complete") return ["the latest verification is not complete"];
  const gaps = [];
  if (snapshot.originMain !== v.mainSha) gaps.push(`origin/main is ${snapshot.originMain}, not the verified ${v.mainSha}`);
  if (!Array.isArray(snapshot.issue?.criteria) || !sameCriteria(snapshot.issue.criteria, v.criteria) || snapshot.issue.acceptanceSha256 !== v.acceptanceSha256) gaps.push("the parent issue's acceptance criteria changed");
  const slices = (snapshot.tickets ?? []).filter((t) => !t.container);
  const list = (ns) => [...ns].sort((a, b) => a - b).map((n) => `#${n}`).join(", ");
  if (list(slices.map((t) => t.number)) !== list(v.tickets ?? [])) gaps.push(`the parent issue's slices are ${list(slices.map((t) => t.number)) || "none"}, not the verified ${list(v.tickets ?? []) || "none"}`);
  for (const t of slices) if (!(t.state === "closed" && t.delivered) && !closedBeforeRun(record, t)) gaps.push(`#${t.number} is no longer closed with its deliverable on main`);
  const open = (record.operations ?? []).filter((o) => o.id !== running && OPEN_OPERATION.has(o.state));
  if (open.length) gaps.push(`${open.map((o) => (o.kind === "close" ? `closing issue #${o.pr} (${o.id})` : `${o.kind} ${o.id} of PR #${o.pr}`)).join(", ")} ${open.length > 1 ? "are" : "is"} unsettled; settle it with checkpoint.mjs reconcile-operations`);
  gaps.push(...filedActions(record).map((f) => `#${f.number} ${f.action === "triage-filed" ? "was filed during the run and has no triage outcome; triage it with issue-run.mjs triage" : `is named as filed in #${f.from}'s writer's report but not recorded; confirm it with issue-run.mjs filed and triage it, or dismiss it with GitHub's evidence`}`));
  return gaps;
}
export const verificationHolds = (record, snapshot) => verificationGaps(record, snapshot).length === 0;

export function remainingFor(record, complete) {
  if (complete) return ["Every slice is merged and the parent issue's acceptance criteria were verified on main; close the parent issue with integration.mjs close-issue if it is still open, and give the final report."];
  return [
    `A writer's review reaches a checkpoint after round 3's verified fixes and after every later round's; the coordinator decides each with review-checkpoint.mjs and publishes it on ${repositoriesOf(record).split ? "the slice's ticket, its review thread" : "the PR"}.`,
    coordinatorMerges(record)
      ? "A ready PR merges only through integration.mjs's merge gate, on a head that is the last independently reviewed one or carries a published acceptance, with every reviewer exited, every report adjudicated, required CI passed and current main merged in; dependent tickets become eligible once a blocker's merge commit is on origin/main."
      : "Ready PRs wait for the maintainer to merge them, since the invocation stops at ready; dependent tickets become eligible only once a blocker's merged deliverable is on origin/main.",
    "The run record is local to this coordinator's machine; another machine, account or harness continues only from a checkpoint saved on the parent issue's state branch, and work a writer has not pushed or snapshotted stays on its own host.",
    "Once every slice is merged, the parent issue's own acceptance criteria are verified on main with integration.mjs verify-issue; the parent issue is complete only when that verification passes, never from merged PRs alone. A parent whose body has no \"Acceptance criteria\" section is refused there, with the section to add named, and stays open.",
    ...(record.operations ?? []).filter((o) => o.kind === "close" && OPEN_OPERATION.has(o.state)).map((o) => `Closing issue #${o.pr} (${o.id}) is ${o.state}: settle it with checkpoint.mjs reconcile-operations from a fresh snapshot before any other attempt.`),
    ...filedActions(record).map((f) => `#${f.number} (${f.action}): ${f.reason}.`),
  ];
}

const OPEN_OPERATION = new Set(["intent", "uncertain"]);
function readyAction(record, pr, why = "") {
  const op = (record.operations ?? []).find((o) => o.pr === pr.number && o.kind !== "close" && OPEN_OPERATION.has(o.state));
  if (op) return ["reconcile-pending", `${op.kind} ${op.id} of PR #${pr.number} at ${op.expectHead} is ${op.state}; settle it with checkpoint.mjs reconcile-operations from a fresh snapshot before any retry`];
  if (coordinatorMerges(record)) return ["merge-gate", `PR #${pr.number} is ready at ${pr.head}${why}; run integration.mjs gate, and merge only when it admits that head`];
  return ["await-maintainer", `PR #${pr.number} is ready at ${pr.head}${why}; the invocation stops at ready, so the maintainer merges it`];
}

const reportedSince = (own) => { const started = Date.parse(own.owner.resumes?.at(-1)?.time ?? own.owner.since); return (own.results ?? []).some((r) => Date.parse(r.time) >= started); };

const writerKnownEnded = (own) => !own.owner && !own.pending && Boolean(own.history?.some((h) => h.released || h.ended || h.priorEnded));

export function planDispatch({ record, snapshot, observations = {}, preflights = [], freeBytes, defaults, host = os.hostname(), identify = processIdentity, now = Date.now(), reviewJobs = `${record.checkout}.review-jobs`, census = processCensus, env = process.env }) {
  if (snapshot.repository !== record.repository || snapshot.issue.number !== record.issue) throw new Error("The snapshot is of another repository or parent issue");
  const model = record.writer.model;
  const routes = routeOptions(model, defaults);
  const tickets = [], eligible = [], existingWork = [];
  const sweep = { read: [], notRead: [], deadLaunches: [] }, reviewed = [];
  const interval = (record.checkIn?.interval ?? CHECK_IN_MINUTES) * 60000;
  let active = 0;
  const add = (ticket, action, reason, extra = {}) => { const entry = { number: ticket.number, title: ticket.title, effort: writerEffortOf(ticket.effort), action, reason, ...extra }; tickets.push(entry); return entry; };
  const chooseRoute = (t) => {
    const effort = writerEffortOf(t.effort);
    const verdictOf = (route) => preflights.filter((p) => p.route === route && p.model === model).flatMap((p) => p.verdicts).find((v) => v.ticket === t.number && v.effort === effort);
    const reasons = [];
    for (const r of routes) {
      const v = verdictOf(r.route);
      if (!v) { reasons.push(`${r.route}: no preflight result for ${model} at ${effort}`); continue; }
      if (v.verdict !== "available" && v.verdict !== "confirmed") { reasons.push(`${r.route}: ${v.reason}`); continue; }
      return { effort, chosen: { ...r, launch: v.launch }, reasons };
    }
    for (const route of new Set(preflights.map((p) => p.route))) if (retiredReason(route, defaults)) reasons.push(retiredReason(route, defaults));
    return { effort, chosen: null, reasons };
  };
  const startWith = (choice) => ({ route: choice.chosen.route, model, effort: choice.effort, ...(choice.chosen.launch && { launch: choice.chosen.launch }) });
  const unlaunchable = modeBlock(record);
  const pendingNext = (p) => {
    if (p.host && p.host !== host) return `${p.operation} ${p.launchId} on ${p.route} was claimed on ${p.host} and has no recorded outcome; settle it on that host (reconcile there, or withdraw --observed-on ${p.host} with what was observed there) before any retry`;
    const retired = retiredReason(p.route, defaults);
    return `launch ${p.launchId} on ${p.route} has no confirmed outcome; ${p.route === "claude-cli" ? "run reconcile" : `find the started writer and record it with launched, or withdraw with evidence that none started${retired ? `, and never retry it there, since ${retired}` : ""}`} before any retry`;
  };
  const historic = new Set(snapshot.tickets.filter((t) => closedBeforeRun(record, t)).map((t) => t.number));
  const met = (b) => b.delivered || historic.has(b.number);
  const undelivered = (t) => t.blockers.filter((b) => !met(b));
  const waitingFor = (blockers) => `waiting for ${blockers.map((b) => `#${b.number} (${b.state === "closed" ? "closed, but no merged deliverable is on origin/main" : "open"})`).join(", ")}`;
  const parentOf = new Map(snapshot.tickets.map((t) => [t.number, t.parent]));
  const heldContainers = new Set();
  const heldAncestor = (t) => { for (let p = t.parent; p !== undefined && p !== snapshot.issue.number; p = parentOf.get(p)) if (heldContainers.has(p)) return p; return null; };
  const heldDeliverers = new Map();
  for (const t of snapshot.tickets) {
    if (!t.deliveredBy) continue;
    const own = record.tickets[t.number] ?? {};
    if (own.owner || own.pending || (t.worktrees.length && !writerKnownEnded(own))) {
      if (!heldDeliverers.has(t.deliveredBy.ticket)) heldDeliverers.set(t.deliveredBy.ticket, []);
      heldDeliverers.get(t.deliveredBy.ticket).push(t.number);
    }
  }
  const heldDelivery = (n) => heldDeliverers.get(n) ?? null;
  const blockedDeliverers = new Map();
  const deliveredBySlice = new Map(snapshot.tickets.filter((t) => t.deliveredBy).map((t) => [t.number, t.deliveredBy.ticket]));
  for (const t of snapshot.tickets) {
    if (!t.deliveredBy || t.delivered || historic.has(t.number)) continue;
    const s = t.deliveredBy.ticket;
    for (const b of t.blockers) {
      if (met(b) || b.number === s || deliveredBySlice.get(b.number) === s) continue;
      if (!blockedDeliverers.has(s)) blockedDeliverers.set(s, []);
      blockedDeliverers.get(s).push({ ticket: t.number, blocker: b });
    }
  }
  const blockedDelivery = (n) => blockedDeliverers.get(n) ?? null;
  const triageHold = (t) => {
    const triaged = record.filed?.[t.number]?.outcome;
    if (triaged?.kind === "maintainer") return { action: "decision-needed", reason: `filed during the run and raised with the maintainer: "${triaged.question}"; no writer starts on it until their answer is recorded with triage or interim` };
    if (triaged?.kind !== "completes") return null;
    const fixOf = snapshot.tickets.find((x) => x.number === triaged.slice);
    if (!fixOf) return { action: "decision-needed", reason: `it completes #${triaged.slice}'s fix (${triaged.reason}), but #${triaged.slice} is not in the parent's tree, so whether its PR made the proper fix is unknown; re-triage the ticket or restore #${triaged.slice}` };
    if (met(fixOf)) return null;
    return { action: "wait-dependency", waitingFor: [fixOf.number], reason: `it completes #${fixOf.number}'s fix (${triaged.reason}); ${triaged.interim ? `the maintainer accepted #${fixOf.number}'s narrow fix as an interim, so this ticket removes it once #${fixOf.number}'s PR has merged` : `#${fixOf.number}'s writer makes the proper fix in its PR with a closing reference to #${t.number}, which delivers it`}` };
  };
  const blockedText = (list) => list.map((x) => `#${x.ticket}, which its PR delivers, waits for #${x.blocker.number} (${x.blocker.state === "closed" ? "closed, but no merged deliverable is on origin/main" : "open"})`).join("; ");
  const statuses = new Map();
  const statusOf = (n, owner) => { if (!statuses.has(n)) statuses.set(n, ownerStatus(owner, observations, { host, identify })); return statuses.get(n); };
  for (const t of snapshot.tickets) {
    const own = record.tickets[t.number] ?? {};
    const open = t.prs.filter((p) => p.state === "OPEN");
    if (t.deliveryConflict) {
      const reserves = Boolean(own.owner || own.pending || (t.worktrees.length && !writerKnownEnded(own)));
      if (reserves) active++;
      add(t, "decision-needed", `${t.deliveryConflict.map((n) => `#${n}`).join(" and ")} both claim it (by an open or merged PR or a body closing reference), so which slice delivers it is the maintainer's decision; it is not dispatched meanwhile${reserves ? ", and its writer, pending start or worktree keeps a place until it is settled" : ""}`, { deliveryConflict: t.deliveryConflict, ...(reserves && { reserves: true }) });
      continue;
    }
    if (t.claimInvalid) {
      const c = t.claimInvalid, reserves = Boolean(own.owner || own.pending || (t.worktrees.length && !writerKnownEnded(own)));
      if (reserves) active++;
      add(t, "decision-needed", `#${c.ticket}'s ${c.via === "pr" ? "PR" : "body"} claims it, but #${c.ticket} cannot deliver it (${c.reason}); remove the closing reference or move the work to a slice that delivers it, since it is not dispatched meanwhile${reserves ? ", and its writer, pending start or worktree keeps a place until it is settled" : ""}`, { claimInvalid: c, ...(reserves && { reserves: true }) });
      continue;
    }
    if (t.deliveredBy) {
      const d = t.deliveredBy, by = `#${d.ticket}'s PR${d.pr ? ` #${d.pr}` : ""}`;
      const how = { "sub-issue": `a Bug under slice #${d.ticket}`, body: `#${d.ticket}'s body claims it with a closing keyword`, pr: "that PR closes it" }[d.via];
      if (own.owner || own.pending) { active++; add(t, "decision-needed", `the record holds a writer or pending start for it, but ${by} delivers it (${how}); settle that writer, since the ticket is never dispatched, and #${d.ticket} waits until it is settled`, { deliveredBy: d }); continue; }
      if (t.worktrees.length && !writerKnownEnded(own)) { active++; add(t, "adopt-worktree", `worktree ${t.worktrees.map((w) => w.path).join(", ")} holds work on it although ${by} delivers it (${how}); find that writer and record it with adopt, then release it once it ends, and #${d.ticket} waits until it is settled`, { worktrees: t.worktrees, reserves: true, deliveredBy: d }); continue; }
      if (t.state === "closed" && !t.delivered && closedBeforeRun(record, t)) { add(t, "done", HISTORY, { history: true }); continue; }
      if (t.state === "closed") { add(t, t.delivered ? "done" : "decision-needed", t.delivered ? `delivered by ${by}, merged on origin/main` : `closed without a merged deliverable on origin/main, although ${by} delivers it; confirm whether the ticket is complete`, { deliveredBy: d }); continue; }
      if (d.merged) { add(t, "decision-needed", `${by} is merged on origin/main, but GitHub left it open, so that PR's body may lack its closing reference; close it by hand once the merge delivers it, or confirm what remains`, { deliveredBy: d }); continue; }
      add(t, "delivered-by", `${by} delivers it (${how}): it is never dispatched and holds no writer place, and it is done once that PR's merge commit is on origin/main and GitHub has closed it`, { deliveredBy: d });
      continue;
    }
    if (t.container && t.claimedContainer) {
      const c = t.claimedContainer;
      const existing = !own.owner && !own.pending && (open.length || t.worktrees.length) && !writerKnownEnded(own);
      const holds = Boolean(own.owner || own.pending || existing);
      if (holds) { heldContainers.add(t.number); active++; }
      const work = existing ? `; existing work on it (${[...open.map((p) => `PR #${p.number}`), ...t.worktrees.map((w) => w.path)].join(", ")}) may still have a writer, so find it and record it with adopt, and its sub-issues wait until it is settled` : holds ? "; its recorded writer or pending start keeps a place and holds its sub-issues until settled" : "";
      add(t, "decision-needed", `${c.tickets ? `${c.tickets.map((n) => `#${n}`).join(" and ")} both claim it` : `#${c.ticket}'s ${c.via === "pr" ? "PR" : "body"} claims it`}, but it has sub-issues of its own, which are planned individually; remove the closing reference, or settle which slice carries that work${work}`, { claimedContainer: c, ...(holds && { reserves: true }), ...(existing && { worktrees: t.worktrees, ...(open.length && { pr: open[0].number }) }) });
      continue;
    }
    if (t.container) {
      if (own.owner || own.pending) {
        heldContainers.add(t.number);
        active++;
        const held = own.owner ? `writer ${own.owner.handle.id ?? own.owner.handle.pid} (${statusOf(t.number, own.owner).status})` : `pending ${own.pending.operation} ${own.pending.launchId}`;
        add(t, "decision-needed", `the ticket gained sub-issues while ${held} holds it; settle that writer before its sub-issues are dispatched`);
      } else if (open.length || t.worktrees.length) {
        const reserves = !writerKnownEnded(own);
        if (reserves) { active++; heldContainers.add(t.number); }
        const action = open.length ? "adopt-pr" : "adopt-worktree";
        add(t, action, `the ticket gained sub-issues while existing work on it (${[...open.map((p) => `PR #${p.number}`), ...t.worktrees.map((w) => w.path)].join(", ")}) may still have a writer; find that writer and record it with adopt, then settle it before its sub-issues are dispatched`, { ...(open.length && { pr: open[0].number, rounds: open[0].rounds, branch: open[0].branch }), worktrees: t.worktrees, container: true, continueBlocked: "the ticket is now a container; its sub-issues are planned individually" });
      } else if (t.truncated) add(t, "decision-needed", "its sub-issues nest deeper than GitHub's limit, so the snapshot could not read them");
      else add(t, "container", "its own sub-issues are planned individually");
      continue;
    }
    if (t.state === "closed" && !t.delivered && closedBeforeRun(record, t)) { add(t, "done", HISTORY, { history: true }); continue; }
    if (t.state === "closed") {
      if (own.owner || own.pending) active++;
      if (own.pending) { add(t, "reconcile-pending", `closed, but ${pendingNext(own.pending)}`, { pending: own.pending }); continue; }
      const lingering = !own.owner && !own.pending && t.worktrees.length > 0 && !writerKnownEnded(own);
      if (lingering) active++;
      const base = t.delivered ? "closed with its merged deliverable on origin/main" : `closed${t.stateReason === "not_planned" ? " as not planned" : ""} without a merged deliverable on origin/main; confirm whether the ticket is complete`;
      if (own.owner?.resuming) { add(t, "reconcile-pending", `${base}; resume ${own.owner.resuming.id} of its writer has no recorded outcome; run reconcile before anything else, since the resumed writer may still run`, { owner: { route: own.owner.route, handle: own.owner.handle, status: statusOf(t.number, own.owner).status } }); continue; }
      if (own.owner && statusOf(t.number, own.owner).status === "exited") { add(t, "release", `${base}; its writer ended (${statusOf(t.number, own.owner).reason}): read its transcript, then record release with that evidence`, { owner: { route: own.owner.route, handle: own.owner.handle, status: "exited" }, transcript: { from: transcriptOf(own.owner) } }); continue; }
      add(t, t.delivered ? "done" : "decision-needed", lingering ? `${base}; its worktree ${t.worktrees.map((w) => w.path).join(", ")} remains and its writer is not settled in the record, so it keeps a place: find that writer and record it with adopt, then release it once it ends, or remove the merged worktree through clean-worktrees, which refuses a tree a process still uses` : base, lingering ? { worktrees: t.worktrees, reserves: true } : {});
      continue;
    }
    if (own.pending) {
      active++;
      const p = own.pending;
      if (p.host && p.host !== host) { add(t, "blocked-owner-unknown", pendingNext(p), { pending: p }); continue; }
      add(t, "reconcile-pending", pendingNext(p), { pending: p });
      continue;
    }
    if (own.owner) {
      const s = statusOf(t.number, own.owner);
      const transcript = ["waiting", "exited"].includes(s.status) ? { from: transcriptOf(own.owner) } : null;
      const extra = { owner: { route: own.owner.route, handle: own.owner.handle, status: s.status }, ...(transcript && { transcript }), ...(open.length === 1 && { pr: open[0].number, rounds: open[0].rounds }) };
      if (own.owner.mismatch) { active++; add(t, "stop-writer", `the writer does not run the requested route: ${own.owner.mismatch}; stop it and keep its evidence, never substitute`, extra); continue; }
      const opening = openPending(own.owner) ?? (own.owner.resuming && `resume ${own.owner.resuming.id} of session ${own.owner.sessionId} has no recorded outcome (${own.owner.resuming.reason ?? "it may have started"}); run reconcile, which looks for a process naming ${own.owner.resuming.launchDir}, and never resume again before it`);
      if (opening) { active++; add(t, "reconcile-pending", opening, extra); continue; }
      const asked = openRequests(own);
      const resumable = s.status === "exited" && own.owner.route === "claude-cli" && own.owner.handle.kind === "process";
      if (asked.length && (s.status !== "exited" || resumable)) { active++; add(t, "answer-request", `${asked.map((r) => requestNext(r, ["waiting", "exited"].includes(s.status))).join("; ")}${resumable ? `; its turn has ended, so deliver the answer by resuming its session: record answer, write the message it prints to a file, run resume with that file as the prompt, then record answered` : ""}`, { ...extra, requests: asked }); continue; }
      if (own.owner.coordinator && own.owner.coordinator !== record.coordinator.session && s.status !== "exited") {
        active++;
        const c = own.owner.contact;
        add(t, c?.state === "intent" ? "reconcile-pending" : "update-contact", c?.state === "intent" ? `contact notice ${c.deliveryId} to the writer has no recorded outcome and may still be queued; ${s.status === "waiting" ? "if its transcript shows it, record contacted with that evidence; otherwise " : ""}wait, or resend with contact --retry` : `the writer was briefed to report to ${own.owner.coordinator}, not this coordinator ${record.coordinator.session}; record contact, send the notice it prints, then record contacted`, extra);
        continue;
      }
      const brief = own.owner.brief;
      if (brief && !own.owner.acknowledged && s.status !== "exited") {
        if (brief.state === "intent") { active++; add(t, "reconcile-pending", `brief delivery ${brief.deliveryId} of assignment ${own.owner.launchId} has no recorded outcome and may still be queued; ${s.status === "waiting" ? "if the writer's transcript shows the assignment, record delivered with that evidence; otherwise " : ""}wait, or resend with deliver --retry, which the brief tells the writer to ignore once a copy has arrived`, extra); continue; }
        if (now - Date.parse(brief.time) > interval) {
          active++;
          const check = { waiting: `its turn has ended, so read its transcript at ${transcriptOf(own.owner)} and record acknowledged if it shows one; otherwise resend`, live: "it is running, so its transcript is not read: resend", unknown: `its state is unknown (${s.reason}), so establish it first; then resend` }[s.status];
          add(t, "settle-delivery", `no acknowledgement of assignment ${own.owner.launchId} arrived within ${interval / 60000} minutes of brief delivery ${brief.deliveryId}: confirm that ${record.coordinator.session} is this session's own id; ${check} with deliver --retry, send that copy to the writer, and record delivered`, extra);
          continue;
        }
      }
      if (s.status === "exited" && open.length === 1 && !open[0].isDraft) { const [action, reason] = readyAction(record, open[0], `; ${s.reason}`); add(t, action, reason, extra); continue; }
      if (resumable && !reportedSince(own)) { active++; add(t, "collect-report", `${s.reason}; its turn ended with no final report recorded since its last start: read its transcript at ${transcriptOf(own.owner)}, then record its report with result and release it, record its request and answer it by resume, or, when it stopped with work left (a wait on a background task), resume it with a prompt to continue`, extra); continue; }
      active++;
      const action = { live: "observe", waiting: "collect-report", unknown: "blocked-owner-unknown", exited: "release" }[s.status];
      const advice = { live: "", waiting: "", unknown: "; establish its state before any replacement", exited: "; read its transcript, then record release with that evidence before a new writer continues" }[s.status];
      add(t, action, s.reason + advice, extra);
      continue;
    }
    if (open.length > 1) { active++; add(t, "decision-needed", `open PRs ${open.map((p) => `#${p.number}`).join(", ")} all belong to this ticket`); continue; }
    if (open.length === 1) {
      const pr = open[0];
      if (!pr.isDraft) {
        const reserves = !writerKnownEnded(own);
        if (reserves) active++;
        const [action, reason] = readyAction(record, pr, ` after ${pr.rounds} review rounds`);
        add(t, action, `${reason}${reserves ? "; its writer is not settled in the record and may still be running, so find it and record it with adopt, then release it once it ends" : ""}`, { pr: pr.number, rounds: pr.rounds, branch: pr.branch, worktrees: t.worktrees, ...(reserves && { reserves: true }) });
        continue;
      }
      const reserves = !writerKnownEnded(own);
      if (reserves) active++;
      existingWork.push({ t, reserves, entry: add(t, "adopt-pr", `draft PR #${pr.number} at ${pr.head} has started ${pr.rounds} review rounds; find its writer and record it with adopt, or, once that writer is known to have ended, claim --operation continue so a new writer continues the PR from round ${pr.rounds}`, { pr: pr.number, rounds: pr.rounds, branch: pr.branch, worktrees: t.worktrees }) });
      continue;
    }
    if (t.worktrees.length) { const reserves = !writerKnownEnded(own); if (reserves) active++; existingWork.push({ t, reserves, entry: add(t, "adopt-worktree", `worktree ${t.worktrees.map((w) => w.path).join(", ")} already holds this ticket's work; find its writer and record it with adopt, or, once that writer is known to have ended, claim --operation continue`, { worktrees: t.worktrees }) }); continue; }
    if (!t.effort) { add(t, "assign-effort", "the ticket has no Effort value: estimate one, publish and read it back through the issue-fields procedure, then snapshot and plan again"); continue; }
    if (!writerEffortOf(t.effort)) { add(t, "decision-needed", `Effort ${t.effort} has no writer effort`); continue; }
    const hold = triageHold(t);
    if (hold) { add(t, hold.action, hold.reason, hold.waitingFor ? { waitingFor: hold.waitingFor } : {}); continue; }
    const waiting = undelivered(t);
    if (waiting.length) { add(t, "wait-dependency", waitingFor(waiting), { waitingFor: waiting.map((b) => b.number) }); continue; }
    const held = heldAncestor(t);
    if (held !== null) { add(t, "wait-dependency", `its parent #${held} is still held by a writer; settle that writer before its sub-issues are dispatched`, { waitingFor: [held] }); continue; }
    const holding = heldDelivery(t.number);
    if (holding) { add(t, "wait-dependency", `${holding.map((n) => `#${n}`).join(", ")}, which its PR delivers, ${holding.length > 1 ? "hold" : "holds"} a writer or work of its own; settle that before #${t.number} is dispatched`, { waitingFor: holding }); continue; }
    const blockedBy = blockedDelivery(t.number);
    if (blockedBy) { add(t, "wait-dependency", blockedText(blockedBy), { waitingFor: [...new Set(blockedBy.map((x) => x.blocker.number))] }); continue; }
    eligible.push(t);
  }
  const listed = new Set(snapshot.tickets.map((t) => t.number));
  for (const [n, own] of Object.entries(record.tickets)) {
    if (listed.has(Number(n)) || (!own.owner && !own.pending)) continue;
    active++;
    tickets.push({ number: Number(n), action: "decision-needed", reason: "the record holds a writer or pending start for a ticket that is no longer one of the parent issue's sub-issues; settle it before reusing its capacity" });
  }
  const free = freeBytes ?? Infinity;
  const room = Math.min(record.concurrency.limit, Math.floor(free / WRITER_DISK));
  for (const { t, entry, reserves } of existingWork.sort((a, b) => a.t.number - b.t.number)) {
    const waiting = undelivered(t);
    if (!writerEffortOf(t.effort)) { entry.continueBlocked = t.effort ? `Effort ${t.effort} has no writer effort` : "the ticket has no Effort value; assign one through the issue-fields procedure and plan again"; continue; }
    if (triageHold(t)) { entry.continueBlocked = triageHold(t).reason; continue; }
    if (waiting.length) { entry.continueBlocked = waitingFor(waiting); continue; }
    if (heldAncestor(t) !== null) { entry.continueBlocked = `its parent #${heldAncestor(t)} is still held by a writer`; continue; }
    if (heldDelivery(t.number)) { entry.continueBlocked = `${heldDelivery(t.number).map((n) => `#${n}`).join(", ")}, which its PR delivers, still holds a writer or work of its own`; continue; }
    if (blockedDelivery(t.number)) { entry.continueBlocked = blockedText(blockedDelivery(t.number)); continue; }
    const choice = chooseRoute(t);
    const others = active - (reserves ? 1 : 0);
    if (!choice.chosen) entry.continueBlocked = choice.reasons.join("; ");
    else if (unlaunchable) entry.continueBlocked = unlaunchable;
    else if (others >= room) entry.continueBlocked = `${others} other writers, held or possibly running on existing work, fill the limit of ${record.concurrency.limit}`;
    else entry.continueWith = startWith(choice);
  }
  const capacityNow = Math.max(0, room - active);
  let capacity = capacityNow;
  for (const t of eligible.sort((a, b) => a.number - b.number)) {
    const choice = chooseRoute(t), { effort, chosen, reasons } = choice;
    if (!chosen) { add(t, "blocked-route", `no supported route runs ${model} at ${effort}: ${reasons.join("; ")}`); continue; }
    if (unlaunchable) { add(t, "blocked-route", unlaunchable); continue; }
    if (capacity <= 0) { add(t, "wait-capacity", capacityNow === 0 && Math.floor(free / WRITER_DISK) <= active ? "free disk does not admit another writer; the coordinator may run the bounded disk recovery" : `${active} writers already hold tickets against a limit of ${record.concurrency.limit}`); continue; }
    capacity--;
    add(t, "dispatch", `every blocker's deliverable is on origin/main`, startWith(choice));
  }
  if (record.handoff) {
    const why = `a planned handoff stopped new dispatch at ${record.handoff.since}`;
    for (const t of tickets) {
      if (t.action === "dispatch") Object.assign(t, { action: "wait-handoff", reason: why });
      if (t.continueWith) { delete t.continueWith; t.continueBlocked = why; }
    }
  }
  for (const [n, own] of Object.entries(record.tickets)) {
    if (!own.owner) continue;
    const s = statusOf(Number(n), own.owner);
    if (["waiting", "exited"].includes(s.status)) sweep.read.push({ ticket: Number(n), from: transcriptOf(own.owner) });
    else sweep.notRead.push({ ticket: Number(n), reason: s.status === "live" ? "running; a running writer cannot be waiting on the coordinator" : s.reason });
  }
  for (const t of snapshot.tickets) reviewed.push(...t.prs.filter((p) => p.state === "OPEN").map((p) => ({ ticket: t.number, pr: p.number })));
  sweep.deadLaunches = deadLaunches(reviewJobs, reviewed, census);
  tickets.sort((a, b) => a.number - b.number);
  for (const entry of tickets) {
    const delivers = snapshot.tickets.filter((x) => x.deliveredBy?.ticket === entry.number).map((x) => x.number);
    if (delivers.length) entry.delivers = delivers;
  }
  const complete = verificationHolds(record, snapshot) && tickets.every((t) => ["done", "container"].includes(t.action));
  return {
    repository: record.repository, issue: record.issue, parent: { type: snapshot.issue.type ?? null, title: snapshot.issue.title ?? null }, runId: record.runId, revision: record.revision, coordinator: record.coordinator.session,
    writer: record.writer, concurrency: { limit: record.concurrency.limit, basis: record.concurrency.basis, active, capacityNow },
    routes, tickets, filed: filedActions(record), sweep, checkIn: checkInStatus(record, now, { defaults, env, identify }), remaining: remainingFor(record, complete), complete,
  };
}

const BRANCH = /^(?:[a-z]+\/)?(?:fix|feat|perf|docs|test|refactor|ci)\/(\d+)-[a-z0-9]+(?:-[a-z0-9]+)*$/;

function planEntry(planFile, record, number, actions) {
  const plan = readJson(planFile);
  if (plan.runId !== record.runId || plan.repository !== record.repository || plan.issue !== record.issue) throw new Error(`The plan was made for another run (${plan.runId ?? "none"}, coordinator ${plan.coordinator}); plan again from this run's record`);
  if (plan.revision !== record.revision) throw new Error(`The plan was made at revision ${plan.revision}; plan again from revision ${record.revision}`);
  const entry = plan.tickets.find((t) => t.number === number);
  if (!entry || !actions.includes(entry.action)) throw new Error(`The plan's action for #${number} is ${entry?.action ?? "missing"}, not ${actions.join(" or ")}`);
  return entry;
}

function assertFree(ticket, number) {
  if (ticket.owner) throw new Error(`#${number} is already owned by ${ticket.owner.handle.kind} ${ticket.owner.handle.id ?? ticket.owner.handle.pid}; one writer per ticket`);
  if (ticket.pending) throw new Error(`#${number} already has pending ${ticket.pending.operation} ${ticket.pending.launchId}; reconcile it first`);
}

const CLAIM_ACTIONS = { dispatch: ["dispatch"], continue: ["adopt-pr", "adopt-worktree"] };
export function claim(record, { plan, ticket: number, worktree, branch, artifactParent, operation = "dispatch", evidence, host = os.hostname(), defaults = readWriterDefaults() }) {
  if (!Object.hasOwn(CLAIM_ACTIONS, operation)) throw new Error(`--operation must be ${Object.keys(CLAIM_ACTIONS).join(", ")}`);
  const entry = planEntry(plan, record, number, CLAIM_ACTIONS[operation]);
  if (!path.isAbsolute(worktree ?? "") || !path.isAbsolute(artifactParent ?? "")) throw new Error("--worktree and --artifact-parent must be absolute paths");
  let start = entry, continues = null;
  if (operation === "continue") {
    if (!evidence) throw new Error("--evidence must say how the previous writer is known to have ended");
    if (!entry.continueWith) throw new Error(`#${number} has no route to continue on: ${entry.continueBlocked}`);
    start = entry.continueWith;
    const found = entry.worktrees?.find((w) => path.resolve(w.path) === path.resolve(worktree));
    if (entry.action === "adopt-worktree" && !found) throw new Error(`--worktree must be one the plan found for #${number}: ${entry.worktrees.map((w) => w.path).join(", ")}`);
    if (!found && fs.existsSync(worktree)) throw new Error(`${worktree} exists but holds no work the plan found for #${number}`);
    const existing = entry.branch ?? found?.branch;
    if (branch !== existing) throw new Error(`--branch must be the existing branch ${existing}`);
    continues = { pr: entry.pr ?? null, rounds: entry.rounds ?? 0, worktreeExists: Boolean(found), evidence };
  } else {
    if (Number(BRANCH.exec(branch ?? "")?.[1]) !== number) throw new Error(`--branch must be <type>/${number}-<slug>`);
    if (fs.existsSync(worktree)) throw new Error(`${worktree} already exists; adopt the work in it instead of starting a second writer`);
  }
  const sameTree = Object.entries(record.tickets).find(([n, t]) => Number(n) !== number && [t.owner, t.pending].some((o) => o && path.resolve(o.worktree) === path.resolve(worktree)));
  if (sameTree) throw new Error(`${worktree} is assigned to #${sameTree[0]}`);
  if (retiredReason(start.route, defaults)) throw new Error(`${retiredReason(start.route, defaults)}; plan again`);
  const ticket = ticketOf(record, number);
  assertFree(ticket, number);
  const permissionMode = routeVendor(start.model) === "claude" ? record.coordinator.permissionMode ?? null : null;
  ticket.pending = { operation: "dispatch", launchId: randomUUID(), route: start.route, model: start.model, effort: start.effort, coordinator: record.coordinator.session, ...(permissionMode && { permissionMode }), worktree, branch, artifactParent, host, reportFields: [...REPORT_FIELDS], ...(continues && { continues }), time: new Date().toISOString() };
  log(record, { dispatch: "dispatch-intent", continue: "continue-intent" }[operation], { ticket: number, route: start.route, launchId: ticket.pending.launchId, ...(continues && { continues }) });
  return ticket.pending;
}

const settledStart = (pending, fields) => ({ pending, ...fields, ...(pending.continues && { priorEnded: pending.continues.evidence }) });

const BRIEFED = /coordinated by coordinator session (\S+?) on /;
const toldCoordinator = (pending, text, record) => (typeof text === "string" && BRIEFED.exec(text)?.[1]) || pending.coordinator || record.coordinator.session;
const sentBrief = (via, text) => ({ state: "delivered", via, ...(text !== undefined && { text }), deliveryId: randomUUID().slice(0, 8), attempts: 1, time: new Date().toISOString() });
const ownerFrom = (pending, handle, brief, coordinator) => ({ route: pending.route, model: pending.model, effort: pending.effort, coordinator, ...(pending.permissionMode && { permissionMode: pending.permissionMode }), worktree: pending.worktree, branch: pending.branch, artifactParent: pending.artifactParent, launchId: pending.launchId, ...(pending.reportFields && { reportFields: pending.reportFields }), handle, verified: false, ...(brief && { brief: { ...brief, coordinator } }), ...(pending.continues && { continues: pending.continues }), since: new Date().toISOString() });

function assertStartable(record, pending, host) {
  if (record.handoff) throw new Error(`A planned handoff stopped new starts at ${record.handoff.since}; nothing was started`);
  if (pending.host && pending.host !== host) throw new Error(`This start was claimed on ${pending.host}; it runs, or is settled, only on that host`);
}
function assertObservedOn(pending, number, host, observedOn, action) {
  const claimedOn = pending.host;
  if (claimedOn && claimedOn !== host && observedOn !== claimedOn) throw new Error(`#${number}'s start was claimed on ${claimedOn}; ${action} it only with evidence observed there, naming that host with --observed-on ${claimedOn}`);
}

export function launched(record, { ticket: number, handleKind, handle, observedOn, host = os.hostname() }) {
  const ticket = ticketOf(record, number);
  if (!ticket.pending) throw new Error(`#${number} has no pending start to confirm`);
  assertObservedOn(ticket.pending, number, host, observedOn, "confirm");
  if (ticket.pending.route === "claude-cli") throw new Error("A detached CLI writer is started with launch and confirmed with reconcile");
  if (!["session", "task"].includes(handleKind) || !handle) throw new Error("--handle-kind must be session or task, with --handle naming it");
  ticket.owner = ownerFrom(ticket.pending, { kind: handleKind, id: handle, host: ticket.pending.host ?? host }, sentBrief("start"), toldCoordinator(ticket.pending, undefined, record));
  log(record, "launched", { ticket: number, launchId: ticket.pending.launchId, handle: ticket.owner.handle });
  ticket.pending = null;
  return ticket.owner;
}

export function adopt(record, { plan, ticket: number, handleKind, handle, pid, session, route, model, effort, worktree, branch, host = os.hostname(), identify = processIdentity }) {
  const entry = planEntry(plan, record, number, ["adopt-pr", "adopt-worktree", "await-maintainer", "merge-gate", "done", "decision-needed"]);
  if (["done", "decision-needed"].includes(entry.action) && !entry.reserves) throw new Error(`The plan's action for #${number} is ${entry.action} with no unsettled writer to adopt`);
  if (!Object.hasOwn(writerRoutes, route) || typeof model !== "string" || !writerEfforts(model).includes(effort)) throw new Error("--route, --model and --effort must describe the existing writer");
  if (!path.isAbsolute(worktree ?? "")) throw new Error("--worktree must be the existing writer's absolute worktree path");
  const found = entry.worktrees?.find((w) => path.resolve(w.path) === path.resolve(worktree));
  if ((entry.action === "adopt-worktree" || ["done", "decision-needed"].includes(entry.action)) && !found) throw new Error(`--worktree must be one the plan found for #${number}: ${entry.worktrees.map((w) => w.path).join(", ")}`);
  const ticket = ticketOf(record, number);
  assertFree(ticket, number);
  let h;
  if (handleKind === "process") {
    const identity = identify(Number(pid));
    if (!identity) throw new Error(`Process ${pid} is not running; it cannot own #${number}`);
    h = { kind: "process", ...identity, host };
    if (session !== undefined && !new RegExp(`^${UUID}$`, "i").test(session)) throw new Error("--session must be the adopted process's session id");
  } else if (["session", "task"].includes(handleKind) && handle) h = { kind: handleKind, id: handle, host };
  else throw new Error("--handle-kind must be session, task or process");
  ticket.owner = { route, model, effort, ...(entry.effort && { requestedEffort: entry.effort }), worktree, branch: branch ?? entry.branch ?? found?.branch ?? null, artifactParent: null, handle: h, ...(h.kind === "process" && session && { sessionId: session }), verified: false, adopted: { pr: entry.pr ?? null, rounds: entry.rounds ?? 0 }, since: new Date().toISOString() };
  log(record, "adopted", { ticket: number, handle: h, pr: entry.pr ?? null, rounds: entry.rounds ?? 0 });
  return ticket.owner;
}

export function withdraw(record, { ticket: number, evidence, observedOn, host = os.hostname() }) {
  const ticket = ticketOf(record, number);
  if (!ticket.pending) throw new Error(`#${number} has nothing pending`);
  if (!evidence) throw new Error("--evidence must say why no writer started (the observation that found none)");
  assertObservedOn(ticket.pending, number, host, observedOn, "withdraw");
  log(record, "withdrawn", { ticket: number, launchId: ticket.pending.launchId, evidence, ...(observedOn && { observedOn }) });
  ticket.history.push(settledStart(ticket.pending, { withdrawn: evidence, ...(observedOn && { observedOn }) }));
  ticket.pending = null;
}

export function verify(record, { ticket: number, preflight: file }) {
  const ticket = ticketOf(record, number), owner = ticket.owner;
  if (!owner) throw new Error(`#${number} has no owner to verify`);
  const result = readJson(file);
  if (result.route !== owner.route || result.model !== owner.model) throw new Error(`The confirmation is for ${result.route} ${result.model}, not ${owner.route} ${owner.model}`);
  const requested = owner.requestedEffort ?? owner.effort;
  const verdict = result.verdicts?.find((v) => v.ticket === number && v.effort === requested);
  if (verdict?.verdict === "confirmed") { owner.verified = true; if (!owner.mismatchBy || owner.mismatchBy === "preflight") { delete owner.mismatch; delete owner.mismatchBy; } }
  else if (verdict?.verdict === "blocked") { owner.verified = false; recordMismatch(owner, "preflight", verdict.reason); }
  else throw new Error(`The confirmation has no observed verdict for #${number} at the ticket's effort ${requested}`);
  log(record, owner.verified ? "verified" : "mismatch", { ticket: number, ...(owner.mismatch && { reason: owner.mismatch }) });
  return owner;
}

export function release(record, { ticket: number, observations, evidence, host = os.hostname(), identify = processIdentity }) {
  const ticket = ticketOf(record, number), owner = ticket.owner;
  if (!owner) throw new Error(`#${number} has no owner to release`);
  if (owner.resuming) throw new Error(`Resume ${owner.resuming.id} of #${number}'s writer has no recorded outcome, and the resumed writer may still run; settle it with reconcile before release`);
  const s = ownerStatus(owner, observations, { host, identify });
  if (s.status !== "exited") throw new Error(`#${number}'s writer is ${s.status} (${s.reason}); only a writer observed to have ended is released`);
  const closed = openRequests(ticket);
  for (const r of closed) r.closed = { time: new Date().toISOString(), reason: "its writer was released" };
  noteSession(owner);
  ticket.history.push({ owner, released: `${s.reason}${evidence ? `; ${evidence}` : ""}`, time: new Date().toISOString() });
  ticket.owner = null;
  log(record, "released", { ticket: number, reason: s.reason, ...(closed.length && { closedRequests: closed.map((r) => r.id) }) });
}

function noteSession(owner) {
  if (!owner || owner.sessionId || owner.handle?.kind !== "process" || !owner.handle.launchDir) return;
  try { owner.sessionId = streamSession(owner.handle.launchDir); } catch {}
}

export function writerSession(record, { ticket: number, writer, session, evidence }) {
  if (!new RegExp(`^${UUID}$`, "i").test(session ?? "") || !evidence) throw new Error("--session must be the writer's session id and --evidence say where it was read");
  const ticket = ticketOf(record, number);
  const o = [ticket.owner, ...(ticket.history ?? []).map((h) => h.owner)].find((x) => x?.handle?.kind === "process" && String(x.launchId ?? x.handle.pid) === String(writer));
  if (!o) throw new Error(`#${number} has no writer ${writer} held by its process (give its assignment id, or the process id of one adopted by its process)`);
  if (o.sessionId && o.sessionId !== session) throw new Error(`#${number}'s writer ${writer} is already recorded as session ${o.sessionId}`);
  o.sessionId = session;
  o.sessionEvidence = evidence;
  log(record, "writer-session", { ticket: number, writer: String(writer), session, evidence });
}

export const REPORT_FIELDS = ["model", "effort", "permissionMode", "pr", "reviewedHead", "rounds", "findings", "verification", "ci", "filed", "next"];
const reportFieldsOf = (ticket) => (ticket.owner ?? ticket.history?.at(-1)?.owner)?.reportFields ?? REPORT_FIELDS.filter((f) => f !== "filed");

function recordMismatch(owner, by, reason) {
  if (owner.mismatch && owner.mismatchBy !== by) return;
  owner.mismatch = reason;
  owner.mismatchBy = by;
}

function confirmationGap(owner, { model, effort, permissionMode }, wantedEffort = owner.effort) {
  const wantedMode = owner.permissionMode ?? null;
  if (model === owner.model && effort === wantedEffort && (!wantedMode || permissionMode === wantedMode)) return null;
  return `${model} at ${effort}${permissionMode ? ` in ${permissionMode}` : ""}, not ${owner.model} at ${wantedEffort}${wantedMode ? ` in ${wantedMode}` : ""}`;
}

export function acknowledged(record, { ticket: number, model, effort, permissionMode, evidence }) {
  const owner = ticketOf(record, number).owner;
  if (!owner) throw new Error(`#${number} has no writer to have acknowledged`);
  if (!model || !effort || !evidence) throw new Error("--model and --effort must give what the writer confirmed from its own metadata, and --evidence where its acknowledgement was read");
  const confirmed = { model, effort, permissionMode: permissionMode ?? null };
  noteSession(owner);
  owner.acknowledged = { time: new Date().toISOString(), confirmed, evidence, ...(owner.brief && { deliveryId: owner.brief.deliveryId }) };
  const gap = confirmationGap(owner, confirmed, owner.requestedEffort ?? owner.effort);
  if (gap) recordMismatch(owner, "acknowledgement", `the writer confirmed ${gap}`);
  log(record, "acknowledged", { ticket: number, confirmed, ...(gap && { mismatch: owner.mismatch }) });
}

const ownerId = (owner) => owner?.launchId ?? owner?.handle?.id ?? owner?.handle?.pid ?? null;
const handleId = (owner) => owner?.handle?.id ?? owner?.handle?.pid ?? null;
const openRequests = (own) => (own.requests ?? []).filter((r) => !r.closed && r.answer?.state !== "delivered" && own.owner && (r.owner === ownerId(own.owner) || r.owner === handleId(own.owner)));
function requestNext(r, ended) {
  if (r.answer?.state === "intent") return `answer ${r.answer.deliveryId} to request ${r.id} has no recorded outcome and may still be queued; ${ended ? "if the writer's transcript shows it, record answered with that evidence; otherwise " : ""}wait, or resend with answer --retry, which tells the writer to ignore a second copy`;
  if (r.relayed) return `request ${r.id} "${r.text}" was relayed to ${r.relayed.to} at ${r.relayed.time}; once they decide, record answer and send it`;
  return `the writer asked ${r.id}: "${r.text}"; decide or relay it, then record answer, send it and record answered`;
}
const findRequest = (record, number, id) => {
  const ticket = ticketOf(record, number), r = ticket.requests?.find((q) => q.id === id);
  if (!r) throw new Error(`#${number} has no request ${id}`);
  if (r.closed) throw new Error(`Request ${id} closed: ${r.closed.reason}`);
  return r;
};
export function request(record, { ticket: number, text, source }) {
  if (!text || !source) throw new Error("--text must quote the writer's request and --source say where it was read");
  const ticket = ticketOf(record, number);
  if (!ticket.owner) throw new Error(`#${number} has no writer to have asked`);
  noteSession(ticket.owner);
  const id = randomUUID().slice(0, 8);
  (ticket.requests ??= []).push({ id, owner: ownerId(ticket.owner), time: new Date().toISOString(), text, source, relayed: null, answer: null });
  log(record, "request", { ticket: number, id });
  return { id };
}
export function relay(record, { ticket: number, request: id, to }) {
  const r = findRequest(record, number, id);
  if (!to) throw new Error("--to must name who decides, such as the maintainer");
  if (r.answer) throw new Error(`Request ${id} already has an answer at ${r.answer.state}`);
  r.relayed = { time: new Date().toISOString(), to };
  log(record, "relayed", { ticket: number, id, to });
}
const contactLine = (to, host) => `Your coordinator is now session ${to} on ${host}; send every further report, blocker and question there. This holds even if you set the rest of this message aside as a copy you already have.`;

export function answer(record, { ticket: number, request: id, text, retry = false }) {
  const r = findRequest(record, number, id);
  if (r.answer?.state === "delivered") throw new Error(`Request ${id} was already answered at ${r.answer.time}`);
  if (r.answer?.state === "intent" && !retry) throw new Error(`Answer ${r.answer.deliveryId} to request ${id} has no recorded outcome; settle it from the writer's transcript, or resend with --retry`);
  if (!r.answer && retry) throw new Error(`Request ${id} has no answer to retry`);
  const words = retry ? r.answer.text : text;
  if (!words) throw new Error("--text must give the answer");
  const owner = ticketOf(record, number).owner, to = record.coordinator.session;
  r.answer = { state: "intent", text: words, deliveryId: randomUUID().slice(0, 8), attempts: (r.answer?.attempts ?? 0) + 1, time: new Date().toISOString(), to };
  log(record, "answer-intent", { ticket: number, id, deliveryId: r.answer.deliveryId, attempt: r.answer.attempts });
  const moved = owner?.coordinator && owner.coordinator !== to ? `\n${contactLine(to, record.coordinator.host)}` : "";
  return { message: `Answer to your request ${id}, which asked: "${r.text}" (delivery ${r.answer.deliveryId}):\n${words}\nIf you already received an answer to request ${id}, ignore this copy.${moved}` };
}
export function answered(record, { ticket: number, request: id, evidence }) {
  const r = findRequest(record, number, id);
  if (r.answer?.state !== "intent") throw new Error(`Request ${id}'s answer is at ${r.answer?.state ?? "no step"}; record answer before sending it`);
  r.answer = { ...r.answer, state: "delivered", time: new Date().toISOString(), ...(evidence && { evidence }) };
  const owner = ticketOf(record, number).owner;
  if (owner?.coordinator && r.answer.to) moveContact(owner, r.answer.to);
  log(record, "answered", { ticket: number, id, deliveryId: r.answer.deliveryId });
}

function moveContact(owner, to) {
  if (owner.brief && !owner.brief.coordinator && owner.coordinator) owner.brief.coordinator = owner.coordinator;
  owner.coordinator = to;
}

export function contact(record, { ticket: number, retry = false, defaults = readWriterDefaults() }) {
  const owner = ticketOf(record, number).owner, to = record.coordinator.session;
  if (!owner?.coordinator) throw new Error(`#${number} has no writer this run briefed`);
  if (owner.coordinator === to) throw new Error(`#${number}'s writer already reports to ${to}`);
  if (owner.contact?.state === "intent" && !retry) throw new Error(`Contact notice ${owner.contact.deliveryId} to #${number}'s writer has no recorded outcome; settle it from the writer's transcript, or resend with --retry`);
  if (retry && owner.contact?.state !== "intent") throw new Error(`#${number} has no contact notice to retry`);
  owner.contact = { state: "intent", to, deliveryId: randomUUID().slice(0, 8), attempts: (owner.contact?.attempts ?? 0) + 1, time: new Date().toISOString() };
  log(record, "contact-intent", { ticket: number, to, deliveryId: owner.contact.deliveryId, attempt: owner.contact.attempts });
  const how = defaults.routes[routeVendor(owner.model)]?.find((r) => r.route === owner.route)?.reports?.[record.coordinator.harness];
  const way = how?.mechanism ? ` as a cross-session message (${how.mechanism})` : `; ${how?.unsupported ?? "this route cannot message it"}, so end each decision point with the report as your turn's last message, and ${defaults.reportFallback}`;
  return { message: `Assignment ${owner.launchId} (contact notice ${owner.contact.deliveryId}): your coordinator is now session ${to} on ${record.coordinator.host}, which took over from ${owner.coordinator}. Send every further report, blocker and question to ${to}${way}. A second copy of this notice says the same and needs nothing more.` };
}
export function contacted(record, { ticket: number, evidence }) {
  const owner = ticketOf(record, number).owner;
  if (owner?.contact?.state !== "intent") throw new Error(`#${number}'s contact notice is at ${owner?.contact?.state ?? "no step"}; record contact before sending it`);
  owner.contact = { ...owner.contact, state: "delivered", time: new Date().toISOString(), ...(evidence && { evidence }) };
  moveContact(owner, owner.contact.to);
  log(record, "contacted", { ticket: number, to: owner.contact.to, deliveryId: owner.contact.deliveryId });
}
export function result(record, { ticket: number, report: file }) {
  const report = readJson(file);
  const ticket = ticketOf(record, number);
  const missing = reportFieldsOf(ticket).filter((f) => report?.[f] === undefined);
  if (missing.length) throw new Error(`The writer's report lacks ${missing.join(", ")}; ask the writer for them`);
  if (report.filed !== undefined) checkFiledField(report.filed);
  ticket.results.push({ time: new Date().toISOString(), report });
  if (ticket.owner) noteSession(ticket.owner);
  const gap = ticket.owner && confirmationGap(ticket.owner, report);
  if (gap) recordMismatch(ticket.owner, "report", `the writer reported ${gap}`);
  log(record, "result", { ticket: number, pr: report.pr, reviewedHead: report.reviewedHead, ...(gap && { mismatch: ticket.owner.mismatch }) });
  const named = filedNumbers(report.filed).filter((n) => !record.filed?.[n]);
  if (report.filed === undefined) return { filed: `the report lists no filed tickets; read what #${number}'s writer filed from GitHub (its PR report's Notes for reviewers, and tickets whose provenance line names #${number}'s PR) and record each with filed` };
  if (named.length) return { filed: `the report names ${named.map((n) => `#${n}`).join(", ")} as filed; confirm each on GitHub and record it with filed` };
}

export const FILED_OUTCOMES = ["completes", "needed", "separate", "maintainer"];

const isTicketNumber = (n) => Number.isSafeInteger(n) && n > 0;
export function checkFiledField(value) {
  if (typeof value === "string" && /^none\.?$/i.test(value.trim())) return;
  if (Array.isArray(value) && value.every((x) => isTicketNumber(x) || (typeof x === "object" && x !== null && isTicketNumber(x.number)))) return;
  throw new Error(`The report's filed field must be "None" or a list of entries, each a ticket number or { "number": N, "reading": "<how it relates to the fix>" }, not ${JSON.stringify(value)}; ask the writer for it in that shape`);
}
export const filedNumbers = (value) => (Array.isArray(value) ? [...new Set(value.map((x) => (typeof x === "object" && x !== null ? x.number : x)).filter(isTicketNumber))] : []);

const filedEntry = (record, number) => {
  const entry = record.filed?.[number];
  if (!entry) throw new Error(`#${number} is not recorded as filed during the run; record it with filed first`);
  return entry;
};

export function filed(record, { filed: number, ticket: from, pr, source, reading }) {
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error("--filed must be the filed ticket's number");
  if (!source) throw new Error("--source must say where GitHub confirms the ticket was filed during the run (the PR report's Notes for reviewers, or the ticket's provenance line)");
  if (number === record.issue) throw new Error(`#${number} is the parent issue`);
  if (from !== undefined && from === number) throw new Error(`#${number} cannot have been filed from its own fix`);
  if (record.filed?.[number]) throw new Error(`#${number} was already recorded as filed at ${record.filed[number].time}`);
  if (record.filedDismissed?.[number]) throw new Error(`#${number} was dismissed at ${record.filedDismissed[number].time} as no ticket a writer filed or reused (${record.filedDismissed[number].evidence})`);
  (record.filed ??= {})[number] ={ number, from: from ?? null, pr: pr ?? null, source, reading: reading ?? null, time: new Date().toISOString(), outcome: null };
  log(record, "filed", { filed: number, from: from ?? null, pr: pr ?? null });
}

export function dismiss(record, { filed: number, ticket: from, evidence }) {
  if (!isTicketNumber(number) || !evidence) throw new Error("--filed must be the number the report names and --evidence say what GitHub shows: that it is no ticket the writer filed or reused");
  if (record.filed?.[number]) throw new Error(`#${number} is recorded as filed during the run; triage it instead`);
  const named = Object.entries(record.tickets ?? {}).filter(([, t]) => (t.results ?? []).some((r) => filedNumbers(r.report?.filed).includes(number))).map(([n]) => Number(n));
  if (!named.length) throw new Error(`No writer's report names #${number} as filed`);
  if (from !== undefined && !named.includes(from)) throw new Error(`#${from}'s writer's report does not name #${number}; ${named.map((n) => `#${n}`).join(", ")} ${named.length > 1 ? "do" : "does"}`);
  (record.filedDismissed ??= {})[number] = { number, from: from ?? named[0], evidence, time: new Date().toISOString() };
  log(record, "filed-dismissed", { filed: number, from: from ?? named[0] });
}

export function triage(record, { filed: number, outcome: kind, slice, under, reason, question }) {
  const entry = filedEntry(record, number);
  if (!FILED_OUTCOMES.includes(kind)) throw new Error(`--outcome must be ${FILED_OUTCOMES.join(", ")}`);
  let outcome;
  if (kind === "completes") {
    if (!Number.isSafeInteger(slice) || !reason) throw new Error("--slice must name the slice whose fix the ticket completes, and --reason say how (the same root cause, code it would replace or remove, or a workaround it names)");
    outcome = { kind, slice, reason };
  } else if (kind === "needed") {
    if (!Number.isSafeInteger(under) || !reason) throw new Error("--under must name the issue in the parent's tree it was attached under, and --reason what of the parent's goal or criteria needs it");
    outcome = { kind, under, reason };
  } else if (kind === "separate") {
    if (!reason) throw new Error("--reason must say why the ticket is separate work");
    if (under !== undefined && !Number.isSafeInteger(under)) throw new Error("--under must be an issue number");
    outcome = { kind, reason, ...(under !== undefined && { under }) };
  } else {
    if (!question) throw new Error("--question must give the question raised with the maintainer");
    if (slice !== undefined && !Number.isSafeInteger(slice)) throw new Error("--slice must be the number of the slice whose PR holds on the answer");
    outcome = { kind, question, ...(slice !== undefined && { slice }) };
  }
  const previous = entry.outcome;
  entry.outcome = { ...outcome, time: new Date().toISOString() };
  log(record, "triaged", { filed: number, outcome: kind, ...(previous && { replaced: previous.kind }) });
}

export function interim(record, { filed: number, decision, evidence }) {
  const entry = filedEntry(record, number);
  if (!decision || !evidence) throw new Error("--decision must quote the maintainer's decision and --evidence say where it was read");
  const o = entry.outcome;
  if (!o || !(o.kind === "completes" || (o.kind === "maintainer" && o.slice !== undefined))) throw new Error(`#${number} is not triaged as completing a slice's fix`);
  entry.outcome = { kind: "completes", slice: o.slice, reason: o.reason ?? o.question, interim: { decision, evidence, time: new Date().toISOString() }, time: new Date().toISOString() };
  log(record, "interim", { filed: number, slice: o.slice });
}

export const completingTickets = (record, slice) => Object.values(record.filed ?? {}).filter((e) => e.outcome && (e.outcome.kind === "completes" || e.outcome.kind === "maintainer") && e.outcome.slice === slice && !e.outcome.interim);

export function filedActions(record) {
  const out = [];
  for (const e of Object.values(record.filed ?? {})) if (!e.outcome) out.push({ number: e.number, action: "triage-filed", reason: `filed during the run${e.from ? ` from #${e.from}'s fix${e.pr ? ` (PR #${e.pr})` : ""}` : " by the coordinator"}, with no triage outcome; read it against the PR it came from and record triage`, ...(e.from && { from: e.from }) });
  const named = new Map();
  for (const [n, t] of Object.entries(record.tickets ?? {})) for (const r of t.results ?? []) for (const f of filedNumbers(r.report?.filed)) if (!record.filed?.[f] && !record.filedDismissed?.[f] && !named.has(f)) named.set(f, Number(n));
  for (const [f, from] of named) out.push({ number: f, action: "confirm-filed", reason: `#${from}'s writer reports it filed it; confirm on GitHub that it was filed during the run, then record it with filed and triage it, or, when GitHub shows the writer neither filed nor reused it, record dismiss with that evidence`, from });
  return out.sort((a, b) => a.number - b.number);
}

export function diskRecovery(record, { removed, branch, classifier }) {
  if (!removed || !classifier) throw new Error("--removed and --classifier must name the removed path and the classifier's merged-and-removable row");
  record.diskRecoveries.push({ time: new Date().toISOString(), removed, branch: branch ?? null, classifier });
  log(record, "disk-recovery", { removed });
}

const UNSAFE = /["'%^&|<>!`$\r\n]/;
export function checkLaunchArgs(args, pending) {
  for (const arg of args) if (UNSAFE.test(arg)) throw new Error(`Launch argument ${JSON.stringify(arg)} holds a character the command line would interpret`);
  const only = (flag) => { const at = args.flatMap((a, i) => (a === flag ? [i] : [])); if (at.length !== 1) throw new Error(`The launch needs exactly one ${flag}`); return args[at[0] + 1]; };
  if (only("--model") !== pending.model) throw new Error(`The launch's --model must be ${pending.model}`);
  if (only("--effort") !== pending.effort) throw new Error(`The launch's --effort must be ${pending.effort}`);
  if (!pending.permissionMode) throw new Error("The claim recorded no permission mode; withdraw it and claim again");
  if (only("--permission-mode") !== pending.permissionMode) throw new Error(`The launch's --permission-mode must be ${pending.permissionMode}, the mode the claim requested`);
}

function createThroughWmi(commandLine, cwd, exec) {
  const script = `$s = New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ ShowWindow = [uint16]0 }; $r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $env:LAUNCH_COMMAND; CurrentDirectory = $env:LAUNCH_CWD; ProcessStartupInformation = $s }; "$($r.ReturnValue) $($r.ProcessId)"`;
  const reply = exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8", windowsHide: true, env: { ...process.env, LAUNCH_COMMAND: commandLine, LAUNCH_CWD: cwd } }).trim();
  return reply.split(" ").map(Number);
}

export function startDetachedWriter({ executable, args, cwd, launchDir }, { exec = execFileSync, platform = process.platform } = {}) {
  const prompt = path.join(launchDir, "prompt.txt"), out = path.join(launchDir, "out.jsonl"), err = path.join(launchDir, "err.log");
  if (platform === "win32") {
    const quoted = [executable, ...args].map((a) => `"${a}"`).join(" ");
    const commandLine = `cmd.exe /d /s /c "${quoted} < "${prompt}" 1> "${out}" 2> "${err}""`;
    const [code, pid] = createThroughWmi(commandLine, cwd, exec);
    if (code !== 0) return { started: false, reason: `Win32_Process.Create returned ${code}` };
    return { started: true, pid };
  }
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^CLAUDE/i.test(key)));
  const quote = (a) => `'${a}'`;
  const child = spawnDetachedProcess("/bin/sh", ["-c", `${[executable, ...args].map(quote).join(" ")} < ${quote(prompt)} > ${quote(out)} 2> ${quote(err)}; echo $? > ${quote(path.join(launchDir, "exit.txt"))}`], { cwd, env, stdio: "ignore" });
  child.unref();
  return { started: true, pid: child.pid };
}

export const launchDirOf = (pending, number) => path.join(pending.artifactParent, `launch-${number}-${pending.launchId}`);

export function launch(record, { ticket: number, executable, args = [], prompt, host = os.hostname(), identify = processIdentity, spawner = startDetachedWriter }) {
  const ticket = ticketOf(record, number), pending = ticket.pending;
  if (!pending || pending.operation !== "dispatch" || pending.route !== "claude-cli") throw new Error(`#${number} has no pending claude-cli dispatch to launch`);
  assertStartable(record, pending, host);
  if (!path.isAbsolute(executable ?? "") || UNSAFE.test(executable) || !path.isAbsolute(prompt ?? "")) throw new Error("--executable and --prompt must be absolute paths");
  checkLaunchArgs(args, pending);
  const launchDir = launchDirOf(pending, number);
  if (UNSAFE.test(launchDir) || UNSAFE.test(record.checkout)) throw new Error(`${launchDir} holds a character the command line would interpret`);
  if (fs.existsSync(launchDir)) throw new Error(`Launch ${pending.launchId} was already attempted; reconcile it`);
  fs.mkdirSync(launchDir, { recursive: true });
  fs.copyFileSync(prompt, path.join(launchDir, "prompt.txt"));
  let outcome;
  try { outcome = spawner({ executable, args: [...args, "--add-dir", launchDir], cwd: record.checkout, launchDir }); }
  catch (error) { throw new Error(`The outcome of launch ${pending.launchId} is uncertain (${error.message}); it stays pending, and reconcile settles it before any retry`); }
  if (!outcome.started) {
    log(record, "launch-failed", { ticket: number, launchId: pending.launchId, reason: outcome.reason });
    ticket.history.push(settledStart(pending, { failed: outcome.reason }));
    ticket.pending = null;
    return { started: false, reason: outcome.reason };
  }
  const identity = identify(outcome.pid);
  const sent = fs.readFileSync(path.join(launchDir, "prompt.txt"), "utf8");
  ticket.owner = ownerFrom(pending, { kind: "process", pid: outcome.pid, start: identity?.start ?? null, host, launchDir }, sentBrief("prompt", sent), toldCoordinator(pending, sent, record));
  log(record, "launched", { ticket: number, launchId: pending.launchId, handle: ticket.owner.handle });
  ticket.pending = null;
  return { started: true, owner: ticket.owner };
}

const step = (holder, name, state, detail = {}) => { (holder.steps ??= []).push({ step: name, state, time: new Date().toISOString(), ...detail }); };
const lastOpenStep = (owner) => owner?.opened?.steps?.at(-1) ?? null;

export function streamSession(launchDir) {
  const out = path.join(launchDir ?? "", "out.jsonl");
  if (!launchDir || !fs.existsSync(out)) throw new Error(`No stream at ${out}; only a detached CLI writer's session can be opened`);
  for (const line of fs.readFileSync(out, "utf8").split(/\r?\n/)) {
    let row;
    try { row = JSON.parse(line); } catch { continue; }
    if (row?.type === "system" && row.subtype === "init") {
      if (!new RegExp(`^${UUID}$`, "i").test(row.session_id ?? "")) throw new Error(`The init line of ${out} names no session id`);
      return row.session_id;
    }
  }
  throw new Error(`${out} has no init line naming the writer's session`);
}

function savedIntent(file, coordinator, intent, number, afterIntent) {
  if (!afterIntent) return;
  try { afterIntent(); }
  catch (error) {
    updateRecord(file, { expectRevision: intent.record.revision, coordinator }, (r) => { step(ticketOf(r, number).owner.opened, "open", "failed", { reason: `not run: ${error.message}` }); });
    throw error;
  }
}

export function runHandoff({ executable, sessionId, cwd }, { exec = execFileSync, platform = process.platform } = {}) {
  if (platform !== "win32") throw new Error(`handing a session to the desktop app is verified only on Windows, not ${platform}`);
  const commandLine = `cmd.exe /d /c ""${executable}" --desktop --resume ${sessionId}"`;
  const [code, pid] = createThroughWmi(commandLine, cwd, exec);
  return code === 0 ? { requested: true, pid } : { requested: false, reason: `Win32_Process.Create returned ${code}` };
}

export function openWriter(file, { coordinator, expectRevision, ticket: number, executable, runner = runHandoff, host = os.hostname(), identify = processIdentity, census = processCensus, afterIntent }) {
  if (!path.isAbsolute(executable ?? "") || UNSAFE.test(executable)) throw new Error("--executable must be the absolute Claude CLI path");
  const intent = updateRecord(file, { expectRevision, coordinator }, (r) => {
    if (r.handoff) throw new Error(`A planned handoff stopped new work at ${r.handoff.since}; nothing was opened`);
    const owner = ticketOf(r, number).owner;
    if (owner?.route !== "claude-cli" || owner.handle.kind !== "process") throw new Error(`#${number} has no detached claude-cli writer to open`);
    if (owner.handle.host && owner.handle.host !== host) throw new Error(`#${number}'s writer runs on ${owner.handle.host}; open it there`);
    const s = ownerStatus(owner, {}, { host, identify, census });
    if (s.status !== "exited") throw new Error(`#${number}'s writer is ${s.status} (${s.reason}); only an idle writer, whose turn has ended, is opened in the app`);
    const last = lastOpenStep(owner);
    if (last && last.state !== "failed") throw new Error(`#${number}'s writer was already opened (open ${last.state}); settle that open, and never run it twice`);
    owner.opened = { sessionId: streamSession(owner.handle.launchDir), steps: owner.opened?.steps ?? [] };
    step(owner.opened, "open", "intent");
  });
  savedIntent(file, coordinator, intent, number, afterIntent);
  const sessionId = intent.record.tickets[number].owner.opened.sessionId;
  let outcome;
  try { outcome = runner({ executable, sessionId, cwd: intent.record.checkout }); }
  catch (error) { outcome = { requested: false, uncertain: true, reason: error.message }; }
  const done = updateRecord(file, { expectRevision: intent.record.revision, coordinator }, (r) => {
    const opened = ticketOf(r, number).owner.opened;
    step(opened, "open", outcome.requested ? "requested" : outcome.uncertain ? "uncertain" : "failed", outcome.requested ? {} : { reason: outcome.reason });
    log(r, "open", { ticket: number, sessionId, requested: Boolean(outcome.requested) });
  });
  return { revision: done.record.revision, sessionId, ...outcome };
}

export function opened(record, { ticket: number, session }) {
  const owner = ticketOf(record, number).owner, last = lastOpenStep(owner);
  if (!last || !["requested", "intent", "uncertain"].includes(last.state) || owner.opened.session) throw new Error(`#${number} has no open to confirm${last ? ` (open ${last.state})` : ""}`);
  const expected = `local_${owner.opened.sessionId}`;
  if (session !== expected) throw new Error(`--session must be ${expected}, the app's id for the session that was opened`);
  owner.opened.session = session;
  step(owner.opened, "open", "confirmed", { session, ...(last.state !== "requested" && { after: `open ${last.state}` }) });
  log(record, "opened", { ticket: number, session });
}

export function deliver(record, { ticket: number, retry = false }) {
  const owner = ticketOf(record, number).owner;
  if (record.handoff) throw new Error(`A planned handoff stopped new starts at ${record.handoff.since}; the brief to #${number}'s writer waits for the next coordinator`);
  if (!retry) throw new Error("The brief went with the writer's start; resend it with deliver --retry");
  if (!owner?.brief) throw new Error(`#${number} has no writer this coordinator briefed; an existing writer adopted with its work already has its assignment`);
  if (owner.acknowledged) throw new Error(`#${number}'s writer acknowledged its brief at ${owner.acknowledged.time}`);
  const to = record.coordinator.session;
  const text = typeof owner.brief.text === "string" ? namingCoordinator(owner, record, owner.brief.text) : undefined;
  owner.brief = { ...owner.brief, ...(text !== undefined && { text, coordinator: to }), to, state: "intent", deliveryId: randomUUID().slice(0, 8), attempts: (owner.brief.attempts ?? 1) + 1, time: new Date().toISOString() };
  log(record, "brief-intent", { ticket: number, handle: owner.handle, deliveryId: owner.brief.deliveryId, attempt: owner.brief.attempts });
  if (typeof owner.brief.text !== "string") return { message: null, resend: `the start kept no copy of the brief; send the writer its start prompt again by its route's own means, naming assignment ${owner.launchId}, then record delivered` };
  return { message: `${assignmentHeader(owner)}\n${owner.brief.text}` };
}
export function delivered(record, { ticket: number, evidence }) {
  const owner = ticketOf(record, number).owner;
  if (owner?.brief?.state !== "intent") throw new Error(`#${number}'s brief is at ${owner?.brief?.state ?? "no step"}; record deliver before sending it`);
  owner.brief = { ...owner.brief, state: "delivered", time: new Date().toISOString(), ...(evidence && { evidence }) };
  log(record, "brief-delivered", { ticket: number, handle: owner.handle, deliveryId: owner.brief.deliveryId });
}

const resumeDirOf = (owner, number, id) => path.join(owner.artifactParent, `resume-${number}-${id}`);
export function resumeWriter(file, { coordinator, expectRevision, ticket: number, executable, args = [], prompt, host = os.hostname(), identify = processIdentity, census = processCensus, spawner = startDetachedWriter, afterIntent }) {
  if (!path.isAbsolute(executable ?? "") || UNSAFE.test(executable) || !path.isAbsolute(prompt ?? "")) throw new Error("--executable and --prompt must be absolute paths");
  const intent = updateRecord(file, { expectRevision, coordinator }, (r) => {
    if (r.handoff) throw new Error(`A planned handoff stopped new work at ${r.handoff.since}; nothing was resumed`);
    const owner = ticketOf(r, number).owner;
    if (owner?.route !== "claude-cli" || owner.handle.kind !== "process" || !owner.artifactParent) throw new Error(`#${number} has no detached claude-cli writer to resume`);
    if (owner.handle.host && owner.handle.host !== host) throw new Error(`#${number}'s writer runs on ${owner.handle.host}; resume it there`);
    if (owner.resuming) throw new Error(`Resume ${owner.resuming.id} has no recorded outcome; settle it with reconcile, and never resume again before it`);
    const s = ownerStatus(owner, {}, { host, identify, census });
    if (s.status !== "exited") throw new Error(`#${number}'s writer is ${s.status} (${s.reason}); only a writer whose turn has ended is resumed`);
    const sessionId = owner.sessionId ?? streamSession(owner.handle.launchDir);
    checkLaunchArgs(args, owner);
    const at = args.flatMap((a, i) => (a === "--resume" ? [i] : []));
    if (at.length !== 1 || args[at[0] + 1] !== sessionId) throw new Error(`The resume needs exactly one --resume ${sessionId}, the session the writer's stream names`);
    const id = randomUUID();
    const launchDir = resumeDirOf(owner, number, id);
    if (UNSAFE.test(launchDir) || UNSAFE.test(r.checkout)) throw new Error(`${launchDir} holds a character the command line would interpret`);
    owner.sessionId = sessionId;
    const moved = owner.coordinator && owner.coordinator !== r.coordinator.session ? r.coordinator.session : null;
    owner.resuming = { id, launchDir, time: new Date().toISOString(), ...(moved && { contactTo: moved, contactNote: contactLine(moved, r.coordinator.host) }) };
    log(r, "resume-intent", { ticket: number, id, sessionId });
  });
  const { id, launchDir, contactNote } = intent.record.tickets[number].owner.resuming;
  if (afterIntent) {
    try { afterIntent(); }
    catch (error) {
      updateRecord(file, { expectRevision: intent.record.revision, coordinator }, (r) => { const o = ticketOf(r, number).owner; log(r, "resume-failed", { ticket: number, id, reason: `not run: ${error.message}` }); delete o.resuming; });
      throw error;
    }
  }
  fs.mkdirSync(launchDir, { recursive: true });
  const text = fs.readFileSync(prompt, "utf8");
  fs.writeFileSync(path.join(launchDir, "prompt.txt"), contactNote && !text.includes(contactNote) ? `${text.replace(/\s*$/, "")}\n${contactNote}\n` : text);
  let outcome;
  try { outcome = spawner({ executable, args: [...args, "--add-dir", launchDir], cwd: intent.record.checkout, launchDir }); }
  catch (error) { outcome = { started: false, uncertain: true, reason: error.message }; }
  const done = updateRecord(file, { expectRevision: intent.record.revision, coordinator }, (r) => {
    const o = ticketOf(r, number).owner;
    if (outcome.uncertain) { o.resuming = { ...o.resuming, reason: outcome.reason }; log(r, "resume-uncertain", { ticket: number, id, reason: outcome.reason }); return; }
    const contactTo = o.resuming.contactTo;
    delete o.resuming;
    if (!outcome.started) { log(r, "resume-failed", { ticket: number, id, reason: outcome.reason }); return; }
    if (contactTo) moveContact(o, contactTo);
    const identity = identify(outcome.pid);
    o.handle = { kind: "process", pid: outcome.pid, start: identity?.start ?? null, host, launchDir };
    (o.resumes ??= []).push({ id, time: new Date().toISOString(), launchDir });
    log(r, "resumed", { ticket: number, id, handle: o.handle });
  });
  return { revision: done.record.revision, id, ...outcome };
}

export function reconcile(record, { ticket: number, host = os.hostname(), census = processCensus, identify = processIdentity }) {
  const ticket = ticketOf(record, number), pending = ticket.pending;
  if (!pending && ticket.owner?.resuming) return reconcileResume(record, ticket.owner, number, { host, census, identify });
  if (!pending) throw new Error(`#${number} has nothing pending`);
  if (pending.route !== "claude-cli") throw new Error(`A ${pending.route} start is confirmed with launched or withdrawn with evidence`);
  if (pending.host && pending.host !== host) throw new Error(`Launch ${pending.launchId} was claimed on ${pending.host}; reconcile it on that host`);
  const launchDir = launchDirOf(pending, number);
  if (!fs.existsSync(launchDir)) {
    ticket.history.push(settledStart(pending, { withdrawn: "no launch directory exists, so nothing was started", ended: "nothing was started" }));
    log(record, "reconciled", { ticket: number, launchId: pending.launchId, outcome: "not started" });
    ticket.pending = null;
    return { outcome: "not started" };
  }
  const processes = census();
  if (!Array.isArray(processes)) throw new Error("The process census failed; the launch stays pending");
  const users = usersOf(launchDir, processes, process.pid);
  if (users.length) {
    const writer = users.find((p) => !users.some((q) => q.pid === p.ppid)) ?? users[0];
    const identity = identify(writer.pid);
    if (!identity) throw new Error(`Process ${writer.pid} names the launch but exited during the census; reconcile again`);
    const prompt = path.join(launchDir, "prompt.txt");
    const sent = fs.existsSync(prompt) ? fs.readFileSync(prompt, "utf8") : undefined;
    ticket.owner = ownerFrom(pending, { kind: "process", ...identity, host, launchDir }, sentBrief("prompt", sent), toldCoordinator(pending, sent, record));
    log(record, "reconciled", { ticket: number, launchId: pending.launchId, outcome: "running", handle: ticket.owner.handle });
    ticket.pending = null;
    return { outcome: "running", owner: ticket.owner };
  }
  const output = path.join(launchDir, "out.jsonl");
  const outcome = fs.existsSync(output) && fs.statSync(output).size > 0 ? "started and ended" : "not running";
  if (outcome === "started and ended") {
    const prompt = path.join(launchDir, "prompt.txt");
    const sent = fs.existsSync(prompt) ? fs.readFileSync(prompt, "utf8") : undefined;
    ticket.owner = ownerFrom(pending, { kind: "process", pid: null, start: null, host, launchDir }, sentBrief("prompt", sent), toldCoordinator(pending, sent, record));
    log(record, "reconciled", { ticket: number, launchId: pending.launchId, outcome, handle: ticket.owner.handle });
    ticket.pending = null;
    return { outcome, owner: ticket.owner };
  }
  ticket.history.push(settledStart(pending, { withdrawn: `no process names ${launchDir} (${outcome}); read its output before dispatching again`, ended: `the process census found no process naming ${launchDir}` }));
  log(record, "reconciled", { ticket: number, launchId: pending.launchId, outcome });
  ticket.pending = null;
  return { outcome };
}

function reconcileResume(record, owner, number, { host, census, identify }) {
  const { id, launchDir, contactTo } = owner.resuming;
  if (owner.handle.host && owner.handle.host !== host) throw new Error(`Resume ${id} ran on ${owner.handle.host}; reconcile it on that host`);
  const processes = census();
  if (!Array.isArray(processes)) throw new Error("The process census failed; the resume stays unsettled");
  const users = usersOf(launchDir, processes, process.pid);
  delete owner.resuming;
  if (users.length) {
    const writer = users.find((p) => !users.some((q) => q.pid === p.ppid)) ?? users[0];
    const identity = identify(writer.pid);
    if (!identity) throw new Error(`Process ${writer.pid} names the resume but exited during the census; reconcile again`);
    owner.handle = { kind: "process", ...identity, host, launchDir };
    (owner.resumes ??= []).push({ id, time: new Date().toISOString(), launchDir });
    if (contactTo) moveContact(owner, contactTo);
    log(record, "reconciled", { ticket: number, resume: id, outcome: "running", handle: owner.handle });
    return { outcome: "running", owner };
  }
  const output = path.join(launchDir, "out.jsonl");
  const outcome = fs.existsSync(output) && fs.statSync(output).size > 0 ? "started and ended" : "not running";
  if (outcome === "started and ended") { owner.handle = { ...owner.handle, launchDir }; (owner.resumes ??= []).push({ id, time: new Date().toISOString(), launchDir }); if (contactTo) moveContact(owner, contactTo); }
  log(record, "reconciled", { ticket: number, resume: id, outcome });
  return { outcome };
}

const assignmentHeader = (owner) => `Assignment ${owner.launchId} (delivery ${owner.brief.deliveryId}). If you have already received assignment ${owner.launchId}, ignore this copy and carry on with the first.`;

export function brief(record, planFile, number, decisions = [], defaults = readWriterDefaults()) {
  const owner = record.tickets[number]?.owner;
  if (owner?.brief?.text) return `${assignmentHeader(owner)}\n${namingCoordinator(owner, record, owner.brief.text)}`;
  return briefBody(record, planFile, number, decisions, defaults);
}

function namingCoordinator(owner, record, text) {
  const from = owner.brief?.coordinator ?? owner.coordinator, to = record.coordinator.session;
  return from && from !== to ? text.split(from).join(to) : text;
}

function briefBody(record, planFile, number, decisions, defaults) {
  const plan = readJson(planFile), entry = plan.tickets.find((t) => t.number === number);
  const ticket = record.tickets[number], work = ticket?.pending ?? ticket?.owner;
  if (!entry || !work) throw new Error(`#${number} has no claimed or owned work to brief`);
  const vendorRoutes = defaults.routes[routeVendor(work.model)] ?? [];
  const route = vendorRoutes.find((r) => r.route === work.route) ?? (ticket.owner?.adopted && vendorRoutes[0] ? { ...vendorRoutes[0], route: work.route, selfCheck: "read your own model, effort and permission mode as .agents/skills/RUNNERS.md describes for your runner" } : null);
  if (!route) throw new Error(`${retiredReason(work.route, defaults) ?? `${work.route} is not a configured route for ${work.model}`}; it has no brief`);
  const adopted = ticket.owner?.adopted ?? work.continues;
  const place = !work.continues || work.continues.worktreeExists ? `in ${work.worktree}` : `on a worktree at ${work.worktree} checked out from the existing origin branch`;
  const coordinator = `coordinator session ${record.coordinator.session}`;
  const how = route.reports?.[record.coordinator.harness] ?? { unsupported: `no message from ${work.route} to a ${record.coordinator.harness} coordinator is configured` };
  const mode = work.permissionMode ? ` in permission mode ${work.permissionMode}` : "";
  const confirmed = work.permissionMode ? "model, effort and permission mode" : "model and effort";
  const { tickets, split } = repositoriesOf(record);
  const parent = `${plan.parent?.type ?? "issue"} #${record.issue}`;
  return [
    `${work.launchId ? `Assignment ${work.launchId}. ` : ""}You are the writer for ${tickets} ticket #${number} (${entry.title}), a sub-issue of ${parent}, coordinated by ${coordinator} on ${record.coordinator.host}.`,
    `Route: ${work.route}, model ${work.model} at effort ${work.effort}${mode}. Before any work and before building any reviewer plan, confirm your own ${confirmed}: ${route.selfCheck}. If any of them differs, stop and report the mismatch as a blocker; never substitute another model, effort or mode.`,
    how.mechanism
      ? `Your first act after reading this brief: send ${coordinator} an acknowledgement naming ${work.launchId ? `assignment ${work.launchId}` : `ticket #${number}`} and the ${confirmed} you confirmed (${how.mechanism}). A brief left unacknowledged for one check-in interval is treated as undelivered.`
      : `You cannot message ${coordinator}: ${how.unsupported}. Write your acknowledgement, naming ${work.launchId ? `assignment ${work.launchId}` : `ticket #${number}`} and the ${confirmed} you confirmed, as your first message instead; ${defaults.reportFallback}.`,
    ...(route.turns ? [route.turns] : []),
    `Run the resolve-issue skill for #${number} exactly as written.`,
    ...(entry.delivers?.length ? [`Your PR also delivers ${entry.delivers.map((n) => `#${n}`).join(", ")} (sub-issues of #${number}, or tickets its body or PR closes), never dispatched to another writer, so the PR body carries a closing reference for each of them beside the one for #${number}, and GitHub closes them with it when it merges.`] : []),
    adopted ? `Continue the existing work ${place} on branch ${work.branch}${adopted.pr ? ` and its PR #${adopted.pr}, which has started ${adopted.rounds} review rounds; the count continues from there and never resets` : ""}.` : `Create your worktree at ${work.worktree} on branch ${work.branch} from origin/main, as resolve-issue's worktree setup describes. Never work on main or in another ticket's worktree.`,
    `Allocate your private artifact directory with resolve-issue's allocator under ${work.artifactParent ?? "a scratch parent of your own"}, and keep every artifact in it.`,
    `The design of record is the body of ${parent}, as its template structures it, together with the decisions below. Settled decisions:${decisions.length ? "" : " none beyond the ticket and that body."}`,
    ...decisions.map((d) => `- ${d}`),
    "Review: run review-pr with the repository's reviewer defaults at the default three-round cap. Once round 3's accepted fixes are verified, again after every later round's, and whenever another decision needs the user, send the coordinator a checkpoint report, then end your turn: the completed round, its planned reviewers and their exits, every report and adjudication comment id, the last reviewed commit and the current head, which accepted findings share an underlying mechanism, whether corrections introduced new defects, whether a broader or simpler repair would be better, the concrete residual risk, and what another round would establish.",
    "After every reviewer launch, read the launcher's exit and its <plan name>.coordinator.err.log at once, in the job directory you gave start-coordinator (the launch-state directory that holds the plan and its journal): a plan refused at validation writes its error only there and no journal, so a journal watcher would wait for nothing. Treat a refusal as a correction to make now.",
    `The coordinator answers with a checkpoint decision it publishes on ${split ? `your ticket in ${tickets}, the PR's review thread` : "the PR"}. Launch a further round only under its extension, with reviewRoundLimit and extendedReviewAuthorization exactly as that decision gives them. Never waive your own review or post a checkpoint decision: accepting unreviewed corrections is the coordinator's decision alone, and under it the PR stays draft until the coordinator acts.`,
    "Your review jobs keep their own ownership, round counts, freezes and process-exit checks, and the machine-wide reviewer and test reservations stay authoritative. The coordinator holds no lock on your worktree.",
    "Never merge, and never mark the PR ready before the review gates pass.",
    `The root-cause fix of #${number}'s own defect is never filed: it belongs in your PR even when it crosses subsystems, and only an unsettled behavior decision turns it into a question to ${coordinator}, never a ticket. Every filing prompt you or your outstanding-work sweep send names ${parent} as the coordinated parent, and each filed ticket states how it relates to that parent's goal and to the fix it came from.`,
    `Final report, as fields: ${REPORT_FIELDS.join(", ")} (your model, effort and permission mode as you read them yourself; the PR number; the last independently reviewed commit; rounds used per reviewer route; outstanding findings or None; the verification evidence; the state of each CI check on the final head; the tickets you, your filing routes or review-pr filed or reused, as a list of { number, reading } entries giving your reading of how each relates to your fix, or None; your next action), plus each follow-up you proposed in your handoff without filing and any changes after the reviewed commit.`,
    how.mechanism
      ? `Send every report, blocker and question to ${coordinator} as a cross-session message (${how.mechanism}), then end your turn: what you end a turn with does not reach it.`
      : `Since you cannot message ${coordinator}, end each decision point with the report, blocker or question as your turn's last message; ${defaults.reportFallback}.`,
  ].join("\n");
}

const FLAGS = new Set(["takeover", "retry"]);
export function parseArgs(argv) {
  const [command, ...rest] = argv, options = {};
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (!arg.startsWith("--")) throw new Error(`Unexpected argument ${arg}`);
    const key = arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (FLAGS.has(key)) { options[key] = true; continue; }
    if (i + 1 >= rest.length) throw new Error(`${arg} needs a value`);
    const value = rest[++i];
    if (key === "arg" || key === "decision") (options[key] ??= []).push(value);
    else if (Object.hasOwn(options, key)) throw new Error(`${arg} given twice`);
    else options[key] = value;
  }
  return { command, options };
}

const integer = (value, name) => { const n = Number(value); if (!Number.isSafeInteger(n)) throw new Error(`--${name} must be an integer`); return n; };
const absolute = (value, name) => { if (typeof value !== "string" || !path.isAbsolute(value)) throw new Error(`--${name} must be an absolute path`); return value; };
const readOptional = (file) => (file ? readJson(absolute(file, "file")) : undefined);

const SIDE_EFFECTS = new Set(["launch", "open", "resume"]);

export function main(argv, { defaults = readWriterDefaults(), github, runners = {}, repos, clientFor = githubClient } = {}) {
  const { command, options: o } = parseArgs(argv);
  const transition = () => `${command}${o.ticket ? ` of #${o.ticket}` : ""}`;
  if (SIDE_EFFECTS.has(command)) ensureSaved(absolute(o.record, "record"), { coordinator: o.coordinator, github });
  const saveIntent = () => ensureSaved(absolute(o.record, "record"), { coordinator: o.coordinator, github });
  const checkpointAfter = (file) => { const c = autoCheckpoint(file, { coordinator: o.coordinator, transition: transition(), github }); return c ? { checkpoint: c } : {}; };
  const mutate = (fn) => {
    const file = absolute(o.record, "record");
    const { record, output } = updateRecord(file, { expectRevision: integer(o.expectRevision, "expect-revision"), coordinator: o.coordinator }, (r) => fn(r));
    return { revision: record.revision, ...(output && typeof output === "object" ? { result: output } : {}), ...checkpointAfter(file) };
  };
  const number = () => integer(o.ticket, "ticket");
  switch (command) {
    case "init": {
      if (!o.merging) throw new Error(`--merging must record who merges: ${MERGING.join(" or ")}`);
      checkCoordinatorId(o.harness, o.coordinator);
      if (!PERMISSION_MODES.includes(o.coordinatorMode)) throw new Error(`--coordinator-mode must be this session's own permission mode: ${PERMISSION_MODES.join(", ")}`);
      orchestrationTitle(o.issue, o.slug);
      const done = initRecord({ ...o, issue: integer(o.issue, "issue"), repository: o.repo, ticketsRepository: startRepositories(o.repo, repos ?? readRepos()).ticketsRepository, concurrency: o.concurrency === undefined ? undefined : integer(o.concurrency, "concurrency"), observations: readOptional(o.observations) }, { defaults });
      return { action: done.action, revision: done.record.revision, pointer: done.pointer, title: done.record.title ?? null, permissionMode: done.record.coordinator.permissionMode, writer: done.record.writer, concurrency: done.record.concurrency, ...(done.diskAdmits !== undefined && { diskAdmitsNow: done.diskAdmits }), ...(modeBlock(done.record) && { dispatchBlocked: modeBlock(done.record) }) };
    }
    case "schedule": { const file = absolute(o.record, "record"); return scheduleSpec(readRecord(file), file, defaults); }
    case "snapshot": {
      const record = readRecord(absolute(o.record, "record"));
      const snap = takeSnapshot({ repository: record.repository, issue: record.issue, tickets: repositoriesOf(record).tickets }, clientFor(record, record.checkout));
      fs.writeFileSync(absolute(o.out, "out"), JSON.stringify(snap, null, 2) + "\n");
      return { tickets: snap.tickets.length, originMain: snap.originMain };
    }
    case "plan": {
      const record = readRecord(absolute(o.record, "record"));
      const plan = planDispatch({ record, snapshot: readJson(absolute(o.snapshot, "snapshot")), observations: readOptional(o.observations), preflights: (o.preflight ? o.preflight.split(",") : []).map((f) => readJson(absolute(f, "preflight"))), freeBytes: freeBytesAt(record.checkout), defaults });
      if (o.out) fs.writeFileSync(absolute(o.out, "out"), JSON.stringify(plan, null, 2) + "\n");
      const checkpoint = autoCheckpoint(absolute(o.record, "record"), { coordinator: record.coordinator.session, transition: "a new plan", github, plan, onlyIfChanged: true });
      return checkpoint ? { ...plan, checkpoint } : plan;
    }
    case "claim": return mutate((r) => claim(r, { plan: absolute(o.plan, "plan"), ticket: number(), worktree: o.worktree, branch: o.branch, artifactParent: o.artifactParent, operation: o.operation, evidence: o.evidence }));
    case "launch": return mutate((r) => launch(r, { ticket: number(), executable: o.executable, args: o.arg ?? [], prompt: o.prompt }));
    case "open": return { ...openWriter(absolute(o.record, "record"), { coordinator: o.coordinator, expectRevision: integer(o.expectRevision, "expect-revision"), ticket: number(), executable: o.executable, afterIntent: saveIntent, runner: runners.open }), ...checkpointAfter(absolute(o.record, "record")) };
    case "opened": return mutate((r) => opened(r, { ticket: number(), session: o.session }));
    case "resume": return { ...resumeWriter(absolute(o.record, "record"), { coordinator: o.coordinator, expectRevision: integer(o.expectRevision, "expect-revision"), ticket: number(), executable: o.executable, args: o.arg ?? [], prompt: o.prompt, afterIntent: saveIntent, ...(runners.resume && { spawner: runners.resume }) }), ...checkpointAfter(absolute(o.record, "record")) };
    case "contact": return mutate((r) => contact(r, { ticket: number(), retry: Boolean(o.retry), defaults }));
    case "contacted": return mutate((r) => contacted(r, { ticket: number(), evidence: o.evidence }));
    case "acknowledged": return mutate((r) => acknowledged(r, { ticket: number(), model: o.model, effort: o.effort, permissionMode: o.permissionMode, evidence: o.evidence }));
    case "deliver": return mutate((r) => deliver(r, { ticket: number(), retry: Boolean(o.retry) }));
    case "delivered": return mutate((r) => delivered(r, { ticket: number(), evidence: o.evidence }));
    case "request": return mutate((r) => request(r, { ticket: number(), text: o.text, source: o.source }));
    case "relay": return mutate((r) => relay(r, { ticket: number(), request: o.request, to: o.to }));
    case "answer": return mutate((r) => answer(r, { ticket: number(), request: o.request, text: o.text, retry: Boolean(o.retry) }));
    case "answered": return mutate((r) => answered(r, { ticket: number(), request: o.request, evidence: o.evidence }));
    case "launched": return mutate((r) => launched(r, { ticket: number(), handleKind: o.handleKind, handle: o.handle, observedOn: o.observedOn }));
    case "check-in": { const file = absolute(o.record, "record"); return mutate((r) => recordCheckIn(r, { job: o.job, none: o.none, file, defaults })); }
    case "checked-in": return mutate((r) => checkedIn(r, { outcome: o.outcome }));
    case "adopt": return mutate((r) => adopt(r, { plan: absolute(o.plan, "plan"), ticket: number(), handleKind: o.handleKind, handle: o.handle, pid: o.pid, session: o.session, route: o.route, model: o.model, effort: o.effort, worktree: o.worktree, branch: o.branch }));
    case "reconcile": return mutate((r) => reconcile(r, { ticket: number() }));
    case "withdraw": return mutate((r) => withdraw(r, { ticket: number(), evidence: o.evidence, observedOn: o.observedOn }));
    case "verify": return mutate((r) => verify(r, { ticket: number(), preflight: absolute(o.preflight, "preflight") }));
    case "writer-session": return mutate((r) => writerSession(r, { ticket: number(), writer: o.writer, session: o.session, evidence: o.evidence }));
    case "release": return mutate((r) => release(r, { ticket: number(), observations: readOptional(o.observations) ?? {}, evidence: o.evidence }));
    case "result": return mutate((r) => result(r, { ticket: number(), report: absolute(o.report, "report") }));
    case "disk-recovery": return mutate((r) => diskRecovery(r, { removed: o.removed, branch: o.branch, classifier: o.classifier }));
    case "filed": return mutate((r) => filed(r, { filed: integer(o.filed, "filed"), ticket: o.ticket === undefined ? undefined : number(), pr: o.pr === undefined ? undefined : integer(o.pr, "pr"), source: o.source, reading: o.reading }));
    case "dismiss": return mutate((r) => dismiss(r, { filed: integer(o.filed, "filed"), ticket: o.ticket === undefined ? undefined : number(), evidence: o.evidence }));
    case "triage": return mutate((r) => triage(r, { filed: integer(o.filed, "filed"), outcome: o.outcome, slice: o.slice === undefined ? undefined : integer(o.slice, "slice"), under: o.under === undefined ? undefined : integer(o.under, "under"), reason: o.reason, question: o.question }));
    case "interim": { if ((o.decision?.length ?? 0) > 1) throw new Error("--decision given twice"); return mutate((r) => interim(r, { filed: integer(o.filed, "filed"), decision: o.decision?.[0], evidence: o.evidence })); }
    case "brief": return brief(readRecord(absolute(o.record, "record")), absolute(o.plan, "plan"), number(), o.decision ?? [], defaults);
    case "recover-lock": return { result: recoverLock(absolute(o.record, "record")) };
    default: throw new Error("Usage: issue-run.mjs init|snapshot|plan|claim|launch|launched|acknowledged|deliver|delivered|request|relay|answer|answered|adopt|reconcile|withdraw|verify|writer-session|release|result|open|opened|resume|contact|contacted|schedule|check-in|checked-in|disk-recovery|filed|dismiss|triage|interim|brief|recover-lock --option value ...");
  }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const output = main(process.argv.slice(2));
    console.log(typeof output === "string" ? output : JSON.stringify(output, null, 2));
    if (output?.checkpoint?.saved === false) { console.error(`The record changed locally, but its checkpoint was not saved: ${output.checkpoint.reason}`); process.exitCode = 3; }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
