// Portable checkpoints of one parent issue's orchestration. The coordinator's run
// record lives on its own machine; this module publishes a credential-free
// copy of it, with an inventory of the writers' work and a takeover brief, as
// a commit on a dedicated state branch in the tickets repository (the code
// repository until the cutover switch in .agents/repos.json is on), and keeps
// one status comment on the parent issue pointing at the exact checkpoint. A
// coordinator on any machine, account or harness discovers the run from the
// parent issue number alone, takes it over, and reconciles it against GitHub.
//
//   node .agents/skills/orchestrate-issues/checkpoint.mjs <command> --option value ...
//
// Commands: enable, publish, sync-summary, discover, resume, prepare-handoff,
// retrieve, intent, outcome, reconcile-operations, reference, recover-lock.
//
// Each checkpoint commit's first parent is the previous checkpoint, and it is
// pushed without force, so Git itself refuses an update built on a stale
// checkpoint. GitHub stays the authority for issue state, PR heads, reviews and
// CI: the branch carries only what GitHub cannot hold, and a resuming
// coordinator plans again from a fresh snapshot.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeExclusive, readJson, currentIdentity, alive } from "../../../scripts/review-job-store.mjs";
import { jobRootOf } from "../../../scripts/review-job-root.mjs";
import { writerEfforts } from "../../../scripts/reviewer-defaults.mjs";
import { readRepos } from "../../repos.mjs";
import { RECORD_VERSION, BEFORE_RENAME, PERMISSION_MODES, applyInvocation, applyCoordinatorMode, authorityFor, carriedRun, checkCoordinatorId, mergingFor, orchestrationTitle, readRecord, updateRecord, recoverLock, pointerFile, resolveWriterModel, readWriterDefaults, defaultConcurrency, ownerStatus, prRef, qualifyPrs, repositoriesOf, sameRepository, startRepositories } from "./issue-run.mjs";

export const CHECKPOINT_VERSION = 2;
export const stateBranch = (issue) => `orchestrate-state/issue-${issue}`;
// A run started under the skill's previous name: its checkpoints are version
// 1 and its state branch is named after the Feature. Nothing here reads them.
const beforeRename = (issue, what) => new Error(`Issue #${issue} was orchestrated under ${BEFORE_RENAME.skill}: ${what}; ${BEFORE_RENAME.how}`);
export const statusMarker = (issue) => `<!-- orchestrate-issues status: issue ${issue} -->`;
const POINTER_LINE = /<!-- orchestrate-issues checkpoint seq=(\d+) commit=([0-9a-f]{40}) -->/;

// --- Git --------------------------------------------------------------------

// Inherited GIT_* variables (a hook's index, another worktree's directory)
// would redirect these calls; only the ones passed here apply.
export function git(cwd, args, { input, env = {} } = {}) {
  const base = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith("GIT_")));
  try { return execFileSync("git", args, { cwd, env: { ...base, ...env }, encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"], ...(input !== undefined && { input }) }).trim(); }
  catch (error) { error.message = `git ${args.join(" ")} failed: ${(error.stderr || error.message || "").toString().trim()}`; throw error; }
}

export function remoteHeads(checkout, remote, pattern) {
  const out = git(checkout, ["ls-remote", remote, pattern]);
  return new Map(out.split(/\r?\n/).filter(Boolean).map((line) => { const [sha, ref] = line.split("\t"); return [ref.replace(/^refs\/heads\//, ""), sha]; }));
}

// The state branch is fetched into a private ref, so the local branch list and
// FETCH_HEAD are untouched. Once tickets live apart the ref is scoped by the
// tickets repository: a code repository issue and an internal issue of
// the same number fetch into refs of their own, and neither can replace the
// other's between its fetch and its read. A run of one repository keeps the
// name it always had.
const localStateRef = (branch, repository, tickets = repository) => (sameRepository(tickets, repository) ? `refs/orchestrate-issues/${branch}` : `refs/orchestrate-issues/${tickets}/${branch}`);

function readCheckpointAt(checkout, commit) {
  const checkpoint = JSON.parse(git(checkout, ["show", `${commit}:checkpoint.json`]));
  if (checkpoint?.version === 1 && Number.isSafeInteger(checkpoint.seq)) throw beforeRename(checkpoint.feature ?? "?", `commit ${commit} holds a version 1 checkpoint`);
  if (checkpoint?.version !== CHECKPOINT_VERSION || !Number.isSafeInteger(checkpoint.seq) || typeof checkpoint.coordinator?.session !== "string") throw new Error(`Commit ${commit} does not hold a version ${CHECKPOINT_VERSION} checkpoint`);
  return checkpoint;
}

// The current checkpoint on the remote, or null when the parent issue has none. The
// chain is checked one step back: the commit's parents are exactly the
// checkpoint it names as previous (one sequence number earlier), when there
// is one, followed by the snapshot commits it names as its other parents.
// The checkpoint read is the one fetched, so a takeover pushed after the
// branch was listed is seen. The checkpoint must also name the run's tickets
// repository (the code repository for a run of one repository), so a
// checkpoint of the other tracker is refused before anything renders or
// publishes it.
export function fetchState(checkout, remote, repository, issue, tickets = repository) {
  const branch = stateBranch(issue), ref = localStateRef(branch, repository, tickets);
  const head = remoteHeads(checkout, remote, `refs/heads/${branch}`).get(branch);
  if (!head) {
    const old = BEFORE_RENAME.stateBranch(issue);
    if (remoteHeads(checkout, remote, `refs/heads/${old}`).has(old)) throw beforeRename(issue, `its state branch on ${remote} is ${old}`);
    return null;
  }
  git(checkout, ["fetch", "-q", "--no-write-fetch-head", remote, `+refs/heads/${branch}:${ref}`]);
  const commit = git(checkout, ["rev-parse", ref]);
  const checkpoint = readCheckpointAt(checkout, commit);
  if (checkpoint.repository !== repository || checkpoint.issue !== issue) throw new Error(`${branch} holds a checkpoint of ${checkpoint.repository}#${checkpoint.issue}, not ${repository}#${issue}`);
  if (!sameRepository(repositoriesOf(checkpoint).tickets, tickets)) throw new Error(`${branch} holds a checkpoint of a run whose tickets live in ${repositoriesOf(checkpoint).tickets}, not ${tickets}; it is another tracker's issue #${issue}`);
  const parents = git(checkout, ["rev-list", "--parents", "-n", "1", commit]).split(" ").slice(1);
  const expected = [...(checkpoint.previous ? [checkpoint.previous] : []), ...(checkpoint.snapshotParents ?? [])];
  if (parents.join(" ") !== expected.join(" ")) throw new Error(`Checkpoint ${commit} names parents ${expected.join(", ") || "none"} (previous ${checkpoint.previous}), but its parents are ${parents.join(", ") || "none"}; inspect ${branch}`);
  if (checkpoint.previous && readCheckpointAt(checkout, checkpoint.previous).seq !== checkpoint.seq - 1) throw new Error(`Checkpoint ${commit} (seq ${checkpoint.seq}) does not follow its previous checkpoint; inspect ${branch}`);
  return { commit, checkpoint, brief: git(checkout, ["show", `${commit}:brief.md`]), branch };
}

export function writeCommit(checkout, files, parents, message) {
  const entries = Object.keys(files).sort().map((name) => `100644 blob ${git(checkout, ["hash-object", "-w", "--stdin"], { input: files[name] })}\t${name}`);
  const tree = git(checkout, ["mktree"], { input: `${entries.join("\n")}\n` });
  return git(checkout, ["commit-tree", tree, ...parents.flatMap((p) => ["-p", p]), "-F", "-"], { input: message });
}

// --- Credential-free content -----------------------------------------------

// A checkpoint is published to everyone who can read the repository, so any
// string that looks like a credential or an authenticated endpoint stops the
// publication instead of being copied.
const SECRETS = [
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/, "a GitHub token"],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/, "a GitHub token"],
  [/\bsk-ant-[A-Za-z0-9_-]{10,}/, "an Anthropic key"],
  [/\bsk-[A-Za-z0-9]{20,}/, "an API key"],
  [/\bAKIA[0-9A-Z]{16}\b/, "a cloud access key"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "a private key"],
  [/\b(?:authorization|bearer)\b\s*[:=]?\s*[A-Za-z0-9._~+/-]{16,}/i, "an authorization header"],
  [/[a-z][a-z0-9+.-]*:\/\/[^\s/"'@]+:[^\s/"'@]+@/i, "a URL with credentials"],
  [/[?&](?:token|access_token|api_key|apikey|key|auth|sig|signature|code)=[^&\s"']+/i, "a URL with a credential parameter"],
];
export function credentialFindings(value, at = "$") {
  if (typeof value === "string") return SECRETS.filter(([pattern]) => pattern.test(value)).map(([, what]) => `${at} holds ${what}`);
  if (Array.isArray(value)) return value.flatMap((v, i) => credentialFindings(v, `${at}[${i}]`));
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => [...credentialFindings(k, `${at} key`), ...credentialFindings(v, `${at}.${k}`)]);
  return [];
}

// Ticket state as the takeover needs it, with every handle and pending start
// tagged with the host it is on. A stored brief keeps its text, so an
// unconfirmed delivery can still be resent exactly.
function portableTickets(tickets, host) {
  const out = structuredClone(tickets);
  for (const ticket of Object.values(out)) {
    if (ticket.owner?.handle && !ticket.owner.handle.host) ticket.owner.handle.host = host;
    if (ticket.pending && !ticket.pending.host) ticket.pending.host = host;
  }
  return out;
}

// --- Work inventory and snapshots -------------------------------------------

const statusOf = (worktree) => git(worktree, ["--no-optional-locks", "status", "--porcelain=v1", "-z", "--untracked-files=all"]);
const indexFile = (worktree) => path.resolve(worktree, git(worktree, ["rev-parse", "--git-path", "index"]));
const hashFile = (file) => (fs.existsSync(file) ? createHash("sha256").update(fs.readFileSync(file)).digest("hex") : null);

const gitRaw = (cwd, args) => execFileSync("git", args, { cwd, env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith("GIT_"))), windowsHide: true, maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
const REGULAR = new Set(["100644", "100755"]);
// One `<mode> <type or stage...> <sha>\t<path>` entry of ls-files -s or ls-tree.
const entryOf = (line) => { const tab = line.indexOf("\t"); const meta = line.slice(0, tab).split(" "); return { mode: meta[0], sha: meta[1].length === 40 ? meta[1] : meta[2], path: line.slice(tab + 1) }; };

// The trees of a worktree's index and of its files (tracked and non-ignored
// untracked), computed in a copy of its index so neither the worktree nor its
// real index changes. Every regular file that is staged, touched since it was
// indexed, or new is stored byte for byte, past Git's line-ending and filter
// conversions, so the files tree holds exactly what is on disk, including an
// edit whose clean conversion happens to equal HEAD.
function treesOf(worktree) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "checkpoint-index-"));
  const names = (args, env) => git(worktree, [...args, "--no-renames", "--name-only", "-z"], { env }).split("\0").filter(Boolean);
  try {
    const temp = path.join(dir, "index"), real = indexFile(worktree);
    if (fs.existsSync(real)) fs.copyFileSync(real, temp);
    const env = { GIT_INDEX_FILE: temp };
    const index = git(worktree, ["write-tree"], { env });
    // Candidates: staged paths, and every working file whose stat differs
    // from its index entry. diff-files compares stat, not converted content,
    // so an edit whose clean conversion equals HEAD is still listed.
    const touched = [...names(["diff-index", "--cached", "HEAD"], env), ...names(["diff-files"], env)];
    git(worktree, ["add", "-A", "--", "."], { env });
    const changed = new Set([...touched, ...names(["diff-index", "--cached", "HEAD"], env)]);
    const entries = new Map(git(worktree, ["ls-files", "-s", "-z"], { env }).split("\0").filter(Boolean).map((line) => { const e = entryOf(line); return [e.path, e]; }));
    const files = [...changed].filter((file) => REGULAR.has(entries.get(file)?.mode));
    if (files.length) {
      const shas = git(worktree, ["hash-object", "-w", "--no-filters", "--stdin-paths"], { input: `${files.join("\n")}\n` }).split(/\r?\n/);
      if (shas.length !== files.length) throw new Error(`hashing ${files.length} files in ${worktree} returned ${shas.length} objects`);
      git(worktree, ["update-index", "-z", "--index-info"], { env, input: files.map((file, i) => `${entries.get(file).mode} ${shas[i]}\t${file}\0`).join("") });
    }
    return { index, files: git(worktree, ["write-tree"], { env }) };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// Everything a snapshot would publish that the checkpoint's own remote does
// not already hold: the snapshot and index commits' changes from HEAD, and,
// for every commit of HEAD's history that none of that remote's branches
// reaches, its message and its changes. History another remote holds counts
// as unpublished here, except the code repository's remote once the state
// branch lives in the private tickets repository: the public code repository
// already shows that history to everyone the tickets repository does. Any of
// it that looks like a credential refuses the snapshot; only paths and
// commits are named. A submodule's gitlink names a commit of another
// repository, which the checkpoint never carries.
export function snapshotCredentials(worktree, head, commits, remote, { live = false, codeRemote = remote } = {}) {
  // The remotes' branches as they report them. Offline, a snapshot may be made
  // against the branches this checkout last fetched from those same remotes,
  // but those can be stale, so publication scans again with live = true,
  // where only what the remotes report counts.
  const tipsOf = (name) => {
    try { return [...remoteHeads(worktree, name, "refs/heads/*").values()]; }
    catch (error) { if (live) throw error; return git(worktree, ["for-each-ref", "--format=%(objectname)", `refs/remotes/${name}/`]).split(/\r?\n/).filter(Boolean); }
  };
  const tips = [...new Set([remote, codeRemote])].flatMap(tipsOf);
  const published = tips.filter((sha) => spawnOk(worktree, ["cat-file", "-e", `${sha}^{commit}`]));
  const unpushed = git(worktree, ["rev-list", head, ...(published.length ? ["--not", ...published] : [])]).split(/\r?\n/).filter(Boolean);
  const blobs = new Map();
  const collect = (args) => { for (const line of git(worktree, ["diff-tree", "-r", "--no-renames", "--no-commit-id", "--root", "-z", ...args]).split("\0").reduce((out, part, i, all) => (part.startsWith(":") ? [...out, `${part}\t${all[i + 1]}`] : out), [])) { const [meta, file] = line.split("\t"); const [, mode, , sha] = meta.split(" "); if (!/^0+$/.test(sha) && mode !== "160000") blobs.set(sha, file); } };
  for (const c of commits) collect([head, c]);
  for (const c of unpushed) collect(["-m", "--first-parent", c]);
  const findings = [];
  for (const c of unpushed) for (const finding of credentialFindings(gitRaw(worktree, ["cat-file", "commit", c]).toString("latin1"), `commit ${c}`)) findings.push(finding);
  for (const [sha, file] of blobs) {
    let text;
    try { text = gitRaw(worktree, ["cat-file", "blob", sha]).toString("latin1"); }
    catch (error) { findings.push(`${file} could not be read for the credential check (${error.message})`); continue; }
    for (const finding of credentialFindings(text, file)) findings.push(finding);
  }
  return findings;
}

const sourceState = (worktree) => ({ head: git(worktree, ["rev-parse", "HEAD"]), status: statusOf(worktree), index: hashFile(indexFile(worktree)) });

// A work-in-progress snapshot of a writer's unfinished files, shaped like a
// stash: the snapshot commit's parents are the worktree's HEAD and a commit of
// its index. It is reachable from the state branch, never from the writer's
// branch, so a frozen review head is untouched. A snapshot is work in
// progress, never review or completion evidence.
// Why a worktree's current state cannot be carried by a snapshot, or null. An
// unmerged index has no single staged state, and a submodule's own commits and
// files live in another repository.
export function unrepresentable(worktree) {
  const unmerged = [...new Set(git(worktree, ["ls-files", "-u", "-z"]).split("\0").filter(Boolean).map((line) => entryOf(line).path))];
  if (unmerged.length) return `unmerged paths (${unmerged.join(", ")}), as a merge or rebase in progress leaves them; finish or abort it`;
  const submodules = git(worktree, ["--no-optional-locks", "status", "--porcelain=v2", "-z", "--untracked-files=no", "--ignore-submodules=none"]).split("\0").filter((line) => /^[12] \S{2} S/.test(line)).map((line) => line.split(" ").slice(line.startsWith("2 ") ? 9 : 8).join(" "));
  const gitlinks = git(worktree, ["diff-index", "--cached", "--no-renames", "--raw", "-z", "HEAD"]).split("\0").reduce((out, part, i, all) => (part.startsWith(":") && (part.split(" ")[0] === ":160000" || part.split(" ")[1] === "160000") ? [...out, all[i + 1]] : out), []);
  const changed = [...new Set([...submodules, ...gitlinks])];
  if (changed.length) return `changed submodules (${changed.join(", ")}); another repository's work is committed and pushed from the submodule`;
  return null;
}

export function snapshotWorktree(worktree, { ticket, branch, remote = DEFAULT_REMOTE, codeRemote = remote, host = os.hostname() }) {
  const before = sourceState(worktree);
  // The handoff reports a worktree a snapshot cannot carry as not snapshotted.
  const blocked = unrepresentable(worktree);
  if (blocked) throw new Error(`${worktree} has ${blocked}, so it cannot be snapshotted`);
  const trees = treesOf(worktree);
  const headTree = git(worktree, ["rev-parse", `${before.head}^{tree}`]);
  if (trees.index === headTree && trees.files === headTree) return { clean: true, head: before.head };
  const indexCommit = git(worktree, ["commit-tree", trees.index, "-p", before.head, "-F", "-"], { input: `index of #${ticket} at ${before.head}\n` });
  const commit = git(worktree, ["commit-tree", trees.files, "-p", before.head, "-p", indexCommit, "-F", "-"], { input: `work-in-progress snapshot of #${ticket} on ${branch} at ${before.head}\n\nNot reviewed and not completion evidence.\n` });
  const after = sourceState(worktree);
  if (after.head !== before.head || after.status !== before.status || after.index !== before.index) throw new Error(`${worktree} changed while it was snapshotted; ask its writer to reach a safe boundary and snapshot again`);
  // Computing the trees again proves the snapshot holds the files as they are.
  const again = treesOf(worktree);
  if (again.files !== trees.files || again.index !== trees.index) throw new Error(`${worktree} changed after it was snapshotted; snapshot again`);
  const findings = snapshotCredentials(worktree, before.head, [commit, indexCommit], remote, { codeRemote });
  if (findings.length) throw new Error(`The snapshot of #${ticket} would publish credentials: ${findings.join("; ")}; it stays on this host only`);
  const paths = git(worktree, ["diff-tree", "-r", "--name-only", "-z", "--no-renames", before.head, commit]).split("\0").filter(Boolean);
  return { clean: false, commit, indexCommit, head: before.head, branch, files: trees.files, index: trees.index, paths, host, time: new Date().toISOString(), sourceUnchanged: true };
}

// The review jobs a PR's rounds ran on this host, as their journals record
// them: the latest completed accounting (the planned reviewers, which
// completed and which are pending, the reviewed head and the posted report
// comments) and the latest attempt launched, which may not have completed.
export function reviewJobs(checkout, pr) {
  const root = path.join(jobRootOf(fs.realpathSync.native(checkout)), `pr-${pr}`);
  if (!fs.existsSync(root)) return [];
  const jobs = [];
  for (const round of fs.readdirSync(root).filter((d) => /^round-\d+$/.test(d))) {
    for (const launch of fs.readdirSync(path.join(root, round))) {
      const journal = path.join(root, round, launch, "journal.jsonl");
      if (!fs.existsSync(journal)) continue;
      let rows;
      try { rows = fs.readFileSync(journal, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line)); }
      catch (error) { jobs.push({ job: `pr-${pr}/${round}/${launch}`, unreadable: error.message }); continue; }
      const completed = rows.filter((r) => r.event === "completed").at(-1);
      const attempted = rows.filter((r) => r.event === "launching").at(-1);
      jobs.push({
        job: `pr-${pr}/${round}/${launch}`, lastEvent: rows.at(-1)?.event ?? null,
        ...(attempted && { attempted: { round: attempted.round ?? null, step: attempted.step ?? null, reviewerId: attempted.reviewerId ?? null, attempt: attempted.attempt ?? null, plannedReviewers: attempted.plannedReviewers ?? null, head: attempted.head ?? null, completedRoundReviewers: attempted.completedRoundReviewers ?? null, time: attempted.time ?? null } }),
        ...(completed && { round: completed.completedRound, reviewerId: completed.reviewerId ?? null, attempt: completed.attempt ?? null, reviewedHead: completed.reviewedHead, completedRoundReviews: completed.completedRoundReviews, completedRoundReviewers: completed.completedRoundReviewers ?? null, plannedRoundReviewers: completed.plannedRoundReviewers ?? null, pendingReviewers: completed.pendingReviewers ?? null, finalCorrections: completed.finalCorrections ?? null, commentIds: completed.commentIds ?? [] }),
      });
    }
  }
  return jobs;
}

// The work inventory is kept per location: one entry per worktree, keyed by the
// host it is on and its path, naming its ticket. Each host observes and retires
// only its own locations; another host's entries pass through every checkpoint
// unchanged until that host observes them again. Snapshots are kept apart, per
// ticket, so no observation can drop one.
export const locationKey = (host, worktree) => `${host}|${worktree}`;
export const workFor = (checkpoint, ticket) => Object.values(checkpoint?.work ?? {}).filter((w) => String(w.ticket) === String(ticket));

// This host's locations: every worktree a ticket held here uses, and every
// location this host recorded before. Each is observed while it exists:
// whether its head reached the remote, whether files are unfinished, a stale
// handoff lock and its PR's review jobs. A location that is gone keeps its
// last observation with its time. A location is retired once nothing holds it
// and it holds neither unfinished files nor unpushed commits. The inventory
// never judges whether a snapshot holds a location's work: unfinished or
// unpushed work is always reported as possibly existing only on its host.
export function inventoryWork(record, { host = os.hostname(), remote, snapshots = {}, prs = {}, previousWork = {} } = {}) {
  const locations = new Map();
  for (const [number, ticket] of Object.entries(record.tickets)) {
    const held = ticket.owner ?? ticket.pending;
    if (!held?.worktree || (ticket.owner?.handle?.host ?? ticket.pending?.host ?? host) !== host) continue;
    locations.set(locationKey(host, held.worktree), { ticket: Number(number), worktree: held.worktree, branch: held.branch, held: true });
  }
  for (const [key, before] of Object.entries(previousWork)) {
    if (before.host !== host) continue;
    locations.set(key, { ticket: before.ticket, worktree: before.worktree, branch: before.branch, held: false, ...locations.get(key), before });
  }
  const work = {};
  let heads = null;
  const now = new Date().toISOString();
  for (const [key, { ticket: number, worktree, branch, held, before }] of locations) {
    const ticket = record.tickets[number] ?? {};
    const snap = snapshots[number] && !snapshots[number].clean ? snapshots[number] : null;
    const entry = { ticket: number, host, worktree, branch: branch ?? before?.branch ?? snap?.branch ?? null, observedAt: now, held };
    if (worktree && fs.existsSync(worktree)) {
      try {
        heads ??= remoteHeads(record.checkout, remote, "refs/heads/*");
        entry.head = git(worktree, ["rev-parse", "HEAD"]);
        const pushed = heads.get(entry.branch) ?? null;
        entry.remoteHead = pushed;
        entry.unpushed = pushed === entry.head ? false : pushed && spawnOk(worktree, ["merge-base", "--is-ancestor", entry.head, pushed]) ? false : true;
        entry.dirty = statusOf(worktree).length > 0 || rawEdits(worktree).length > 0;
        const lock = path.join(git(worktree, ["rev-parse", "--path-format=absolute", "--git-dir"]), "agent-handoff.lock");
        if (fs.existsSync(lock)) { let owner = null; try { owner = readJson(lock); } catch { /* reported as unreadable below */ } entry.handoffLock = owner ? { host: owner.host ?? null, pid: owner.processIdentity?.pid ?? owner.pid ?? null } : { unreadable: true }; }
      } catch (error) { entry.error = error.message; }
    } else {
      // Nothing can be observed: the last observation stands, with its time.
      if (worktree) entry.exists = false;
      const last = before ? (before.lastObserved ?? { at: before.observedAt, head: before.head, dirty: before.dirty, unpushed: before.unpushed }) : null;
      if (last && [last.dirty, last.unpushed].some((v) => v !== undefined)) entry.lastObserved = last;
    }
    const pr = prs[number] ?? ticket.owner?.adopted?.pr ?? ticket.owner?.continues?.pr ?? ticket.results?.at(-1)?.report?.pr ?? before?.pr ?? null;
    if (Number.isSafeInteger(pr)) { entry.pr = pr; entry.reviewJobs = reviewJobs(record.checkout, pr); }
    const s = workState(entry);
    if (!held && !s.dirty && !s.unpushed && !s.unknown && !entry.handoffLock && !entry.error) continue;
    work[key] = entry;
  }
  return work;
}

// A location's state as last known: observed now when its worktree exists,
// otherwise as last observed, with the time; unknown when it could not be
// observed.
export const workState = (w) => {
  const last = w?.lastObserved ?? {};
  const dirty = w?.dirty ?? last.dirty, unpushed = w?.unpushed ?? last.unpushed;
  return { head: w?.head ?? last.head, dirty, unpushed, at: w?.dirty !== undefined ? w.observedAt : last.at, unknown: w?.exists !== false && dirty === undefined && Boolean(w?.error) };
};
// What of a location may exist only on its host, in words a destination acts
// on. A snapshot never counts as holding it: the destination is told the
// snapshot exists, and that the source may hold more.
export function onlyHereDetails(w, snap) {
  const s = workState(w), gone = w.exists === false ? " (that worktree has since gone from its path)" : "";
  const saved = snap && !snap.clean ? `; snapshot ${snap.commit} holds only what was saved at ${snap.time ?? "the handoff"}` : "";
  const what = [s.dirty && "unfinished files", s.unpushed && "unpushed commits"].filter(Boolean);
  const details = [];
  if (what.length) details.push(`as of ${s.at}, ${w.host} held ${what.join(" and ")} in ${w.worktree}${gone} that may exist only there${saved}`);
  if (s.unknown) details.push(`the state of ${w.worktree} on ${w.host} could not be observed (${w.error}); treat its work as existing only there`);
  return details;
}
// Every ticket a checkpoint mentions: held, snapshotted or located.
export const ticketsIn = (c) => [...new Set([...Object.keys(c.tickets ?? {}), ...Object.keys(c.snapshots ?? {}), ...Object.values(c.work ?? {}).map((w) => String(w.ticket))])].sort((a, b) => a - b);

// Unfinished bytes Git's converted status cannot see: working files whose
// stat differs from their index entry and whose raw bytes differ from what
// checking that entry out here would write (a clean filter or line-ending
// conversion can make an edit look unchanged). Once Git re-indexes such a
// file it treats it as unchanged, and so do the snapshot and the inventory,
// which both select files this way.
function rawEdits(worktree) {
  const candidates = git(worktree, ["--no-optional-locks", "diff-files", "--name-only", "-z"]).split("\0").filter(Boolean);
  if (!candidates.length) return [];
  // Each candidate costs a checkout conversion; past this many, the worktree
  // is reported as holding edits rather than checked file by file.
  if (candidates.length > 1000) return candidates;
  const entries = new Map(git(worktree, ["ls-files", "-s", "-z"]).split("\0").filter(Boolean).map((line) => { const e = entryOf(line); return [e.path, e]; }));
  return candidates.filter((file) => {
    const e = entries.get(file), there = statOrNull(path.join(worktree, file));
    if (!e || !REGULAR.has(e.mode) || !there?.isFile()) return false;
    return !fs.readFileSync(path.join(worktree, file)).equals(gitRaw(worktree, ["cat-file", "--filters", `:${file}`]));
  });
}

// A path below a file is absent too; POSIX reports it as ENOTDIR.
const statOrNull = (file) => { try { return fs.lstatSync(file); } catch (error) { if (error.code === "ENOENT" || error.code === "ENOTDIR") return null; throw error; } };
const spawnOk = (cwd, args) => { try { git(cwd, args); return true; } catch { return false; } };

// --- Publication state ------------------------------------------------------

// The publication state sits beside the run record rather than in it, so a
// publish never moves the record's revision under the coordinator.
export const sidecarOf = (file) => `${file}.checkpoint.json`;
const readSidecar = (file) => { try { return readJson(sidecarOf(file)); } catch (error) { if (error.code === "ENOENT") return { saved: null, attempt: null, summary: null }; throw new Error(`${sidecarOf(file)} is unreadable (${error.message}); preserve it and inspect it`); } };
function writeSidecar(file, value) {
  const temp = `${sidecarOf(file)}.${randomUUID()}.tmp`;
  writeExclusive(temp, value);
  fs.renameSync(temp, sidecarOf(file));
}

function withLock(file, run) {
  const target = sidecarOf(file), lock = `${target}.lock`, token = randomUUID();
  try { writeExclusive(lock, { token, identity: currentIdentity() }); }
  catch (error) {
    if (error.code !== "EEXIST") throw error;
    let holder = "an unreadable holder";
    try { const owner = readJson(lock); holder = alive(owner.identity) ? `running process ${owner.identity.pid}` : `exited process ${owner.identity.pid}; run checkpoint.mjs recover-lock --record ${file}`; } catch { /* keep the generic description */ }
    throw new Error(`${lock} is held by ${holder}; nothing was published`);
  }
  try {
    if (fs.existsSync(`${lock}.recovery`)) throw new Error(`Recovery of ${lock} is in progress or was interrupted; nothing was published`);
    return run();
  } finally {
    let held;
    try { held = readJson(lock).token === token; } catch { held = false; }
    if (held) fs.unlinkSync(lock);
  }
}

export class CoordinatorChanged extends Error {}

// --- Status comment -------------------------------------------------------

export function githubComments(repository, checkout) {
  const run = (args, input) => execFileSync("gh", args, { cwd: checkout, encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024, ...(input !== undefined && { input }) });
  const shape = (c) => ({ id: c.id, body: c.body ?? "", url: c.html_url });
  return {
    list: (issue) => JSON.parse(run(["api", "--paginate", "--slurp", `repos/${repository}/issues/${issue}/comments`])).flat().map(shape),
    get: (id) => shape(JSON.parse(run(["api", `repos/${repository}/issues/comments/${id}`]))),
    create: (issue, body) => shape(JSON.parse(run(["api", "-X", "POST", `repos/${repository}/issues/${issue}/comments`, "--input", "-"], JSON.stringify({ body })))),
    update: (id, body) => shape(JSON.parse(run(["api", "-X", "PATCH", `repos/${repository}/issues/comments/${id}`, "--input", "-"], JSON.stringify({ body })))),
  };
}

const short = (sha) => sha?.slice(0, 9) ?? "none";
const cell = (text) => String(text ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
const ownerText = (t) => {
  if (t.owner) return `${t.owner.route} ${t.owner.model} at ${t.owner.effort}, ${t.owner.handle.kind} ${t.owner.handle.id ?? t.owner.handle.pid} on ${t.owner.handle.host}`;
  if (t.pending) return `pending ${t.pending.operation} on ${t.pending.route} (claimed on ${t.pending.host})`;
  return "none";
};
// Every location is shown as an observation at its own time, since another
// host's entry passes through later checkpoints unchanged; a flag nobody
// observed is said to be unknown, never clean or pushed.
const locationText = (w) => {
  const s = workState(w);
  const flag = (value, yes, no, unknown) => (value === undefined ? unknown : value ? yes : no);
  const parts = [...(w.exists === false ? ["worktree missing"] : []), ...(s.at ? [`as of ${s.at}`] : []), flag(s.unpushed, "unpushed commits", "head pushed", "push state unknown"), flag(s.dirty, "unfinished files", "clean", "file state unknown")];
  if (w.handoffLock) parts.push("handoff lock present");
  return parts.join(", ");
};
// A ticket's work on every host that holds some, and its snapshot beside it.
const workText = (c, n) => {
  const snap = c.snapshots?.[n];
  return [...workFor(c, n).map((w) => `${w.host}: ${locationText(w)}`), ...(snap && !snap.clean ? [`snapshot ${short(snap.commit)} from ${snap.host ?? "its source"}`] : [])].join("; ");
};

export function renderSummary(state, repository) {
  const { checkpoint: c, commit } = state;
  const link = `https://github.com/${repository}/tree/${commit}`;
  const tickets = new Map(Object.entries(c.tickets).map(([n, t]) => [Number(n), { owner: ownerText(t) }]));
  for (const n of [...Object.keys(c.snapshots ?? {}), ...Object.values(c.work ?? {}).map((w) => w.ticket)]) if (!tickets.has(Number(n))) tickets.set(Number(n), { owner: "none" });
  for (const t of c.observed?.tickets ?? []) tickets.set(t.number, { ...(tickets.get(t.number) ?? { owner: "none" }), action: t.action, reason: t.reason, pr: t.pr });
  // The comment is on the parent issue, in the tickets repository, so its pull
  // requests name the code repository once tickets live apart.
  const names = repositoriesOf(c);
  const rows = [...tickets.entries()].sort(([a], [b]) => a - b).map(([n, t]) => `| #${n} | ${cell(t.action ?? "")} | ${t.pr ? prRef(names, t.pr) : ""} | ${cell(t.owner)} | ${cell(workText(c, n))} | ${cell(t.reason ?? "")} |`);
  const prior = c.previousCoordinators.map((p) => `${p.session} on ${p.host} (${p.ended})`).join("; ");
  return qualifyPrs(names, [
    statusMarker(c.issue),
    `<!-- orchestrate-issues checkpoint seq=${c.seq} commit=${commit} -->`,
    "## Orchestration status",
    "",
    `Checkpoint ${c.seq} is [\`${short(commit)}\`](${link}) on \`${stateBranch(c.issue)}\`, saved ${c.time} after ${c.transition}. The [takeover brief](https://github.com/${repository}/blob/${commit}/brief.md) and the full record are in that commit; this comment summarizes it and may lag it.`,
    "",
    `Coordinator: session ${c.coordinator.session} on ${c.coordinator.host} (${c.coordinator.harness}, ${c.coordinator.model} at ${c.coordinator.effort}) since ${c.coordinator.since}.${prior ? ` Previous: ${prior}.` : ""}`,
    `Handoff: ${c.handoff ? `${c.handoff.state} since ${c.handoff.since}; new dispatch is stopped` : "none; dispatch continues"}.`,
    `Writers: ${c.writer.model} (${c.writer.source}); concurrency ${c.concurrency.limit}.`,
    "",
    `| Ticket | Action${c.observed ? ` (planned ${c.observed.at})` : ""} | PR | Owner | Work on its host | Reason |`,
    "| --- | --- | --- | --- | --- | --- |",
    ...(rows.length ? rows : ["| none | | | | | |"]),
    "",
    ...(c.operations?.some((o) => !["confirmed", "not-applied", "superseded", "failed"].includes(o.state)) ? ["Unsettled operations: " + c.operations.filter((o) => !["confirmed", "not-applied", "superseded", "failed"].includes(o.state)).map((o) => `${operationText(o)} at ${short(o.expectHead)} (${o.state})`).join("; ") + ".", ""] : []),
    ...(c.verifications?.length ? [verificationText(c.verifications.at(-1)), ""] : []),
    ...(c.observed?.remaining?.length ? ["Remaining:", ...c.observed.remaining.map((r) => `- ${r}`), ""] : []),
    `To continue in another session, on any machine: use orchestrate-issues for #${c.issue}; it resumes from \`${stateBranch(c.issue)}\` and reconciles every fact with GitHub first.`,
  ].join("\n"));
}

const sameText = (a, b) => a.replace(/\r\n/g, "\n").trim() === b.replace(/\r\n/g, "\n").trim();
const markerComments = (github, issue) => github.list(issue).filter((c) => c.body.includes(statusMarker(issue))).sort((a, b) => a.id - b.id);

// Writes the status comment from the checkpoint at the head of the state
// branch and reads it back. It repeats no other side effect, so a failed or
// interrupted summary is repaired by running it again.
export function syncSummary({ repository, tickets = repository, issue, checkout, remote, github, commentId, state }) {
  const current = state ?? fetchState(checkout, remote, repository, issue, tickets);
  if (!current) throw new Error(`Issue #${issue} has no checkpoint on ${stateBranch(issue)}`);
  // The state branch is in the tickets repository the checkpoint names.
  const body = renderSummary(current, repositoriesOf(current.checkpoint).tickets);
  let existing = null, duplicates = [];
  if (commentId) { try { const c = github.get(commentId); if (c.body.includes(statusMarker(issue))) existing = c; } catch { existing = null; } }
  if (!existing) { const found = markerComments(github, issue); existing = found.at(-1) ?? null; duplicates = found.slice(0, -1).map((c) => c.id); }
  let written;
  if (existing && sameText(existing.body, body)) written = existing;
  else if (existing) written = github.update(existing.id, body);
  else written = github.create(issue, body);
  const back = github.get(written.id);
  const pointer = POINTER_LINE.exec(back.body);
  if (!pointer || Number(pointer[1]) !== current.checkpoint.seq || pointer[2] !== current.commit) throw new Error(`Comment ${written.id} did not read back as checkpoint ${current.checkpoint.seq}`);
  return { commentId: back.id, url: back.url, seq: current.checkpoint.seq, commit: current.commit, ...(duplicates.length && { duplicates }) };
}

// --- Publishing -------------------------------------------------------------

const DEFAULT_REMOTE = "origin";
// The remote of the code repository, which holds the writers' branches.
export const CODE_REMOTE = "origin";

// The remote that holds the state branch. In one repository it is the remote
// named, origin by default. Once tickets live apart it is the checkout's
// remote whose every URL names the tickets repository: its fetch URL and each
// push URL, as Git expands them (insteadOf and pushInsteadOf included), since
// a push goes to every push URL. A named remote that reaches anything else is
// refused, here and again before each publication, so neither the state
// branch nor a writer's snapshot reaches the code repository.
export const namesRepository = (url, repository) => {
  const u = String(url).trim().replace(/\\/g, "/").replace(/\/+$/, "").replace(/\.git$/i, "").toLowerCase(), r = repository.toLowerCase();
  return u.endsWith(`/${r}`) || u.endsWith(`:${r}`);
};
const remoteUrls = (checkout, name) => [...new Set([git(checkout, ["remote", "get-url", name]), ...git(checkout, ["remote", "get-url", "--push", "--all", name]).split(/\r?\n/).filter(Boolean)])];
export function stateRemote(checkout, names, remote) {
  const { split, tickets } = repositoriesOf(names);
  if (!split) return remote ?? DEFAULT_REMOTE;
  const elsewhere = (name) => remoteUrls(checkout, name).filter((url) => !namesRepository(url, tickets));
  if (remote) {
    const other = elsewhere(remote);
    if (!other.length) return remote;
    throw new Error(`Remote ${remote} reaches ${other.join(", ")}, not only the tickets repository ${tickets}; once the cutover switch in .agents/repos.json is on, the state branch goes only to a remote whose fetch and push URLs all name it`);
  }
  const found = git(checkout, ["remote"]).split(/\r?\n/).filter(Boolean).sort().find((name) => !elsewhere(name).length);
  if (found) return found;
  throw new Error(`No remote of ${checkout} names only the tickets repository ${tickets}, which holds the state branch once the cutover switch in .agents/repos.json is on; add one with git remote add internal https://github.com/${tickets}.git`);
}
// The record's checkpoint remotes: the state branch's, and the code
// repository's, which a record from one repository does not name apart.
const remotesOf = (record) => ({ remote: record.checkpoints.remote, codeRemote: record.checkpoints.codeRemote ?? record.checkpoints.remote });

function takeoverBrief(c, commit) {
  const lines = [`# Takeover brief for issue #${c.issue}`, "", `Checkpoint ${c.seq} (${commit ?? "this commit"}), ${c.time}, after ${c.transition}. Coordinator ${c.coordinator.session} on ${c.coordinator.host}.`, ""];
  lines.push("Resume with checkpoint.mjs resume in a new session; it takes over only by pushing a takeover checkpoint on top of this one. Then snapshot GitHub and plan: GitHub is the authority for issues, PR heads, review rounds and CI, and nothing below replaces that reading.", "");
  lines.push("- Every writer, pending start and process below belongs to the host it names. A destination's local view of another host proves nothing: an absent PID, an unlisted session or a missing launch directory there is not an exit. Such a writer stays unknown until it is observed on its own host, by its coordinator there or by the maintainer, and recorded as an observation naming that host.");
  lines.push("- A review continuation belongs to the writer session that submitted it. Never claim it from another session; once that writer is observed to have ended, cancel and release the job on its host as the review supervisor describes, and continue the PR with a new writer whose round count continues from the PR's posted rounds.");
  lines.push(`- The periodic check-in is session-scoped and ended with its coordinator; recreate it on your own runner${c.checkIn?.command ? ` with: ${c.checkIn.command}` : ""}.`);
  lines.push("- New and replacement writers use your harness's default writer model unless the invocation's explicit model override still applies; writers already running keep their recorded model and effort. Confirm each new route with its preflight before dispatch, and let review-pr select reviewers against the actual new writer.", "");
  for (const n of ticketsIn(c)) {
    const t = c.tickets[n] ?? {};
    const snap = c.snapshots?.[n];
    const notes = [];
    if (t.owner || t.pending) notes.push(ownerText(t));
    if (snap && !snap.clean) notes.push(`unfinished work as of ${snap.time ?? "the handoff"} is in snapshot ${snap.commit} from ${snap.host ?? "its source"}; retrieve it with checkpoint.mjs retrieve --ticket ${n}`);
    for (const w of workFor(c, n)) {
      for (const detail of onlyHereDetails(w, snap)) notes.push(`${detail}; recover those bytes there before restarting or overwriting this work`);
      if (w.handoffLock) notes.push(`a handoff lock (host ${w.handoffLock.host ?? "unknown"}) remains in ${w.worktree}; on ${w.host}, node scripts/agent-handoff.mjs recover-lock ${w.worktree} removes it once its coordinator and child are confirmed gone`);
      for (const j of w.reviewJobs ?? []) {
        const done = j.round ? `round ${j.round} reviewed ${short(j.reviewedHead)}, completed ${JSON.stringify(j.completedRoundReviewers)} of planned ${JSON.stringify(j.plannedRoundReviewers)}` : "no completed review";
        const tried = j.attempted ? `; last launched reviewer ${j.attempted.reviewerId ?? j.attempted.step} attempt ${j.attempted.attempt ?? "?"} of round ${j.attempted.round ?? "?"} (planned ${JSON.stringify(j.attempted.plannedReviewers)})` : "";
        notes.push(`review job ${j.job} on ${w.host}: ${done}${tried}, last event ${j.lastEvent}`);
      }
    }
    if (notes.length) lines.push(`## #${n}`, "", ...notes.map((x) => `- ${x}`), "");
  }
  const open = (c.operations ?? []).filter((o) => !["confirmed", "not-applied", "superseded", "failed"].includes(o.state));
  if (open.length) lines.push("## Unsettled operations", "", ...open.map((o) => `- ${o.id}: ${operationText(o)} at ${o.expectHead}, ${o.state}; settle it with checkpoint.mjs reconcile-operations before any retry`), "");
  if (c.verifications?.length) lines.push("## Issue verification", "", verificationText(c.verifications.at(-1)), "");
  if (c.handoff?.uncertain?.length) lines.push("## Running or uncertain at handoff", "", ...c.handoff.uncertain.map((u) => `- #${u.ticket}: ${u.status} (${u.reason})`), "");
  return `${lines.join("\n").trim()}\n`;
}

export function buildCheckpoint(record, { seq, previous, snapshotParents = [], kind, transition, host, work, snapshots = record.snapshots ?? {}, observed }) {
  const checkpoint = {
    version: CHECKPOINT_VERSION, repository: record.repository, ...(record.ticketsRepository !== undefined && { ticketsRepository: record.ticketsRepository }), issue: record.issue, seq, previous, snapshotParents, time: new Date().toISOString(), kind, transition,
    run: { runId: record.runId, recordRevision: record.revision, source: { host, checkout: record.checkout } },
    coordinator: record.coordinator, previousCoordinators: record.previousCoordinators,
    invocation: record.invocation, authority: record.authority, writer: record.writer, concurrency: record.concurrency,
    checkIn: record.checkIn ?? null, title: record.title ?? null,
    tickets: portableTickets(record.tickets, host),
    operations: record.operations ?? [], decisions: decisionLinks(record), diskRecoveries: record.diskRecoveries, verifications: record.verifications ?? [],
    work: work ?? {}, snapshots,
    handoff: record.handoff ?? null,
    observed: observed ?? null,
    log: record.log.slice(-100),
  };
  const findings = credentialFindings(checkpoint);
  if (findings.length) throw new Error(`The checkpoint would publish credentials: ${findings.join("; ")}; nothing was published`);
  return checkpoint;
}

// Two plan summaries say the same when their tickets and remaining work do;
// the time they were planned does not count.
const sameObservation = (a, b) => JSON.stringify(a ? { tickets: a.tickets, remaining: a.remaining } : null) === JSON.stringify(b ? { tickets: b.tickets, remaining: b.remaining } : null);

// A compact view of a plan for the summary, made at the moment it was planned.
export const observedFrom = (plan) => (plan ? { at: plan.plannedAt ?? new Date().toISOString(), tickets: plan.tickets.map((t) => ({ number: t.number, action: t.action, pr: t.pr ?? null, reason: t.reason })), remaining: plan.remaining ?? [] } : null);

// Publishes the run record as the next checkpoint. The previous checkpoint is
// the one this coordinator last saved; a remote head written by another
// coordinator stops this one, and an update Git refuses is reported, never
// forced. A save counts only after the remote head and content read back.
export function publish(file, { coordinator, kind = "auto", transition = "an explicit publish", plan, snapshots = {}, host = os.hostname(), github, takeoverFrom, sync = true, onlyIfChanged = false } = {}) {
  const record = readRecord(file);
  if (record.coordinator.session !== coordinator) throw new Error(`Issue #${record.issue} is coordinated by ${record.coordinator.session}; ${coordinator} may not publish its checkpoint`);
  if (!record.checkpoints) throw new Error("Checkpoints are not enabled for this run; run checkpoint.mjs enable");
  const { remote, codeRemote } = remotesOf(record), { tickets } = repositoriesOf(record);
  // The remote's URLs may have changed since enable; a publication never
  // reaches beyond the tickets repository.
  stateRemote(record.checkout, record, remote);
  github ??= githubComments(tickets, record.checkout);
  return withLock(file, () => {
    const side = readSidecar(file);
    const head = fetchState(record.checkout, remote, record.repository, record.issue, tickets);
    let previous = head?.commit ?? null;
    if (head && head.checkpoint.coordinator.session !== coordinator && head.commit !== takeoverFrom) throw new CoordinatorChanged(`Issue #${record.issue} has been taken over: checkpoint ${head.checkpoint.seq} (${head.commit}) names coordinator ${head.checkpoint.coordinator.session} on ${head.checkpoint.coordinator.host}. This coordinator must stop; nothing was published`);
    if (!head && side.saved) throw new Error(`${stateBranch(record.issue)} is missing although checkpoint ${side.saved.seq} (${side.saved.commit}) was saved; inspect the remote before publishing again`);
    if (head && head.checkpoint.coordinator.session === coordinator) {
      // A checkpoint of this run made from a later record revision means this
      // record is an outdated copy; publishing it would undo newer state.
      if (head.checkpoint.run.runId === record.runId && head.checkpoint.run.recordRevision > record.revision) throw new Error(`Checkpoint ${head.checkpoint.seq} (${head.commit}) holds record revision ${head.checkpoint.run.recordRevision}, newer than this record's revision ${record.revision}; this copy of the record is outdated, so nothing was published`);
      if (head.checkpoint.run.runId !== record.runId) throw new Error(`Checkpoint ${head.checkpoint.seq} (${head.commit}) names this coordinator but another run ${head.checkpoint.run.runId}; inspect it before publishing`);
      if (side.saved && head.commit !== side.saved.commit) {
        // Only this record's own attempt, landed after its outcome was lost,
        // explains a remote head it did not save.
        if (side.attempt?.commit !== head.commit) throw new Error(`Checkpoint ${head.checkpoint.seq} (${head.commit}) is neither the checkpoint this record last saved (${side.saved.commit}) nor its pending attempt; another copy of this record published it, so nothing was published`);
        side.saved = { seq: head.checkpoint.seq, commit: head.commit, recordRevision: head.checkpoint.run.recordRevision, runId: head.checkpoint.run.runId, time: head.checkpoint.time, recovered: true };
      }
    }
    // A plan that changes nothing the checkpoint holds publishes nothing.
    const observed = observedFrom(plan) ?? head?.checkpoint.observed ?? null;
    if (onlyIfChanged && head && head.checkpoint.run.runId === record.runId && head.checkpoint.run.recordRevision === record.revision && sameObservation(observed, head.checkpoint.observed)) return { saved: true, unchanged: true, seq: head.checkpoint.seq, commit: head.commit };
    const seq = (head?.checkpoint.seq ?? 0) + 1;
    const fresh = Object.fromEntries(Object.entries(snapshots).filter(([, s]) => s && !s.clean));
    const allSnapshots = { ...(record.snapshots ?? {}), ...fresh };
    // Every snapshot the checkpoint names must travel with it: one not yet in
    // the previous checkpoint's history (its first publication may have
    // failed) becomes a parent of this one, after the previous checkpoint.
    // Before it does, its history is scanned again against what the remote
    // reports now; a snapshot made offline against stale branches that fails
    // that scan is left out, and its work counts as existing only on its host.
    const carried = (c) => Boolean(previous) && spawnOk(record.checkout, ["merge-base", "--is-ancestor", c, previous]);
    const refusedSnapshots = {};
    for (const [n, s] of Object.entries(allSnapshots)) {
      if (carried(s.commit)) continue;
      const findings = snapshotCredentials(record.checkout, s.head, [s.commit, s.indexCommit], remote, { live: true, codeRemote });
      if (findings.length) { refusedSnapshots[n] = findings; delete allSnapshots[n]; }
    }
    // This host's locations are observed afresh; every other host's pass
    // through unchanged until that host observes them.
    const previousWork = head?.checkpoint.work ?? {};
    const work = {
      ...Object.fromEntries(Object.entries(previousWork).filter(([, w]) => w.host !== host)),
      ...inventoryWork(record, { host, remote: codeRemote, snapshots: allSnapshots, previousWork, prs: Object.fromEntries((plan?.tickets ?? []).filter((t) => t.pr).map((t) => [t.number, t.pr])) }),
    };
    const extra = [...new Set(Object.values(allSnapshots).map((s) => s.commit))].filter((c) => !carried(c));
    // The last plan's summary stays, across a takeover too, until a newer
    // plan replaces it; it carries the time it was planned.
    const checkpoint = buildCheckpoint(record, { seq, previous, snapshotParents: extra, kind, transition, host, work, snapshots: allSnapshots, observed });
    const content = `${JSON.stringify(checkpoint, null, 2)}\n`;
    const commit = writeCommit(record.checkout, { "checkpoint.json": content, "brief.md": takeoverBrief(checkpoint) }, [...(previous ? [previous] : []), ...extra], `checkpoint ${seq} of ${tickets}#${record.issue}: ${transition}\n`);
    side.attempt = { seq, commit, previous, recordRevision: record.revision, runId: record.runId, state: "intent", time: new Date().toISOString() };
    writeSidecar(file, side);
    let pushError = null;
    try { git(record.checkout, ["push", "-q", remote, `${commit}:refs/heads/${stateBranch(record.issue)}`]); } catch (error) { pushError = error; }
    let now;
    try { now = remoteHeads(record.checkout, remote, `refs/heads/${stateBranch(record.issue)}`).get(stateBranch(record.issue)) ?? null; }
    catch (error) { side.attempt = { ...side.attempt, state: "uncertain", reason: `the push ${pushError ? `failed (${pushError.message})` : "ran"} and the remote could not be read back (${error.message})` }; writeSidecar(file, side); return { saved: false, state: "uncertain", seq, commit, reason: side.attempt.reason }; }
    if (now !== commit) {
      const competing = now !== previous;
      side.attempt = { ...side.attempt, state: competing ? "refused" : "failed", reason: competing ? `the remote moved to ${now} while this checkpoint was built on ${previous}` : `the push failed: ${pushError?.message ?? "no error, but the remote is unchanged"}` };
      writeSidecar(file, side);
      if (competing) {
        const after = fetchState(record.checkout, remote, record.repository, record.issue, tickets);
        if (after && after.checkpoint.coordinator.session !== coordinator) throw new CoordinatorChanged(`Issue #${record.issue} was taken over while this checkpoint was being published: checkpoint ${after.checkpoint.seq} names ${after.checkpoint.coordinator.session}. This coordinator must stop; nothing was published`);
      }
      return { saved: false, state: side.attempt.state, seq, commit, reason: side.attempt.reason };
    }
    git(record.checkout, ["fetch", "-q", "--no-write-fetch-head", remote, `+refs/heads/${stateBranch(record.issue)}:${localStateRef(stateBranch(record.issue), record.repository, tickets)}`]);
    if (git(record.checkout, ["show", `${commit}:checkpoint.json`]) !== content.trim()) throw new Error(`Checkpoint ${commit} did not read back as written`);
    side.saved = { seq, commit, recordRevision: record.revision, runId: record.runId, time: checkpoint.time };
    side.attempt = null;
    writeSidecar(file, side);
    const result = { saved: true, seq, commit, url: `https://github.com/${tickets}/tree/${commit}`, ...(Object.keys(refusedSnapshots).length && { refusedSnapshots }) };
    if (sync && github) {
      try { side.summary = syncSummary({ repository: record.repository, tickets, issue: record.issue, checkout: record.checkout, remote, github, commentId: side.summary?.commentId, state: { commit, checkpoint, brief: "" } }); result.summary = { state: "synced", ...side.summary }; }
      catch (error) { result.summary = { state: "failed", reason: error.message, repair: "checkpoint.mjs sync-summary rewrites it from the saved checkpoint" }; side.summary = { ...(side.summary ?? {}), failed: error.message, time: new Date().toISOString() }; }
      writeSidecar(file, side);
    }
    return result;
  });
}

// Run before a side effect (a writer start, a merge): the record's current
// revision, holding the intent, must be saved remotely, and this coordinator
// must still own the run. A record without checkpoints is unaffected.
export function ensureSaved(file, { coordinator, host, github } = {}) {
  const record = readRecord(file);
  if (!record.checkpoints) return { checkpoints: false };
  const side = readSidecar(file);
  if (side.saved?.recordRevision === record.revision && side.saved.runId === record.runId) {
    const branch = stateBranch(record.issue);
    let now;
    try { now = remoteHeads(record.checkout, record.checkpoints.remote, `refs/heads/${branch}`).get(branch); }
    catch (error) { throw new Error(`Checkpoint ${side.saved.seq} could not be confirmed on the remote (${error.message}); the side effect was not started`); }
    if (now === side.saved.commit) return { saved: true, seq: side.saved.seq, commit: side.saved.commit };
  }
  let result;
  try { result = publish(file, { coordinator, kind: "auto", transition: "the intent before a side effect", host, github }); }
  catch (error) { if (error instanceof CoordinatorChanged) throw error; result = { saved: false, reason: error.message }; }
  if (!result.saved) throw new Error(`The intent at record revision ${record.revision} is not saved remotely (${result.reason}); the side effect was not started. Publish again once the remote is reachable`);
  return result;
}

// Run after each recorded transition. It reports a failed save instead of
// throwing, since the local change is already recorded; a takeover still
// throws, because this coordinator must stop.
export function autoCheckpoint(file, { coordinator, transition, host, github, plan, onlyIfChanged = false } = {}) {
  const record = readRecord(file);
  if (!record.checkpoints) return null;
  try { return publish(file, { coordinator, kind: "auto", transition, host, github, plan, onlyIfChanged }); }
  catch (error) {
    if (error instanceof CoordinatorChanged) throw error;
    return { saved: false, state: "failed", reason: error.message };
  }
}

// --- Enable, discover, resume ----------------------------------------------

// The checkpoint settings of a record: the state branch's remote and, once
// tickets live apart, the code repository's remote beside it.
const checkpointSettings = (names, remote, issue) => ({ remote, branch: stateBranch(issue), ...(repositoriesOf(names).split && { codeRemote: CODE_REMOTE }) });

export function enable(file, { coordinator, expectRevision, remote: named, host, github }) {
  const current = readRecord(file);
  const remote = stateRemote(current.checkout, current, named);
  const head = fetchState(current.checkout, remote, current.repository, current.issue, repositoriesOf(current).tickets);
  if (head && head.checkpoint.coordinator.session !== coordinator) throw new Error(`Issue #${current.issue} already has checkpoint ${head.checkpoint.seq} by coordinator ${head.checkpoint.coordinator.session} on ${head.checkpoint.coordinator.host}; take it over with checkpoint.mjs resume instead of starting a second run`);
  const { record } = updateRecord(file, { expectRevision, coordinator }, (r) => { r.checkpoints = checkpointSettings(r, remote, r.issue); r.log.push({ time: new Date().toISOString(), event: "checkpoints-enabled", remote }); });
  return { revision: record.revision, checkpoint: publish(file, { coordinator, transition: "checkpoints were enabled", host, github }) };
}

// Finds the run from the parent issue number: the status comment names a
// checkpoint, and the state branch's head is the current one. A summary that
// names an older checkpoint is reported stale; the branch wins.
export function discover({ repository, tickets = repository, issue, checkout, remote = DEFAULT_REMOTE, github }) {
  const state = fetchState(checkout, remote, repository, issue, tickets);
  const comments = github ? markerComments(github, issue) : [];
  const latest = comments.at(-1);
  const pointer = latest ? POINTER_LINE.exec(latest.body) : null;
  const summary = latest ? { commentId: latest.id, url: latest.url, seq: pointer ? Number(pointer[1]) : null, commit: pointer?.[2] ?? null } : null;
  if (!state) return { found: false, summary, reason: summary ? `the status comment names checkpoint ${summary.seq}, but ${stateBranch(issue)} does not exist on ${remote}` : `Issue #${issue} has no checkpoint on ${stateBranch(issue)}` };
  return { found: true, commit: state.commit, checkpoint: state.checkpoint, brief: state.brief, summary: summary ? { ...summary, stale: summary.commit !== state.commit } : { stale: true, missing: true } };
}

// Limitations a destination must act on before anything replaces the work.
export function limitations(checkpoint, { host = os.hostname(), observations = {} } = {}) {
  const out = [];
  for (const n of ticketsIn(checkpoint)) {
    const t = checkpoint.tickets[n] ?? {};
    if (t.owner) {
      const s = ownerStatus(t.owner, observations, { host });
      if (s.status !== "exited") out.push({ ticket: Number(n), kind: "owner", status: s.status, detail: s.reason });
    }
    if (t.pending) out.push({ ticket: Number(n), kind: "pending", detail: `${t.pending.operation} ${t.pending.launchId} on ${t.pending.route} was claimed on ${t.pending.host} with no recorded outcome; settle it from that host before any retry` });
    const snap = checkpoint.snapshots?.[n];
    if (snap && !snap.clean) out.push({ ticket: Number(n), kind: "snapshot", detail: `unfinished work as of ${snap.time ?? "the handoff"} is retrievable from snapshot ${snap.commit}, made on ${snap.host ?? "its source"} (work in progress, not reviewed)` });
    // Every location with unfinished files or unpushed commits is reported as
    // possibly holding work only there, whatever the snapshot holds.
    for (const w of workFor(checkpoint, n)) {
      for (const detail of onlyHereDetails(w, snap)) out.push({ ticket: Number(n), kind: "unpublished", detail });
      if (w.handoffLock) out.push({ ticket: Number(n), kind: "handoff-lock", detail: `a handoff lock remains in ${w.worktree} on ${w.host}; only scripts/agent-handoff.mjs recover-lock on that host may remove it` });
    }
  }
  for (const o of checkpoint.operations ?? []) if (!["confirmed", "not-applied", "superseded", "failed"].includes(o.state)) out.push({ ticket: o.ticket, kind: "operation", detail: `${operationText(o)} at ${o.expectHead} is ${o.state}; reconcile-operations settles it from GitHub before any retry` });
  return out;
}

// Takes the run over from its checkpoint. The takeover is real only once its
// own checkpoint is pushed on top of the one it read, so two destinations
// racing for the same run cannot both succeed. The new coordinator acts on its
// own invocation; its predecessor's authority and decisions stay in the record
// as evidence. Ownership, reports and history carry over unchanged.
export function resume(options, { github, host = os.hostname(), defaults = readWriterDefaults(), totalMemory = os.totalmem() } = {}) {
  const { record: file, checkout, repository, ticketsRepository, issue, coordinator, harness, invocation, evidence } = options;
  for (const [name, value] of Object.entries({ record: file, checkout })) if (typeof value !== "string" || !path.isAbsolute(value)) throw new Error(`--${name} must be an absolute path`);
  const remote = stateRemote(checkout, { repository, ticketsRepository }, options.remote);
  if (!coordinator || !invocation) throw new Error("--coordinator and --invocation (the user's request in this session) are required");
  // Who merges comes from this session's request, never from the previous one.
  const merging = mergingFor(invocation, options.merging);
  if (options.concurrency !== undefined && (!Number.isSafeInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 8)) throw new Error("--concurrency must be 1 to 8");
  const found = discover({ repository, tickets: ticketsRepository ?? repository, issue, checkout, remote, github });
  if (!found.found) throw new Error(`${found.reason}; start the run with issue-run.mjs init`);
  const prev = found.checkpoint;
  if (!sameRepository(repositoriesOf(prev).tickets, ticketsRepository ?? repository)) throw new Error(`Checkpoint ${prev.seq} is of a run whose tickets live in ${repositoriesOf(prev).tickets}, but this session would read them from ${ticketsRepository ?? repository}; the cutover switch in .agents/repos.json moved since the run started, so finish the run where it started`);
  if (prev.coordinator.session === coordinator) {
    if (!fs.existsSync(file)) throw new Error(`Checkpoint ${prev.seq} already names ${coordinator}, but its record ${file} is not here; this session's record lives where it was created`);
    // A takeover interrupted after its push leaves the record saved but the
    // local pointer missing or stale; the record that checkpoint was made from
    // installs it again.
    const own = readRecord(file);
    if (own.runId !== prev.run.runId || own.coordinator.session !== coordinator) throw new Error(`Checkpoint ${prev.seq} names run ${prev.run.runId}, but ${file} holds run ${own.runId}; inspect both before continuing`);
    const pointer = installPointer(checkout, repositoriesOf(own).tickets, issue, { record: file, coordinator, host, since: own.coordinator.since });
    // This session's request, as it is now, decides who merges, and its
    // permission mode as it reads it now is recorded; a change is saved before
    // the session acts on it.
    const applied = applyInvocation(file, { coordinator, invocation, merging });
    const switched = applyCoordinatorMode(file, { coordinator, permissionMode: options.coordinatorMode, title: options.slug === undefined ? undefined : orchestrationTitle(issue, options.slug) }).revision !== applied.record.revision;
    const checkpoint = applied.changed || switched ? ensureSaved(file, { coordinator, host, github }) : undefined;
    return { action: "resume", seq: prev.seq, commit: found.commit, pointer, ...(checkpoint && { checkpoint }), limitations: limitations(prev, { host }) };
  }
  if (!evidence) throw new Error(`--evidence must say why ${prev.coordinator.session} on ${prev.coordinator.host} no longer coordinates (for example, the maintainer's statement that its account reached its usage limit)`);
  // A record this session wrote for a takeover of this same checkpoint, whose
  // push did not land, is published again rather than replaced.
  let retry = null;
  if (fs.existsSync(file)) {
    let existing = null;
    try { existing = readRecord(file); } catch { existing = null; }
    const start = existing?.log?.[0];
    if (existing && existing.revision === 1 && existing.coordinator.session === coordinator && start?.event === "takeover" && start.checkpoint?.commit === found.commit) retry = existing;
    else throw new Error(`${file} already exists; take over into a new record file`);
  }
  // An explicit writer model in an earlier invocation stays in force across
  // takeovers until an invocation names another; a harness default does not.
  const carried = prev.invocation.writerModel;
  const writerModel = options.writerModel ?? carried;
  const writer = resolveWriterModel(harness, writerModel, defaults);
  if (options.writerModel === undefined && carried !== undefined) writer.source = `explicit override carried from ${prev.invocation.writerModelFrom ?? prev.coordinator.session}'s invocation`;
  let concurrency = defaultConcurrency({ totalMemory });
  if (options.concurrency !== undefined) concurrency = { limit: options.concurrency, basis: `invocation override (default would be ${concurrency.limit})` };
  const since = new Date().toISOString();
  if (options.coordinatorMode !== undefined && !PERMISSION_MODES.includes(options.coordinatorMode)) throw new Error(`--coordinator-mode must be the coordinator's own permission mode: ${PERMISSION_MODES.join(", ")}`);
  const self = { session: coordinator, host, harness, model: options.coordinatorModel, effort: options.coordinatorEffort, ...(options.coordinatorMode !== undefined && { permissionMode: options.coordinatorMode }), since };
  // The parent issue's title and check-in carry over; a checkpoint from
  // before titles were recorded takes the title from this session's slug.
  const run = carriedRun(prev, { file, record: { issue, coordinator: self }, defaults });
  if (!run.title && options.slug !== undefined) run.title = orchestrationTitle(issue, options.slug);
  const record = {
    version: RECORD_VERSION, revision: 1, runId: randomUUID(), repository, ...(ticketsRepository !== undefined && { ticketsRepository }), issue, checkout,
    coordinator: self,
    invocation: { text: invocation, merging, ...(writerModel !== undefined && { writerModel }), ...(options.writerModel === undefined && carried !== undefined && { writerModelFrom: prev.invocation.writerModelFrom ?? prev.coordinator.session }), ...(options.concurrency !== undefined && { concurrency: options.concurrency }) },
    authority: authorityFor(merging), writer, concurrency,
    tickets: structuredClone(prev.tickets), diskRecoveries: prev.diskRecoveries, operations: prev.operations ?? [], decisionRefs: prev.decisions ?? [], verifications: prev.verifications ?? [],
    // Saved snapshots stay the tickets' retrievable work under the new
    // coordinator. The work inventory needs no copy: every location passes
    // through the takeover checkpoint from the one it is built on.
    snapshots: structuredClone(prev.snapshots ?? {}),
    ...run,
    previousCoordinators: [...prev.previousCoordinators, { ...prev.coordinator, record: `checkpoint ${prev.seq} (${found.commit})`, invocation: prev.invocation, authority: prev.authority, ended: evidence }],
    checkpoints: checkpointSettings({ repository, ticketsRepository }, remote, issue),
    log: [{ time: since, event: "takeover", coordinator, from: prev.coordinator.session, checkpoint: { seq: prev.seq, commit: found.commit }, evidence, writer: writer.model }],
  };
  if (!options.coordinatorModel || !writerEfforts(options.coordinatorModel).includes(options.coordinatorEffort)) throw new Error("--coordinator-model and --coordinator-effort must be the coordinator's own metadata");
  if (!retry) writeExclusive(file, record);
  // Only a refusal (another coordinator's checkpoint, or a push Git refused)
  // sets the record aside. Any other failure may have landed the takeover, so
  // the record stays for resume to settle from the remote.
  const setAside = (reason) => { fs.renameSync(file, `${file}.refused-${Date.now()}`); return new Error(`The takeover was refused (${reason}); this session does not coordinate #${issue}. Discover again and take over into a new record if the run is still unowned`); };
  const uncertain = (reason) => new Error(`The takeover's outcome is uncertain (${reason}); this session may already coordinate #${issue}. Run resume again in this session with the same record once the remote is reachable; it settles the outcome from the state branch`);
  let published;
  try { published = publish(file, { coordinator, kind: "takeover", transition: `the takeover from ${prev.coordinator.session}`, host, github, takeoverFrom: found.commit }); }
  catch (error) { throw error instanceof CoordinatorChanged ? setAside(error.message) : uncertain(error.message); }
  if (!published.saved) throw published.state === "refused" ? setAside(published.reason) : uncertain(published.reason);
  installPointer(checkout, ticketsRepository ?? repository, issue, { record: file, coordinator, host, since: retry?.coordinator.since ?? since });
  // The limitations are those of the takeover's own checkpoint, which observed
  // this host's work afresh.
  return { action: "takeover", seq: published.seq, commit: published.commit, from: prev.coordinator, writer: retry?.writer ?? writer, summary: published.summary ?? null, limitations: limitations(readCheckpointAt(checkout, published.commit), { host }) };
}

// On this machine the local pointer follows the takeover, so a previous
// coordinator's record here stops accepting changes.
// `repository` is the tickets repository, which keys the pointer.
function installPointer(checkout, repository, issue, value) {
  const pointer = pointerFile(checkout, repository, issue);
  fs.mkdirSync(path.dirname(pointer), { recursive: true });
  let current = null;
  try { current = readJson(pointer); } catch { current = null; }
  if (current && path.resolve(current.record) === path.resolve(value.record) && current.coordinator === value.coordinator) return pointer;
  const temp = `${pointer}.${randomUUID()}.tmp`;
  writeExclusive(temp, value);
  fs.renameSync(temp, pointer);
  return pointer;
}

// --- Planned handoff ----------------------------------------------------------

// The record has already changed when a handoff publishes, so a failed save is
// reported for a later publish to retry; a takeover still stops the command.
function savedOrReported(run) {
  try { return run(); }
  catch (error) { if (error instanceof CoordinatorChanged) throw error; return { saved: false, state: "failed", reason: error.message }; }
}

// Stop: admission of new work ends and a checkpoint says so. Publish: after the
// writers were asked to reach safe boundaries, every owned worktree on this
// host with unfinished files is snapshotted, the writers' observed states are
// recorded with this host, and the checkpoint carries the snapshots and the
// brief. Running or uncertain writers are listed as such; a cancellation
// request or a status message is not an exit.
export function prepareHandoff(file, { coordinator, expectRevision, step, observations = {}, host = os.hostname(), github }) {
  if (step === "stop") {
    const { record } = updateRecord(file, { expectRevision, coordinator }, (r) => { r.handoff = { state: "preparing", since: new Date().toISOString(), by: coordinator }; r.log.push({ time: r.handoff.since, event: "handoff-stop" }); });
    return { revision: record.revision, checkpoint: savedOrReported(() => publish(file, { coordinator, kind: "handoff", transition: "the handoff stopped new dispatch", host, github })) };
  }
  if (step !== "publish") throw new Error("--step must be stop or publish");
  const current = readRecord(file);
  if (current.handoff?.state !== "preparing" && current.handoff?.state !== "ready") throw new Error("Run prepare-handoff --step stop first, then ask each writer to reach a safe boundary");
  const snapshots = {}, refused = [];
  for (const [n, t] of Object.entries(current.tickets)) {
    const held = t.owner ?? t.pending;
    if (!held?.worktree || (t.owner?.handle?.host ?? t.pending?.host ?? host) !== host || !fs.existsSync(held.worktree)) continue;
    try { snapshots[n] = snapshotWorktree(held.worktree, { ticket: Number(n), branch: held.branch, ...(current.checkpoints ? remotesOf(current) : { remote: DEFAULT_REMOTE }), host }); }
    catch (error) { refused.push({ ticket: Number(n), reason: error.message }); }
  }
  const { record } = updateRecord(file, { expectRevision, coordinator }, (r) => {
    const uncertain = [];
    for (const [n, t] of Object.entries(r.tickets)) {
      if (t.owner) { const s = ownerStatus(t.owner, observations, { host }); t.owner.observedAtHandoff = { status: s.status, reason: s.reason, host, time: new Date().toISOString() }; if (s.status !== "exited") uncertain.push({ ticket: Number(n), status: s.status, reason: s.reason }); }
      if (t.pending) uncertain.push({ ticket: Number(n), status: "pending", reason: `${t.pending.operation} ${t.pending.launchId} has no recorded outcome` });
    }
    for (const x of refused) uncertain.push({ ticket: x.ticket, status: "not snapshotted", reason: x.reason });
    // Each snapshot stays the ticket's retrievable work in every later
    // checkpoint until another snapshot of that ticket replaces it.
    for (const [n, s] of Object.entries(snapshots)) if (!s.clean) (r.snapshots ??= {})[n] = s;
    r.handoff = { ...r.handoff, state: "ready", published: new Date().toISOString(), uncertain };
    r.log.push({ time: r.handoff.published, event: "handoff-publish", snapshots: Object.keys(snapshots).length, uncertain: uncertain.length });
  });
  const checkpoint = savedOrReported(() => publish(file, { coordinator, kind: "handoff", transition: "the planned handoff", snapshots, host, github }));
  return { revision: record.revision, checkpoint, snapshots, uncertain: record.handoff.uncertain };
}

// Recreates a ticket's unfinished work from its snapshot in a new worktree:
// each changed file is written with the snapshot's exact bytes, past this
// checkout's conversions, and the index takes the snapshot's staged state.
// Both are checked against the snapshot.
export function retrieve({ repository, tickets = repository, issue, checkout, remote = DEFAULT_REMOTE, ticket, worktree }) {
  if (!path.isAbsolute(worktree ?? "")) throw new Error("--worktree must be an absolute path");
  if (fs.existsSync(worktree)) throw new Error(`${worktree} already exists`);
  const state = fetchState(checkout, remote, repository, issue, tickets);
  const snap = state?.checkpoint.snapshots?.[ticket];
  if (!snap || snap.clean) throw new Error(`Checkpoint ${state?.checkpoint.seq ?? "none"} holds no snapshot for #${ticket}`);
  const local = spawnOk(checkout, ["rev-parse", "--verify", "--quiet", `refs/heads/${snap.branch}`]) ? git(checkout, ["rev-parse", `refs/heads/${snap.branch}`]) : null;
  if (local && local !== snap.head) throw new Error(`Local branch ${snap.branch} is at ${local}, not the snapshot's head ${snap.head}; retrieve into a checkout without it, or reconcile the branch first`);
  git(checkout, local ? ["worktree", "add", worktree, snap.branch] : ["worktree", "add", "--no-track", "-b", snap.branch, worktree, snap.head]);
  const entries = new Map(git(worktree, ["ls-tree", "-r", "-z", "--full-tree", snap.commit]).split("\0").filter(Boolean).map((line) => { const e = entryOf(line); return [e.path, e]; }));
  // Removals come first, deepest first, each pruning the directories it
  // empties, so a directory the snapshot replaced with a file (or a file it
  // replaced with a directory) is gone before its replacement is written.
  const root = path.resolve(worktree);
  const removed = snap.paths.filter((file) => !entries.has(file)).sort((a, b) => b.split("/").length - a.split("/").length);
  for (const file of removed) {
    fs.rmSync(path.join(root, file), { force: true });
    for (let dir = path.dirname(path.join(root, file)); dir !== root && dir.startsWith(root + path.sep) && fs.existsSync(dir) && fs.readdirSync(dir).length === 0; dir = path.dirname(dir)) fs.rmdirSync(dir);
  }
  for (const file of snap.paths.filter((f) => entries.has(f))) {
    const target = path.join(worktree, file), entry = entries.get(file);
    const there = statOrNull(target);
    if (there?.isDirectory()) throw new Error(`${target} is a directory the snapshot does not account for; inspect ${worktree}`);
    if (!REGULAR.has(entry.mode)) { git(worktree, ["--literal-pathspecs", "restore", `--source=${snap.commit}`, "--worktree", "--", file]); continue; }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.rmSync(target, { force: true });
    fs.writeFileSync(target, gitRaw(worktree, ["cat-file", "blob", entry.sha]));
    if (entry.mode === "100755") fs.chmodSync(target, 0o755);
  }
  git(worktree, ["read-tree", snap.index]);
  const wrong = snap.paths.filter((file) => {
    const entry = entries.get(file), target = path.join(worktree, file);
    // A removed file may come back only as a directory the snapshot fills.
    if (!entry) { const there = statOrNull(target); return Boolean(there) && !(there.isDirectory() && [...entries.keys()].some((k) => k.startsWith(`${file}/`))); }
    // A symbolic link is checked by its target text; a checkout without
    // symbolic links writes that text as a file.
    if (entry.mode === "120000") { const there = statOrNull(target); if (!there) return true; const text = gitRaw(worktree, ["cat-file", "blob", entry.sha]).toString(); return there.isSymbolicLink() ? fs.readlinkSync(target) !== text : fs.readFileSync(target, "utf8") !== text; }
    if (!REGULAR.has(entry.mode)) return !statOrNull(target);
    return git(worktree, ["hash-object", "--no-filters", "--", file]) !== entry.sha;
  });
  const trees = treesOf(worktree);
  if (wrong.length || trees.index !== snap.index) throw new Error(`${worktree} does not match snapshot ${snap.commit} (${wrong.length ? `files ${wrong.join(", ")}` : "the staged state"}); inspect it before use`);
  // The new worktree's index was read from a tree and holds no file stat yet;
  // refreshing it keeps later observations from rechecking every file.
  spawnOk(worktree, ["update-index", "-q", "--refresh"]);
  return { worktree, branch: snap.branch, head: snap.head, snapshot: snap.commit, paths: snap.paths, verified: true };
}

// --- Intended operations and their outcomes --------------------------------

// An operation on GitHub (a merge, marking a PR ready, closing the parent issue) is
// recorded as intent before it runs and as an outcome after. An outcome lost
// to an interruption is read back from GitHub, never assumed: a PR merged at
// the intended head confirms a merge, an open PR still at the intended head
// means it did not apply and may be retried, and a moved head means the
// decision no longer applies. A close names the parent issue as its `pr` and the
// verified main commit as its head; a closed parent issue confirms it.
export const OPERATION_KINDS = ["merge", "ready", "close"];
export const operationText = (o) => (o.kind === "close" ? `closing issue #${o.pr}` : `${o.kind} of PR #${o.pr}`);
export const verificationText = (v) => `Issue verification ${v.id} on main \`${String(v.mainSha).slice(0, 9)}\` at ${v.time}: ${v.verdict}${v.verdict === "complete" ? "" : ` (${[...v.incomplete.map((t) => `#${t.number} ${t.action}`), ...v.criteria.filter((c) => c.status !== "met").map((c) => `unmet: ${c.criterion}`), ...(v.unsettled ?? []).map((o) => `unsettled ${o}`)].join("; ")})`}.`;
export function intent(record, { kind, ticket, pr, expectHead, evidence }) {
  if (!OPERATION_KINDS.includes(kind)) throw new Error(`--kind must be ${OPERATION_KINDS.join(" or ")}`);
  if (!Number.isSafeInteger(ticket) || !Number.isSafeInteger(pr) || !/^[0-9a-f]{40}$/.test(expectHead ?? "")) throw new Error("--ticket, --pr and the full --expect-head are required");
  const open = (record.operations ?? []).find((o) => o.pr === pr && o.kind === kind && ["intent", "uncertain"].includes(o.state));
  if (open) throw new Error(`Operation ${open.id} (${kind} of PR #${pr}) is ${open.state}; reconcile it before recording another`);
  const op = { id: randomUUID().slice(0, 8), kind, ticket, pr, expectHead, state: "intent", time: new Date().toISOString(), ...(evidence && { evidence }) };
  (record.operations ??= []).push(op);
  record.log.push({ time: op.time, event: "operation-intent", id: op.id, kind, pr });
  return op;
}
export function outcome(record, { id, state, evidence }) {
  const op = (record.operations ?? []).find((o) => o.id === id);
  if (!op) throw new Error(`No operation ${id}`);
  if (!["confirmed", "failed", "uncertain"].includes(state)) throw new Error("--state must be confirmed, failed or uncertain");
  if (!evidence) throw new Error("--evidence must say what showed the outcome");
  if (!["intent", "uncertain"].includes(op.state)) throw new Error(`Operation ${id} is already ${op.state}`);
  Object.assign(op, { state, evidence, settled: new Date().toISOString() });
  record.log.push({ time: op.settled, event: "operation-outcome", id, state });
  return op;
}
// Where a confirmed merge landed: the merge commit's first parent, against
// the main commit the head's CI covered (older records hold only the main the
// gate admitted). A merge that landed elsewhere put a combination on main that
// CI never ran before main's own run; one whose first parent could not be
// read says so, rather than passing for one that landed where it was checked.
export function landing(op, mergeCommit, firstParent) {
  let mergedOnto = null;
  try { mergedOnto = firstParent ? firstParent(mergeCommit) : null; } catch { mergedOnto = null; }
  const covered = ciCovered(op);
  return { mergeCommit, mergedOnto, baseMoved: mergedOnto === null || !covered ? null : mergedOnto !== covered };
}
export const ciCovered = (op) => op.gate?.ciMain ?? op.gate?.originMain;
export const landingText = (l, covered) => (l.baseMoved ? `; it landed on ${l.mergedOnto}, while its CI covered main ${covered}, so CI never ran on that combination before main's own run` : l.baseMoved === null ? "; where it landed could not be read" : "");

export function reconcileOperations(record, { snapshot, firstParent }) {
  const prs = new Map(snapshot.tickets.flatMap((t) => t.prs.map((p) => [p.number, p])));
  const results = [];
  for (const op of record.operations ?? []) {
    if (!["intent", "uncertain"].includes(op.state)) continue;
    const pr = prs.get(op.pr);
    let state = "uncertain", retry = false, evidence = `PR #${op.pr} is not in the snapshot of ${snapshot.observedAt}`, landed = {};
    if (op.kind === "close") {
      const issue = snapshot.issue?.number === op.pr ? snapshot.issue : null;
      if (!issue) evidence = `Issue #${op.pr} is not the snapshot's parent issue`;
      else if (issue.state === "closed") { state = "confirmed"; evidence = `Issue #${op.pr} is closed`; }
      else { state = "not-applied"; retry = true; evidence = `Issue #${op.pr} is still ${issue.state}`; }
    } else if (pr && op.kind === "merge") {
      if (pr.state === "MERGED" && pr.head === op.expectHead) { state = "confirmed"; landed = landing(op, pr.mergeCommit, firstParent); evidence = `PR #${op.pr} is merged as ${pr.mergeCommit} at ${pr.head}${landingText(landed, ciCovered(op))}`; }
      else if (pr.state === "MERGED") { state = "superseded"; evidence = `PR #${op.pr} was merged as ${pr.mergeCommit} at ${pr.head}, not at ${op.expectHead}; this operation's expected-head merge did not apply`; }
      else if (pr.state === "OPEN" && pr.head === op.expectHead) { state = "not-applied"; retry = true; evidence = `PR #${op.pr} is still open at ${pr.head}`; }
      else if (pr.state === "OPEN") { state = "superseded"; evidence = `PR #${op.pr} moved to ${pr.head}; a decision for ${op.expectHead} does not apply to it`; }
      else { state = "not-applied"; evidence = `PR #${op.pr} is ${pr.state} without a merge`; }
    } else if (pr && op.kind === "ready") {
      if (pr.state === "OPEN" && !pr.isDraft && pr.head === op.expectHead) { state = "confirmed"; evidence = `PR #${op.pr} is ready at ${pr.head}`; }
      else if (pr.state === "OPEN" && pr.isDraft && pr.head === op.expectHead) { state = "not-applied"; retry = true; evidence = `PR #${op.pr} is still a draft at ${pr.head}`; }
      else { state = "superseded"; evidence = `PR #${op.pr} is ${pr.state}${pr.isDraft ? " (draft)" : ""} at ${pr.head}`; }
    }
    if (state !== "uncertain") Object.assign(op, { state, evidence, settled: new Date().toISOString(), retry, ...landed });
    else op.lastCheck = { time: new Date().toISOString(), evidence };
    record.log.push({ time: new Date().toISOString(), event: "operation-reconciled", id: op.id, state });
    results.push({ id: op.id, kind: op.kind, pr: op.pr, state, retry, evidence });
  }
  return results;
}

// A reference to a decision published elsewhere on GitHub, such as a review
// checkpoint decision on a review thread. The record keeps the link, not a
// copy.
export function reference(record, { pr, url, kind }) {
  if (!Number.isSafeInteger(pr) || !/^https:\/\/github\.com\/\S+$/.test(url ?? "") || !kind) throw new Error("--pr, --url (a GitHub link) and --kind are required");
  (record.decisionRefs ??= []).push({ pr, url, kind, time: new Date().toISOString() });
  record.log.push({ time: new Date().toISOString(), event: "reference", pr, kind });
}

// The checkpoint's decision links: the references recorded with `reference`,
// and one for every review checkpoint decision review-checkpoint.mjs has read
// back as published on its PR's review thread, which stays that decision's
// authority. A decision not yet published has no link, and a link a takeover
// carries over is never added twice.
export function decisionLinks(record) {
  const links = [...(record.decisionRefs ?? [])], names = repositoriesOf(record);
  for (const [number, ticket] of Object.entries(record.tickets ?? {})) {
    for (const d of ticket.checkpoints ?? []) {
      if (d.state !== "published" || !d.published?.comment) continue;
      const url = names.commentUrl(names.thread(d.pr, Number(number)), d.published.comment);
      if (!links.some((l) => l.url === url)) links.push({ pr: d.pr, url, kind: `review-checkpoint ${d.kind}`, ticket: Number(number), id: d.id, round: d.round, head: d.head, time: d.published.time });
    }
  }
  return links;
}

// --- Command line -----------------------------------------------------------

function parse(argv) {
  const [command, ...rest] = argv, o = {};
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (!arg.startsWith("--") || i + 1 >= rest.length) throw new Error(`Unexpected argument ${arg}`);
    const key = arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (Object.hasOwn(o, key)) throw new Error(`${arg} given twice`);
    o[key] = rest[++i];
  }
  return { command, o };
}
const int = (v, name) => { const n = Number(v); if (!Number.isSafeInteger(n)) throw new Error(`--${name} must be an integer`); return n; };
const abs = (v, name) => { if (typeof v !== "string" || !path.isAbsolute(v)) throw new Error(`--${name} must be an absolute path`); return v; };

export function main(argv, { github: injected, repos, commentsFor = githubComments } = {}) {
  const { command, o } = parse(argv);
  // Comments go to the tickets repository: the record's, or, for a command
  // that names --repo without a record, the one the cutover switch gives.
  const githubFor = (tickets, checkout) => injected ?? commentsFor(tickets, checkout);
  const fromRecord = () => { const file = abs(o.record, "record"); const r = readRecord(file); return { file, r, github: githubFor(repositoriesOf(r).tickets, r.checkout) }; };
  const named = (checkout) => {
    const names = { repository: o.repo, ...startRepositories(o.repo, repos ?? readRepos()) };
    return { ...names, tickets: repositoriesOf(names).tickets, remote: stateRemote(checkout, names, o.remote), github: githubFor(repositoriesOf(names).tickets, checkout) };
  };
  const mutate = (fn, transition) => {
    const { file, github } = fromRecord();
    const { record, output } = updateRecord(file, { expectRevision: int(o.expectRevision, "expect-revision"), coordinator: o.coordinator }, fn);
    return { revision: record.revision, ...(output !== undefined && { result: output }), checkpoint: autoCheckpoint(file, { coordinator: o.coordinator, transition, github }) };
  };
  switch (command) {
    case "enable": { const { file, github } = fromRecord(); return enable(file, { coordinator: o.coordinator, expectRevision: int(o.expectRevision, "expect-revision"), remote: o.remote, github }); }
    case "publish": { const { file, github } = fromRecord(); return publish(file, { coordinator: o.coordinator, transition: o.transition ?? "an explicit publish", plan: o.plan ? readJson(abs(o.plan, "plan")) : undefined, github }); }
    case "sync-summary": { const checkout = abs(o.checkout, "checkout"), issue = int(o.issue, "issue"), { tickets, remote, github } = named(checkout); return syncSummary({ repository: o.repo, tickets, issue, checkout, remote, github }); }
    case "discover": { const checkout = abs(o.checkout, "checkout"), { tickets, remote, github } = named(checkout); const found = discover({ repository: o.repo, tickets, issue: int(o.issue, "issue"), checkout, remote, github }); return found.found ? { ...found, limitations: limitations(found.checkpoint) } : found; }
    case "resume": {
      // Like init, the command line records the coordinator's own session id,
      // permission mode and title slug, never a default.
      checkCoordinatorId(o.harness, o.coordinator);
      if (!PERMISSION_MODES.includes(o.coordinatorMode)) throw new Error(`--coordinator-mode must be this session's own permission mode: ${PERMISSION_MODES.join(", ")}`);
      // The slug gives the session title to a checkpoint that carries none; a
      // carried title stays.
      orchestrationTitle(int(o.issue, "issue"), o.slug);
      const checkout = abs(o.checkout, "checkout"), { ticketsRepository, remote, github } = named(checkout);
      return resume({ record: o.record, checkout, repository: o.repo, ticketsRepository, issue: int(o.issue, "issue"), coordinator: o.coordinator, harness: o.harness, coordinatorModel: o.coordinatorModel, coordinatorEffort: o.coordinatorEffort, coordinatorMode: o.coordinatorMode, slug: o.slug, invocation: o.invocation, evidence: o.evidence, writerModel: o.writerModel, merging: o.merging ?? "(missing)", concurrency: o.concurrency === undefined ? undefined : int(o.concurrency, "concurrency"), remote }, { github });
    }
    case "prepare-handoff": { const { file, github } = fromRecord(); return prepareHandoff(file, { coordinator: o.coordinator, expectRevision: int(o.expectRevision, "expect-revision"), step: o.step, observations: o.observations ? readJson(abs(o.observations, "observations")) : {}, github }); }
    case "retrieve": { const checkout = abs(o.checkout, "checkout"); const { tickets, remote } = named(checkout); return retrieve({ repository: o.repo, tickets, issue: int(o.issue, "issue"), checkout, remote, ticket: int(o.ticket, "ticket"), worktree: o.worktree }); }
    case "intent": return mutate((r) => intent(r, { kind: o.kind, ticket: int(o.ticket, "ticket"), pr: int(o.pr, "pr"), expectHead: o.expectHead, evidence: o.evidence }), `the intent to ${o.kind} PR #${o.pr}`);
    case "outcome": return mutate((r) => outcome(r, { id: o.id, state: o.state, evidence: o.evidence }), `the outcome of operation ${o.id}`);
    case "reconcile-operations": {
      // A confirmed merge's first parent is read from the remote's main.
      const { r } = fromRecord();
      const firstParent = (sha) => { git(r.checkout, ["fetch", "-q", "origin", "main"]); return git(r.checkout, ["rev-parse", `${sha}^1`]); };
      return mutate((rec) => reconcileOperations(rec, { snapshot: readJson(abs(o.snapshot, "snapshot")), firstParent }), "operations reconciled with GitHub");
    }
    case "reference": return mutate((r) => reference(r, { pr: int(o.pr, "pr"), url: o.url, kind: o.kind }), `a reference to a ${o.kind} on PR #${o.pr}`);
    case "recover-lock": return { result: recoverLock(sidecarOf(abs(o.record, "record"))) };
    default: throw new Error("Usage: checkpoint.mjs enable|publish|sync-summary|discover|resume|prepare-handoff|retrieve|intent|outcome|reconcile-operations|reference|recover-lock --option value ...");
  }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const output = main(process.argv.slice(2));
    console.log(JSON.stringify(output, null, 2));
    // The local change stands, but nothing remote holds it yet.
    if (output?.checkpoint && output.checkpoint.saved === false) { console.error(`The record changed locally, but its checkpoint was not saved: ${output.checkpoint.reason}`); process.exitCode = 3; }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
