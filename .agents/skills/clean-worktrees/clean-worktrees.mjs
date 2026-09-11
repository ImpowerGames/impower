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
// a detached or unborn head, uncommitted changes, commits on neither
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
// of its own) and the directory is renamed and renamed back, which Windows
// refuses while any process has a file open or its current directory inside
// it. When git still stops part-way, the directory is no longer a worktree,
// the rest of it goes directly, and a row says what is left and where. The
// branch goes with -D after that re-verification, and an empty type directory
// goes with it.
//
// Everything that touches the system goes through `deps` (git, the drivers
// and the process listing through `exec` and `processes`, the file system
// through the rest), so clean-worktrees.test.mjs runs the whole command
// in-process against stubbed output, and classify and serversFrom take their
// inputs as parameters so their tables are pinned without even that.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

// Every process on the machine with its command line, one tab-separated line
// each, so the worktrees a running server or shell names can be found without
// asking any driver.
function listProcesses(exec) {
  const r =
    process.platform === "win32"
      ? exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", 'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId)`t$($_.Name)`t$($_.CommandLine)" }'], undefined, 60_000)
      : exec("ps", ["-eo", "pid=,comm=,args="], undefined, 60_000);
  if (r.status !== 0) return { ok: false, err: r.err || `exit ${r.status}` };
  const list = [];
  for (const line of r.out.split(/\r?\n/)) {
    const m = process.platform === "win32" ? /^(\d+)\t([^\t]*)\t(.*)$/.exec(line) : /^\s*(\d+)\s+(\S+)\s*(.*)$/.exec(line);
    if (m) list.push({ pid: Number(m[1]), name: m[2], cmd: m[3] });
  }
  return { ok: true, list };
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
  else if (entry.prunable) keep.push(`git no longer sees it as a worktree (${entry.prunable}) but the directory is still there; delete it by hand`);
  if (entry.detached) keep.push("detached head, no branch; left for a person");
  if (facts.unborn) keep.push("unborn branch with no commits; left for a person");
  const remote = `origin/${entry.branch}`;
  if (entry.branch && !facts.isMain && !facts.isDefault && !entry.prunable && !facts.missing && !facts.unborn) {
    const remoteState = facts.remoteExists ? `${remote} exists` : `no ${remote}`;
    if (facts.dirty > 0) keep.push(`uncommitted changes (${n(facts.dirty, "file")})`);
    if (facts.unpushed > 0) keep.push(facts.remoteExists ? `${n(facts.unpushed, "commit")} on neither origin/main nor ${remote}` : `${n(facts.unpushed, "commit")} not on origin/main, and no ${remote} holds them`);
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
// is still recorded.
const DRIVERS = [
  { driver: ".agents/skills/drive-web-editor/driver.mjs", states: [".agents/skills/drive-web-editor/.state.json", ".agents/skills/resolve-issue/.state.json", ".claude/skills/drive-web-editor/.state.json", ".claude/skills/resolve-issue/.state.json"] },
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
    const r = deps.exec(process.execPath, [path.join(worktree, d.driver), "status"], worktree, 60_000);
    const answer = serversFrom(`${r.out}\n${r.err}`, deps.pidAlive);
    const judged = answer.state === "unknown" ? recordedServer(stateFileOf(worktree, d, deps.exists), deps, answer.detail) : answer;
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

function gatherFacts(entry, ctx, deps) {
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
    onFirstParent: false,
    committed: false,
    created: false,
    servers: [],
    users: [],
  };
  facts.isDefault = !facts.isMain && Boolean(entry.branch) && ctx.defaultBranches.has(entry.branch);
  facts.probeLeft = facts.missing && deps.exists(`${abs}${PROBE_SUFFIX}`);
  if (facts.isMain || facts.isDefault || entry.detached || entry.prunable || facts.missing || facts.unborn) return facts;
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
  return "not a registered worktree, which is what an interrupted removal or add leaves behind; delete it by hand after checking it";
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

async function removeWorktree(entry, ctx, deps) {
  const abs = path.resolve(entry.path);
  const kept = (note) => ({ outcome: "kept", note, remaining: null });
  const failed = (note, remaining) => ({ outcome: "failed", note, remaining });
  if (!isUnder(abs, ctx.root)) return kept(`refusing to touch a path outside ${ctx.root}`);
  if (ctx.defaultBranches.has(entry.branch)) return kept(`refusing to touch the default branch ${entry.branch}`);
  const st = deps.exec("git", ["status", "--porcelain"], abs);
  if (st.status !== 0) return kept(`git status failed since it was classified (${st.err || st.out}); the tree is untouched`);
  const dirty = st.out.split(/\r?\n/).filter(Boolean).length;
  if (dirty > 0) return kept(`changed since it was classified: uncommitted changes (${n(dirty, "file")}); the tree is untouched`);
  const ref = `refs/heads/${entry.branch}`;
  const head = deps.exec("git", ["symbolic-ref", "-q", "HEAD"], abs);
  if (head.status !== 0 || head.out !== ref) return kept(`changed since it was classified: ${head.status === 0 && head.out ? `now on ${head.out.replace(/^refs\/heads\//, "")}` : "detached head"}; the tree is untouched`);
  const own = deps.exec("git", ["rev-list", "--count", ref, "^refs/remotes/origin/main"], ctx.mainRoot);
  if (own.status !== 0 || Number(own.out) > 0) return kept(`changed since it was classified: ${own.status === 0 ? `${n(Number(own.out), "commit")} not on origin/main` : own.err || own.out}; the tree is untouched`);
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
  const notes = [];
  const rm = deps.exec("git", ["worktree", "remove", abs], ctx.mainRoot);
  if (rm.status !== 0) {
    const gitErr = rm.err || rm.out;
    if (!deps.exists(abs)) notes.push(`git worktree remove reported an error but the directory is gone (${gitErr})`);
    else {
      const reg = registration(abs, ctx, deps);
      if (!reg.known) return failed(`git worktree remove failed (${gitErr}) and whether git still holds its record could not be read (git worktree list failed: ${reg.err}); nothing more was touched; check the directory and \`git worktree list\` by hand; the branch stays until then`, await bytesUnder(abs, deps));
      if (reg.registered) {
        // Git checks the lock, the submodules and the tree's changes before
        // it deletes anything and drops its record after deleting, so a
        // record still there is a refusal; nothing more is done to the tree.
        return kept(`git worktree remove refused (${gitErr}) and kept its record; nothing more was touched`);
      }
      // Git deleted the directory's entries in order until one it could not
      // delete, then dropped its record: the directory is no longer a
      // worktree, whatever is left in it, so the rest goes directly.
      try {
        deps.removeDir(abs);
      } catch {
        /* reported below from what is left */
      }
      if (deps.exists(abs)) {
        const remaining = await bytesUnder(abs, deps);
        return failed(`git worktree remove stopped part-way (${gitErr}) and dropped its record, so ${abs} is no longer a worktree; ${formatBytes(remaining)} remain there; delete the directory by hand once nothing holds it, then \`git branch -D ${entry.branch}\`; the branch stays until then`, remaining);
      }
      notes.push(`git worktree remove stopped part-way (${gitErr}) and dropped its record; the rest of the directory was removed directly`);
    }
    // Git drops the record itself when it fails past its checks; when the
    // record is still there, removing the now-missing path drops it.
    if (registration(abs, ctx, deps).registered !== false) {
      const again = deps.exec("git", ["worktree", "remove", abs], ctx.mainRoot);
      if (again.status !== 0) notes.push(`its record could not be dropped (${again.err || again.out}); \`git worktree prune\` drops it`);
    }
  }
  const del = deps.exec("git", ["branch", "-D", entry.branch], ctx.mainRoot);
  if (del.status !== 0) return failed(`the directory is gone; git branch -D ${entry.branch} failed (${del.err || del.out}), so delete the branch by hand${notes.length ? `; ${notes.join("; ")}` : ""}`, 0);
  const parent = path.dirname(abs);
  if (isUnder(parent, ctx.root) && deps.isEmptyDir(parent)) {
    const rel = `${path.relative(ctx.root, parent)}${path.sep}`;
    try {
      deps.removeEmptyDir(parent);
      notes.push(`removed the empty ${rel}`);
    } catch (err) {
      notes.push(`the empty ${rel} could not be removed (${err.code ?? err.message})`);
    }
  }
  return { outcome: "removed", note: notes.join("; "), remaining: 0 };
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
  const opts = { apply: false, root: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") opts.apply = true;
    else if (a === "--root" || a.startsWith("--root=")) {
      opts.root = a === "--root" ? argv[++i] : a.slice("--root=".length);
      if (!opts.root) die("--root needs the path of the main checkout after it");
      if (!path.isAbsolute(opts.root)) die(`--root ${opts.root} is not an absolute path; --root names the main checkout in full, so that a relative path resolved against whatever directory the shell is in never passes for it`);
    } else die(`unknown option ${a}; the options are --apply and --root <path>`);
  }
  if (opts.apply && !opts.root) die("--apply needs --root <path>, the main checkout it is to act on, so the repository comes from the command line and never from the current directory alone; the dry run needs no --root");
  return opts;
}

// Runs the command and returns its exit code: 1 when a removal failed, and a
// refusal to run at all is thrown before anything is touched.
export async function main(argv, deps = liveDeps) {
  const { apply, root: namedRoot } = parseArgs(argv);
  const log = deps.log;

  const cwd = deps.cwd();
  const top = deps.exec("git", ["rev-parse", "--show-toplevel"], cwd);
  if (top.status !== 0) die("not inside a git repository; run from the main checkout");
  const entries = parseWorktreeList(gitOrDie(deps, ["worktree", "list", "--porcelain"], cwd));
  const mainEntry = entries[0];
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

  log("fetching origin with --prune ...");
  gitOrDie(deps, ["fetch", "--prune", "origin"], mainRoot);
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
    summary = `Removed ${n(removed, "worktree")} and ${removed === 1 ? "its branch" : "their branches"}, freeing ${formatBytes(freed)}; ${n(removable.length - removed - failed + kept, "worktree")} kept${failed ? `; ${failed} failed (see the rows above for what is left)` : ""}${strayNote}${scanNote}.${free != null ? ` Free space now ${formatBytes(free)}.` : ""}`;
    log(summary);
    record({ summary });
  }
  return failed ? 1 : 0;
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
