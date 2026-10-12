// Coordinates the ticket writers of one Feature. It reads the Feature's
// sub-issues, blockers, Effort values, PRs and worktrees, decides which
// tickets may be dispatched, and keeps the coordinator's compact run record:
// who owns each ticket, which launch is pending, and the reports and disk
// recoveries the coordinator recorded. GitHub stays the authority for issue
// state, PR heads, review rounds and CI, so every plan reads them afresh and
// the record never copies them as current facts.
//
//   node .agents/skills/orchestrate-feature/feature-run.mjs <command> --option value ...
//
// Commands: init, snapshot, plan, claim, launch, create, settle-create,
// handoff, launched, deliver, delivered, request, relay, answer, answered,
// adopt, reconcile, withdraw, verify, release, result, disk-recovery, brief,
// recover-lock.
// Every command that changes the record takes --record, --coordinator and
// --expect-revision, prints the new record revision, and refuses a stale
// revision or another coordinator's session.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { spawnDetached as spawnDetachedProcess } from "../../../scripts/detached-launch.mjs";
import { writeExclusive, readJson, alive, currentIdentity } from "../../../scripts/review-job-store.mjs";
import { processIdentity } from "../../../scripts/reviewer-slots.mjs";
import { routeVendor, writerEfforts } from "../../../scripts/reviewer-defaults.mjs";
import { writerRoutes } from "../../../scripts/writer-route-preflight.mjs";
import { liveDeps, usersOf } from "../clean-worktrees/clean-worktrees.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const RECORD_VERSION = 1;

// Writer models, routes and each route's self-check live in runner
// configuration beside the reviewer defaults.
export const readWriterDefaults = (repo = repoRoot) => JSON.parse(fs.readFileSync(path.join(repo, ".claude", "writer-defaults.json"), "utf8"));

export function resolveWriterModel(harness, override, defaults) {
  if (override !== undefined) {
    if (typeof override !== "string" || !routeVendor(override) || !defaults.routes[routeVendor(override)]) throw new Error(`Writer model ${override} has no supported writer route`);
    return { model: override, source: "invocation" };
  }
  const entry = defaults.orchestrators[harness];
  if (!entry) throw new Error(`--harness must be one of ${Object.keys(defaults.orchestrators).join(", ")}`);
  return { model: entry.model, source: `${harness} orchestrator default` };
}

// The writer routes for a model in preference order, each marked with whether
// the current turn may start it. A route that starts only during a turn the
// user's own message began can merely be proposed from an event-driven turn.
export function routeOptions(model, turn, defaults) {
  if (turn !== "user" && turn !== "event") throw new Error("--turn must be user (the user's own message began this turn) or event (a session note, CI event or timer began it)");
  const routes = defaults.routes[routeVendor(model)];
  if (!routes) throw new Error(`No writer routes for ${model}`);
  return routes.map((r) => {
    if (!Object.hasOwn(writerRoutes, r.route)) throw new Error(`Writer default route ${r.route} is unknown to the route preflight`);
    const blocked = r.userTurnOnly && turn === "event";
    return { route: r.route, dispatchable: !blocked, ...(blocked && { reason: "starts only during a turn the user's own message began; this turn can only propose it" }), ...(r.endsWithCoordinator && { endsWithCoordinator: true }), selfCheck: r.selfCheck };
  });
}

// Ticket Effort is an organization issue field; its option names map onto the
// writer effort of the same name.
export const writerEffortOf = (name) => ({ Low: "low", Medium: "medium", High: "high" })[name] ?? null;

// A writer may install dependencies into a fresh worktree (about 6 GB of
// disk). Its memory goes mostly to its reviewer processes (about 4 GB with
// the writer's own tools); test suites take the machine-wide reservation one
// at a time, so they do not add per writer. Three writers keep their
// reviewers inside the machine-wide pool of eight reviewer slots.
export const WRITER_DISK = 6 * 2 ** 30;
export const WRITER_MEMORY = 4 * 2 ** 30;
export const MAX_WRITERS = 3;
// The run's bound comes from what does not change during a run: memory and
// the reviewer slots. Free disk changes, notably with the bounded disk
// recovery, so each plan admits writers against the disk free at that moment.
export function defaultConcurrency({ totalMemory }) {
  const byMemory = Math.floor(totalMemory / WRITER_MEMORY);
  return { limit: Math.max(0, Math.min(MAX_WRITERS, byMemory)), basis: `the smaller of ${MAX_WRITERS} (reviewer slots) and ${byMemory} by memory at 4 GB per writer; each plan also admits only as many writers as free disk allows at 6 GB per writer` };
}
export const freeBytesAt = (dir) => { const s = fs.statfsSync(dir); return s.bavail * s.bsize; };

// --- Run record -----------------------------------------------------------

export function readRecord(file) {
  const record = readJson(file);
  if (record?.version !== RECORD_VERSION || !Number.isSafeInteger(record.revision) || typeof record.coordinator?.session !== "string") throw new Error(`${file} is not a version ${RECORD_VERSION} feature run record`);
  return record;
}

function writeAtomic(file, value) {
  const temp = `${file}.${randomUUID()}.tmp`;
  writeExclusive(temp, value);
  fs.renameSync(temp, file);
}

// An exclusive lock beside a file, held for one synchronous step. A lock whose
// helper process is confirmed gone is reported, never silently taken:
// recover-lock removes it after the same check. A lock taken while a recovery
// marker exists is given back, since that recovery may be judging an older
// holder.
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

// One synchronous mutation of the run record under its lock.
export function updateRecord(file, { expectRevision, coordinator }, mutate, { identify = processIdentity } = {}) {
  const release = acquire(file, identify);
  try {
    const record = readRecord(file);
    if (record.revision !== expectRevision) throw new Error(`The run record is at revision ${record.revision}, not ${expectRevision}; plan again from the current record`);
    if (record.coordinator.session !== coordinator) throw new Error(`Feature #${record.feature} is coordinated by ${record.coordinator.session} on ${record.coordinator.host}; ${coordinator} may not change its run record`);
    // After a takeover the pointer names the new record, so the previous
    // coordinator's record stops accepting changes.
    let pointer;
    try { pointer = readJson(pointerFile(record.checkout, record.repository, record.feature)); } catch { pointer = null; }
    if (!pointer || path.resolve(pointer.record) !== path.resolve(file)) throw new Error(`The coordinator pointer for Feature #${record.feature} ${pointer ? `names ${pointer.record} (coordinator ${pointer.coordinator})` : "is missing or unreadable"}; this record no longer coordinates the Feature`);
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

// Removes a lock whose holder is confirmed gone. One recovery runs at a time,
// and the lock is removed only if it is still the generation that was judged.
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

// One coordinator per Feature on this machine: a pointer in the checkout's
// shared Git directory names the coordinator and its record. A second
// coordinator is refused; it takes over only after the first is observed to
// have ended, carrying the ownership forward unchanged.
export function pointerFile(checkout, repository, feature) {
  const common = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: checkout, encoding: "utf8", windowsHide: true }).trim();
  return path.join(common, "orchestrate-feature", `${repository.replace(/[^A-Za-z0-9.-]+/g, "_")}-${feature}.json`);
}

export function initRecord(options, { defaults = readWriterDefaults(), freeBytes, totalMemory = os.totalmem(), host = os.hostname(), identify = processIdentity } = {}) {
  const { record: file, checkout, repository, feature, coordinator, harness, invocation } = options;
  for (const [name, value] of Object.entries({ record: file, checkout })) if (typeof value !== "string" || !path.isAbsolute(value)) throw new Error(`--${name} must be an absolute path`);
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository ?? "")) throw new Error("--repo must be owner/name");
  if (!Number.isSafeInteger(feature) || feature <= 0) throw new Error("--feature must be the Feature's issue number");
  if (!coordinator) throw new Error("--coordinator must name the coordinator's session");
  if (!invocation) throw new Error("--invocation must quote the user's request that invoked the skill");
  if (!options.coordinatorModel || !writerEfforts(options.coordinatorModel).includes(options.coordinatorEffort)) throw new Error("--coordinator-model and --coordinator-effort must be the coordinator's own metadata");
  const writer = resolveWriterModel(harness, options.writerModel, defaults);
  let concurrency = defaultConcurrency({ totalMemory });
  const diskAdmits = Math.floor((freeBytes ?? freeBytesAt(checkout)) / WRITER_DISK);
  if (options.concurrency !== undefined) {
    if (!Number.isSafeInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 8) throw new Error("--concurrency must be 1 to 8");
    concurrency = { limit: options.concurrency, basis: `invocation override (default would be ${concurrency.limit}: ${concurrency.basis})` };
  }
  const pointer = pointerFile(checkout, repository, feature);
  const self = { session: coordinator, host, harness, model: options.coordinatorModel, effort: options.coordinatorEffort, since: new Date().toISOString() };
  const fresh = (carried = {}) => ({
    version: RECORD_VERSION, revision: 1, runId: randomUUID(), repository, feature, checkout, coordinator: self,
    invocation: { text: invocation, ...(options.writerModel !== undefined && { writerModel: options.writerModel }), ...(options.concurrency !== undefined && { concurrency: options.concurrency }) },
    authority: { reviewRounds: "the default three-round cap; a further round needs the maintainer's decision or delegation", merge: "the maintainer merges ready PRs", diskRecovery: "the guarded clean-worktrees classifier's merged-and-removable entries only, each recorded here" },
    writer, concurrency, tickets: carried.tickets ?? {}, diskRecoveries: carried.diskRecoveries ?? [], previousCoordinators: carried.previousCoordinators ?? [],
    log: [{ time: self.since, event: carried.tickets ? "takeover" : "init", coordinator, writer: writer.model, concurrency: concurrency.limit }],
  });
  fs.mkdirSync(path.dirname(pointer), { recursive: true });
  // The pointer is read and replaced under its own lock, so two coordinators
  // starting or taking over at once are serialized, and the second sees the
  // first one's pointer.
  const releasePointer = acquire(pointer, identify);
  try {
    let existing;
    try { existing = readJson(pointer); } catch (error) { if (error.code !== "ENOENT") throw new Error(`The coordinator pointer ${pointer} is unreadable; preserve it and inspect it`); }
    if (!existing) {
      writeExclusive(file, fresh());
      writeAtomic(pointer, { record: file, coordinator, host, since: self.since });
      return { action: "init", record: readRecord(file), pointer, diskAdmits };
    }
    if (existing.coordinator === coordinator && existing.record === file) return { action: "resume", record: readRecord(file), pointer };
    if (!options.takeover) throw new Error(`Feature #${feature} already has coordinator ${existing.coordinator} on ${existing.host} (record ${existing.record}); a second coordinator would duplicate writers. Continue in that session, or confirm it ended and run init --takeover with an observation of it`);
    const prior = ownerStatus({ handle: { kind: "session", id: existing.coordinator } }, options.observations ?? {}, { host, identify });
    if (prior.status !== "exited") throw new Error(`Takeover refused: the previous coordinator ${existing.coordinator} is ${prior.status} (${prior.reason})`);
    // The previous record stays locked from the copy to the pointer switch,
    // so no change to it falls between them.
    const releaseOld = acquire(existing.record, identify);
    try {
      const old = readRecord(existing.record);
      writeExclusive(file, fresh({ tickets: old.tickets, diskRecoveries: old.diskRecoveries, previousCoordinators: [...old.previousCoordinators, { ...old.coordinator, record: existing.record, ended: prior.reason }] }));
      writeAtomic(pointer, { record: file, coordinator, host, since: self.since });
    } finally { releaseOld(); }
    return { action: "takeover", record: readRecord(file), pointer };
  } finally { releasePointer(); }
}

// --- Owner observation ----------------------------------------------------

// A desktop session or native task is observed by the coordinator through its
// own tools and passed in. A detached writer on this host is live while its
// recorded wrapper process runs or while any process names its launch
// directory: the writer carries that directory on its own command line, so it
// is found even after its wrapper ended. Absent evidence, a failed census, a
// cancellation request or a foreign host leaves the owner unknown, which
// blocks any replacement.
const EXITED = new Set(["archived", "absent", "completed", "failed", "stopped"]);
const processCensus = () => { const r = liveDeps.processes(); return r.ok ? r.list : null; };
export function ownerStatus(owner, observations = {}, { host = os.hostname(), identify = processIdentity, census = processCensus } = {}) {
  const handle = owner.handle;
  if (handle.kind === "process") {
    if (handle.host !== host) return { status: "unknown", reason: `process ${handle.pid} runs on ${handle.host}; this host cannot observe it` };
    let now;
    try { now = identify(handle.pid); } catch (error) { return { status: "unknown", reason: `process ${handle.pid} could not be probed: ${error.message}` }; }
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
  if (seen.state === "running") return { status: "live", reason: `${handle.kind} ${handle.id} is running` };
  if (seen.state === "idle" && handle.kind === "session") return { status: "waiting", reason: `session ${handle.id} ended its turn; read its report or answer it` };
  if (EXITED.has(seen.state)) return { status: "exited", reason: `${handle.kind} ${handle.id} is ${seen.state}` };
  return { status: "unknown", reason: `${handle.kind} ${handle.id} is ${seen.state}, which does not prove it stopped` };
}

// --- GitHub and worktree snapshot -----------------------------------------

const branchTicket = (branch) => Number(/(?:^|\/)[a-z]+\/(\d+)-[^/]*$/.exec(branch ?? "")?.[1]) || null;

export function parseWorktrees(text) {
  return text.split(/\r?\n\r?\n/).map((block) => Object.fromEntries(block.split(/\r?\n/).filter(Boolean).map((line) => { const i = line.indexOf(" "); return i < 0 ? [line, true] : [line.slice(0, i), line.slice(i + 1)]; }))).filter((w) => w.worktree).map((w) => ({ path: w.worktree, head: w.HEAD ?? null, branch: typeof w.branch === "string" ? w.branch.replace(/^refs\/heads\//, "") : null }));
}

export function githubClient(repository, checkout) {
  const run = (cmd, args) => execFileSync(cmd, args, { cwd: checkout, encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  const pages = (args) => JSON.parse(run("gh", ["api", "--paginate", "--slurp", ...args])).flat();
  return {
    issue: (n) => JSON.parse(run("gh", ["api", `repos/${repository}/issues/${n}`])),
    subIssues: (n) => pages([`repos/${repository}/issues/${n}/sub_issues`]),
    blockedBy: (n) => pages([`repos/${repository}/issues/${n}/dependencies/blocked_by`]),
    effort: (n) => pages(["-H", "X-GitHub-Api-Version: 2026-03-10", `repos/${repository}/issues/${n}/issue-field-values`]).find((v) => v.issue_field_name === "Effort")?.single_select_option?.name ?? null,
    pulls: (n) => JSON.parse(run("gh", ["pr", "list", "--repo", repository, "--state", "all", "--search", String(n), "--limit", "100", "--json", "number,state,isDraft,headRefName,headRefOid,baseRefName,closingIssuesReferences,mergeCommit"])),
    comments: (pr) => pages([`repos/${repository}/issues/${pr}/comments`]),
    checks: (pr) => JSON.parse(run("gh", ["pr", "view", String(pr), "--repo", repository, "--json", "statusCheckRollup"])).statusCheckRollup.map((c) => ({ name: c.name ?? c.context, state: c.conclusion || c.state || c.status })),
    fetchMain: () => { run("git", ["fetch", "-q", "origin", "main"]); return run("git", ["rev-parse", "origin/main"]).trim(); },
    onMain: (sha) => spawnSync("git", ["merge-base", "--is-ancestor", sha, "origin/main"], { cwd: checkout, windowsHide: true }).status === 0,
    worktrees: () => parseWorktrees(run("git", ["worktree", "list", "--porcelain"])),
  };
}

// The rounds a PR's review has started, from the round-state comments the
// review workflow posts.
// GitHub nests sub-issues at most eight levels deep, counting the Feature.
export const MAX_SUB_ISSUE_DEPTH = 8;
export const reviewRounds = (comments) => Math.max(0, ...comments.map((c) => [...(c.body ?? "").matchAll(/^#{2,4} Review round (\d+) state\b/gm)].map((m) => Number(m[1]))).flat());

export function takeSnapshot({ repository, feature }, client) {
  const originMain = client.fetchMain();
  const worktrees = client.worktrees();
  const pullCache = new Map();
  const pullsOf = (n) => {
    if (!pullCache.has(n)) pullCache.set(n, client.pulls(n).filter((p) => p.closingIssuesReferences?.some((r) => r.number === n) || branchTicket(p.headRefName) === n));
    return pullCache.get(n);
  };
  const delivered = (n) => pullsOf(n).some((p) => p.state === "MERGED" && p.mergeCommit?.oid && client.onMain(p.mergeCommit.oid));
  const tickets = [];
  // Every descendant is read, to GitHub's own nesting limit; a container below
  // that limit would be one this snapshot could not see into, so it is marked
  // truncated rather than treated as a ticket.
  const visit = (parent, depth) => {
    for (const sub of client.subIssues(parent)) {
      const n = sub.number;
      const children = client.subIssues(n);
      const truncated = children.length > 0 && depth >= MAX_SUB_ISSUE_DEPTH;
      const prs = pullsOf(n).map((p) => ({ number: p.number, state: p.state, isDraft: p.isDraft, branch: p.headRefName, head: p.headRefOid, base: p.baseRefName, mergeCommit: p.mergeCommit?.oid ?? null, ...(p.state === "OPEN" && { rounds: reviewRounds(client.comments(p.number)), checks: client.checks(p.number) }) }));
      tickets.push({
        number: n, title: sub.title, state: sub.state, parent, container: children.length > 0, ...(truncated && { truncated: true }), effort: client.effort(n),
        delivered: sub.state === "closed" && delivered(n),
        blockers: client.blockedBy(n).map((b) => ({ number: b.number, state: b.state, delivered: b.state === "closed" && delivered(b.number) })),
        prs, worktrees: worktrees.filter((w) => branchTicket(w.branch) === n),
      });
      if (children.length && !truncated) visit(n, depth + 1);
    }
  };
  const issue = client.issue(feature);
  visit(feature, 1);
  return { repository, feature: { number: feature, state: issue.state, title: issue.title }, observedAt: new Date().toISOString(), originMain, tickets };
}

// --- Admission plan -------------------------------------------------------

// The next action for an adopted start, from its last recorded step.
function adoptedNext(pending) {
  const last = lastStep(pending);
  const at = last ? `${last.step} ${last.state}` : "none";
  const next = {
    none: ["dispatch-step", "claimed; run create"],
    "create intent": ["reconcile-pending", "create has no recorded outcome, so a session may exist; look for it and record what you find with settle-create (--session <id> or --absent), never run create again"],
    "create uncertain": ["reconcile-pending", `create may have made a session (${last?.reason}); look for it and record what you find with settle-create (--session <id> or --absent), never run create again`],
    "create failed": ["reconcile-pending", `create failed (${last?.reason}); withdraw with that evidence`],
    "create confirmed": ["dispatch-step", `session ${last?.sessionId} was created; run handoff`],
    "handoff intent": ["reconcile-pending", "handoff has no recorded outcome; look for the session in the app's list and record it with launched --handle-kind session if it is there, or withdraw with evidence that it is not; never run handoff again"],
    "handoff uncertain": ["reconcile-pending", `handoff may have run (${last?.reason}); look for the session in the app's list and record it with launched --handle-kind session if it is there, or withdraw with evidence that it is not; never run handoff again`],
    "handoff failed": ["reconcile-pending", `handoff failed (${last?.reason}); withdraw with that evidence`],
    "handoff requested": ["reconcile-pending", `confirm session ${last?.sessionId} in the app's session list and record it with launched --handle-kind session`],
  }[at];
  return next ?? ["reconcile-pending", `unexpected adopted step ${at}`];
}

// Remaining work the coordinator reports while those steps are not automated.
export const REMAINING = [
  "Review rounds beyond the default three need the maintainer's decision or recorded delegation; the coordinator decides each checkpoint by hand.",
  "Ready PRs wait for the maintainer to merge them; dependent tickets become eligible only once a blocker's merged deliverable is on origin/main.",
  "The run record is local to this coordinator's machine; a handoff to another machine or account needs the portable checkpoint the record does not yet provide.",
  "The Feature's own acceptance criteria are not verified by this plan, so the Feature is never reported complete from it.",
];

// The record holds no writer for the ticket, and its last one was released
// after an observed end, settled by a census that found no process, or was a
// continuation whose claim recorded the previous writer's end and never ran.
const writerKnownEnded = (own) => !own.owner && !own.pending && Boolean(own.history?.some((h) => h.released || h.ended || h.priorEnded));

export function planDispatch({ record, snapshot, observations = {}, turn, preflights = [], freeBytes, defaults, host = os.hostname(), identify = processIdentity }) {
  if (snapshot.repository !== record.repository || snapshot.feature.number !== record.feature) throw new Error("The snapshot is of another repository or Feature");
  const model = record.writer.model;
  const routes = routeOptions(model, turn, defaults);
  const tickets = [], eligible = [], existingWork = [];
  let active = 0;
  const add = (ticket, action, reason, extra = {}) => { const entry = { number: ticket.number, title: ticket.title, effort: writerEffortOf(ticket.effort), action, reason, ...extra }; tickets.push(entry); return entry; };
  // The first route that runs the writer model at the ticket's effort, or the
  // one this turn may only propose, with the reasons the others were passed over.
  const chooseRoute = (t) => {
    const effort = writerEffortOf(t.effort);
    const verdictOf = (route) => preflights.filter((p) => p.route === route && p.model === model).flatMap((p) => p.verdicts).find((v) => v.ticket === t.number && v.effort === effort);
    const reasons = [];
    let proposable = null;
    for (const r of routes) {
      const v = verdictOf(r.route);
      if (!v) { reasons.push(`${r.route}: no preflight result for ${model} at ${effort}`); continue; }
      if (v.verdict !== "available" && v.verdict !== "confirmed") { reasons.push(`${r.route}: ${v.reason}`); continue; }
      if (!r.dispatchable) { proposable ??= r; reasons.push(`${r.route}: ${r.reason}`); continue; }
      return { effort, chosen: { ...r, launch: v.launch }, reasons };
    }
    return { effort, chosen: null, proposable, reasons };
  };
  const startWith = (choice) => ({ route: choice.chosen.route, model, effort: choice.effort, ...(choice.chosen.launch && { launch: choice.chosen.launch }), ...(choice.chosen.endsWithCoordinator && { endsWithCoordinator: true }) });
  const undelivered = (t) => t.blockers.filter((b) => !b.delivered);
  const waitingFor = (blockers) => `waiting for ${blockers.map((b) => `#${b.number} (${b.state === "closed" ? "closed, but no merged deliverable is on origin/main" : "open"})`).join(", ")}`;
  // Sub-issues of a container whose own writer is still held wait until that
  // writer is settled; the snapshot lists a container before its sub-issues.
  const parentOf = new Map(snapshot.tickets.map((t) => [t.number, t.parent]));
  const heldContainers = new Set();
  const heldAncestor = (t) => { for (let p = t.parent; p !== undefined && p !== snapshot.feature.number; p = parentOf.get(p)) if (heldContainers.has(p)) return p; return null; };
  for (const t of snapshot.tickets) {
    const own = record.tickets[t.number] ?? {};
    const open = t.prs.filter((p) => p.state === "OPEN");
    if (t.container) {
      if (own.owner || own.pending) {
        heldContainers.add(t.number);
        active++;
        const held = own.owner ? `writer ${own.owner.handle.id ?? own.owner.handle.pid} (${ownerStatus(own.owner, observations, { host, identify }).status})` : `pending ${own.pending.operation} ${own.pending.launchId}`;
        add(t, "decision-needed", `the ticket gained sub-issues while ${held} holds it; settle that writer before its sub-issues are dispatched`);
      } else if (t.truncated) add(t, "decision-needed", "its sub-issues nest deeper than GitHub's limit, so the snapshot could not read them");
      else add(t, "container", "its own sub-issues are planned individually");
      continue;
    }
    if (t.state === "closed") {
      if (own.owner || own.pending) active++;
      add(t, t.delivered ? "done" : "decision-needed", t.delivered ? "closed with its merged deliverable on origin/main" : "closed without a merged deliverable on origin/main; confirm whether the ticket is complete");
      continue;
    }
    if (own.pending) {
      active++;
      const p = own.pending;
      const heldParent = heldAncestor(t);
      if (p.route === "claude-adopted" && p.operation === "dispatch") {
        const [action, reason] = adoptedNext(p);
        if (heldParent !== null && action === "dispatch-step") add(t, "wait-dependency", `its parent #${heldParent} is still held by a writer; the pending start stays recorded, but run none of its steps until that writer is settled`, { pending: p, waitingFor: [heldParent] });
        else add(t, action, reason, { pending: p });
        continue;
      }
      if (heldParent !== null && p.operation === "proposed") { add(t, "wait-dependency", `its parent #${heldParent} is still held by a writer; withdraw the proposal, or record it with launched if it was started anyway`, { pending: p, waitingFor: [heldParent] }); continue; }
      add(t, "reconcile-pending", p.operation === "proposed" ? `a ${p.route} start was proposed and awaits the user; record its start with launched, or withdraw it once declined` : `launch ${p.launchId} on ${p.route} has no confirmed outcome; ${p.route === "claude-cli" ? "run reconcile" : "find the started writer and record it with launched, or withdraw with evidence that none started"} before any retry`, { pending: p });
      continue;
    }
    if (own.owner) {
      const s = ownerStatus(own.owner, observations, { host, identify });
      const extra = { owner: { route: own.owner.route, handle: own.owner.handle, status: s.status }, ...(open.length === 1 && { pr: open[0].number, rounds: open[0].rounds }) };
      if (own.owner.mismatch) { active++; add(t, "stop-writer", `the writer does not run the requested route: ${own.owner.mismatch}; stop it and keep its evidence, never substitute`, extra); continue; }
      const asked = openRequests(own);
      if (asked.length && s.status !== "exited") { active++; add(t, "answer-request", asked.map(requestNext).join("; "), { ...extra, requests: asked }); continue; }
      // Only a writer this coordinator launched awaits its first brief; an
      // existing writer adopted with its work already has its assignment.
      if (own.owner.brief !== undefined && own.owner.brief?.state !== "delivered" && s.status !== "exited") {
        active++;
        if (!own.owner.brief && heldAncestor(t) !== null) add(t, "wait-dependency", `its parent #${heldAncestor(t)} is still held by a writer; do not brief session ${own.owner.handle.id} until that writer is settled`, { ...extra, waitingFor: [heldAncestor(t)] });
        else if (!own.owner.brief) add(t, "deliver-brief", `the app adopted session ${own.owner.handle.id}; once its first turn has ended, record deliver --plan (it prints the brief), send that text by message, then record delivered`, extra);
        else add(t, "reconcile-pending", `brief delivery ${own.owner.brief.deliveryId} of assignment ${own.owner.launchId} to session ${own.owner.handle.id} has no recorded outcome and may still be queued; if the writer's transcript shows the assignment, record delivered with that evidence; otherwise wait, or resend with deliver --retry, which the brief tells the writer to ignore once a copy has arrived`, extra);
        continue;
      }
      if (s.status === "exited" && open.length === 1 && !open[0].isDraft) { add(t, "await-maintainer", `PR #${open[0].number} is ready at ${open[0].head}; ${s.reason}`, extra); continue; }
      active++;
      const action = { live: "observe", waiting: "collect-report", unknown: "blocked-owner-unknown", exited: "release" }[s.status];
      const advice = { live: "", waiting: "", unknown: "; establish its state before any replacement", exited: "; record release with that evidence before a new writer continues" }[s.status];
      add(t, action, s.reason + advice, extra);
      continue;
    }
    if (open.length > 1) { active++; add(t, "decision-needed", `open PRs ${open.map((p) => `#${p.number}`).join(", ")} all belong to this ticket`); continue; }
    if (open.length === 1) {
      const pr = open[0];
      if (!pr.isDraft) { add(t, "await-maintainer", `PR #${pr.number} is ready at ${pr.head} after ${pr.rounds} review rounds; the maintainer merges it`, { pr: pr.number, rounds: pr.rounds }); continue; }
      const reserves = !writerKnownEnded(own);
      if (reserves) active++;
      existingWork.push({ t, reserves, entry: add(t, "adopt-pr", `draft PR #${pr.number} at ${pr.head} has started ${pr.rounds} review rounds; find its writer and record it with adopt, or, once that writer is known to have ended, claim --operation continue so a new writer continues the PR from round ${pr.rounds}`, { pr: pr.number, rounds: pr.rounds, branch: pr.branch, worktrees: t.worktrees }) });
      continue;
    }
    if (t.worktrees.length) { const reserves = !writerKnownEnded(own); if (reserves) active++; existingWork.push({ t, reserves, entry: add(t, "adopt-worktree", `worktree ${t.worktrees.map((w) => w.path).join(", ")} already holds this ticket's work; find its writer and record it with adopt, or, once that writer is known to have ended, claim --operation continue`, { worktrees: t.worktrees }) }); continue; }
    if (!writerEffortOf(t.effort)) { add(t, "decision-needed", t.effort ? `Effort ${t.effort} has no writer effort` : "the ticket has no Effort value; assign one through the issue-fields procedure"); continue; }
    const waiting = undelivered(t);
    if (waiting.length) { add(t, "wait-dependency", waitingFor(waiting), { waitingFor: waiting.map((b) => b.number) }); continue; }
    const held = heldAncestor(t);
    if (held !== null) { add(t, "wait-dependency", `its parent #${held} is still held by a writer; settle that writer before its sub-issues are dispatched`, { waitingFor: [held] }); continue; }
    eligible.push(t);
  }
  // A writer the record still holds for a ticket the Feature no longer lists
  // keeps its capacity until the coordinator settles it.
  const listed = new Set(snapshot.tickets.map((t) => t.number));
  for (const [n, own] of Object.entries(record.tickets)) {
    if (listed.has(Number(n)) || (!own.owner && !own.pending)) continue;
    active++;
    tickets.push({ number: Number(n), action: "decision-needed", reason: "the record holds a writer or pending start for a ticket that is no longer one of the Feature's sub-issues; settle it before reusing its capacity" });
  }
  const free = freeBytes ?? Infinity;
  const room = Math.min(record.concurrency.limit, Math.floor(free / WRITER_DISK));
  // Existing work is continued by a new writer only under the same admission
  // as new work: every blocker delivered, a route available, and room in the
  // limit. Each piece of existing work reserves a place, since its writer may
  // run, until the record shows that writer released after an observed exit;
  // a continuation gives up only its own ticket's place, never another's.
  for (const { t, entry, reserves } of existingWork.sort((a, b) => a.t.number - b.t.number)) {
    const waiting = undelivered(t);
    if (!writerEffortOf(t.effort)) { entry.continueBlocked = "the ticket has no writer effort"; continue; }
    if (waiting.length) { entry.continueBlocked = waitingFor(waiting); continue; }
    if (heldAncestor(t) !== null) { entry.continueBlocked = `its parent #${heldAncestor(t)} is still held by a writer`; continue; }
    const choice = chooseRoute(t);
    const others = active - (reserves ? 1 : 0);
    if (!choice.chosen) entry.continueBlocked = choice.reasons.join("; ");
    else if (others >= room) entry.continueBlocked = `${others} other writers, held or possibly running on existing work, fill the limit of ${record.concurrency.limit}`;
    else entry.continueWith = startWith(choice);
  }
  const capacityNow = Math.max(0, room - active);
  let capacity = capacityNow;
  for (const t of eligible.sort((a, b) => a.number - b.number)) {
    const choice = chooseRoute(t), { effort, chosen, proposable, reasons } = choice;
    if (!chosen && !proposable) { add(t, "blocked-route", `no supported route runs ${model} at ${effort}: ${reasons.join("; ")}`); continue; }
    if (capacity <= 0) { add(t, "wait-capacity", capacityNow === 0 && Math.floor(free / WRITER_DISK) <= active ? "free disk does not admit another writer; the coordinator may run the bounded disk recovery" : `${active} writers already hold tickets against a limit of ${record.concurrency.limit}`); continue; }
    capacity--;
    if (chosen) add(t, "dispatch", `every blocker's deliverable is on origin/main`, startWith(choice));
    else add(t, "propose", `only ${proposable.route} is available and this turn cannot start it; propose it and record the proposal with claim --operation proposed`, { route: proposable.route, model, effort, reasons });
  }
  tickets.sort((a, b) => a.number - b.number);
  return {
    repository: record.repository, feature: record.feature, runId: record.runId, revision: record.revision, coordinator: record.coordinator.session, turn,
    writer: record.writer, concurrency: { limit: record.concurrency.limit, basis: record.concurrency.basis, active, capacityNow },
    routes, tickets, remaining: REMAINING, complete: false,
  };
}

// --- Ownership transitions ------------------------------------------------

const BRANCH = /^(?:[a-z]+\/)?(?:fix|feat|perf|docs|test|refactor|ci)\/(\d+)-[a-z0-9]+(?:-[a-z0-9]+)*$/;

function planEntry(planFile, record, number, actions) {
  const plan = readJson(planFile);
  // A plan admits work only for the run and revision it was made from; a
  // takeover starts a new run, so an earlier coordinator's plan never applies.
  if (plan.runId !== record.runId || plan.repository !== record.repository || plan.feature !== record.feature) throw new Error(`The plan was made for another run (${plan.runId ?? "none"}, coordinator ${plan.coordinator}); plan again from this run's record`);
  if (plan.revision !== record.revision) throw new Error(`The plan was made at revision ${plan.revision}; plan again from revision ${record.revision}`);
  const entry = plan.tickets.find((t) => t.number === number);
  if (!entry || !actions.includes(entry.action)) throw new Error(`The plan's action for #${number} is ${entry?.action ?? "missing"}, not ${actions.join(" or ")}`);
  return entry;
}

function assertFree(ticket, number) {
  if (ticket.owner) throw new Error(`#${number} is already owned by ${ticket.owner.handle.kind} ${ticket.owner.handle.id ?? ticket.owner.handle.pid}; one writer per ticket`);
  if (ticket.pending) throw new Error(`#${number} already has pending ${ticket.pending.operation} ${ticket.pending.launchId}; reconcile it first`);
}

// A claim records the intent to start a writer before anything starts. A
// continuation claims existing work (a draft PR or a found worktree) for a new
// writer once the coordinator has evidence that the previous one ended; it
// keeps the branch, worktree and the PR's started review rounds.
const CLAIM_ACTIONS = { dispatch: ["dispatch"], proposed: ["propose"], continue: ["adopt-pr", "adopt-worktree"] };
export function claim(record, { plan, ticket: number, worktree, branch, artifactParent, operation = "dispatch", evidence }) {
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
  const ticket = ticketOf(record, number);
  assertFree(ticket, number);
  ticket.pending = { operation: operation === "proposed" ? "proposed" : "dispatch", launchId: randomUUID(), route: start.route, model: start.model, effort: start.effort, worktree, branch, artifactParent, ...(continues && { continues }), time: new Date().toISOString() };
  log(record, { dispatch: "dispatch-intent", proposed: "proposed", continue: "continue-intent" }[operation], { ticket: number, route: start.route, launchId: ticket.pending.launchId, ...(continues && { continues }) });
  return ticket.pending;
}

// A pending start that ends without a writer keeps what its claim
// established: a continuation's evidence that the previous writer ended.
const settledStart = (pending, fields) => ({ pending, ...fields, ...(pending.continues && { priorEnded: pending.continues.evidence }) });

const ownerFrom = (pending, handle) => ({ route: pending.route, model: pending.model, effort: pending.effort, worktree: pending.worktree, branch: pending.branch, artifactParent: pending.artifactParent, launchId: pending.launchId, handle, verified: false, ...(pending.continues && { continues: pending.continues }), since: new Date().toISOString() });

export function launched(record, { ticket: number, handleKind, handle, host = os.hostname() }) {
  const ticket = ticketOf(record, number);
  if (!ticket.pending) throw new Error(`#${number} has no pending start to confirm`);
  if (ticket.pending.route === "claude-cli") throw new Error("A detached CLI writer is started with launch and confirmed with reconcile");
  if (!["session", "task"].includes(handleKind) || !handle) throw new Error("--handle-kind must be session or task, with --handle naming it");
  const adopted = ticket.pending.route === "claude-adopted";
  if (adopted) {
    // A handoff whose outcome was lost is settled by finding the session in
    // the app's list; the handoff itself is never run twice.
    const last = lastStep(ticket.pending);
    if (handleKind !== "session" || last?.step !== "handoff" || !["requested", "intent", "uncertain"].includes(last.state)) throw new Error(`An adopted writer is confirmed as a session found in the app's list after its handoff ran; #${number} is at ${last ? `${last.step} ${last.state}` : "no step"}`);
    step(ticket.pending, "adopt", "confirmed", { handle, ...(last.state !== "requested" && { after: `handoff ${last.state}` }) });
  }
  ticket.owner = ownerFrom(ticket.pending, { kind: handleKind, id: handle, host });
  if (adopted) { ticket.owner.steps = ticket.pending.steps; ticket.owner.brief = null; }
  log(record, "launched", { ticket: number, launchId: ticket.pending.launchId, handle: ticket.owner.handle });
  ticket.pending = null;
  return ticket.owner;
}

// Existing work found by the plan gets its existing writer as owner; adoption
// starts nothing, and the PR keeps the rounds it already started.
export function adopt(record, { plan, ticket: number, handleKind, handle, pid, route, model, effort, worktree, branch, host = os.hostname(), identify = processIdentity }) {
  const entry = planEntry(plan, record, number, ["adopt-pr", "adopt-worktree"]);
  if (!Object.hasOwn(writerRoutes, route) || typeof model !== "string" || !writerEfforts(model).includes(effort)) throw new Error("--route, --model and --effort must describe the existing writer");
  if (!path.isAbsolute(worktree ?? "")) throw new Error("--worktree must be the existing writer's absolute worktree path");
  const found = entry.worktrees?.find((w) => path.resolve(w.path) === path.resolve(worktree));
  if (entry.action === "adopt-worktree" && !found) throw new Error(`--worktree must be one the plan found for #${number}: ${entry.worktrees.map((w) => w.path).join(", ")}`);
  const ticket = ticketOf(record, number);
  assertFree(ticket, number);
  let h;
  if (handleKind === "process") {
    const identity = identify(Number(pid));
    if (!identity) throw new Error(`Process ${pid} is not running; it cannot own #${number}`);
    h = { kind: "process", ...identity, host };
  } else if (["session", "task"].includes(handleKind) && handle) h = { kind: handleKind, id: handle, host };
  else throw new Error("--handle-kind must be session, task or process");
  ticket.owner = { route, model, effort, worktree, branch: branch ?? entry.branch ?? found?.branch ?? null, artifactParent: null, handle: h, verified: false, adopted: { pr: entry.pr ?? null, rounds: entry.rounds ?? 0 }, since: new Date().toISOString() };
  log(record, "adopted", { ticket: number, handle: h, pr: entry.pr ?? null, rounds: entry.rounds ?? 0 });
  return ticket.owner;
}

export function withdraw(record, { ticket: number, evidence }) {
  const ticket = ticketOf(record, number);
  if (!ticket.pending) throw new Error(`#${number} has nothing pending`);
  if (!evidence) throw new Error("--evidence must say why no writer started (a declined proposal, or the observation that found none)");
  log(record, "withdrawn", { ticket: number, launchId: ticket.pending.launchId, evidence });
  ticket.history.push(settledStart(ticket.pending, { withdrawn: evidence }));
  ticket.pending = null;
}

export function verify(record, { ticket: number, preflight: file }) {
  const ticket = ticketOf(record, number), owner = ticket.owner;
  if (!owner) throw new Error(`#${number} has no owner to verify`);
  const result = readJson(file);
  if (result.route !== owner.route || result.model !== owner.model) throw new Error(`The confirmation is for ${result.route} ${result.model}, not ${owner.route} ${owner.model}`);
  const verdict = result.verdicts?.find((v) => v.ticket === number && v.effort === owner.effort);
  if (verdict?.verdict === "confirmed") { owner.verified = true; delete owner.mismatch; }
  else if (verdict?.verdict === "blocked") owner.mismatch = verdict.reason;
  else throw new Error(`The confirmation has no observed verdict for #${number} at ${owner.effort}`);
  log(record, owner.verified ? "verified" : "mismatch", { ticket: number, ...(owner.mismatch && { reason: owner.mismatch }) });
  return owner;
}

export function release(record, { ticket: number, observations, evidence, host = os.hostname(), identify = processIdentity }) {
  const ticket = ticketOf(record, number), owner = ticket.owner;
  if (!owner) throw new Error(`#${number} has no owner to release`);
  const s = ownerStatus(owner, observations, { host, identify });
  if (s.status !== "exited") throw new Error(`#${number}'s writer is ${s.status} (${s.reason}); only a writer observed to have ended is released`);
  // A released writer's unanswered requests close with it; a new writer
  // asks its own.
  const closed = openRequests(ticket);
  for (const r of closed) r.closed = { time: new Date().toISOString(), reason: "its writer was released" };
  ticket.history.push({ owner, released: `${s.reason}${evidence ? `; ${evidence}` : ""}`, time: new Date().toISOString() });
  ticket.owner = null;
  log(record, "released", { ticket: number, reason: s.reason, ...(closed.length && { closedRequests: closed.map((r) => r.id) }) });
}

export const REPORT_FIELDS = ["model", "effort", "pr", "reviewedHead", "rounds", "findings", "verification", "ci", "next"];

// A writer's request for a decision is recorded with the writer that asked
// it, so a restarted coordinator finds what is still owed and to whom. An
// answer is a message like the brief: its intent is recorded before it is
// sent and its outcome after, and a resend is an identified retry the writer
// ignores once a copy has arrived.
const ownerId = (owner) => owner?.handle?.id ?? owner?.handle?.pid ?? null;
const openRequests = (own) => (own.requests ?? []).filter((r) => !r.closed && r.answer?.state !== "delivered" && r.owner === ownerId(own.owner));
function requestNext(r) {
  if (r.answer?.state === "intent") return `answer ${r.answer.deliveryId} to request ${r.id} has no recorded outcome and may still be queued; if the writer's transcript shows it, record answered with that evidence; otherwise wait, or resend with answer --retry, which tells the writer to ignore a second copy`;
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
// Prints the message to send: the request and delivery ids let the writer
// recognize a second copy.
export function answer(record, { ticket: number, request: id, text, retry = false }) {
  const r = findRequest(record, number, id);
  if (r.answer?.state === "delivered") throw new Error(`Request ${id} was already answered at ${r.answer.time}`);
  if (r.answer?.state === "intent" && !retry) throw new Error(`Answer ${r.answer.deliveryId} to request ${id} has no recorded outcome; settle it from the writer's transcript, or resend with --retry`);
  if (!r.answer && retry) throw new Error(`Request ${id} has no answer to retry`);
  const words = retry ? r.answer.text : text;
  if (!words) throw new Error("--text must give the answer");
  r.answer = { state: "intent", text: words, deliveryId: randomUUID().slice(0, 8), attempts: (r.answer?.attempts ?? 0) + 1, time: new Date().toISOString() };
  log(record, "answer-intent", { ticket: number, id, deliveryId: r.answer.deliveryId, attempt: r.answer.attempts });
  return { message: `Answer to your request ${id}, which asked: "${r.text}" (delivery ${r.answer.deliveryId}):\n${words}\nIf you already received an answer to request ${id}, ignore this copy.` };
}
export function answered(record, { ticket: number, request: id, evidence }) {
  const r = findRequest(record, number, id);
  if (r.answer?.state !== "intent") throw new Error(`Request ${id}'s answer is at ${r.answer?.state ?? "no step"}; record answer before sending it`);
  r.answer = { ...r.answer, state: "delivered", time: new Date().toISOString(), ...(evidence && { evidence }) };
  log(record, "answered", { ticket: number, id, deliveryId: r.answer.deliveryId });
}
export function result(record, { ticket: number, report: file }) {
  const report = readJson(file);
  const missing = REPORT_FIELDS.filter((f) => report?.[f] === undefined);
  if (missing.length) throw new Error(`The writer's report lacks ${missing.join(", ")}; ask the writer for them`);
  const ticket = ticketOf(record, number);
  if (ticket.owner && (report.model !== ticket.owner.model || report.effort !== ticket.owner.effort)) throw new Error(`The report names ${report.model} at ${report.effort}, but #${number}'s writer was started as ${ticket.owner.model} at ${ticket.owner.effort}`);
  ticket.results.push({ time: new Date().toISOString(), report });
  log(record, "result", { ticket: number, pr: report.pr, reviewedHead: report.reviewedHead });
}

export function diskRecovery(record, { removed, branch, classifier }) {
  if (!removed || !classifier) throw new Error("--removed and --classifier must name the removed path and the classifier's merged-and-removable row");
  record.diskRecoveries.push({ time: new Date().toISOString(), removed, branch: branch ?? null, classifier });
  log(record, "disk-recovery", { removed });
}

// --- Detached CLI writer --------------------------------------------------

// Arguments go into a command line, so characters a shell would interpret are
// refused rather than escaped.
const UNSAFE = /["'%^&|<>!`$\r\n]/;
export function checkLaunchArgs(args, pending) {
  for (const arg of args) if (UNSAFE.test(arg)) throw new Error(`Launch argument ${JSON.stringify(arg)} holds a character the command line would interpret`);
  const only = (flag) => { const at = args.flatMap((a, i) => (a === flag ? [i] : [])); if (at.length !== 1) throw new Error(`The launch needs exactly one ${flag}`); return args[at[0] + 1]; };
  if (only("--model") !== pending.model) throw new Error(`The launch's --model must be ${pending.model}`);
  if (only("--effort") !== pending.effort) throw new Error(`The launch's --effort must be ${pending.effort}`);
}

// The writer runs under a wrapper shell that redirects its input and output.
// On Windows the wrapper is created through WMI, outside the coordinator's
// process tree, so the writer survives the tool call that started it;
// elsewhere the repository's detached launcher starts it.
export function startDetachedWriter({ executable, args, cwd, launchDir }) {
  const prompt = path.join(launchDir, "prompt.txt"), out = path.join(launchDir, "out.jsonl"), err = path.join(launchDir, "err.log");
  if (process.platform === "win32") {
    const quoted = [executable, ...args].map((a) => `"${a}"`).join(" ");
    const commandLine = `cmd.exe /d /s /c "${quoted} < "${prompt}" 1> "${out}" 2> "${err}""`;
    const script = `$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $env:LAUNCH_COMMAND; CurrentDirectory = $env:LAUNCH_CWD }; "$($r.ReturnValue) $($r.ProcessId)"`;
    const reply = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8", windowsHide: true, env: { ...process.env, LAUNCH_COMMAND: commandLine, LAUNCH_CWD: cwd } }).trim();
    const [code, pid] = reply.split(" ").map(Number);
    if (code !== 0) return { started: false, reason: `Win32_Process.Create returned ${code}` };
    return { started: true, pid };
  }
  // The trailing exit-status write keeps the shell from replacing itself with
  // the writer, so the recorded pid stays the wrapper's.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^CLAUDE/i.test(key)));
  const quote = (a) => `'${a}'`;
  const child = spawnDetachedProcess("/bin/sh", ["-c", `${[executable, ...args].map(quote).join(" ")} < ${quote(prompt)} > ${quote(out)} 2> ${quote(err)}; echo $? > ${quote(path.join(launchDir, "exit.txt"))}`], { cwd, env, stdio: "ignore" });
  child.unref();
  return { started: true, pid: child.pid };
}

// The launch directory follows from the pending launch id alone, so a launch
// that started a writer but failed before the record was written is still
// found by reconcile.
export const launchDirOf = (pending, number) => path.join(pending.artifactParent, `launch-${number}-${pending.launchId}`);

export function launch(record, { ticket: number, executable, args = [], prompt, host = os.hostname(), identify = processIdentity, spawner = startDetachedWriter }) {
  const ticket = ticketOf(record, number), pending = ticket.pending;
  if (!pending || pending.operation !== "dispatch" || pending.route !== "claude-cli") throw new Error(`#${number} has no pending claude-cli dispatch to launch`);
  if (!path.isAbsolute(executable ?? "") || UNSAFE.test(executable) || !path.isAbsolute(prompt ?? "")) throw new Error("--executable and --prompt must be absolute paths");
  checkLaunchArgs(args, pending);
  const launchDir = launchDirOf(pending, number);
  if (UNSAFE.test(launchDir) || UNSAFE.test(record.checkout)) throw new Error(`${launchDir} holds a character the command line would interpret`);
  if (fs.existsSync(launchDir)) throw new Error(`Launch ${pending.launchId} was already attempted; reconcile it`);
  fs.mkdirSync(launchDir, { recursive: true });
  fs.copyFileSync(prompt, path.join(launchDir, "prompt.txt"));
  // The writer's own command line names its launch directory, so a census
  // finds the writer itself, before its start is recorded and after its
  // wrapper ends.
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
  ticket.owner = ownerFrom(pending, { kind: "process", pid: outcome.pid, start: identity?.start ?? null, host, launchDir });
  log(record, "launched", { ticket: number, launchId: pending.launchId, handle: ticket.owner.handle });
  ticket.pending = null;
  return { started: true, owner: ticket.owner };
}

// --- Adopted desktop writer -----------------------------------------------

// An adopted writer is a session the CLI creates and the desktop app then
// resumes, so it starts from a turn that could not start a desktop session
// itself. Each step records its intent before the side effect and its
// outcome after, so an interrupted step is visible as an intent with no
// outcome rather than as nothing.
const lastStep = (pending) => pending.steps?.at(-1) ?? null;
function adoptedPending(record, number, expected) {
  const ticket = ticketOf(record, number), pending = ticket.pending;
  if (!pending || pending.operation !== "dispatch" || pending.route !== "claude-adopted") throw new Error(`#${number} has no pending claude-adopted dispatch`);
  const last = lastStep(pending);
  const at = last ? `${last.step} ${last.state}` : "none";
  const allowed = [expected].flat();
  if (!allowed.includes(at)) throw new Error(`#${number}'s adopted start is at step ${at}, not ${allowed.join(" or ")}`);
  return pending;
}
const step = (pending, name, state, detail = {}) => { (pending.steps ??= []).push({ step: name, state, time: new Date().toISOString(), ...detail }); };

// The first turn is a one-line prompt; the brief follows by message once the
// app has adopted the session, because the app does not move a session that
// is mid-turn.
export function runCreate({ executable, model, effort, permissionMode, cwd }) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^CLAUDE/i.test(key)));
  return createOutcome(spawnSync(executable, ["-p", "--model", model, "--effort", effort, "--permission-mode", permissionMode, "--output-format", "json"], { cwd, env, input: "Reply with the single word ready. Your instructions arrive in the next message.", encoding: "utf8", timeout: 300000, maxBuffer: 64 * 1024 * 1024, windowsHide: true }), model);
}

// The created session's id, provided the CLI answered without error and with
// the requested model.
export function createOutcome(result, model) {
  // A run stopped by the timeout or a signal may already have made a session.
  if (result.error?.code === "ETIMEDOUT" || result.signal) return { created: false, uncertain: true, reason: `the CLI was stopped (${result.error?.code ?? result.signal}) before it answered` };
  if (result.error) return { created: false, reason: `the CLI could not run: ${result.error.message}` };
  let answer;
  try { answer = JSON.parse(result.stdout); } catch { answer = undefined; }
  if (result.status !== 0 || answer?.is_error !== false || typeof answer?.session_id !== "string") return { created: false, reason: `the CLI exited ${result.status}${answer?.result ? `: ${answer.result}` : ""}`, sessionId: answer?.session_id ?? null };
  if (!Object.hasOwn(answer.modelUsage ?? {}, model)) return { created: false, reason: `the session answered with ${Object.keys(answer.modelUsage ?? {}).join(", ") || "no model"}, not ${model}`, sessionId: answer.session_id };
  return { created: true, sessionId: answer.session_id };
}

const PERMISSION_MODES = ["default", "acceptEdits", "plan", "auto", "bypassPermissions"];
export function createAdopted(file, { coordinator, expectRevision, ticket: number, executable, permissionMode, runner = runCreate }) {
  if (!path.isAbsolute(executable ?? "") || UNSAFE.test(executable)) throw new Error("--executable must be the absolute Claude CLI path");
  if (!PERMISSION_MODES.includes(permissionMode)) throw new Error(`--permission-mode must be the coordinator's own mode: ${PERMISSION_MODES.join(", ")}`);
  const intent = updateRecord(file, { expectRevision, coordinator }, (r) => { step(adoptedPending(r, number, "none"), "create", "intent", { permissionMode }); });
  const pending = intent.record.tickets[number].pending;
  let outcome;
  try { outcome = runner({ executable, model: pending.model, effort: pending.effort, permissionMode, cwd: intent.record.checkout }); }
  catch (error) { outcome = { created: false, uncertain: true, reason: error.message }; }
  const done = updateRecord(file, { expectRevision: intent.record.revision, coordinator }, (r) => {
    const p = adoptedPending(r, number, "create intent");
    if (outcome.created) step(p, "create", "confirmed", { sessionId: outcome.sessionId });
    else step(p, "create", outcome.uncertain ? "uncertain" : "failed", { reason: outcome.reason, sessionId: outcome.sessionId ?? null });
    log(r, "create", { ticket: number, created: outcome.created, sessionId: outcome.sessionId ?? null });
  });
  return { revision: done.record.revision, ...outcome };
}

// A create whose outcome was lost or stopped is settled by evidence, never by
// running it again: the session the coordinator found, or what shows that
// none was made.
export function settleCreate(record, { ticket: number, session, absent = false, evidence }) {
  if (!evidence) throw new Error("--evidence must say where the session was found, or how its absence was established");
  const pending = adoptedPending(record, number, ["create intent", "create uncertain"]);
  if (absent) step(pending, "create", "failed", { reason: `settled: ${evidence}` });
  else {
    if (!/^[0-9a-f-]{36}$/i.test(session ?? "")) throw new Error("--session must be the found session's id, or pass --absent");
    step(pending, "create", "confirmed", { sessionId: session, settled: evidence });
  }
  log(record, "create-settled", { ticket: number, sessionId: absent ? null : session, evidence });
}

// The app refuses a resume whose output is redirected, so the handoff runs in
// a console of its own, created outside the coordinator's process tree.
export function runHandoff({ executable, sessionId, cwd }) {
  if (process.platform !== "win32") throw new Error(`handing a session to the desktop app is verified only on Windows, not ${process.platform}`);
  const commandLine = `cmd.exe /d /c start "" cmd.exe /d /c ""${executable}" --desktop --resume ${sessionId}"`;
  const script = `$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $env:LAUNCH_COMMAND; CurrentDirectory = $env:LAUNCH_CWD }; "$($r.ReturnValue) $($r.ProcessId)"`;
  const reply = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8", windowsHide: true, env: { ...process.env, LAUNCH_COMMAND: commandLine, LAUNCH_CWD: cwd } }).trim();
  const [code, pid] = reply.split(" ").map(Number);
  return code === 0 ? { requested: true, pid } : { requested: false, reason: `Win32_Process.Create returned ${code}` };
}

export function handoffAdopted(file, { coordinator, expectRevision, ticket: number, executable, runner = runHandoff }) {
  if (!path.isAbsolute(executable ?? "") || UNSAFE.test(executable)) throw new Error("--executable must be the absolute Claude CLI path");
  const intent = updateRecord(file, { expectRevision, coordinator }, (r) => { step(adoptedPending(r, number, "create confirmed"), "handoff", "intent"); });
  const sessionId = intent.record.tickets[number].pending.steps.find((s) => s.step === "create" && s.state === "confirmed").sessionId;
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) throw new Error(`Session id ${sessionId} is not a UUID`);
  let outcome;
  try { outcome = runner({ executable, sessionId, cwd: intent.record.checkout }); }
  catch (error) { outcome = { requested: false, uncertain: true, reason: error.message }; }
  const done = updateRecord(file, { expectRevision: intent.record.revision, coordinator }, (r) => {
    const p = adoptedPending(r, number, "handoff intent");
    step(p, "handoff", outcome.requested ? "requested" : outcome.uncertain ? "uncertain" : "failed", outcome.requested ? { sessionId } : { reason: outcome.reason });
    log(r, "handoff", { ticket: number, sessionId, requested: !!outcome.requested });
  });
  return { revision: done.record.revision, sessionId, ...outcome };
}

// The coordinator sends the brief by message. `deliver` builds the brief,
// stores its text with the intent and prints it to send; `delivered` records
// the outcome. A message can arrive late, so an unconfirmed send is settled
// from the writer's transcript or resent only as an identified retry of the
// stored text: every copy names the assignment, carries the same
// instructions, and tells the writer to act on the first copy it receives.
function briefedOwner(record, number) {
  const owner = ticketOf(record, number).owner;
  if (!owner || owner.brief === undefined) throw new Error(`#${number} has no newly launched adopted writer awaiting a brief; an existing writer adopted with its work already has its assignment`);
  return owner;
}
export function deliver(record, { ticket: number, retry = false, plan, decisions = [], defaults = readWriterDefaults() }) {
  const owner = briefedOwner(record, number);
  if (owner.brief?.state === "delivered") throw new Error(`#${number}'s brief was delivered at ${owner.brief.time}`);
  if (owner.brief?.state === "intent" && !retry) throw new Error(`#${number}'s brief ${owner.brief.deliveryId} is already at intent with no recorded outcome; settle it from the writer's transcript, or resend with --retry`);
  if (!owner.brief && retry) throw new Error(`#${number}'s brief has not been sent; record deliver without --retry`);
  if (retry && (plan || decisions.length)) throw new Error("A retry resends the stored brief; it takes no plan or decisions");
  if (!retry && !plan) throw new Error("--plan must name the plan the brief is built from");
  const text = retry ? owner.brief.text : briefBody(record, plan, number, decisions, defaults);
  owner.brief = { state: "intent", deliveryId: randomUUID().slice(0, 8), attempts: (owner.brief?.attempts ?? 0) + 1, time: new Date().toISOString(), text };
  log(record, "brief-intent", { ticket: number, handle: owner.handle, deliveryId: owner.brief.deliveryId, attempt: owner.brief.attempts });
  return { message: `${assignmentHeader(owner)}\n${text}` };
}
export function delivered(record, { ticket: number, evidence }) {
  const owner = briefedOwner(record, number);
  if (owner.brief?.state !== "intent") throw new Error(`#${number}'s brief is at ${owner.brief?.state ?? "no step"}; record deliver before sending it`);
  owner.brief = { ...owner.brief, state: "delivered", time: new Date().toISOString(), ...(evidence && { evidence }) };
  log(record, "brief-delivered", { ticket: number, handle: owner.handle, deliveryId: owner.brief.deliveryId });
}

// A launch whose outcome was not recorded is settled by a census of the
// processes naming its launch directory, never by missing output alone.
export function reconcile(record, { ticket: number, host = os.hostname(), census = processCensus, identify = processIdentity }) {
  const ticket = ticketOf(record, number), pending = ticket.pending;
  if (!pending) throw new Error(`#${number} has nothing pending`);
  if (pending.route !== "claude-cli") throw new Error(`A ${pending.route} start is confirmed with launched or withdrawn with evidence`);
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
    ticket.owner = ownerFrom(pending, { kind: "process", ...identity, host, launchDir });
    log(record, "reconciled", { ticket: number, launchId: pending.launchId, outcome: "running", handle: ticket.owner.handle });
    ticket.pending = null;
    return { outcome: "running", owner: ticket.owner };
  }
  const output = path.join(launchDir, "out.jsonl");
  const outcome = fs.existsSync(output) && fs.statSync(output).size > 0 ? "started and ended" : "not running";
  ticket.history.push(settledStart(pending, { withdrawn: `no process names ${launchDir} (${outcome}); read its output before dispatching again`, ended: `the process census found no process naming ${launchDir}` }));
  log(record, "reconciled", { ticket: number, launchId: pending.launchId, outcome });
  ticket.pending = null;
  return { outcome };
}

// --- Writer brief ---------------------------------------------------------

const assignmentHeader = (owner) => `Assignment ${owner.launchId} (delivery ${owner.brief.deliveryId}). If you have already received assignment ${owner.launchId}, ignore this copy and carry on with the first.`;

// The brief to print for a writer's prompt. A brief that deliver recorded is
// reproduced exactly, under its current delivery.
export function brief(record, planFile, number, decisions = [], defaults = readWriterDefaults()) {
  const owner = record.tickets[number]?.owner;
  if (owner?.brief?.text) return `${assignmentHeader(owner)}\n${owner.brief.text}`;
  return briefBody(record, planFile, number, decisions, defaults);
}

function briefBody(record, planFile, number, decisions, defaults) {
  const plan = readJson(planFile), entry = plan.tickets.find((t) => t.number === number);
  const ticket = record.tickets[number], work = ticket?.pending ?? ticket?.owner;
  if (!entry || !work) throw new Error(`#${number} has no claimed or owned work to brief`);
  const route = defaults.routes[routeVendor(work.model)].find((r) => r.route === work.route);
  const adopted = ticket.owner?.adopted ?? work.continues;
  const place = !work.continues || work.continues.worktreeExists ? `in ${work.worktree}` : `on a worktree at ${work.worktree} checked out from the existing origin branch`;
  return [
    `You are the writer for ${record.repository} ticket #${number} (${entry.title}), a slice of Feature #${record.feature}. The coordinator is session ${record.coordinator.session} on ${record.coordinator.host}; it answers by message.`,
    `Route: ${work.route}, model ${work.model} at effort ${work.effort}. Before any work and before building any reviewer plan, confirm your own model and effort: ${route.selfCheck}. If either differs, stop and report the mismatch as a blocker; never substitute another model or effort.`,
    `Run the resolve-issue skill for #${number} exactly as written.`,
    adopted ? `Continue the existing work ${place} on branch ${work.branch}${adopted.pr ? ` and its PR #${adopted.pr}, which has started ${adopted.rounds} review rounds; the count continues from there and never resets` : ""}.` : `Create your worktree at ${work.worktree} on branch ${work.branch} from origin/main, as resolve-issue's worktree setup describes. Never work on main or in another ticket's worktree.`,
    `Allocate your private artifact directory with resolve-issue's allocator under ${work.artifactParent ?? "a scratch parent of your own"}, and keep every artifact in it.`,
    `Settled decisions:${decisions.length ? "" : " none beyond the ticket and its parent Feature's Proposed solution."}`,
    ...decisions.map((d) => `- ${d}`),
    "Review: run review-pr with the repository's reviewer defaults at the default three-round cap. When the loop would ask for a further round or another decision needs the user, end your turn with the request addressed to the coordinator and a checkpoint report: which accepted findings share an underlying mechanism, whether corrections introduced new defects, whether a broader or simpler repair would be better, the concrete residual risk, and what another round would establish.",
    "Your review jobs keep their own ownership, round counts, freezes and process-exit checks, and the machine-wide reviewer and test reservations stay authoritative. The coordinator holds no lock on your worktree.",
    "Never merge, and never mark the PR ready before the review gates pass.",
    `Final report, as fields: ${REPORT_FIELDS.join(", ")} (your model and effort as you read them yourself; the PR number; the last independently reviewed commit; rounds used per reviewer route; outstanding findings or None; the verification evidence; the state of each CI check on the final head; your next action), plus any changes after the reviewed commit.`,
    ...(route.reportsByMessage ? [`This session is not linked to the coordinator, so nothing you end a turn with reaches it. Send every report, blocker and question to coordinator session ${record.coordinator.session} as a cross-session message (SendMessage with to set to that id), then end your turn.`] : []),
  ].join("\n");
}

// --- Command line ---------------------------------------------------------

const FLAGS = new Set(["takeover", "retry", "absent"]);
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

export function main(argv, { defaults = readWriterDefaults() } = {}) {
  const { command, options: o } = parseArgs(argv);
  const mutate = (fn) => {
    const file = absolute(o.record, "record");
    const { record, output } = updateRecord(file, { expectRevision: integer(o.expectRevision, "expect-revision"), coordinator: o.coordinator }, (r) => fn(r));
    return { revision: record.revision, ...(output && typeof output === "object" ? { result: output } : {}) };
  };
  const number = () => integer(o.ticket, "ticket");
  switch (command) {
    case "init": {
      const done = initRecord({ ...o, feature: integer(o.feature, "feature"), repository: o.repo, concurrency: o.concurrency === undefined ? undefined : integer(o.concurrency, "concurrency"), observations: readOptional(o.observations) }, { defaults });
      return { action: done.action, revision: done.record.revision, pointer: done.pointer, writer: done.record.writer, concurrency: done.record.concurrency, ...(done.diskAdmits !== undefined && { diskAdmitsNow: done.diskAdmits }) };
    }
    case "snapshot": {
      const record = readRecord(absolute(o.record, "record"));
      const snap = takeSnapshot({ repository: record.repository, feature: record.feature }, githubClient(record.repository, record.checkout));
      fs.writeFileSync(absolute(o.out, "out"), JSON.stringify(snap, null, 2) + "\n");
      return { tickets: snap.tickets.length, originMain: snap.originMain };
    }
    case "plan": {
      const record = readRecord(absolute(o.record, "record"));
      const plan = planDispatch({ record, snapshot: readJson(absolute(o.snapshot, "snapshot")), observations: readOptional(o.observations), turn: o.turn, preflights: (o.preflight ? o.preflight.split(",") : []).map((f) => readJson(absolute(f, "preflight"))), freeBytes: freeBytesAt(record.checkout), defaults });
      if (o.out) fs.writeFileSync(absolute(o.out, "out"), JSON.stringify(plan, null, 2) + "\n");
      return plan;
    }
    case "claim": return mutate((r) => claim(r, { plan: absolute(o.plan, "plan"), ticket: number(), worktree: o.worktree, branch: o.branch, artifactParent: o.artifactParent, operation: o.operation, evidence: o.evidence }));
    case "launch": return mutate((r) => launch(r, { ticket: number(), executable: o.executable, args: o.arg ?? [], prompt: o.prompt }));
    case "create": return createAdopted(absolute(o.record, "record"), { coordinator: o.coordinator, expectRevision: integer(o.expectRevision, "expect-revision"), ticket: number(), executable: o.executable, permissionMode: o.permissionMode });
    case "handoff": return handoffAdopted(absolute(o.record, "record"), { coordinator: o.coordinator, expectRevision: integer(o.expectRevision, "expect-revision"), ticket: number(), executable: o.executable });
    case "deliver": return mutate((r) => deliver(r, { ticket: number(), retry: Boolean(o.retry), plan: o.plan ? absolute(o.plan, "plan") : undefined, decisions: o.decision ?? [], defaults }));
    case "delivered": return mutate((r) => delivered(r, { ticket: number(), evidence: o.evidence }));
    case "request": return mutate((r) => request(r, { ticket: number(), text: o.text, source: o.source }));
    case "relay": return mutate((r) => relay(r, { ticket: number(), request: o.request, to: o.to }));
    case "answer": return mutate((r) => answer(r, { ticket: number(), request: o.request, text: o.text, retry: Boolean(o.retry) }));
    case "answered": return mutate((r) => answered(r, { ticket: number(), request: o.request, evidence: o.evidence }));
    case "settle-create": return mutate((r) => settleCreate(r, { ticket: number(), session: o.session, absent: Boolean(o.absent), evidence: o.evidence }));
    case "launched": return mutate((r) => launched(r, { ticket: number(), handleKind: o.handleKind, handle: o.handle }));
    case "adopt": return mutate((r) => adopt(r, { plan: absolute(o.plan, "plan"), ticket: number(), handleKind: o.handleKind, handle: o.handle, pid: o.pid, route: o.route, model: o.model, effort: o.effort, worktree: o.worktree, branch: o.branch }));
    case "reconcile": return mutate((r) => reconcile(r, { ticket: number() }));
    case "withdraw": return mutate((r) => withdraw(r, { ticket: number(), evidence: o.evidence }));
    case "verify": return mutate((r) => verify(r, { ticket: number(), preflight: absolute(o.preflight, "preflight") }));
    case "release": return mutate((r) => release(r, { ticket: number(), observations: readOptional(o.observations) ?? {}, evidence: o.evidence }));
    case "result": return mutate((r) => result(r, { ticket: number(), report: absolute(o.report, "report") }));
    case "disk-recovery": return mutate((r) => diskRecovery(r, { removed: o.removed, branch: o.branch, classifier: o.classifier }));
    case "brief": return brief(readRecord(absolute(o.record, "record")), absolute(o.plan, "plan"), number(), o.decision ?? [], defaults);
    case "recover-lock": return { result: recoverLock(absolute(o.record, "record")) };
    default: throw new Error("Usage: feature-run.mjs init|snapshot|plan|claim|launch|create|handoff|launched|settle-create|deliver|delivered|request|relay|answer|answered|adopt|reconcile|withdraw|verify|release|result|disk-recovery|brief|recover-lock --option value ...");
  }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const output = main(process.argv.slice(2));
    console.log(typeof output === "string" ? output : JSON.stringify(output, null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
