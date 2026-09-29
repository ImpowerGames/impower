#!/usr/bin/env node
// Removes the worktrees whose work is already on origin/main and keeps every
// other one, printing the reason for each. Run from the main checkout; a dry
// run is the default, and --apply names the checkout it is to act on:
//
//   node .agents/skills/clean-worktrees/clean-worktrees.mjs                        # classify, remove nothing
//   node .agents/skills/clean-worktrees/clean-worktrees.mjs --apply --root <main>  # remove the removable ones
//
// Git never removes a worktree on its own: merging a pull request and deleting
// its branch on GitHub deletes the remote copy only, and the directory under
// ../<repo>.worktrees/, its local branch and its node_modules stay until
// `git worktree remove` runs. Each holds about a gigabyte, and the
// resolve-issue preflight refuses to start a ticket below 6 GB free.
//
// A worktree is removed only when every commit on its branch and on its
// remote is on origin/main, its tree is clean, and nothing is using it.
// Everything else is kept, with every reason that applies: the main checkout
// and any other path outside the worktrees directory, the default branch
// (main, and whatever origin/HEAD names) wherever it is checked out, a locked
// worktree, one git no longer sees as a worktree or whose directory is gone,
// an unborn head, a detached head whose commit is not on origin/main, or one
// with an operation in progress (a stopped rebase or bisect), commits only its
// HEAD reflog or per-worktree refs reach, or HEAD moved within the last day (a checkout a session
// may be about to use), uncommitted changes, commits on neither
// origin/main nor the branch's remote, commits on the remote that are not on
// origin/main, a branch with no commit made on it (a fresh worktree a session
// may be working in: its tip sits on origin/main's first-parent line, where a
// merged branch's tip never does, or its reflog holds its creation and no
// commit since), a branch whose reflog has expired while its tip is off that
// line (whether a commit was made on it cannot be told, so it is left for a
// person), dev servers that the worktree's own driver reports up or
// launching, a running process whose command line names the directory, a
// worktree git cannot answer for, and one holding a symlink or junction that
// points outside it, or a directory that cannot be read. Directories under
// the worktrees root that are not worktrees are listed too, so a tree an
// interrupted removal left behind is never out of sight, and so is a branch
// whose worktree an earlier run removed without managing to delete it.
//
// --apply first drops the records of worktrees whose directory is gone (`git
// worktree prune`), unless a `<path>.removing` probe leftover sits beside a
// dead record. `--apply --root <main> --remove <path>` removes the one
// directory it names, registered worktree or leftover, unmerged or not, and
// never its branch; see removeOne for what it refuses.
//
// --apply must be given --root with the main checkout's absolute path, and
// refuses when that is not the checkout the current directory belongs to, so
// the repository acted on always comes from the command line. Every row of
// an --apply run is appended to .git/clean-worktrees.log in the main checkout
// as it is decided, with a `removing` row before each removal starts, so a
// run that is killed leaves its record, and a later run reads that record to
// say which branch a failed or interrupted removal left behind.
//
// Removal is `git worktree remove`, which deletes a tree's entries in
// directory order, stops at the first it cannot delete, drops its own record
// whatever it managed, and on Windows follows a junction and deletes what it
// points at, wherever that is; so before it runs, the walk that sizes the
// tree reads every link in it and keeps the tree when one leads outside it,
// the tree is re-verified (still clean, still on its branch, still no commits
// of its own; a detached tree still detached at the same commit, still on
// origin/main, still with nothing in progress) and the directory is renamed and renamed back, which Windows
// refuses while any process has a file open or its current directory inside
// it. When git still stops part-way, the directory is no longer a worktree,
// the rest of it goes directly, and a row says what is left and where. The
// branch, when there is one, goes with -D after that re-verification, and an empty type directory
// goes with it.
//
// After the worktrees, the web editor driver's directory for each worktree
// the run removes goes too, unless a session in it may still be in use; the
// driver-profiles section below says how.
//
// After those, the review job directories under
// <parent>/<repo>.review-jobs are classified and, under --apply, the
// removable ones removed; the review-jobs section below says how. Then the
// redgreen snapshots under the system temp directory and the test-suite runs
// under the main checkout's .git/test-suites, as the scratch section says.
//
// Everything that touches the system goes through `deps` (git, the drivers
// and the process listing through `exec` and `processes`, the file system
// through the rest), so clean-worktrees.test.mjs runs the whole command
// in-process against stubbed output, and classify and serversFrom take their
// inputs as parameters so their tables are pinned without even that.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PROFILE_CLAIM_FILE, PROFILE_CLAIM_MS, PROFILE_LOCK_STALE_MS, checkoutDir, checkoutStateFiles, driverHome } from "../drive-web-editor/session-dir.mjs";
import { jobRootOf } from "../../../scripts/review-job-root.mjs";
import { processIdentity } from "../../../scripts/reviewer-slots.mjs";

// Windows paths compare without case, and git prints them with forward slashes.
const norm = (p) => {
  const r = path.resolve(p);
  return process.platform === "win32" ? r.toLowerCase() : r;
};
const samePath = (a, b) => norm(a) === norm(b);
const isUnder = (child, parent) => {
  const rel = path.relative(norm(parent), norm(child));
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
};
const n = (count, noun, plural = `${noun}s`) => `${count} ${count === 1 ? noun : plural}`;

// Signal 0 delivers nothing and only asks whether the pid exists; EPERM means
// it exists under another user.
export function pidAlive(pid, kill = process.kill) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    kill(pid, 0);
    return true;
  } catch (err) {
    return err?.code === "EPERM";
  }
}

// What is under a directory: the bytes in it, symlinks not followed and a
// file that cannot be read counting as nothing; every symlink or junction in
// it with the absolute path it points at (a junction's target comes back with
// a `\\?\` prefix on some systems, which is dropped); and every directory or
// link that could not be read, since a link inside one is then unknown. A
// worktree's node_modules is some fifty thousand files, and one stat at a
// time takes six seconds of it on Windows, so the reads run in batches
// through the thread pool, which takes it to about two.
const BATCH = 32;
export async function scanTree(dir) {
  const dirs = [dir];
  const files = [];
  const linkPaths = [];
  const unreadable = [];
  while (dirs.length) {
    const batch = dirs.splice(0, BATCH);
    const lists = await Promise.all(batch.map((d) => fs.promises.readdir(d, { withFileTypes: true }).catch((err) => err)));
    lists.forEach((items, i) => {
      if (!Array.isArray(items)) {
        unreadable.push(`${batch[i]}: ${items.code ?? items.message}`);
        return;
      }
      for (const it of items) {
        const p = path.join(batch[i], it.name);
        if (it.isSymbolicLink()) linkPaths.push(p);
        else if (it.isDirectory()) dirs.push(p);
        else if (it.isFile()) files.push(p);
      }
    });
  }
  let bytes = 0;
  for (let i = 0; i < files.length; i += BATCH) {
    const stats = await Promise.all(files.slice(i, i + BATCH).map((f) => fs.promises.lstat(f).catch(() => null)));
    for (const s of stats) if (s) bytes += s.size;
  }
  const links = [];
  for (let i = 0; i < linkPaths.length; i += BATCH) {
    const targets = await Promise.all(linkPaths.slice(i, i + BATCH).map((l) => fs.promises.readlink(l).catch((err) => err)));
    targets.forEach((t, j) => {
      const link = linkPaths[i + j];
      if (typeof t !== "string") unreadable.push(`${link}: ${t.code ?? t.message}`);
      else links.push({ link, target: path.resolve(path.dirname(link), t.replace(/^\\\\\?\\UNC\\/, "\\\\").replace(/^\\\\\?\\/, "")) });
    });
  }
  return { bytes, links, unreadable };
}

// Why a tree the walk read cannot be removed: a link in it leading outside
// it, which `git worktree remove` would follow on Windows, or a directory it
// could not read, which may hold one. Null when the tree can go.
export function linkReason(scan, dir) {
  const rel = (p) => path.relative(dir, p);
  const out = scan.links.filter((l) => !samePath(l.target, dir) && !isUnder(l.target, dir));
  if (out.length) return `${n(out.length, "link")} inside it ${out.length === 1 ? "points" : "point"} outside it (${listSome(out.map((l) => `${rel(l.link)} -> ${l.target}`), 3)}); git worktree remove follows a junction and deletes what it points at, so remove the link itself by hand and run again`;
  if (scan.unreadable.length) return `${n(scan.unreadable.length, "directory or link", "directories or links")} inside it could not be read (${listSome(scan.unreadable.map((u) => u.replace(`${dir}${path.sep}`, "")), 3)}), so whether a link inside it points outside it cannot be told; left for a person`;
  return null;
}

// Every process on the machine with its parent, its age in milliseconds (how
// long it has run, so a larger age is an older process) and its command line,
// so the worktrees a running server or shell names can be found without
// asking any driver. Windows keeps a dead parent's pid in ParentProcessId and
// hands the pid to a new process, so the age is what tells a real parent from
// a recycled one.
// `exec` is deps.exec, which hides the console window.
function listProcesses(exec) {
  const r =
    process.platform === "win32"
      ? /* windows-hide: caller */ exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", '$all = Get-CimInstance Win32_Process; $now = [DateTime]::UtcNow; $all | ForEach-Object { "$($_.ProcessId)`t$($_.ParentProcessId)`t$(if ($_.CreationDate) { [int64]($now - $_.CreationDate.ToUniversalTime()).TotalMilliseconds })`t$($_.Name)`t$($_.CommandLine)" }'], undefined, 60_000)
      : /* windows-hide: caller */ exec("ps", ["-eo", "pid=,ppid=,etimes=,comm=,args="], undefined, 60_000);
  if (r.status !== 0) return { ok: false, err: r.err || `exit ${r.status}` };
  return { ok: true, list: parseProcesses(r.out) };
}

// One process per line of the listing `listProcesses` asks for. The clock is
// read after the enumeration, so a process that started meanwhile has a
// negative age; it is kept, with its age clamped to zero, since dropping the
// line would hide a process that may name a tree.
export function parseProcesses(text, win = process.platform === "win32") {
  const list = [];
  for (const line of text.split(/\r?\n/)) {
    const m = win ? /^(\d+)\t(\d*)\t(-?\d*)\t([^\t]*)\t(.*)$/.exec(line) : /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s*(.*)$/.exec(line);
    if (!m) continue;
    list.push({ pid: Number(m[1]), ppid: m[2] === "" ? null : Number(m[2]), age: m[3] === "" ? null : Math.max(0, Number(m[3])) * (win ? 1 : 1000), name: m[4], cmd: m[5] });
  }
  return list;
}

export const LOG_NAME = "clean-worktrees.log";

export const liveDeps = {
  cwd: () => process.cwd(),
  pid: () => process.pid,
  now: () => new Date().toISOString(),
  // `exec` runs git, the worktree drivers and the process listing; `out` and
  // `err` are trimmed, and a command that could not start reports its error as
  // `err` with a null status.
  exec(cmd, args, cwd, timeout) {
    const r = spawnSync(cmd, args, { cwd, encoding: "utf8", windowsHide: true, timeout, maxBuffer: 64 * 1024 * 1024 });
    return { status: r.status, out: (r.stdout ?? "").trim(), err: ((r.stderr ?? "") + (r.error ? r.error.message : "")).trim() };
  },
  processes: () => listProcesses(liveDeps.exec),
  exists: (p) => fs.existsSync(p),
  tmpdir: () => os.tmpdir(),
  mtimeMs: (p) => {
    try {
      return fs.statSync(p).mtimeMs;
    } catch {
      return null;
    }
  },
  // A scratch directory is removed the way a job directory is, unlinking any
  // link inside it first so no target is followed.
  removeScratch: (p) => removeJobDir(p),
  unlinkLinks: (p) => unlinkLinksIn(p),
  isLink: (p) => fs.lstatSync(p).isSymbolicLink(),
  readFile: (p) => fs.readFileSync(p, "utf8"),
  listDirs: (p) => {
    try {
      return fs
        .readdirSync(p, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
    } catch {
      return [];
    }
  },
  isEmptyDir: (p) => fs.existsSync(p) && fs.readdirSync(p).length === 0,
  rename: (from, to) => fs.renameSync(from, to),
  removeDir: (p) => fs.rmSync(p, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 }),
  removeEmptyDir: (p) => fs.rmdirSync(p),
  scan: scanTree,
  freeSpace(dir) {
    try {
      const s = fs.statfsSync(dir);
      return s.bavail * s.bsize;
    } catch {
      return null;
    }
  },
  pidAlive,
  // The start time processIdentity records for a pid: null when it is gone,
  // and it throws when it cannot be read.
  // Each lookup spawns PowerShell on Windows, so a pid is asked about once.
  processStart: (() => {
    const seen = new Map();
    return (pid) => {
      if (!seen.has(pid)) seen.set(pid, processIdentity(pid)?.start ?? null);
      return seen.get(pid);
    };
  })(),
  // Where the web editor driver keeps each checkout's session directories,
  // and the reads that judge them; both throw on any error, so an entry that
  // cannot be read is never taken for one that is not there.
  driverHome: () => driverHome(),
  readEntries: (p) => fs.readdirSync(p, { withFileTypes: true }),
  lstat: (p) => fs.lstatSync(p),
  // The record of every --apply run, one JSON object per line, in the main
  // checkout's .git so it is never committed.
  readLog: (p) => {
    try {
      return fs.readFileSync(p, "utf8");
    } catch {
      return "";
    }
  },
  appendLog: (p, line) => fs.appendFileSync(p, `${line}\n`),
  // Rows print through a synchronous write so each is on the screen before
  // the next removal starts, whatever stdout is connected to.
  log: (...a) => {
    const line = `${a.join(" ")}\n`;
    try {
      fs.writeSync(1, line);
    } catch {
      process.stdout.write(line);
    }
  },
};

class Refusal extends Error {}
const die = (msg) => {
  throw new Refusal(msg);
};

// One entry per `worktree` stanza of `git worktree list --porcelain`.
export function parseWorktreeList(text) {
  const entries = [];
  let cur = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (line === "") continue;
    const sp = line.indexOf(" ");
    const key = sp < 0 ? line : line.slice(0, sp);
    const value = sp < 0 ? "" : line.slice(sp + 1);
    if (key === "worktree") {
      cur = { path: value, head: null, branch: null, detached: false, bare: false, locked: null, prunable: null };
      entries.push(cur);
      continue;
    }
    if (!cur) continue;
    if (key === "HEAD") cur.head = value;
    else if (key === "branch") cur.branch = value.replace(/^refs\/heads\//, "");
    else if (key === "detached") cur.detached = true;
    else if (key === "bare") cur.bare = true;
    else if (key === "locked") cur.locked = value || "no reason given";
    else if (key === "prunable") cur.prunable = value || "no reason given";
  }
  return entries;
}

// What a worktree's driver said about its dev servers. `UP` is up; `DOWN`
// names a record whose URL does not answer, which is a tree still launching
// while its pid lives and a stale record otherwise; `down` is no record; a
// line saying the state file could not be read, whatever word it starts
// with, is a driver that could not answer, since the record may name a live
// server; and so is any other output, with the first line that names an
// error as the detail (a load failure prints a Node frame before the error).
export function serversFrom(output, alive = pidAlive) {
  const lines = output.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const line = lines.find((l) => /^(UP|DOWN|down)\b/.test(l));
  if (!line) return { state: "unknown", detail: lines.find((l) => /error/i.test(l)) ?? lines[0] ?? "no output" };
  if (/state file unreadable/.test(line)) return { state: "unknown", detail: line };
  if (line.startsWith("down")) return { state: "down" };
  const url = /url=(\S+)/.exec(line)?.[1];
  const pid = Number(/pid=(\d+)/.exec(line)?.[1]);
  if (line.startsWith("UP")) return { state: "up", url, pid };
  return { state: alive(pid) ? "launching" : "down", url, pid };
}

// The processes whose command line names the directory or something under
// it, this script's own excluded. Command lines are compared with the path's
// separators and case folded, because Windows prints them either way, and
// the match ends at a path boundary so a directory never claims the
// processes of one whose name extends its own.
export function usersOf(dir, processes, selfPid, platform = process.platform) {
  const win = platform === "win32";
  const fold = (s) => win ? s.replaceAll("\\", "/").toLowerCase() : s;
  const resolved = (win ? path.win32 : path.posix).resolve(dir);
  const boundary = win ? '(?![^\\s"\'/\\\\])' : '(?![^\\s"\'/])';
  const needle = new RegExp(fold(resolved).replace(/[.*+?^${}()|[\]\\/]/g, "\\$&") + boundary);
  return processes.filter((p) => p.pid !== selfPid && needle.test(fold(p.cmd ?? "")));
}

const listSome = (items, max) => (items.length > max ? `${items.slice(0, max).join(", ")} and ${items.length - max} more` : items.join(", "));

// Why a detached head on origin/main still stays, from detachedHistory's facts.
function detachedKeeps(facts) {
  const keep = [];
  if (facts.inProgress?.length) keep.push(`an operation is in progress in it (${facts.inProgress.join(", ")}); finish or abort it first`);
  if (facts.headLogUnknown) keep.push(`${facts.headLogUnknown}; left for a person`);
  if (facts.headLogOrphans > 0) keep.push(`its HEAD reflog or per-worktree refs (refs/worktree, bisect, rewritten) reach ${n(facts.headLogOrphans, "commit")} that origin/main, every branch, remote and tag do not, which removing it would leave unreferenced`);
  if (facts.headIdleMs != null && facts.headIdleMs < DETACHED_IDLE_MS) keep.push(`its HEAD moved ${Math.max(0, Math.round(facts.headIdleMs / 60000))} min ago, within ${DETACHED_IDLE_MS / 3600000} hours; a fresh checkout a session may be working in, so remove it by hand when it is done`);
  return keep;
}

// The decision for one worktree from the facts gathered about it. Every
// reason to keep is listed, so a dirty tree on a merged branch says both. The
// main checkout is the one path outside the worktrees directory that is
// always there, so it shares the rule and gets its own wording.
export function classify(entry, facts) {
  const keep = [];
  if (!facts.insideRoot) keep.push(facts.isMain ? "the main checkout" : `outside ${facts.root}`);
  if (facts.isDefault) keep.push(`the default branch ${entry.branch}, which is never removed wherever it is checked out`);
  if (entry.locked) keep.push(`locked (${entry.locked})`);
  if (facts.missing) keep.push(facts.probeLeft ? `its directory is gone and ${path.resolve(entry.path)}${PROBE_SUFFIX} is beside it, which is what an interrupted run's probe leaves; rename it back by hand, and do not run \`git worktree prune\`, which would drop the record the renamed tree points at` : "its directory is gone; `git worktree prune` drops the record");
  else if (entry.prunable) keep.push(`git no longer sees it as a worktree (${entry.prunable}) but the directory is still there, so whether it has uncommitted changes cannot be told; check it by hand, then delete it by hand`);
  // A detached head has no branch or remote to say where its commits went, so
  // it is removable only when its commit is already on origin/main.
  if (entry.detached && !facts.headOnMain) keep.push("detached head, no branch, and its commit is not known to be on origin/main; left for a person");
  if (facts.unborn) keep.push("unborn branch with no commits; left for a person");
  const remote = `origin/${entry.branch}`;
  if ((entry.branch || facts.headOnMain) && !facts.isMain && !facts.isDefault && !entry.prunable && !facts.missing && !facts.unborn) {
    const remoteState = facts.remoteExists ? `${remote} exists` : `no ${remote}`;
    if (facts.dirty > 0) keep.push(`uncommitted changes (${n(facts.dirty, "file")})`);
    if (!entry.branch) keep.push(...detachedKeeps(facts));
    else if (facts.unpushed > 0) keep.push(facts.remoteExists ? `${n(facts.unpushed, "commit")} on neither origin/main nor ${remote}` : `${n(facts.unpushed, "commit")} not on origin/main, and no ${remote} holds them`);
    else if (facts.ownCommits > 0) keep.push(`${n(facts.ownCommits, "commit")} not on origin/main (all on ${remote}; a pull request may be open)`);
    else if (facts.remoteAhead > 0) keep.push(`${remote} has ${n(facts.remoteAhead, "commit")} not on origin/main and this branch is behind it; a pull request may be open`);
    else if (!facts.committed && facts.onFirstParent) keep.push(`no commit was made on the branch: its tip is on origin/main's first-parent line and its reflog records none (${remoteState}); a fresh worktree a session may be working in, so remove it by hand when it is done`);
    else if (!facts.committed && facts.created) keep.push(`no commit was made on the branch: its reflog holds its creation and no commit since (${remoteState}); a fresh worktree a session may be working in, so remove it by hand when it is done`);
    else if (!facts.committed) keep.push(`its reflog records neither a commit nor its creation, so whether a commit was made on it cannot be told, and its tip is off origin/main's first-parent line (${remoteState}); left for a person, and \`git worktree remove\` plus \`git branch -D\` by hand once its commits are checked`);
    for (const s of serverRows(facts.servers)) {
      const via = s.driver ? ` through ${s.driver}` : "";
      if (s.state === "up") keep.push(`dev servers up at ${s.url} (pid ${s.pid})${via}`);
      else if (s.state === "launching") keep.push(`dev servers launching (pid ${s.pid} alive, ${s.url} not answering)${via}; the worktree's driver \`down\` settles it`);
      else if (s.state === "recorded") keep.push(`its driver${via} could not report its servers (${s.detail}), and its state file records pid ${s.pid} alive at ${s.url}; the worktree's driver \`down\` settles it once the driver runs, or stop the pid by hand`);
      else if (s.state === "unknown") keep.push(`its driver${via} could not report its servers (${s.detail})`);
    }
    if (facts.users === null) keep.push("the processes on this machine could not be listed, so whether one is using it is unknown");
    else if (facts.users.length) keep.push(`its path is on the command line of ${listSome(facts.users.map((p) => `pid ${p.pid} (${p.name})`), 2)}`);
  }
  if (keep.length) return { remove: false, reasons: keep };
  const ignored = facts.ignored.length ? `; takes ${n(facts.ignored.length, "ignored path")} with it (${facts.ignored.join(", ")})` : "";
  if (entry.detached) return { remove: true, reasons: [`detached head at a commit already on origin/main${ignored}`] };
  return { remove: true, reasons: [`merged into origin/main; ${facts.remoteExists ? `${remote} still exists` : `no ${remote}`}${ignored}`] };
}

// ------------------------------------------------------------------ facts ---

const gitOrDie = (deps, args, cwd) => {
  const r = deps.exec("git", args, cwd);
  if (r.status !== 0) die(`git ${args.join(" ")} failed in ${cwd}: ${r.err || r.out}`);
  return r.out;
};

// Every driver a worktree may hold, each with its own server and the places
// it keeps its state file, in the order it looks: the web editor driver
// reads the file beside itself and otherwise the one under `resolve-issue/`,
// where it lived in older worktrees and where a server launched from there
// is still recorded. Its `sessions` records live outside the worktree, one
// per agent session, and `status --all` reports every one of them.
const DRIVERS = [
  { driver: ".agents/skills/drive-web-editor/driver.mjs", sessions: true, states: [".agents/skills/drive-web-editor/.state.json", ".agents/skills/resolve-issue/.state.json", ".claude/skills/drive-web-editor/.state.json", ".claude/skills/resolve-issue/.state.json"] },
  { driver: ".agents/skills/drive-vscode-web/driver.mjs", states: [".agents/skills/drive-vscode-web/.state.json", ".claude/skills/drive-vscode-web/.state.json"] },
  { driver: ".agents/skills/resolve-issue/driver.mjs", states: [".agents/skills/resolve-issue/.state.json"] },
];

// Migration discovery includes worktrees that still run the other layout.
const LEGACY_DRIVERS = DRIVERS.map((d) => ({
  driver: d.driver.replace(".agents", ".claude"),
  states: [...new Set(d.states.map((s) => s.replace(".agents", ".claude")))],
}));

// The state file a driver would read: the first of its places that exists,
// or the first of them when none does.
const stateFileOf = (worktree, d, exists) => {
  const files = d.states.map((s) => path.join(worktree, s));
  return files.find(exists) ?? files[0];
};

// Asks every driver the worktree has for its servers and returns each
// answer, named by the driver, so a row can say which driver's `down`
// settles it. A driver that could not answer is judged by its own state
// file instead.
export function probeServers(worktree, deps) {
  const seen = new Set();
  const drivers = [...DRIVERS, ...LEGACY_DRIVERS].filter((d) => {
    const file = path.join(worktree, d.driver);
    if (!deps.exists(file)) return false;
    let identity = file;
    try { identity = fs.realpathSync(file); } catch {}
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
  return drivers.map((d) => {
    const r = deps.exec(process.execPath, [path.join(worktree, d.driver), "status", ...(d.sessions ? ["--all"] : [])], worktree, 60_000);
    const answer = serversFrom(`${r.out}\n${r.err}`, deps.pidAlive);
    const judged = answer.state === "unknown" ? recordedServers([stateFileOf(worktree, d, deps.exists), ...(d.sessions ? (deps.sessionStates ?? checkoutStateFiles)(worktree) : [])], deps, answer.detail) : answer;
    return { ...judged, driver: path.basename(path.dirname(d.driver)) };
  });
}

// What a driver that could not answer (a load failure, a `status` that hung)
// would have said, read from the state file it writes at launch and removes
// when its server is stopped: no file is no server; a file naming a pid
// still alive is a server that may be up, reported with the URL the file
// records; a file naming a dead pid is a stale record; a file that cannot be
// read, or names no server, leaves the driver unknown. `detail` is why the
// driver could not answer, and goes into the row.
export function recordedServer(stateFile, deps, detail) {
  if (!deps.exists(stateFile)) return { state: "down", detail };
  let record;
  try {
    record = JSON.parse(deps.readFile(stateFile));
  } catch (err) {
    return { state: "unknown", detail: `${detail}; its state file could not be read (${String(err.message).split("\n")[0]})` };
  }
  if (!record?.url || record.pid == null) return { state: "unknown", detail: `${detail}; its state file names no server` };
  if (!deps.pidAlive(record.pid)) return { state: "down", detail, url: record.url, pid: record.pid };
  return { state: "recorded", url: record.url, pid: record.pid, detail };
}

// The web editor driver keeps one record per agent session, outside the
// worktree (drive-web-editor/session-dir.mjs), as well as any record beside
// itself. A driver that could not answer is judged by all of them: the first
// that may name a live server decides, and otherwise the first file's answer
// stands.
export function recordedServers(stateFiles, deps, detail) {
  const judged = stateFiles.map((file) => recordedServer(file, deps, detail));
  return judged.find((j) => j.state !== "down") ?? judged[0];
}

// The answers that become rows: every driver's answer but a definite
// `down`, each its own row, so a person stopping one server is told about
// the other. One driver's answer says nothing about another driver's
// servers, so a driver's `down` never removes another's row.
export function serverRows(results) {
  return results.filter((s) => s.state !== "down");
}

// `git status --porcelain --ignored=matching`: the tree's changes, untracked
// files included, and the ignored paths (`!!`) that go with the directory.
// `matching` names a directory that an ignore pattern matches without walking
// it, which is what keeps this as fast as a plain status over node_modules.
function statusOf(worktree, deps) {
  const lines = gitOrDie(deps, ["status", "--porcelain", "--ignored=matching"], worktree).split(/\r?\n/).filter(Boolean);
  return { dirty: lines.filter((l) => !l.startsWith("!!")).length, ignored: lines.filter((l) => l.startsWith("!!")).map((l) => l.slice(3)) };
}

// The branch's reflog as git keeps it (newest first, entries expire after
// ninety days by default), read for what was done on the branch: a `commit`,
// `cherry-pick` or `merge ...: Merge made by` entry is a commit made here,
// and a `branch: Created from` entry anywhere in it means the reflog reaches
// back to the branch's creation, so a reflog holding that and no commit entry
// is a branch no commit was ever made on. A fast-forward, a rebase onto
// origin/main with nothing to replay, a pull or a reset moves the tip without
// either. The creation entry is the oldest, so it is the first to expire; a
// reflog without it says nothing about what expired before its first entry.
export function readReflog(text) {
  const entries = text.split(/\r?\n/).filter(Boolean).map((l) => {
    const tab = l.indexOf("\t");
    return { sha: tab < 0 ? l : l.slice(0, tab), msg: tab < 0 ? "" : l.slice(tab + 1) };
  });
  return {
    committed: entries.some((e) => /^(commit|cherry-pick)\b|^merge .*: Merge made by/.test(e.msg)),
    created: entries.some((e) => /^branch: Created from/.test(e.msg)),
  };
}

// A detached head has no branch to say what was done in the tree, so the
// worktree's own git directory and HEAD reflog do: an operation left in
// progress (a stopped rebase or bisect detaches HEAD at a clean commit),
// commits made and then left behind by checking out another commit, which the
// reflog alone still reaches, or held only by a per-worktree ref, and when HEAD last moved, since a checkout made
// moments ago is one a session may be about to use. Any answer git does not
// give keeps the tree.
const DETACHED_IDLE_MS = 24 * 60 * 60 * 1000;
const IN_PROGRESS = ["rebase-merge", "rebase-apply", "BISECT_LOG", "MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD"];
const MAX_HEAD_LOG = 200;

export function detachedHistory(abs, ctx, deps) {
  const facts = { inProgress: [], headLogUnknown: null, headLogOrphans: 0, headIdleMs: null };
  for (const name of IN_PROGRESS) {
    const r = deps.exec("git", ["rev-parse", "--git-path", name], abs);
    if (r.status !== 0 || !r.out) {
      facts.headLogUnknown = `git could not locate its ${name} state (${r.err || r.out || `exit ${r.status}`})`;
      return facts;
    }
    if (deps.exists(path.resolve(abs, r.out))) facts.inProgress.push(name);
  }
  // %gd under --date=unix reads HEAD@{<when the entry was written>}; %ct would
  // be the commit's own date, which says nothing about when HEAD moved.
  const log = deps.exec("git", ["reflog", "show", "--date=unix", "--format=%H%x09%gd", "HEAD"], abs);
  if (log.status !== 0) {
    facts.headLogUnknown = `its HEAD reflog could not be read (${log.err || log.out || `exit ${log.status}`})`;
    return facts;
  }
  const rows = log.out.split(/\r?\n/).filter(Boolean).map((l) => {
    const [hash, sel] = l.split("\t");
    return [hash, /@\{(\d+)\}$/.exec(sel ?? "")?.[1]];
  });
  const hashes = [...new Set(rows.map((r) => r[0]))];
  const newest = Math.max(...rows.map((r) => Number(r[1])));
  if (!rows.length || !Number.isFinite(newest) || hashes.length > MAX_HEAD_LOG) {
    facts.headLogUnknown = rows.length ? "its HEAD reflog is too long or unreadable to check" : "its HEAD reflog is empty, so when it was last used cannot be told";
    return facts;
  }
  facts.headIdleMs = Date.parse(deps.now()) - newest * 1000;
  // A per-worktree ref (refs/worktree, and the bisect and rebase refs) is
  // deleted with the tree just as the reflog is, so what it holds counts too.
  const own = deps.exec("git", ["for-each-ref", "--format=%(objectname)", "refs/worktree", "refs/bisect", "refs/rewritten"], abs);
  if (own.status !== 0) {
    facts.headLogUnknown = `its per-worktree refs could not be read (${own.err || own.out || `exit ${own.status}`})`;
    return facts;
  }
  const held = [...new Set([...hashes, ...own.out.split(/\r?\n/).filter(Boolean)])];
  // Only what no branch, remote or tag also reaches would be left unreferenced.
  const alone = deps.exec("git", ["rev-list", "--count", ...held, "--not", "refs/remotes/origin/main", "--branches", "--remotes", "--tags"], ctx.mainRoot);
  if (alone.status !== 0) facts.headLogUnknown = `whether its HEAD reflog holds commits nothing else reaches could not be read (${alone.err || alone.out})`;
  else facts.headLogOrphans = Number(alone.out);
  return facts;
}

export function gatherFacts(entry, ctx, deps) {
  const abs = path.resolve(entry.path);
  const facts = {
    isMain: samePath(abs, ctx.mainRoot),
    isDefault: false,
    insideRoot: isUnder(abs, ctx.root),
    root: ctx.root,
    missing: !deps.exists(abs),
    probeLeft: false,
    unborn: /^0+$/.test(entry.head ?? ""),
    dirty: 0,
    ignored: [],
    ownCommits: 0,
    unpushed: 0,
    remoteExists: false,
    remoteAhead: 0,
    headOnMain: false,
    onFirstParent: false,
    committed: false,
    created: false,
    servers: [],
    users: [],
  };
  facts.isDefault = !facts.isMain && Boolean(entry.branch) && ctx.defaultBranches.has(entry.branch);
  facts.probeLeft = facts.missing && deps.exists(`${abs}${PROBE_SUFFIX}`);
  if (facts.isMain || facts.isDefault || entry.prunable || facts.missing || facts.unborn) return facts;
  if (entry.detached) {
    facts.headOnMain = deps.exec("git", ["merge-base", "--is-ancestor", entry.head, "refs/remotes/origin/main"], ctx.mainRoot).status === 0;
    if (!facts.headOnMain) return facts;
    Object.assign(facts, detachedHistory(abs, ctx, deps));
    Object.assign(facts, statusOf(abs, deps));
    facts.servers = probeServers(abs, deps);
    facts.users = ctx.processes.ok ? usersOf(abs, ctx.processes.list, deps.pid()) : null;
    return facts;
  }
  Object.assign(facts, statusOf(abs, deps));
  const ref = `refs/heads/${entry.branch}`;
  const remoteRef = `refs/remotes/origin/${entry.branch}`;
  facts.remoteExists = deps.exec("git", ["rev-parse", "--verify", "-q", remoteRef], ctx.mainRoot).status === 0;
  facts.ownCommits = Number(gitOrDie(deps, ["rev-list", "--count", ref, "^refs/remotes/origin/main"], ctx.mainRoot));
  facts.unpushed = facts.remoteExists
    ? Number(gitOrDie(deps, ["rev-list", "--count", ref, "^refs/remotes/origin/main", `^${remoteRef}`], ctx.mainRoot))
    : facts.ownCommits;
  facts.remoteAhead = facts.remoteExists ? Number(gitOrDie(deps, ["rev-list", "--count", remoteRef, "^refs/remotes/origin/main"], ctx.mainRoot)) : 0;
  facts.onFirstParent = ctx.firstParent.has(entry.head);
  const reflog = deps.exec("git", ["reflog", "show", "--format=%H%x09%gs", ref], ctx.mainRoot);
  Object.assign(facts, readReflog(reflog.status === 0 ? reflog.out : ""));
  facts.servers = probeServers(abs, deps);
  facts.users = ctx.processes.ok ? usersOf(abs, ctx.processes.list, deps.pid()) : null;
  return facts;
}

// Directories under the worktrees root, one or two levels down, that are not
// registered worktrees and hold none: what an interrupted removal or add
// leaves behind, which no git command lists.
export function strayDirs(entries, root, listDirs) {
  const registered = entries.map((e) => path.resolve(e.path));
  const known = (p) => registered.some((r) => samePath(r, p));
  const holds = (p) => registered.some((r) => isUnder(r, p));
  const strays = [];
  for (const name of listDirs(root)) {
    const p = path.join(root, name);
    if (known(p)) continue;
    if (!holds(p)) {
      strays.push(p);
      continue;
    }
    for (const sub of listDirs(p)) {
      const q = path.join(p, sub);
      if (!known(q) && !holds(q)) strays.push(q);
    }
  }
  return strays;
}

const PROBE_SUFFIX = ".removing";

// The removals the log says did not finish: for each path the log's last row
// about it, kept when that row is `failed` or a `removing` that no outcome
// row followed, which is a run killed while git was removing it. The same by
// branch, for the branch such a removal left local: keyed by the branch, so
// that a worktree recreated at the old path does not stand as the last word
// on the branch the earlier removal stranded there.
const unfinished = (log, key) => {
  const last = new Map();
  for (const r of readLogRows(log)) if (r.decision && r.path && (key === "path" || r.branch)) last.set(key === "path" ? norm(r.path) : r.branch, r);
  return [...last.values()].filter((r) => r.decision === "failed" || r.decision === "removing");
};
export const unfinishedRemovals = (log) => unfinished(log, "path");
export const strandedBranches = (log) => unfinished(log, "branch");

const unfinishedWhat = (r, object = " it") => `the --apply run at ${r.at} ${r.decision === "removing" ? `was removing${object} when that run stopped (${r.why})` : `failed to remove${object} (${r.why})`}`;
const unfinishedNote = (r, deps, ctx, object) => {
  const branchStays = r.branch && deps.exec("git", ["rev-parse", "--verify", "-q", `refs/heads/${r.branch}`], ctx.mainRoot).status === 0;
  return `${unfinishedWhat(r, object)}${branchStays ? `; its branch ${r.branch} is still local` : ""}`;
};

// Why a stray directory is there, from its name and from the log of earlier
// --apply runs: the probe's leftover names the worktree it was renamed from,
// and a removal that failed or was interrupted names the branch it left
// behind, whether the directory listed is the leftover itself or the type
// directory holding it.
export function strayReason(p, entries, log, deps, ctx) {
  const rel = (q) => path.relative(path.dirname(ctx.mainRoot), q);
  const base = p.endsWith(PROBE_SUFFIX) ? p.slice(0, -PROBE_SUFFIX.length) : null;
  if (base && entries.some((e) => samePath(e.path, base))) {
    return deps.exists(base)
      ? `not a registered worktree, named like the probe of ${rel(base)}, which is registered and present; check it before deleting it by hand`
      : `the worktree ${rel(base)}, renamed by an interrupted run's probe and not renamed back; rename it back by hand, and do not run \`git worktree prune\`, which would drop the record it points at`;
  }
  const own = unfinishedRemovals(log).filter((r) => [p, base].some((q) => q && samePath(r.path, q)));
  if (own.length) return `not a registered worktree; ${unfinishedNote(own.at(-1), deps, ctx)}`;
  const held = unfinishedRemovals(log).filter((r) => isUnder(r.path, p));
  if (held.length) return `not a registered worktree; it holds ${held.map((r) => `${rel(r.path)}, which ${unfinishedNote(r, deps, ctx, "")}`).join("; and ")}`;
  return "not a registered worktree, which is what an interrupted removal or add leaves behind; check it, then `--apply --root <main> --remove <path>` deletes it";
}

export function readLogRows(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      /* a line the log did not write whole */
    }
  }
  return rows;
}

export function formatBytes(bytes) {
  if (bytes == null) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${i === 0 ? v : v.toFixed(1)} ${units[i]}`;
}

// ---------------------------------------------------------------- removal ---

// Removes one worktree and reports what happened: `removed`, `kept` when a
// re-check refused before anything was touched, or `failed` with the
// directory's state in the note. The rename probe is the check git lacks on
// Windows: the system refuses to rename a directory while any process has a
// file open or its current directory inside it, and refuses without touching
// a file, where `git worktree remove` deletes what sorts before the held
// entry and drops its record before it reports the failure. The branch is
// deleted with -D only after the same commit count that justified the
// removal is read again, so -D never deletes work committed since the
// classification. Git follows a junction inside the tree, so the walk that
// sized the tree moments before this runs has read every link in it and kept
// the tree if one leads outside it. The direct directory removal is the one
// destructive call here that git does not guard, so it is made only under
// the root and only on a directory git has already stopped treating as a
// worktree, which a listing that failed cannot establish: an unknown answer
// keeps the tree.
const bytesUnder = async (dir, deps) => (await deps.scan(dir)).bytes;

function registration(abs, ctx, deps) {
  const r = deps.exec("git", ["worktree", "list", "--porcelain"], ctx.mainRoot);
  if (r.status !== 0) return { known: false, err: r.err || r.out || `exit ${r.status}` };
  return { known: true, registered: parseWorktreeList(r.out).some((e) => samePath(e.path, abs)) };
}

// The rename probe, the check git lacks on Windows: the system refuses to
// rename a directory while any process has a file open or its current
// directory inside it, and refuses without touching a file, where `git
// worktree remove` deletes what sorts before the held entry and drops its
// record before it reports the failure. Null when nothing holds the directory,
// otherwise the outcome that stops the removal.
async function probeHeld(abs, deps) {
  const kept = (note) => ({ outcome: "kept", note, remaining: null });
  const failed = (note, remaining) => ({ outcome: "failed", note, remaining });
  const probe = `${abs}${PROBE_SUFFIX}`;
  if (deps.exists(probe)) return kept(`${probe} already exists, which is what an interrupted run leaves beside a worktree; check it and rename it back or delete it by hand, then run again`);
  try {
    deps.rename(abs, probe);
  } catch (err) {
    return kept(`the directory could not be renamed (${err.code ?? err.message}), which on Windows happens while a process has a file open or its current directory inside it; no process names the path, so find what has a file open in it (an editor, an indexer, a shell) and run again`);
  }
  try {
    deps.rename(probe, abs);
  } catch (err) {
    return failed(`the directory was renamed to ${probe} to test whether a process holds it and could not be renamed back (${err.code ?? err.message}); rename it back by hand`, await bytesUnder(probe, deps));
  }
  return null;
}

// Removes what is left of a directory git no longer treats as a worktree and
// returns the bytes still there, or null when it is gone.
async function removeDirect(abs, deps) {
  try {
    deps.removeDir(abs);
  } catch {
    /* reported from what is left */
  }
  return deps.exists(abs) ? bytesUnder(abs, deps) : null;
}

// `git worktree remove` and what follows a refusal or a part-way stop. Null
// when the directory is gone and git holds no record of it, otherwise the
// outcome that stops the removal; `notes` collects what happened on the way,
// and `afterHand` ends the advice for a directory that could not be finished.
async function gitRemoveTree(abs, ctx, deps, notes, afterHand) {
  const kept = (note) => ({ outcome: "kept", note, remaining: null });
  const failed = (note, remaining) => ({ outcome: "failed", note, remaining });
  const rm = deps.exec("git", ["worktree", "remove", abs], ctx.mainRoot);
  if (rm.status === 0) return null;
  const gitErr = rm.err || rm.out;
  if (!deps.exists(abs)) notes.push(`git worktree remove reported an error but the directory is gone (${gitErr})`);
  else {
    const reg = registration(abs, ctx, deps);
    if (!reg.known) return failed(`git worktree remove failed (${gitErr}) and whether git still holds its record could not be read (git worktree list failed: ${reg.err}); nothing more was touched; check the directory and \`git worktree list\` by hand${afterHand ? "; the branch stays until then" : ""}`, await bytesUnder(abs, deps));
    if (reg.registered) {
      // Git checks the lock, the submodules and the tree's changes before
      // it deletes anything and drops its record after deleting, so a
      // record still there is a refusal; nothing more is done to the tree.
      return kept(`git worktree remove refused (${gitErr}) and kept its record; nothing more was touched`);
    }
    // Git deleted the directory's entries in order until one it could not
    // delete, then dropped its record: the directory is no longer a
    // worktree, whatever is left in it, so the rest goes directly.
    const remaining = await removeDirect(abs, deps);
    if (remaining !== null) return failed(`git worktree remove stopped part-way (${gitErr}) and dropped its record, so ${abs} is no longer a worktree; ${formatBytes(remaining)} remain there; delete the directory by hand once nothing holds it${afterHand}`, remaining);
    notes.push(`git worktree remove stopped part-way (${gitErr}) and dropped its record; the rest of the directory was removed directly`);
  }
  // Git drops the record itself when it fails past its checks; when the
  // record is still there, removing the now-missing path drops it.
  if (registration(abs, ctx, deps).registered !== false) {
    const again = deps.exec("git", ["worktree", "remove", abs], ctx.mainRoot);
    if (again.status !== 0) notes.push(`its record could not be dropped (${again.err || again.out}); \`git worktree prune\` drops it`);
  }
  return null;
}

// The type directory an emptied worktree leaves behind goes with it.
function removeEmptyParent(abs, ctx, deps, notes) {
  const parent = path.dirname(abs);
  if (!isUnder(parent, ctx.root) || !deps.isEmptyDir(parent)) return;
  const rel = `${path.relative(ctx.root, parent)}${path.sep}`;
  try {
    deps.removeEmptyDir(parent);
    notes.push(`removed the empty ${rel}`);
  } catch (err) {
    notes.push(`the empty ${rel} could not be removed (${err.code ?? err.message})`);
  }
}

export async function removeWorktree(entry, ctx, deps) {
  const abs = path.resolve(entry.path);
  const kept = (note) => ({ outcome: "kept", note, remaining: null });
  const failed = (note, remaining) => ({ outcome: "failed", note, remaining });
  if (!isUnder(abs, ctx.root)) return kept(`refusing to touch a path outside ${ctx.root}`);
  if (entry.branch && ctx.defaultBranches.has(entry.branch)) return kept(`refusing to touch the default branch ${entry.branch}`);
  const st = deps.exec("git", ["status", "--porcelain"], abs);
  if (st.status !== 0) return kept(`git status failed since it was classified (${st.err || st.out}); the tree is untouched`);
  const dirty = st.out.split(/\r?\n/).filter(Boolean).length;
  if (dirty > 0) return kept(`changed since it was classified: uncommitted changes (${n(dirty, "file")}); the tree is untouched`);
  const ref = `refs/heads/${entry.branch}`;
  const head = deps.exec("git", ["symbolic-ref", "-q", "HEAD"], abs);
  if (entry.detached) {
    // Still detached at the commit it was classified at, and that commit is still on origin/main.
    if (head.status === 0) return kept(`changed since it was classified: now on ${head.out.replace(/^refs\/heads\//, "")}; the tree is untouched`);
    const tip = deps.exec("git", ["rev-parse", "HEAD"], abs);
    if (tip.status !== 0 || tip.out !== entry.head) return kept(`changed since it was classified: HEAD is ${tip.status === 0 ? tip.out : tip.err || tip.out}; the tree is untouched`);
    const onMain = deps.exec("git", ["merge-base", "--is-ancestor", tip.out, "refs/remotes/origin/main"], ctx.mainRoot);
    if (onMain.status !== 0) return kept("changed since it was classified: its commit is not on origin/main; the tree is untouched");
    const why = detachedKeeps(detachedHistory(abs, ctx, deps));
    if (why.length) return kept(`changed since it was classified: ${why.join("; ")}; the tree is untouched`);
  } else {
    if (head.status !== 0 || head.out !== ref) return kept(`changed since it was classified: ${head.status === 0 && head.out ? `now on ${head.out.replace(/^refs\/heads\//, "")}` : "detached head"}; the tree is untouched`);
    const own = deps.exec("git", ["rev-list", "--count", ref, "^refs/remotes/origin/main"], ctx.mainRoot);
    if (own.status !== 0 || Number(own.out) > 0) return kept(`changed since it was classified: ${own.status === 0 ? `${n(Number(own.out), "commit")} not on origin/main` : own.err || own.out}; the tree is untouched`);
  }
  const held = await probeHeld(abs, deps);
  if (held) return held;
  const notes = [];
  const stopped = await gitRemoveTree(abs, ctx, deps, notes, entry.detached ? "" : `, then \`git branch -D ${entry.branch}\`; the branch stays until then`);
  if (stopped) return stopped;
  const del = entry.detached ? { status: 0 } : deps.exec("git", ["branch", "-D", entry.branch], ctx.mainRoot);
  if (del.status !== 0) return failed(`the directory is gone; git branch -D ${entry.branch} failed (${del.err || del.out}), so delete the branch by hand${notes.length ? `; ${notes.join("; ")}` : ""}`, 0);
  removeEmptyParent(abs, ctx, deps, notes);
  return { outcome: "removed", note: notes.join("; "), remaining: 0 };
}

// ---------------------------------------------------- dead worktree records ---

// Drops the records git holds for worktrees it can no longer find (`git
// worktree prune`), so a dead record never blocks the deletion of a branch
// that shares its name or shows as a row that only says to run the command.
// Pruning drops every dead record at once, so it waits when a `<path>.removing`
// sits beside any of them: that is the directory an interrupted probe renamed,
// and the record it points at must survive until it is renamed back. Returns
// the paths pruned, or why nothing was.
function pruneDeadRecords(entries, ctx, deps) {
  const dead = entries.filter((e) => e.prunable);
  if (!dead.length) return { pruned: [] };
  const probe = dead.find((e) => deps.exists(`${path.resolve(e.path)}${PROBE_SUFFIX}`));
  if (probe) return { pruned: [], waiting: `${path.resolve(probe.path)}${PROBE_SUFFIX} is beside a dead record, which is what an interrupted run's probe leaves; rename it back by hand first, since pruning would drop the record it points at` };
  const r = deps.exec("git", ["worktree", "prune"], ctx.mainRoot);
  if (r.status !== 0) return { pruned: [], waiting: `git worktree prune failed (${r.err || r.out})` };
  return { pruned: dead.map((e) => path.resolve(e.path)) };
}

// ------------------------------------------------- one named directory ---

// `--apply --root <main> --remove <path>`: removes the one directory named,
// registered worktree or leftover, and never its branch, so a ticket whose
// pull request is still open or abandoned can give its disk back. It refuses
// what must not be done: the main checkout, a path outside the worktrees root,
// an interrupted probe's `.removing` directory, one holding another worktree
// or sitting inside one, the default branch, a locked worktree, a directory
// that is gone, a target that is itself a link, one with uncommitted changes,
// a worktree git can no longer read or an unregistered directory holding a
// `.git` of its own (git status cannot answer for either),
// one a process or driver is using or that the rename probe finds held, one
// holding a link that leads outside it (named) or a directory that cannot be
// read. The shell that ran this command does not count as a user, though its
// command line names the path: only an ancestor whose own command line runs
// this script with --remove, and only while each parent is at least as old as
// its child (`ancestorsOf`). Otherwise every link inside is unlinked without
// being followed, and the tree goes: through `git worktree remove` when git
// still knows it, directly when git has already dropped it. Returns the exit
// code; a refusal is thrown before anything is touched.
async function removeOne(target, ctx, deps, entries, record) {
  const log = deps.log;
  const abs = path.resolve(target);
  const rel = path.relative(path.dirname(ctx.mainRoot), abs);
  if (samePath(abs, ctx.mainRoot)) die("that is the main checkout; nothing was touched");
  if (!isUnder(abs, ctx.root)) die(`${abs} is not under ${ctx.root}; nothing was touched`);
  if (abs.endsWith(PROBE_SUFFIX)) die(`${abs} is the directory an interrupted run's probe renamed; rename it back by hand instead, since removing it would leave the record it points at`);
  if (entries.some((e) => isUnder(e.path, abs))) die(`${abs} holds another worktree; name that worktree instead`);
  const inside = entries.find((e) => isUnder(abs, e.path));
  if (inside) die(`${rel} is inside the worktree ${path.relative(path.dirname(ctx.mainRoot), path.resolve(inside.path))}; name the worktree itself, since removing part of a tree deletes uncommitted work the status check never sees; nothing was touched`);
  const entry = entries.find((e) => samePath(e.path, abs));
  if (entry?.branch && ctx.defaultBranches.has(entry.branch)) die(`${rel} holds the default branch ${entry.branch}, which is never removed; nothing was touched`);
  if (entry?.locked) die(`${rel} is locked (${entry.locked}); nothing was touched`);
  if (!deps.exists(abs)) die(entry ? `${abs} is already gone and git still holds its record; run this without --remove and it prunes the record` : `${abs} does not exist; nothing was touched`);
  if (deps.isLink(abs)) die(`${rel} is itself a link, and unlinking the links inside it would act on what it points at, wherever that is; remove the link by hand; nothing was touched`);
  // git status is the only check for uncommitted work, so a tree it cannot
  // answer for is refused: a worktree git can no longer read, and a
  // directory that still holds a `.git` of its own.
  if (entry?.prunable) die(`${rel} is a worktree git can no longer read (${entry.prunable}), so whether it has uncommitted changes cannot be told; check it by hand, then delete it by hand; nothing was touched`);
  if (!entry && deps.exists(path.join(abs, ".git"))) die(`${rel} holds a .git but is not a registered worktree, so whether it has uncommitted changes cannot be told; check it by hand, then delete it by hand; nothing was touched`);
  const live = Boolean(entry);
  if (live) {
    const st = deps.exec("git", ["status", "--porcelain"], abs);
    if (st.status !== 0) die(`git status failed in ${rel} (${st.err || st.out}), so whether it has changes cannot be told; nothing was touched`);
    const dirty = st.out.split(/\r?\n/).filter(Boolean).length;
    if (dirty > 0) die(`${rel} has uncommitted changes (${n(dirty, "file")}); commit, push or discard them first; nothing was touched`);
  }
  const holds = [];
  if (!ctx.processes.ok) holds.push("the processes on this machine could not be listed, so whether one is using it is unknown");
  else {
    // The shell that ran this command names the path it was typed with, and
    // the same path is the argument it hands the script; that is not a use of
    // the tree. Only an ancestor whose own command line runs this script
    // counts as that shell, so an editor opened on the tree stays a user.
    const mine = ancestorsOf(deps.pid(), ctx.processes.list);
    const users = usersOf(abs, ctx.processes.list, deps.pid()).filter((p) => !(mine.has(p.pid) && RUNS_SCRIPT.test(p.cmd)));
    if (users.length) holds.push(`its path is on the command line of ${listSome(users.map((p) => `pid ${p.pid} (${p.name})`), 2)}`);
  }
  for (const s of serverRows(probeServers(abs, deps))) holds.push(`its ${s.driver ?? "driver"} reports ${s.state === "unknown" ? `an unknown server state (${s.detail})` : `dev servers ${s.state}${s.url ? ` at ${s.url}` : ""}`}; the driver's \`down\` settles it`);
  if (holds.length) die(`${rel} is in use: ${holds.join("; ")}; nothing was touched`);
  const scan = await deps.scan(abs);
  const blocked = linkReason(scan, abs);
  if (blocked) die(`${rel}: ${blocked}; nothing was touched`);
  const finish = (decision, note, size) => {
    const line = `${decision.padEnd(DECISION_WIDTH)}  ${rel}  ${formatBytes(size).padEnd(SIZE_WIDTH)}  ${note}`.trimEnd();
    log(line);
    record({ decision, path: abs, why: note });
    return decision === "failed" ? 1 : 0;
  };
  // Before anything is unlinked or deleted: a directory a process holds is
  // refused whole, where git would delete what sorts before the held entry.
  const held = await probeHeld(abs, deps);
  if (held?.outcome === "kept") die(`${rel}: ${held.note}; nothing was touched`);
  if (held) {
    record({ decision: "removing", path: abs, why: `${entry ? "worktree" : "directory"} ${rel} removed by name` });
    return finish("failed", held.note, scan.bytes);
  }

  const what = live ? "worktree" : "directory";
  const why = `${what} ${rel} removed by name${entry?.branch ? `; its branch ${entry.branch} stays` : ""}`;
  record({ decision: "removing", path: abs, why });
  let unlinked = 0;
  try {
    unlinked = deps.unlinkLinks(abs);
  } catch (err) {
    return finish("failed", `${err.code ?? err.message} while unlinking the links inside it; the directory is still there and no link's target was followed`, scan.bytes);
  }
  const notes = [];
  if (unlinked) notes.push(`${n(unlinked, "link")} unlinked first, targets untouched`);
  const said = () => (notes.length ? `${notes.join("; ")}; ` : "");
  if (live) {
    const stopped = await gitRemoveTree(abs, ctx, deps, notes, "");
    if (stopped) return finish("failed", `${said()}${stopped.note}`, scan.bytes);
  } else {
    const remaining = await removeDirect(abs, deps);
    if (remaining !== null) return finish("failed", `${said()}${formatBytes(remaining)} remain there; delete the directory by hand once nothing holds it`, scan.bytes);
    notes.unshift("not a registered worktree");
  }
  removeEmptyParent(abs, ctx, deps, notes);
  return finish("removed", [...notes, entry?.branch ? `its branch ${entry.branch} stays` : ""].filter(Boolean).join("; "), scan.bytes);
}

// A command line that runs this script to remove one directory. The file name
// and the option, not the skill's name, which a worktree's own path can hold
// (a branch is named after its ticket).
const RUNS_SCRIPT = /clean-worktrees\.mjs"?\s.*--remove\b/;

// The pids of a process and the parents above it. A parent counts only when it
// is at least as old as its child: on Windows a dead parent's pid is handed to
// a new process, which is younger than the child that names it, and the walk
// stops there. A process whose age is unknown ends the walk too.
function ancestorsOf(pid, list) {
  const byPid = new Map(list.map((p) => [p.pid, p]));
  const chain = new Set([pid]);
  for (let p = byPid.get(pid); p; ) {
    const parent = byPid.get(p.ppid);
    if (!parent || chain.has(parent.pid) || p.age == null || parent.age == null || parent.age < p.age) break;
    chain.add(parent.pid);
    p = parent;
  }
  return chain;
}

// ------------------------------------------------------ driver profiles ---

// The web editor driver keeps a directory per checkout under driverHome(),
// named by a hash of the checkout's path, holding one directory per agent
// session with its server record (state.json) and its Chromium profile
// (drive-web-editor/session-dir.mjs). A hash cannot be read back into a path,
// so a directory is tied to a worktree only by hashing that worktree's path.
// The driver hashes the path it was started from, whose drive letter may be
// in either case, so both spellings are hashed.
export function checkoutSpellings(p) {
  const r = path.resolve(p);
  const out = new Set([r]);
  if (/^[a-zA-Z]:/.test(r)) {
    out.add(r[0].toUpperCase() + r.slice(1));
    out.add(r[0].toLowerCase() + r.slice(1));
  }
  return [...out];
}

// Why a checkout's driver directory must stay, one reason per session that
// may still be in use: a server record naming a live pid, a profile claim
// younger than the driver's takeover window, a claim lock younger than the
// driver's stale-lock window, a running process whose command line names the
// directory (a browser names its profile), or anything that cannot be read:
// the directory's or a session's entries, a record or claim, or one of them
// that is a link rather than a file. Empty when it can go.
export function driverDirKeeps(dir, deps, nowMs, processes) {
  const keep = [];
  const why = (err) => String(err?.code ?? err?.message ?? err).split("\n")[0];
  // A file's lstat, null when it is not there; a link, dangling or not, and
  // anything but ENOENT are reasons to keep.
  const inspect = (file, label) => {
    try {
      const st = deps.lstat(file);
      if (st.isSymbolicLink()) return { keep: `${label} is a link` };
      return { st };
    } catch (err) {
      if (err?.code === "ENOENT") return { st: null };
      return { keep: `${label} could not be inspected (${why(err)})` };
    }
  };
  const readJson = (file) => {
    try {
      return { value: JSON.parse(deps.readFile(file)) };
    } catch (err) {
      return { err: why(err) };
    }
  };
  let entries;
  try {
    entries = deps.readEntries(dir);
  } catch (err) {
    return [`its sessions could not be listed (${why(err)})`];
  }
  for (const entry of entries) {
    const name = entry.name;
    if (!entry.isDirectory()) {
      keep.push(`${name} is not a session directory; left for a person`);
      continue;
    }
    const session = path.join(dir, name);
    try {
      deps.readEntries(session);
    } catch (err) {
      keep.push(`session ${name}: its entries could not be listed (${why(err)})`);
      continue;
    }
    const state = path.join(session, "state.json");
    const stateAt = inspect(state, `session ${name}: its server record`);
    if (stateAt.keep) keep.push(stateAt.keep);
    else if (stateAt.st) {
      const r = readJson(state);
      if (r.err) keep.push(`session ${name}: its server record could not be read (${r.err})`);
      else if (deps.pidAlive(r.value?.pid)) keep.push(`session ${name}: its server record names pid ${r.value.pid}, still running`);
    }
    const claim = path.join(session, "profile", PROFILE_CLAIM_FILE);
    const lockAt = inspect(`${claim}.lock`, `session ${name}: its profile claim lock`);
    if (lockAt.keep) keep.push(lockAt.keep);
    else if (lockAt.st && nowMs - lockAt.st.mtimeMs <= PROFILE_LOCK_STALE_MS) keep.push(`session ${name}: a launch holds its profile claim lock`);
    const claimAt = inspect(claim, `session ${name}: its profile claim`);
    if (claimAt.keep) keep.push(claimAt.keep);
    else if (claimAt.st) {
      const r = readJson(claim);
      if (r.err || typeof r.value?.at !== "number") keep.push(`session ${name}: its profile claim could not be read${r.err ? ` (${r.err})` : ""}`);
      else if (nowMs - r.value.at < PROFILE_CLAIM_MS) keep.push(`session ${name}: its profile was claimed ${Math.max(0, Math.round((nowMs - r.value.at) / 60_000))} min ago, under the driver's ${PROFILE_CLAIM_MS / 60_000} min`);
    }
  }
  if (!processes.ok) keep.push("the processes on this machine could not be listed, so whether one is using it is unknown");
  else {
    const users = usersOf(dir, processes.list, deps.pid());
    if (users.length) keep.push(`its path is on the command line of ${listSome(users.map((p) => `pid ${p.pid} (${p.name})`), 2)}`);
  }
  return keep;
}

// Lists every checkout directory under the driver home that belongs to no
// worktree left after this run. One whose worktree this run removes (or, in
// a dry run, would remove) goes under --apply unless driverDirKeeps names a
// reason; one that matches no worktree at all is listed with its size and
// left for a person, since which checkout it served cannot be told. The
// directories of worktrees that stay are not listed. Returns the count of
// failed removals.
export async function cleanDriverDirs(ctx, deps, apply, record, rows) {
  const home = deps.driverHome?.();
  if (!home) return { failed: 0, rows: [] };
  const names = deps.listDirs(home);
  if (!names.length) return { failed: 0, rows: [] };
  const env = { IMPOWER_DRIVER_HOME: home };
  const hashes = (p) => checkoutSpellings(p).map((s) => path.basename(checkoutDir(s, env)));
  const worktrees = rows.filter((r) => !r.stray);
  const goes = (r) => (apply ? r.decision === "removed" : r.decision === "remove");
  const owner = new Map();
  for (const r of worktrees.filter((r) => !goes(r))) for (const h of hashes(r.entry.path)) owner.set(h, null);
  for (const r of worktrees.filter(goes)) for (const h of hashes(r.entry.path)) if (!owner.has(h)) owner.set(h, r.entry.path);
  const rel = (p) => path.relative(path.dirname(ctx.mainRoot), path.resolve(p));
  const nowMs = Date.parse(deps.now());
  const out = [];
  let failed = 0;
  for (const name of names) {
    if (owner.get(name) === null) continue;
    const dir = path.join(home, name);
    const worktree = owner.get(name);
    const size = await deps.scan(dir).then((s) => s.bytes, () => null);
    let decision;
    let why;
    if (worktree === undefined) {
      decision = apply ? "kept" : "keep";
      why = "matches no worktree, so which checkout it served cannot be told; delete it by hand once no session uses it";
    } else {
      const keep = driverDirKeeps(dir, deps, nowMs, ctx.processes);
      if (keep.length) {
        decision = apply ? "kept" : "keep";
        why = `the driver directory of ${rel(worktree)}, which ${apply ? "was" : "would be"} removed; ${keep.join("; ")}`;
      } else if (!apply) {
        decision = "remove";
        why = `the driver directory of ${rel(worktree)}, which would be removed; no session in it is in use`;
      } else {
        why = `the driver directory of ${rel(worktree)}, which was removed; no session in it is in use`;
        record({ decision: "removing", path: dir, why });
        try {
          deps.removeDir(dir);
          decision = deps.exists(dir) ? "failed" : "removed";
          if (decision === "failed") why = `the directory is still there; ${why}`;
        } catch (err) {
          decision = "failed";
          why = `${err.code ?? err.message}; the directory is ${deps.exists(dir) ? "still there" : "gone"}; ${why}`;
        }
        if (decision === "failed") failed++;
      }
    }
    if (apply) record({ decision, path: dir, why });
    out.push({ name, decision, size, why });
  }
  if (!out.length) return { failed: 0, rows: [] };
  const log = deps.log;
  log("");
  log(`web editor driver directories under ${home}:`);
  for (const r of out) log(`${r.decision.padEnd(DECISION_WIDTH)}  ${r.name}  ${formatBytes(r.size).padEnd(SIZE_WIDTH)}  ${r.why}`);
  const gone = out.filter((r) => r.decision === "remove" || r.decision === "removed");
  log(`${n(out.length, "driver directory", "driver directories")}: ${gone.length} ${apply ? "removed" : "to remove"} (${formatBytes(gone.reduce((s, r) => s + (r.size ?? 0), 0))}), ${out.length - gone.length} kept.`);
  return { failed, rows: out };
}

// ---------------------------------------------------------- review jobs ---

// Review job directories live in <parent>/<repo>.review-jobs/pr-<P>/, one per
// pull request, with a round-<R> directory per review round inside it (see
// scripts/review-job-root.mjs). A pr-<P> directory is the unit of removal. A
// test-* directory is a standalone check's scratch folder, which needs a
// location outside TEMP for the same reason review jobs do.
export { jobRootOf };

// Every *.jsonl file under a job directory, never entering a link, a probe
// checkout's node_modules or a .git directory, with the directories that
// could not be read.
export function jobJournals(dir) {
  const journals = [];
  const unreadable = [];
  const pending = [dir];
  while (pending.length) {
    const d = pending.pop();
    let items;
    try {
      items = fs.readdirSync(d, { withFileTypes: true });
    } catch (err) {
      unreadable.push(`${d}: ${err.code ?? err.message}`);
      continue;
    }
    for (const it of items) {
      const p = path.join(d, it.name);
      if (it.isSymbolicLink()) continue;
      if (it.isDirectory()) {
        if (it.name !== "node_modules" && it.name !== ".git") pending.push(p);
      } else if (it.isFile() && it.name.endsWith(".jsonl")) journals.push(p);
    }
  }
  return { journals, unreadable };
}

// Every process a journal records, keyed by pid: a row's own `pid`, and the
// `pid` of any identity object it holds (processIdentity, childIdentity,
// identity), each with the process start times the journal recorded for it
// (an identity object's `start`, which processIdentity writes beside every
// coordinator and child pid). A pid with no recorded start maps to an empty
// set and is judged by its number alone. Null when a line is not JSON, since
// what that line recorded cannot be told; a launcher appends whole lines, so
// a torn last line is treated the same way.
export function journalProcesses(text) {
  const procs = new Map();
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (Number.isSafeInteger(value.pid) && value.pid > 0) {
      const starts = procs.get(value.pid) ?? new Set();
      if (typeof value.start === "string" && value.start) starts.add(value.start);
      procs.set(value.pid, starts);
    }
    for (const child of Object.values(value)) visit(child);
  };
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      visit(JSON.parse(line));
    } catch {
      return null;
    }
  }
  return procs;
}

// Whether a process a journal recorded is still that process: the pid exists
// and, when the journal recorded a start time, the process now holding the
// number started then. Windows hands out finished processes' pids to unrelated
// programs, so the number alone proves nothing. A start time that cannot be
// read now, or a pid with none recorded, keeps the number's word.
export function recordedProcessAlive(pid, starts, deps) {
  if (!deps.pidAlive(pid)) return false;
  if (!starts.size || !deps.processStart) return true;
  let now;
  try {
    now = deps.processStart(pid);
  } catch {
    // Windows will not read the start time of a service or another user's
    // process; whether it is the recorded one cannot be told, so the number
    // keeps the directory, and the caller says why.
    return "unreadable";
  }
  return now !== null && starts.has(now);
}

// The state of pull request (or, failing that, issue) N on GitHub: "open",
// "closed", or null with the reason it could not be read.
export function numberState(number, deps, cwd) {
  const pr = deps.exec("gh", ["pr", "view", String(number), "--json", "state", "--jq", ".state"], cwd, 60_000);
  if (pr.status === 0 && pr.out) return { state: pr.out === "OPEN" ? "open" : "closed", kind: "PR" };
  const issue = deps.exec("gh", ["issue", "view", String(number), "--json", "state", "--jq", ".state"], cwd, 60_000);
  if (issue.status === 0 && issue.out) return { state: issue.out === "OPEN" ? "open" : "closed", kind: "issue" };
  return { state: null, err: pr.err || issue.err || "no output" };
}

// The decision for one entry under the job root. It is removable only when
// its PR (or issue) is closed, every journal in it is readable, and no process
// a journal names or whose command line names the directory is running. A
// pid whose journal recorded a start time counts only while the process
// holding it started then; one recorded bare, or whose start time cannot be
// read now, is taken at its number's word, which keeps a directory rather than
// removing one in use.
export function classifyJob(name, dir, deps, ctx) {
  const m = /^pr-(\d+)$/.exec(name);
  const test = /^test-/.test(name);
  if (!m && !test) return { remove: false, reason: "not a pr-<N> or test-* job directory; left for a person" };
  const keep = [];
  let github = null;
  if (m) {
    github = numberState(Number(m[1]), deps, ctx.mainRoot);
    if (github.state === null) keep.push(`the state of #${m[1]} could not be read (${github.err})`);
    else if (github.state === "open") keep.push(`${github.kind} #${m[1]} is open`);
  }
  const { journals, unreadable } = jobJournals(dir);
  if (unreadable.length) keep.push(`${n(unreadable.length, "directory", "directories")} inside it could not be read (${listSome(unreadable, 2)})`);
  const live = new Set();
  const unreadableStart = new Set();
  for (const journal of journals) {
    let procs;
    try {
      procs = journalProcesses(fs.readFileSync(journal, "utf8"));
    } catch (err) {
      procs = null;
    }
    if (procs === null) keep.push(`the journal ${path.relative(dir, journal)} could not be read in full`);
    else {
      for (const [pid, starts] of procs) {
        if (pid === deps.pid()) continue;
        const alive = recordedProcessAlive(pid, starts, deps);
        if (alive === "unreadable") unreadableStart.add(pid);
        else if (alive) live.add(pid);
      }
    }
  }
  if (unreadableStart.size) keep.push(`its journal records ${n(unreadableStart.size, "process", "processes")} whose pid is now held by a process whose start time cannot be read, so whether it is the recorded one is unknown (pid ${[...unreadableStart].join(", ")})`);
  if (live.size) keep.push(`its journal records ${n(live.size, "process", "processes")} still running (pid ${[...live].join(", ")})`);
  const using = commandLineReason(dir, deps, ctx);
  if (using) keep.push(using);
  // A test's scratch directory names its own process in an owner journal
  // when it is created; without one, whose it is cannot be told.
  if (test && !journals.length) keep.push("a test directory with no journal naming its process; left for a person");
  if (keep.length) return { remove: false, reason: keep.join("; ") };
  const why = m ? `${github.kind} #${m[1]} is closed and` : "a test's scratch directory, and";
  return { remove: true, reason: `${why} no process its journals record is running; ${n(journals.length, "journal")}` };
}

// Removes a job directory without following any link in it: every symlink
// and junction is unlinked first (a reviewer probe checkout holds node_modules
// junctions into live worktrees), the tree is walked again to confirm none is
// left, and only then is the rest deleted, which then holds plain files and
// directories only.
export function removeJobDir(dir) {
  const unlinked = unlinkLinksIn(dir);
  if (unlinkLinksIn(dir) !== 0) throw new Error(`a link reappeared inside ${dir} while it was being removed; nothing further was deleted`);
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
  return unlinked;
}

// Unlinks every symlink and junction under a directory and returns how many,
// never following one: a directory junction or symlink on Windows is removed
// with rmdir, which deletes the reparse point and never its target.
function unlinkLinksIn(dir) {
  let found = 0;
  const pending = [dir];
  while (pending.length) {
    const d = pending.pop();
    for (const it of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, it.name);
      if (it.isSymbolicLink()) {
        found++;
        try {
          fs.unlinkSync(p);
        } catch {
          fs.rmdirSync(p);
        }
      } else if (it.isDirectory()) pending.push(p);
    }
  }
  return found;
}

// Classifies every entry under the job root, prints a row each, and under
// --apply removes the removable ones. Returns the count of failed removals.
export function cleanJobs(ctx, deps, apply, record) {
  const root = jobRootOf(ctx.mainRoot);
  const names = deps.listDirs(root);
  const log = deps.log;
  if (!names.length) return { failed: 0, rows: [] };
  log("");
  log(`review job directories under ${root}:`);
  const rows = [];
  let failed = 0;
  for (const name of names) {
    const dir = path.join(root, name);
    const verdict = classifyJob(name, dir, deps, ctx);
    let decision = verdict.remove ? "remove" : "keep";
    let why = verdict.reason;
    if (apply) {
      if (!verdict.remove) decision = "kept";
      else {
        record({ decision: "removing", path: dir, why });
        try {
          const unlinked = removeJobDir(dir);
          decision = "removed";
          if (unlinked) why += `; ${n(unlinked, "link")} unlinked first, targets untouched`;
        } catch (err) {
          failed++;
          decision = "failed";
          why = `${err.message}; the directory is ${deps.exists(dir) ? "still there" : "gone"}; ${why}`;
        }
      }
      record({ decision, path: dir, why });
    }
    rows.push({ name, decision, why });
    log(`${decision.padEnd(DECISION_WIDTH)}  ${name}  ${why}`);
  }
  const removable = rows.filter((r) => r.decision === "remove" || r.decision === "removed" || r.decision === "failed").length;
  log(`${n(rows.length, "job directory", "job directories")}: ${removable} ${apply ? "removable" : "to remove"}, ${rows.length - removable} kept.`);
  return { failed, rows };
}

// ------------------------------------------------------ scratch directories ---

// Two scratch locations the regression workflow writes and nothing else
// removes. `runRedGreen` (drive-web-editor/redgreen.mjs) makes a redgreen-*
// directory under the system temp directory for its snapshot and its red and
// green logs, and leaves it for the report to cite. `test-suite.mjs start`
// (refused by the local-test hook, but runs left by earlier sessions remain
// and `resume` continues them) writes each run under
// <git-dir>/test-suites/<uuid>/; a linked worktree's git
// dir goes with the worktree, and the main checkout's is pruned here.
const REDGREEN_AGE_MS = 24 * 60 * 60 * 1000;

// Shared by both: a directory named on a running command line is in use.
function commandLineReason(dir, deps, ctx) {
  if (!ctx.processes.ok) return "the processes on this machine could not be listed, so whether one is using it is unknown";
  const users = usersOf(dir, ctx.processes.list, deps.pid());
  return users.length ? `its path is on the command line of ${listSome(users.map((p) => `pid ${p.pid} (${p.name})`), 2)}` : null;
}

const hours = (ms) => `${(ms / 3_600_000).toFixed(1)} h`;

export function classifyRedgreen(dir, deps, ctx) {
  const keep = [];
  const mtime = deps.mtimeMs(dir);
  const age = mtime == null ? null : Date.parse(deps.now()) - mtime;
  if (age == null) keep.push("its age could not be read");
  else if (age < REDGREEN_AGE_MS) keep.push(`written ${hours(age)} ago, under the ${hours(REDGREEN_AGE_MS)} threshold; a run's report may still cite its logs`);
  // runRedGreen names its own process in owner.json; its command line never
  // names the directory it generated, so this is what shows a run still
  // holding the snapshot it restores from. A directory without the file is
  // judged by age alone.
  let owner = null;
  try {
    owner = JSON.parse(deps.readFile(path.join(dir, "owner.json")))?.pid;
  } catch {
    /* no owner record */
  }
  if (deps.pidAlive(owner) && owner !== deps.pid()) keep.push(`its owner.json names pid ${owner}, which is running; a red/green run may still be restoring from it`);
  const using = commandLineReason(dir, deps, ctx);
  if (using) keep.push(using);
  if (keep.length) return { remove: false, reason: keep.join("; ") };
  return { remove: true, reason: `a redgreen snapshot last written ${hours(age)} ago` };
}

// A run is finished when run.json says its coordinator released it (`active`
// false, written before the reservation is released) or the coordinator it
// names is dead, and no attempt's child it records is still running. A
// missing or unreadable run.json keeps the directory: `start` writes it right
// after creating the directory, so its absence may be a run starting.
export function classifyTestRun(dir, deps, ctx) {
  let run;
  try {
    run = JSON.parse(deps.readFile(path.join(dir, "run.json")));
  } catch (err) {
    return { remove: false, reason: `its run.json could not be read (${err.code ?? String(err.message).split("\n")[0]}); a run may be starting` };
  }
  const keep = [];
  const ownerPid = run?.owner?.pid;
  if (run?.active !== false) {
    if (deps.pidAlive(ownerPid)) keep.push(`run.json reports it active and its coordinator pid ${ownerPid} is running`);
    else if (!Number.isInteger(ownerPid)) keep.push("run.json reports it active and names no coordinator pid");
  }
  const children = (Array.isArray(run?.attempts) ? run.attempts : []).filter((a) => !["passed", "failed", "interrupted"].includes(a?.status)).map((a) => a?.child?.pid).filter((pid) => deps.pidAlive(pid));
  if (children.length) keep.push(`an unfinished attempt's child is still running (pid ${children.join(", ")})`);
  const using = commandLineReason(dir, deps, ctx);
  if (using) keep.push(using);
  if (keep.length) return { remove: false, reason: keep.join("; ") };
  return { remove: true, reason: run.active === false ? "a finished test-suite run" : `a test-suite run whose coordinator pid ${ownerPid} is dead` };
}

// The redgreen directories under the temp directory and the runs under the
// main checkout's .git/test-suites, each classified, printed with its size,
// and under --apply removed when removable. Returns the count of failures.
export async function cleanScratch(ctx, deps, apply, record) {
  const log = deps.log;
  const tmp = deps.tmpdir();
  const suites = path.join(ctx.mainRoot, ".git", "test-suites");
  const groups = [
    { label: `redgreen snapshots under ${tmp}`, root: tmp, names: deps.listDirs(tmp).filter((d) => /^redgreen-/.test(d)), classify: classifyRedgreen },
    { label: `test-suite runs under ${suites}`, root: suites, names: deps.listDirs(suites), classify: classifyTestRun },
  ];
  let failed = 0;
  const rows = [];
  for (const g of groups) {
    if (!g.names.length) continue;
    log("");
    log(`${g.label}:`);
    let removable = 0;
    let bytes = 0;
    for (const name of g.names) {
      const dir = path.join(g.root, name);
      const verdict = g.classify(dir, deps, ctx);
      const size = await deps.scan(dir).then((s) => s.bytes, () => null);
      let decision = verdict.remove ? "remove" : "keep";
      let why = verdict.reason;
      if (verdict.remove) {
        removable++;
        bytes += size ?? 0;
      }
      if (apply) {
        if (!verdict.remove) decision = "kept";
        else {
          record({ decision: "removing", path: dir, why });
          try {
            deps.removeScratch(dir);
            decision = "removed";
          } catch (err) {
            failed++;
            decision = "failed";
            why = `${err.message}; the directory is ${deps.exists(dir) ? "still there" : "gone"}; ${why}`;
          }
        }
        record({ decision, path: dir, why });
      }
      rows.push({ path: dir, decision, why, size });
      log(`${decision.padEnd(DECISION_WIDTH)}  ${name}  ${formatBytes(size).padEnd(SIZE_WIDTH)}  ${why}`);
    }
    log(`${n(g.names.length, "directory", "directories")}: ${removable} ${apply ? "removable" : "to remove"} (${formatBytes(bytes)}), ${g.names.length - removable} kept.`);
  }
  return { failed, rows };
}

// ------------------------------------------------------------------ table ---

// One row per worktree or stray directory. Rows print as they are decided, so
// a failure part-way through an --apply leaves the record of everything
// before it on the screen; the columns are sized from what is known before
// the first row prints.
const DECISION_WIDTH = "removed".length;
const SIZE_WIDTH = "1023.9 MB".length;
function rowPrinter(rows, ctx, log) {
  const rel = (p) => path.relative(path.dirname(ctx.mainRoot), path.resolve(p)) || ".";
  const branchCell = (r) => (r.stray && !r.stranded ? "(not a worktree)" : r.entry.branch ?? (r.entry.detached ? "(detached)" : ""));
  const widths = [DECISION_WIDTH, Math.max(...rows.map((r) => rel(r.entry.path).length)), Math.max(...rows.map((r) => branchCell(r).length)), SIZE_WIDTH];
  return (r) => log([r.decision, rel(r.entry.path), branchCell(r), formatBytes(r.size)].map((v, i) => v.padEnd(widths[i])).concat(r.why).join("  ").trimEnd());
}

export function parseArgs(argv) {
  const opts = { apply: false, root: null, remove: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") opts.apply = true;
    else if (a === "--root" || a.startsWith("--root=")) {
      opts.root = a === "--root" ? argv[++i] : a.slice("--root=".length);
      if (!opts.root) die("--root needs the path of the main checkout after it");
      if (!path.isAbsolute(opts.root)) die(`--root ${opts.root} is not an absolute path; --root names the main checkout in full, so that a relative path resolved against whatever directory the shell is in never passes for it`);
    } else if (a === "--remove" || a.startsWith("--remove=")) {
      opts.remove = a === "--remove" ? argv[++i] : a.slice("--remove=".length);
      if (!opts.remove) die("--remove needs the path of the directory to remove after it");
      if (!path.isAbsolute(opts.remove)) die(`--remove ${opts.remove} is not an absolute path; --remove names the directory in full, so that a relative path resolved against whatever directory the shell is in never names the wrong one`);
    } else die(`unknown option ${a}; the options are --apply, --root <path> and --remove <path>`);
  }
  if (opts.apply && !opts.root) die("--apply needs --root <path>, the main checkout it is to act on, so the repository comes from the command line and never from the current directory alone; the dry run needs no --root");
  if (opts.remove && !opts.apply) die("--remove <path> needs --apply --root <path>: it removes the one directory it names and has no dry run");
  return opts;
}

// Runs the command and returns its exit code: 1 when a removal failed, and a
// refusal to run at all is thrown before anything is touched.
export async function main(argv, deps = liveDeps) {
  const { apply, root: namedRoot, remove } = parseArgs(argv);
  const log = deps.log;

  const cwd = deps.cwd();
  const top = deps.exec("git", ["rev-parse", "--show-toplevel"], cwd);
  if (top.status !== 0) die("not inside a git repository; run from the main checkout");
  let entries = parseWorktreeList(gitOrDie(deps, ["worktree", "list", "--porcelain"], cwd));
  let mainEntry = entries[0];
  if (!mainEntry) die("git worktree list printed nothing; run from the main checkout");
  if (mainEntry.bare) die("the first worktree is bare; run from the main checkout");
  if (!samePath(top.out, mainEntry.path)) die(`run from the main checkout, ${mainEntry.path}; this is the worktree ${top.out}`);
  const mainRoot = path.resolve(mainEntry.path);
  if (namedRoot && !samePath(namedRoot, mainRoot)) die(`--root ${namedRoot} is not the main checkout the current directory belongs to, ${mainRoot}; nothing was touched`);
  const ctx = {
    mainRoot,
    root: path.join(path.dirname(mainRoot), `${path.basename(mainRoot)}.worktrees`),
    firstParent: new Set(),
    defaultBranches: new Set(["main"]),
    processes: { ok: false, err: "not listed" },
  };
  // The default branch is never removed wherever it is checked out: main,
  // and whatever origin/HEAD names. A clone records origin/HEAD; a repository
  // built with `git init` and `git remote add` has none, and what its default
  // branch is cannot be told, so --apply waits for it to be recorded.
  const originHead = deps.exec("git", ["symbolic-ref", "-q", "refs/remotes/origin/HEAD"], mainRoot);
  if (originHead.status === 0 && originHead.out.startsWith("refs/remotes/origin/")) ctx.defaultBranches.add(originHead.out.slice("refs/remotes/origin/".length));
  else if (apply) die(`origin/HEAD is not recorded in ${mainRoot}, so which branch is the default cannot be told beyond main; \`git remote set-head origin --auto\` records it; nothing was touched`);
  else log(`origin/HEAD is not recorded in ${mainRoot}, so main alone counts as the default branch; \`git remote set-head origin --auto\` records it`);
  const logPath = path.join(mainRoot, ".git", LOG_NAME);
  const record = (obj) => {
    if (!apply) return;
    try {
      deps.appendLog(logPath, JSON.stringify({ at: deps.now(), ...obj }));
    } catch (err) {
      if (!ctx.logFailed) log(`the run is not being recorded in ${logPath} (${err.code ?? err.message})`);
      ctx.logFailed = true;
    }
  };

  if (remove) {
    ctx.processes = deps.processes();
    return removeOne(remove, ctx, deps, entries, record);
  }

  log("fetching origin with --prune ...");
  gitOrDie(deps, ["fetch", "--prune", "origin"], mainRoot);
  // Dead records are dropped before anything is classified, so they neither
  // show as rows that only name the command nor block a branch deletion.
  if (apply) {
    const dropped = pruneDeadRecords(entries, ctx, deps);
    if (dropped.pruned.length) {
      log(`pruned ${n(dropped.pruned.length, "dead worktree record")}: ${dropped.pruned.map((p) => path.relative(path.dirname(mainRoot), p)).join(", ")}`);
      record({ pruned: dropped.pruned });
      entries = parseWorktreeList(gitOrDie(deps, ["worktree", "list", "--porcelain"], cwd));
      mainEntry = entries[0];
    } else if (dropped.waiting) log(`dead worktree records were not pruned: ${dropped.waiting}`);
  }
  ctx.firstParent = new Set(gitOrDie(deps, ["rev-list", "--first-parent", "refs/remotes/origin/main"], mainRoot).split(/\s+/).filter(Boolean));
  ctx.processes = deps.processes();
  record({ run: argv.join(" "), main: mainRoot });

  // A worktree git cannot answer for is kept and said so, rather than
  // stopping the run for every other one.
  const rows = [];
  for (const entry of entries) {
    let facts = null;
    let verdict;
    try {
      facts = gatherFacts(entry, ctx, deps);
      verdict = classify(entry, facts);
    } catch (err) {
      if (!(err instanceof Refusal)) throw err;
      verdict = { remove: false, reasons: [`git could not judge it (${err.message}); left for a person`] };
    }
    rows.push({ entry, verdict, stray: false, sized: verdict.remove || Boolean(entry.prunable && facts && !facts.missing), size: null, decision: verdict.remove ? "remove" : "keep", why: verdict.reasons.join("; ") });
  }
  const earlier = deps.readLog(logPath);
  const strayPaths = strayDirs(entries, ctx.root, deps.listDirs);
  for (const p of strayPaths) {
    rows.push({ entry: { path: p, branch: null, detached: false }, verdict: { remove: false }, stray: true, sized: true, size: null, decision: "keep", why: strayReason(p, entries, earlier, deps, ctx) });
  }
  // A branch an earlier run's removal left local with no worktree is listed
  // by the log alone, since nothing else on disk names it: not one a
  // registered worktree holds, which has its own row, nor one a stray row
  // names. Its commits are read again before -D is advised, since the log's
  // reason is from an earlier run.
  for (const r of strandedBranches(earlier)) {
    if (entries.some((e) => e.branch === r.branch) || strayPaths.some((p) => samePath(p, r.path) || isUnder(r.path, p))) continue;
    if (deps.exec("git", ["rev-parse", "--verify", "-q", `refs/heads/${r.branch}`], mainRoot).status !== 0) continue;
    const own = deps.exec("git", ["rev-list", "--count", `refs/heads/${r.branch}`, "^refs/remotes/origin/main"], mainRoot);
    const finish = own.status !== 0 ? `whether its commits are on origin/main could not be read (${own.err || own.out}); left for a person` : Number(own.out) > 0 ? `it holds ${n(Number(own.out), "commit")} not on origin/main; left for a person` : `every commit on it is on origin/main, so \`git branch -D ${r.branch}\` finishes that removal`;
    rows.push({ entry: { path: r.path, branch: r.branch, detached: false }, verdict: { remove: false }, stray: true, stranded: true, sized: false, size: null, decision: "keep", why: `its branch ${r.branch} is still local and no worktree holds it: ${unfinishedWhat(r)}; ${finish}` });
  }

  const print = rowPrinter(rows, ctx, log);
  let freed = 0;
  let failed = 0;
  // A row whose sizing fails is not removed; a row whose removal throws is
  // `failed` with the directory's state, so a throw part-way through the run
  // costs one row and not the table. The walk that sizes a removable tree
  // also reads every link in it, and a link leading outside the tree turns
  // the row into a keep before anything is recorded or touched.
  const sizeError = (row) => (err) => {
    row.sizeNote = `could not be sized (${err.message})`;
    return null;
  };
  const rowError = (row) => (err) => ({ outcome: apply ? "failed" : row.decision, note: `${err.message}; the directory is ${deps.exists(path.resolve(row.entry.path)) ? "still there" : "gone"}`, remaining: null });
  const settle = async (row) => {
    if (row.sized) {
      const abs = path.resolve(row.entry.path);
      const scan = await deps.scan(abs).catch(sizeError(row));
      row.size = scan?.bytes ?? null;
      const reason = scan && row.verdict.remove ? linkReason(scan, abs) : null;
      if (reason) Object.assign(row, { verdict: { remove: false, reasons: [reason] }, decision: "keep", why: reason });
    }
    if (!apply) return row.sizeNote ? { outcome: row.decision, note: row.sizeNote, remaining: null } : null;
    if (!row.verdict.remove) return { outcome: "kept", note: row.sizeNote ?? "", remaining: null };
    if (row.sizeNote) return { outcome: "kept", note: `${row.sizeNote}; the tree is untouched`, remaining: null };
    // Recorded before git starts, so a run killed during the removal has
    // left the row that names the branch it may have stranded.
    record({ decision: "removing", path: path.resolve(row.entry.path), branch: row.entry.branch, why: row.why });
    return removeWorktree(row.entry, ctx, deps);
  };
  for (const row of rows) {
    const r = await settle(row).catch(rowError(row));
    if (r) {
      row.decision = r.outcome;
      if (r.outcome === "failed") failed++;
      if (r.outcome === "removed" || (r.outcome === "failed" && r.remaining !== null)) freed += Math.max(0, (row.size ?? 0) - (r.remaining ?? 0));
      if (r.note) row.why = r.outcome === "removed" ? `${row.why}; ${r.note}` : `${r.note}; ${row.why}`;
    }
    print(row);
    // A stray or stranded row is read from the log, never written to it: a
    // row of its own would stand as the last word on that path and hide the
    // failed or interrupted removal it reports.
    if (!row.stray) record({ decision: row.decision, path: path.resolve(row.entry.path), branch: row.entry.branch, why: row.why });
  }

  const worktrees = rows.filter((r) => !r.stray && r.entry !== mainEntry);
  const removable = worktrees.filter((r) => r.verdict.remove);
  const strays = rows.filter((r) => r.stray && !r.stranded);
  const stranded = rows.filter((r) => r.stranded);
  const kept = worktrees.length - removable.length;
  const strayNote = (strays.length ? `; ${n(strays.length, "directory", "directories")} under the worktrees root ${strays.length === 1 ? "is not a worktree" : "are not worktrees"} (${formatBytes(strays.reduce((s, r) => s + (r.size ?? 0), 0))})` : "") + (stranded.length ? `; ${n(stranded.length, "branch", "branches")} whose worktree is gone ${stranded.length === 1 ? "is" : "are"} still local (${stranded.map((r) => r.entry.branch).join(", ")})` : "");
  const scanNote = ctx.processes.ok ? "" : `; the processes on this machine could not be listed (${ctx.processes.err}), which kept every worktree`;
  log("");
  let summary;
  if (!apply) {
    const toFree = removable.reduce((sum, r) => sum + (r.size ?? 0), 0);
    summary = `${n(worktrees.length, "worktree")} besides the main checkout: ${removable.length} to remove (${formatBytes(toFree)}), ${kept} kept${strayNote}${scanNote}.`;
    log(summary);
    log(`Dry run; nothing was removed. Run again with --apply --root ${mainRoot} to remove the ${removable.length}.`);
  } else {
    const removed = removable.filter((r) => r.decision === "removed").length;
    const free = deps.freeSpace(mainRoot);
    const detached = removable.filter((r) => r.decision === "removed" && r.entry.detached).length;
    const withBranch = removed - detached;
    const branches = detached === 0 ? (removed === 1 ? " and its branch" : " and their branches") : withBranch > 0 ? ` and ${n(withBranch, "branch", "branches")} (${n(detached, "detached worktree")} had none)` : " (detached, so no branch)";
    summary = `Removed ${n(removed, "worktree")}${branches}, freeing ${formatBytes(freed)}; ${n(removable.length - removed - failed + kept, "worktree")} kept${failed ? `; ${failed} failed (see the rows above for what is left)` : ""}${strayNote}${scanNote}.${free != null ? ` Free space now ${formatBytes(free)}.` : ""}`;
    log(summary);
    record({ summary });
  }
  const drivers = await cleanDriverDirs(ctx, deps, apply, record, rows);
  const jobs = cleanJobs(ctx, deps, apply, record);
  const scratch = await cleanScratch(ctx, deps, apply, record);
  return failed || drivers.failed || jobs.failed || scratch.failed ? 1 : 0;
}

if (process.argv[1] && samePath(fs.realpathSync(fileURLToPath(import.meta.url)), fs.realpathSync(process.argv[1]))) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (err) {
    if (!(err instanceof Refusal)) throw err;
    console.error("ERROR: " + err.message);
    process.exitCode = 1;
  }
}
