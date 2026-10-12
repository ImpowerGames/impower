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
// Commands: init, snapshot, plan, claim, launch, launched, adopt, reconcile,
// withdraw, verify, release, result, disk-recovery, brief, recover-lock.
// Every command that changes the record takes --record, --coordinator and
// --expect-revision, prints the new record revision, and refuses a stale
// revision or another coordinator's session.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
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
export function defaultConcurrency({ freeBytes, totalMemory }) {
  const byDisk = Math.floor(freeBytes / WRITER_DISK), byMemory = Math.floor(totalMemory / WRITER_MEMORY);
  return { limit: Math.max(0, Math.min(MAX_WRITERS, byDisk, byMemory)), basis: `the smaller of ${MAX_WRITERS} (reviewer slots), ${byDisk} by free disk at 6 GB per writer and ${byMemory} by memory at 4 GB per writer` };
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

// One synchronous mutation under an exclusive lock beside the record. A lock
// whose helper process is confirmed gone is reported, never silently taken:
// recover-lock removes it after the same check.
export function updateRecord(file, { expectRevision, coordinator }, mutate, { identify = processIdentity } = {}) {
  const lock = `${file}.lock`, token = randomUUID();
  try { writeExclusive(lock, { token, identity: currentIdentity() }); }
  catch (error) {
    if (error.code !== "EEXIST") throw error;
    throw new Error(`${lockState(lock, identify)}; the record was not changed`);
  }
  try {
    const record = readRecord(file);
    if (record.revision !== expectRevision) throw new Error(`The run record is at revision ${record.revision}, not ${expectRevision}; plan again from the current record`);
    if (record.coordinator.session !== coordinator) throw new Error(`Feature #${record.feature} is coordinated by ${record.coordinator.session} on ${record.coordinator.host}; ${coordinator} may not change its run record`);
    const next = structuredClone(record);
    const output = mutate(next);
    next.revision = record.revision + 1;
    next.updated = new Date().toISOString();
    writeAtomic(file, next);
    return { record: next, output };
  } finally {
    let held;
    try { held = readJson(lock).token === token; } catch { held = false; }
    if (held) fs.unlinkSync(lock);
  }
}

function lockState(lock, identify) {
  let owner;
  try { owner = readJson(lock); } catch { return `The run record lock ${lock} is unreadable; preserve it and inspect it`; }
  let running;
  try { running = alive(owner.identity, identify); } catch (error) { return `The run record lock ${lock} names an owner whose state is unknown (${error.message}); preserve it`; }
  return running ? `Process ${owner.identity.pid} is updating the run record; retry after it exits` : `The run record lock ${lock} was left by process ${owner.identity.pid}, which has exited; run recover-lock`;
}

export function recoverLock(file, { identify = processIdentity } = {}) {
  const lock = `${file}.lock`;
  if (!fs.existsSync(lock)) return "no lock";
  const owner = readJson(lock);
  if (alive(owner.identity, identify)) throw new Error(`Process ${owner.identity.pid} still holds the run record lock`);
  fs.unlinkSync(lock);
  return `removed the lock of exited process ${owner.identity.pid}`;
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
  let concurrency = defaultConcurrency({ freeBytes: freeBytes ?? freeBytesAt(checkout), totalMemory });
  if (options.concurrency !== undefined) {
    if (!Number.isSafeInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 8) throw new Error("--concurrency must be 1 to 8");
    concurrency = { limit: options.concurrency, basis: `invocation override (default would be ${concurrency.limit}: ${concurrency.basis})` };
  }
  const pointer = pointerFile(checkout, repository, feature);
  const self = { session: coordinator, host, harness, model: options.coordinatorModel, effort: options.coordinatorEffort, since: new Date().toISOString() };
  const fresh = (carried = {}) => ({
    version: RECORD_VERSION, revision: 1, repository, feature, checkout, coordinator: self,
    invocation: { text: invocation, ...(options.writerModel !== undefined && { writerModel: options.writerModel }), ...(options.concurrency !== undefined && { concurrency: options.concurrency }) },
    authority: { reviewRounds: "the default three-round cap; a further round needs the maintainer's decision or delegation", merge: "the maintainer merges ready PRs", diskRecovery: "the guarded clean-worktrees classifier's merged-and-removable entries only, each recorded here" },
    writer, concurrency, tickets: carried.tickets ?? {}, diskRecoveries: carried.diskRecoveries ?? [], previousCoordinators: carried.previousCoordinators ?? [],
    log: [{ time: self.since, event: carried.tickets ? "takeover" : "init", coordinator, writer: writer.model, concurrency: concurrency.limit }],
  });
  fs.mkdirSync(path.dirname(pointer), { recursive: true });
  let existing;
  try { existing = readJson(pointer); } catch (error) { if (error.code !== "ENOENT") throw new Error(`The coordinator pointer ${pointer} is unreadable; preserve it and inspect it`); }
  if (!existing) {
    writeExclusive(file, fresh());
    writeExclusive(pointer, { record: file, coordinator, host, since: self.since });
    return { action: "init", record: readRecord(file), pointer };
  }
  if (existing.coordinator === coordinator && existing.record === file) return { action: "resume", record: readRecord(file), pointer };
  if (!options.takeover) throw new Error(`Feature #${feature} already has coordinator ${existing.coordinator} on ${existing.host} (record ${existing.record}); a second coordinator would duplicate writers. Continue in that session, or confirm it ended and run init --takeover with an observation of it`);
  const prior = ownerStatus({ handle: { kind: "session", id: existing.coordinator } }, options.observations ?? {}, { host, identify });
  if (prior.status !== "exited") throw new Error(`Takeover refused: the previous coordinator ${existing.coordinator} is ${prior.status} (${prior.reason})`);
  const old = readRecord(existing.record);
  writeExclusive(file, fresh({ tickets: old.tickets, diskRecoveries: old.diskRecoveries, previousCoordinators: [...old.previousCoordinators, { ...old.coordinator, record: existing.record, ended: prior.reason }] }));
  writeAtomic(pointer, { record: file, coordinator, host, since: self.since });
  return { action: "takeover", record: readRecord(file), pointer };
}

// --- Owner observation ----------------------------------------------------

// A desktop session or native task is observed by the coordinator through its
// own tools and passed in; a detached process on this host is probed by its
// recorded start identity. Absent evidence, a cancellation request or a
// foreign host leaves the owner unknown, which blocks any replacement.
const EXITED = new Set(["archived", "absent", "completed", "failed", "stopped"]);
export function ownerStatus(owner, observations = {}, { host = os.hostname(), identify = processIdentity } = {}) {
  const handle = owner.handle;
  if (handle.kind === "process") {
    if (handle.host !== host) return { status: "unknown", reason: `process ${handle.pid} runs on ${handle.host}; this host cannot observe it` };
    let now;
    try { now = identify(handle.pid); } catch (error) { return { status: "unknown", reason: `process ${handle.pid} could not be probed: ${error.message}` }; }
    if (!now) return { status: "exited", reason: `process ${handle.pid} is gone` };
    if (handle.start && now.start === handle.start) return { status: "live", reason: `process ${handle.pid} started ${handle.start} is running` };
    if (!handle.start) return { status: "unknown", reason: `process ${handle.pid} has no recorded start identity` };
    return { status: "exited", reason: `pid ${handle.pid} now belongs to another process` };
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
  const visit = (parent, depth) => {
    for (const sub of client.subIssues(parent)) {
      const n = sub.number;
      const children = depth < 3 ? client.subIssues(n) : [];
      const prs = pullsOf(n).map((p) => ({ number: p.number, state: p.state, isDraft: p.isDraft, branch: p.headRefName, head: p.headRefOid, base: p.baseRefName, mergeCommit: p.mergeCommit?.oid ?? null, ...(p.state === "OPEN" && { rounds: reviewRounds(client.comments(p.number)), checks: client.checks(p.number) }) }));
      tickets.push({
        number: n, title: sub.title, state: sub.state, parent, container: children.length > 0, effort: client.effort(n),
        delivered: sub.state === "closed" && delivered(n),
        blockers: client.blockedBy(n).map((b) => ({ number: b.number, state: b.state, delivered: b.state === "closed" && delivered(b.number) })),
        prs, worktrees: worktrees.filter((w) => branchTicket(w.branch) === n),
      });
      if (children.length) visit(n, depth + 1);
    }
  };
  const issue = client.issue(feature);
  visit(feature, 1);
  return { repository, feature: { number: feature, state: issue.state, title: issue.title }, observedAt: new Date().toISOString(), originMain, tickets };
}

// --- Admission plan -------------------------------------------------------

// Remaining work the coordinator reports while those steps are not automated.
export const REMAINING = [
  "Review rounds beyond the default three need the maintainer's decision or recorded delegation; the coordinator decides each checkpoint by hand.",
  "Ready PRs wait for the maintainer to merge them; dependent tickets become eligible only once a blocker's merged deliverable is on origin/main.",
  "The run record is local to this coordinator's machine; a handoff to another machine or account needs the portable checkpoint the record does not yet provide.",
  "The Feature's own acceptance criteria are not verified by this plan, so the Feature is never reported complete from it.",
];

export function planDispatch({ record, snapshot, observations = {}, turn, preflights = [], freeBytes, defaults, host = os.hostname(), identify = processIdentity }) {
  if (snapshot.repository !== record.repository || snapshot.feature.number !== record.feature) throw new Error("The snapshot is of another repository or Feature");
  const model = record.writer.model;
  const routes = routeOptions(model, turn, defaults);
  const tickets = [], eligible = [];
  let active = 0;
  const add = (ticket, action, reason, extra = {}) => tickets.push({ number: ticket.number, title: ticket.title, effort: writerEffortOf(ticket.effort), action, reason, ...extra });
  for (const t of snapshot.tickets) {
    const own = record.tickets[t.number] ?? {};
    const open = t.prs.filter((p) => p.state === "OPEN");
    if (t.container) { add(t, "container", "its own sub-issues are planned individually"); continue; }
    if (t.state === "closed") {
      if (own.owner || own.pending) active++;
      add(t, t.delivered ? "done" : "decision-needed", t.delivered ? "closed with its merged deliverable on origin/main" : "closed without a merged deliverable on origin/main; confirm whether the ticket is complete");
      continue;
    }
    if (own.pending) {
      active++;
      const p = own.pending;
      add(t, "reconcile-pending", p.operation === "proposed" ? `a ${p.route} start was proposed and awaits the user; record its start with launched, or withdraw it once declined` : `launch ${p.launchId} on ${p.route} has no confirmed outcome; ${p.route === "claude-cli" ? "run reconcile" : "find the started writer and record it with launched, or withdraw with evidence that none started"} before any retry`, { pending: p });
      continue;
    }
    if (own.owner) {
      const s = ownerStatus(own.owner, observations, { host, identify });
      const extra = { owner: { route: own.owner.route, handle: own.owner.handle, status: s.status }, ...(open.length === 1 && { pr: open[0].number, rounds: open[0].rounds }) };
      if (own.owner.mismatch) { active++; add(t, "stop-writer", `the writer does not run the requested route: ${own.owner.mismatch}; stop it and keep its evidence, never substitute`, extra); continue; }
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
      active++;
      add(t, "adopt-pr", `draft PR #${pr.number} at ${pr.head} has started ${pr.rounds} review rounds; find its writer and record it with adopt, or confirm it ended before a new writer continues the PR from round ${pr.rounds}`, { pr: pr.number, rounds: pr.rounds, branch: pr.branch });
      continue;
    }
    if (t.worktrees.length) { active++; add(t, "adopt-worktree", `worktree ${t.worktrees.map((w) => w.path).join(", ")} already holds this ticket's work; find its writer and record it with adopt`, { worktrees: t.worktrees }); continue; }
    if (!writerEffortOf(t.effort)) { add(t, "decision-needed", t.effort ? `Effort ${t.effort} has no writer effort` : "the ticket has no Effort value; assign one through the issue-fields procedure"); continue; }
    const waiting = t.blockers.filter((b) => !b.delivered);
    if (waiting.length) { add(t, "wait-dependency", `waiting for ${waiting.map((b) => `#${b.number} (${b.state === "closed" ? "closed, but no merged deliverable is on origin/main" : "open"})`).join(", ")}`, { waitingFor: waiting.map((b) => b.number) }); continue; }
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
  const capacityNow = Math.max(0, Math.min(record.concurrency.limit, Math.floor(free / WRITER_DISK)) - active);
  let capacity = capacityNow;
  for (const t of eligible.sort((a, b) => a.number - b.number)) {
    const effort = writerEffortOf(t.effort);
    const verdictOf = (route) => preflights.filter((p) => p.route === route && p.model === model).flatMap((p) => p.verdicts).find((v) => v.ticket === t.number && v.effort === effort);
    const reasons = [];
    let chosen = null, proposable = null;
    for (const r of routes) {
      const v = verdictOf(r.route);
      if (!v) { reasons.push(`${r.route}: no preflight result for ${model} at ${effort}`); continue; }
      if (v.verdict !== "available" && v.verdict !== "confirmed") { reasons.push(`${r.route}: ${v.reason}`); continue; }
      if (!r.dispatchable) { proposable ??= r; reasons.push(`${r.route}: ${r.reason}`); continue; }
      chosen = { ...r, launch: v.launch };
      break;
    }
    if (!chosen && !proposable) { add(t, "blocked-route", `no supported route runs ${model} at ${effort}: ${reasons.join("; ")}`); continue; }
    if (capacity <= 0) { add(t, "wait-capacity", capacityNow === 0 && Math.floor(free / WRITER_DISK) <= active ? "free disk does not admit another writer; the coordinator may run the bounded disk recovery" : `${active} writers already hold tickets against a limit of ${record.concurrency.limit}`); continue; }
    capacity--;
    if (chosen) add(t, "dispatch", `every blocker's deliverable is on origin/main`, { route: chosen.route, model, effort, ...(chosen.launch && { launch: chosen.launch }), ...(chosen.endsWithCoordinator && { endsWithCoordinator: true }) });
    else add(t, "propose", `only ${proposable.route} is available and this turn cannot start it; propose it and record the proposal with claim --operation proposed`, { route: proposable.route, model, effort, reasons });
  }
  tickets.sort((a, b) => a.number - b.number);
  return {
    repository: record.repository, feature: record.feature, revision: record.revision, coordinator: record.coordinator.session, turn,
    writer: record.writer, concurrency: { limit: record.concurrency.limit, basis: record.concurrency.basis, active, capacityNow },
    routes, tickets, remaining: REMAINING, complete: false,
  };
}

// --- Ownership transitions ------------------------------------------------

const BRANCH = /^(?:[a-z]+\/)?(?:fix|feat|perf|docs|test|refactor|ci)\/(\d+)-[a-z0-9]+(?:-[a-z0-9]+)*$/;

function planEntry(planFile, record, number, actions) {
  const plan = readJson(planFile);
  if (plan.revision !== record.revision || plan.feature !== record.feature) throw new Error(`The plan was made at revision ${plan.revision}; plan again from revision ${record.revision}`);
  const entry = plan.tickets.find((t) => t.number === number);
  if (!entry || !actions.includes(entry.action)) throw new Error(`The plan's action for #${number} is ${entry?.action ?? "missing"}, not ${actions.join(" or ")}`);
  return entry;
}

function assertFree(ticket, number) {
  if (ticket.owner) throw new Error(`#${number} is already owned by ${ticket.owner.handle.kind} ${ticket.owner.handle.id ?? ticket.owner.handle.pid}; one writer per ticket`);
  if (ticket.pending) throw new Error(`#${number} already has pending ${ticket.pending.operation} ${ticket.pending.launchId}; reconcile it first`);
}

export function claim(record, { plan, ticket: number, worktree, branch, artifactParent, operation = "dispatch" }) {
  if (operation !== "dispatch" && operation !== "proposed") throw new Error("--operation must be dispatch or proposed");
  const entry = planEntry(plan, record, number, [operation === "dispatch" ? "dispatch" : "propose"]);
  if (!path.isAbsolute(worktree ?? "") || !path.isAbsolute(artifactParent ?? "")) throw new Error("--worktree and --artifact-parent must be absolute paths");
  if (Number(BRANCH.exec(branch ?? "")?.[1]) !== number) throw new Error(`--branch must be <type>/${number}-<slug>`);
  if (fs.existsSync(worktree)) throw new Error(`${worktree} already exists; adopt the work in it instead of starting a second writer`);
  const sameTree = Object.entries(record.tickets).find(([n, t]) => Number(n) !== number && [t.owner, t.pending].some((o) => o && path.resolve(o.worktree) === path.resolve(worktree)));
  if (sameTree) throw new Error(`${worktree} is assigned to #${sameTree[0]}`);
  const ticket = ticketOf(record, number);
  assertFree(ticket, number);
  ticket.pending = { operation, launchId: randomUUID(), route: entry.route, model: entry.model, effort: entry.effort, worktree, branch, artifactParent, time: new Date().toISOString() };
  log(record, operation === "dispatch" ? "dispatch-intent" : "proposed", { ticket: number, route: entry.route, launchId: ticket.pending.launchId });
  return ticket.pending;
}

const ownerFrom = (pending, handle) => ({ route: pending.route, model: pending.model, effort: pending.effort, worktree: pending.worktree, branch: pending.branch, artifactParent: pending.artifactParent, handle, verified: false, since: new Date().toISOString() });

export function launched(record, { ticket: number, handleKind, handle, host = os.hostname() }) {
  const ticket = ticketOf(record, number);
  if (!ticket.pending) throw new Error(`#${number} has no pending start to confirm`);
  if (ticket.pending.route === "claude-cli") throw new Error("A detached CLI writer is started with launch and confirmed with reconcile");
  if (!["session", "task"].includes(handleKind) || !handle) throw new Error("--handle-kind must be session or task, with --handle naming it");
  ticket.owner = ownerFrom(ticket.pending, { kind: handleKind, id: handle, host });
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
  ticket.history.push({ pending: ticket.pending, withdrawn: evidence });
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
  ticket.history.push({ owner, released: `${s.reason}${evidence ? `; ${evidence}` : ""}`, time: new Date().toISOString() });
  ticket.owner = null;
  log(record, "released", { ticket: number, reason: s.reason });
}

export const REPORT_FIELDS = ["model", "effort", "pr", "reviewedHead", "rounds", "findings", "verification", "ci"];
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

// The wrapper shell's command line names the launch directory, so a census
// finds a writer whose start was never recorded. On Windows it is created
// through WMI, outside the coordinator's process tree, so the writer survives
// the tool call that started it.
export function spawnDetached({ executable, args, cwd, launchDir }) {
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
  // the writer, so its command line still names the launch directory.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^CLAUDE/i.test(key)));
  const quote = (a) => `'${a}'`;
  const child = spawn("/bin/sh", ["-c", `${[executable, ...args].map(quote).join(" ")} < ${quote(prompt)} > ${quote(out)} 2> ${quote(err)}; echo $? > ${quote(path.join(launchDir, "exit.txt"))}`], { cwd, env, detached: true, stdio: "ignore" });
  child.unref();
  return { started: true, pid: child.pid };
}

// The launch directory follows from the pending launch id alone, so a launch
// that started a writer but failed before the record was written is still
// found by reconcile.
export const launchDirOf = (pending, number) => path.join(pending.artifactParent, `launch-${number}-${pending.launchId}`);

export function launch(record, { ticket: number, executable, args = [], prompt, host = os.hostname(), identify = processIdentity, spawner = spawnDetached }) {
  const ticket = ticketOf(record, number), pending = ticket.pending;
  if (!pending || pending.operation !== "dispatch" || pending.route !== "claude-cli") throw new Error(`#${number} has no pending claude-cli dispatch to launch`);
  if (!path.isAbsolute(executable ?? "") || UNSAFE.test(executable) || !path.isAbsolute(prompt ?? "")) throw new Error("--executable and --prompt must be absolute paths");
  checkLaunchArgs(args, pending);
  const launchDir = launchDirOf(pending, number);
  if (UNSAFE.test(launchDir) || UNSAFE.test(record.checkout)) throw new Error(`${launchDir} holds a character the command line would interpret`);
  if (fs.existsSync(launchDir)) throw new Error(`Launch ${pending.launchId} was already attempted; reconcile it`);
  fs.mkdirSync(launchDir, { recursive: true });
  fs.copyFileSync(prompt, path.join(launchDir, "prompt.txt"));
  let outcome;
  try { outcome = spawner({ executable, args, cwd: record.checkout, launchDir }); }
  catch (error) { throw new Error(`The outcome of launch ${pending.launchId} is uncertain (${error.message}); it stays pending, and reconcile settles it before any retry`); }
  if (!outcome.started) {
    log(record, "launch-failed", { ticket: number, launchId: pending.launchId, reason: outcome.reason });
    ticket.history.push({ pending, failed: outcome.reason });
    ticket.pending = null;
    return { started: false, reason: outcome.reason };
  }
  const identity = identify(outcome.pid);
  ticket.owner = ownerFrom(pending, { kind: "process", pid: outcome.pid, start: identity?.start ?? null, host, launchDir });
  log(record, "launched", { ticket: number, launchId: pending.launchId, handle: ticket.owner.handle });
  ticket.pending = null;
  return { started: true, owner: ticket.owner };
}

// A launch whose outcome was not recorded is settled by a census of the
// processes naming its launch directory, never by missing output alone.
const processCensus = () => { const r = liveDeps.processes(); return r.ok ? r.list : null; };
export function reconcile(record, { ticket: number, host = os.hostname(), census = processCensus, identify = processIdentity }) {
  const ticket = ticketOf(record, number), pending = ticket.pending;
  if (!pending) throw new Error(`#${number} has nothing pending`);
  if (pending.route !== "claude-cli") throw new Error(`A ${pending.route} start is confirmed with launched or withdrawn with evidence`);
  const launchDir = launchDirOf(pending, number);
  if (!fs.existsSync(launchDir)) {
    ticket.history.push({ pending, withdrawn: "no launch directory exists, so nothing was started" });
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
  ticket.history.push({ pending, withdrawn: `no process names ${launchDir} (${outcome}); read its output before dispatching again` });
  log(record, "reconciled", { ticket: number, launchId: pending.launchId, outcome });
  ticket.pending = null;
  return { outcome };
}

// --- Writer brief ---------------------------------------------------------

export function brief(record, planFile, number, decisions = [], defaults = readWriterDefaults()) {
  const plan = readJson(planFile), entry = plan.tickets.find((t) => t.number === number);
  const ticket = record.tickets[number], work = ticket?.pending ?? ticket?.owner;
  if (!entry || !work) throw new Error(`#${number} has no claimed or owned work to brief`);
  const route = defaults.routes[routeVendor(work.model)].find((r) => r.route === work.route);
  const adopted = ticket.owner?.adopted;
  return [
    `You are the writer for ${record.repository} ticket #${number} (${entry.title}), a slice of Feature #${record.feature}. The coordinator is session ${record.coordinator.session} on ${record.coordinator.host}; it answers by message.`,
    `Route: ${work.route}, model ${work.model} at effort ${work.effort}. Before any work and before building any reviewer plan, confirm your own model and effort: ${route.selfCheck}. If either differs, stop and report the mismatch as a blocker; never substitute another model or effort.`,
    `Run the resolve-issue skill for #${number} exactly as written.`,
    adopted ? `Continue the existing work in ${work.worktree} on branch ${work.branch}${adopted.pr ? ` and its PR #${adopted.pr}, which has started ${adopted.rounds} review rounds; the count continues from there and never resets` : ""}.` : `Create your worktree at ${work.worktree} on branch ${work.branch} from origin/main, as resolve-issue's worktree setup describes. Never work on main or in another ticket's worktree.`,
    `Allocate your private artifact directory with resolve-issue's allocator under ${work.artifactParent ?? "a scratch parent of your own"}, and keep every artifact in it.`,
    `Settled decisions:${decisions.length ? "" : " none beyond the ticket and its parent Feature's Proposed solution."}`,
    ...decisions.map((d) => `- ${d}`),
    "Review: run review-pr with the repository's reviewer defaults at the default three-round cap. When the loop would ask for a further round or another decision needs the user, end your turn with the request addressed to the coordinator and a checkpoint report: which accepted findings share an underlying mechanism, whether corrections introduced new defects, whether a broader or simpler repair would be better, the concrete residual risk, and what another round would establish.",
    "Your review jobs keep their own ownership, round counts, freezes and process-exit checks, and the machine-wide reviewer and test reservations stay authoritative. The coordinator holds no lock on your worktree.",
    "Never merge, and never mark the PR ready before the review gates pass.",
    `Final report, as fields: ${REPORT_FIELDS.join(", ")} (your model and effort as you read them yourself; the PR number; the last independently reviewed commit; rounds used per reviewer route; outstanding findings or None; the verification evidence; the state of each CI check on the final head), plus any changes after the reviewed commit.`,
  ].join("\n");
}

// --- Command line ---------------------------------------------------------

const FLAGS = new Set(["takeover"]);
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
      return { action: done.action, revision: done.record.revision, pointer: done.pointer, writer: done.record.writer, concurrency: done.record.concurrency };
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
    case "claim": return mutate((r) => claim(r, { plan: absolute(o.plan, "plan"), ticket: number(), worktree: o.worktree, branch: o.branch, artifactParent: o.artifactParent, operation: o.operation }));
    case "launch": return mutate((r) => launch(r, { ticket: number(), executable: o.executable, args: o.arg ?? [], prompt: o.prompt }));
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
    default: throw new Error("Usage: feature-run.mjs init|snapshot|plan|claim|launch|launched|adopt|reconcile|withdraw|verify|release|result|disk-recovery|brief|recover-lock --option value ...");
  }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const output = main(process.argv.slice(2));
    console.log(typeof output === "string" ? output : JSON.stringify(output, null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
