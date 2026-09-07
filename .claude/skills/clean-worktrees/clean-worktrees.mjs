#!/usr/bin/env node
// Removes the worktrees whose work is already on origin/main and keeps every
// other one, printing the reason for each. Run from the main checkout; a dry
// run is the default:
//
//   node .claude/skills/clean-worktrees/clean-worktrees.mjs           # classify, remove nothing
//   node .claude/skills/clean-worktrees/clean-worktrees.mjs --apply   # remove the removable ones
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
// and any other path outside the worktrees directory, a locked worktree, one
// git no longer sees as a worktree or whose directory is gone, a detached or
// unborn head, uncommitted changes, commits on neither origin/main nor the
// branch's remote, commits on the remote that are not on origin/main, a
// branch that has not moved since it was created (a fresh worktree a session
// may be working in; the branch's reflog says whether commits were made in
// it), dev servers that the worktree's own driver reports up or launching,
// a running process whose command line names the directory, and a worktree
// git cannot answer for. Directories under the worktrees root that are not
// worktrees are listed too, so a tree an interrupted removal left behind is
// never out of sight.
//
// Removal is `git worktree remove`, which on Windows deletes what it can and
// then fails when a process holds a directory inside the tree; so before it
// runs, the tree is re-verified (still clean, still no commits of its own)
// and the directory is renamed and renamed back, which the system refuses
// while any process has its current directory inside. When git still stops
// part-way, the row says what is left and where. The branch goes with -D
// after that re-verification, and an empty type directory goes with it.
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

// Bytes under a directory, symlinks not followed; an entry that cannot be read
// counts as nothing. A worktree's node_modules is some fifty thousand files,
// and one stat at a time takes six seconds of it on Windows, so the reads run
// in batches through the thread pool, which takes it to about two.
const BATCH = 32;
export async function dirSize(dir) {
  const dirs = [dir];
  const files = [];
  while (dirs.length) {
    const batch = dirs.splice(0, BATCH);
    const lists = await Promise.all(batch.map((d) => fs.promises.readdir(d, { withFileTypes: true }).catch(() => [])));
    lists.forEach((items, i) => {
      for (const it of items) {
        const p = path.join(batch[i], it.name);
        if (it.isDirectory()) dirs.push(p);
        else if (it.isFile()) files.push(p);
      }
    });
  }
  let total = 0;
  for (let i = 0; i < files.length; i += BATCH) {
    const stats = await Promise.all(files.slice(i, i + BATCH).map((f) => fs.promises.lstat(f).catch(() => null)));
    for (const s of stats) if (s) total += s.size;
  }
  return total;
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

export const liveDeps = {
  cwd: () => process.cwd(),
  pid: () => process.pid,
  // `exec` runs git, the worktree drivers and the process listing; `out` and
  // `err` are trimmed, and a command that could not start reports its error as
  // `err` with a null status.
  exec(cmd, args, cwd, timeout) {
    const r = spawnSync(cmd, args, { cwd, encoding: "utf8", windowsHide: true, timeout, maxBuffer: 64 * 1024 * 1024 });
    return { status: r.status, out: (r.stdout ?? "").trim(), err: ((r.stderr ?? "") + (r.error ? r.error.message : "")).trim() };
  },
  processes: () => listProcesses(liveDeps.exec),
  exists: (p) => fs.existsSync(p),
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
  dirSize,
  freeSpace(dir) {
    try {
      const s = fs.statfsSync(dir);
      return s.bavail * s.bsize;
    } catch {
      return null;
    }
  },
  pidAlive,
  log: (...a) => console.log(...a),
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
// while its pid lives and a stale record otherwise; `down` is no record; any
// other output is a driver that could not answer, which counts as unknown.
export function serversFrom(output, alive = pidAlive) {
  const lines = output.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const line = lines.find((l) => /^(UP|DOWN|down)\b/.test(l));
  if (!line) return { state: "unknown", detail: lines[0] ?? "no output" };
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
export function usersOf(dir, processes, selfPid) {
  const fold = (s) => s.replaceAll("\\", "/").toLowerCase();
  const needle = new RegExp(`${fold(path.resolve(dir)).replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}(?![^\\s"'/\\\\])`);
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
  if (entry.locked) keep.push(`locked (${entry.locked})`);
  if (facts.missing) keep.push("its directory is gone; `git worktree prune` drops the record");
  else if (entry.prunable) keep.push(`git no longer sees it as a worktree (${entry.prunable}) but the directory is still there; delete it by hand`);
  if (entry.detached) keep.push("detached head, no branch; left for a person");
  if (facts.unborn) keep.push("unborn branch with no commits; left for a person");
  const remote = `origin/${entry.branch}`;
  if (entry.branch && !facts.isMain && !entry.prunable && !facts.missing && !facts.unborn) {
    if (facts.dirty > 0) keep.push(`uncommitted changes (${n(facts.dirty, "file")})`);
    if (facts.unpushed > 0) keep.push(facts.remoteExists ? `${n(facts.unpushed, "commit")} on neither origin/main nor ${remote}` : `${n(facts.unpushed, "commit")} not on origin/main, and no ${remote} holds them`);
    else if (facts.ownCommits > 0) keep.push(`${n(facts.ownCommits, "commit")} not on origin/main (all on ${remote}; a pull request may be open)`);
    else if (facts.remoteAhead > 0) keep.push(`${remote} has ${n(facts.remoteAhead, "commit")} not on origin/main and this branch is behind it; a pull request may be open`);
    else if (facts.moved === null) keep.push("the branch has no reflog, so whether commits were made in it cannot be told; left for a person");
    else if (!facts.moved) keep.push(`the branch has not moved since it was created (${facts.remoteExists ? `${remote} exists` : `no ${remote}`}); a fresh worktree a session may be working in, so remove it by hand when it is done`);
    const s = facts.servers;
    if (s.state === "up") keep.push(`dev servers up at ${s.url} (pid ${s.pid})`);
    else if (s.state === "launching") keep.push(`dev servers launching (pid ${s.pid} alive, ${s.url} not answering); the worktree's driver \`down\` settles it`);
    else if (s.state === "unknown") keep.push(`its driver could not report its servers (${s.detail})`);
    if (facts.users === null) keep.push("the processes on this machine could not be listed, so whether one is using it is unknown");
    else if (facts.users.length) keep.push(`in use by ${listSome(facts.users.map((p) => `pid ${p.pid} (${p.name})`), 2)}`);
  }
  if (keep.length) return { remove: false, reasons: keep };
  const ignored = facts.ignored.length ? `; takes ${n(facts.ignored.length, "ignored path")} with it (${listSome(facts.ignored, 3)})` : "";
  return { remove: true, reasons: [`merged into origin/main; ${facts.remoteExists ? `${remote} still exists` : `no ${remote}`}${ignored}`] };
}

// ------------------------------------------------------------------ facts ---

const gitOrDie = (deps, args, cwd) => {
  const r = deps.exec("git", args, cwd);
  if (r.status !== 0) die(`git ${args.join(" ")} failed in ${cwd}: ${r.err || r.out}`);
  return r.out;
};

const DRIVERS = [".claude/skills/drive-web-editor/driver.mjs", ".claude/skills/resolve-issue/driver.mjs"];

function probeServers(worktree, deps) {
  const driver = DRIVERS.map((d) => path.join(worktree, d)).find((p) => deps.exists(p));
  if (!driver) return { state: "none" };
  const r = deps.exec(process.execPath, [driver, "status"], worktree, 60_000);
  return serversFrom(`${r.out}\n${r.err}`, deps.pidAlive);
}

// `git status --porcelain --ignored=matching`: the tree's changes, untracked
// files included, and the ignored paths (`!!`) that go with the directory.
// `matching` names a directory that an ignore pattern matches without walking
// it, which is what keeps this as fast as a plain status over node_modules.
function statusOf(worktree, deps) {
  const lines = gitOrDie(deps, ["status", "--porcelain", "--ignored=matching"], worktree).split(/\r?\n/).filter(Boolean);
  return { dirty: lines.filter((l) => !l.startsWith("!!")).length, ignored: lines.filter((l) => l.startsWith("!!")).map((l) => l.slice(3)) };
}

function gatherFacts(entry, ctx, deps) {
  const abs = path.resolve(entry.path);
  const facts = {
    isMain: samePath(abs, ctx.mainRoot),
    insideRoot: isUnder(abs, ctx.root),
    root: ctx.root,
    missing: !deps.exists(abs),
    unborn: /^0+$/.test(entry.head ?? ""),
    dirty: 0,
    ignored: [],
    ownCommits: 0,
    unpushed: 0,
    remoteExists: false,
    remoteAhead: 0,
    moved: false,
    servers: { state: "none" },
    users: [],
  };
  if (facts.isMain || entry.detached || entry.prunable || facts.missing || facts.unborn) return facts;
  Object.assign(facts, statusOf(abs, deps));
  const ref = `refs/heads/${entry.branch}`;
  const remoteRef = `refs/remotes/origin/${entry.branch}`;
  facts.remoteExists = deps.exec("git", ["rev-parse", "--verify", "-q", remoteRef], ctx.mainRoot).status === 0;
  facts.ownCommits = Number(gitOrDie(deps, ["rev-list", "--count", ref, "^refs/remotes/origin/main"], ctx.mainRoot));
  facts.unpushed = facts.remoteExists
    ? Number(gitOrDie(deps, ["rev-list", "--count", ref, "^refs/remotes/origin/main", `^${remoteRef}`], ctx.mainRoot))
    : facts.ownCommits;
  facts.remoteAhead = facts.remoteExists ? Number(gitOrDie(deps, ["rev-list", "--count", remoteRef, "^refs/remotes/origin/main"], ctx.mainRoot)) : 0;
  // The branch's reflog: every entry still at the tip means nothing has been
  // committed, reset or pulled on it since it was created.
  const reflog = deps.exec("git", ["reflog", "show", "--format=%H", ref], ctx.mainRoot);
  const entries = reflog.status === 0 ? reflog.out.split(/\s+/).filter(Boolean) : [];
  facts.moved = entries.length === 0 ? null : entries.some((h) => h !== entry.head);
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
// directory's state in the note. The rename probe is the check git lacks: the
// system refuses to rename a directory any process has its current directory
// in, and refuses without touching a file, where `git worktree remove` deletes
// the tracked files and the .git link before it finds the held directory. The
// branch is deleted with -D only after the same commit count that justified
// the removal is read again, so -D never deletes work committed since the
// classification. The direct directory removal is the one destructive call
// here that git does not guard, so it is made only under the root and only
// on a directory git has already stopped treating as a worktree.
async function removeWorktree(entry, facts, ctx, deps) {
  const abs = path.resolve(entry.path);
  const kept = (note) => ({ outcome: "kept", note, remaining: null });
  const failed = (note, remaining) => ({ outcome: "failed", note, remaining });
  if (!isUnder(abs, ctx.root)) return kept(`refusing to touch a path outside ${ctx.root}`);
  const st = deps.exec("git", ["status", "--porcelain"], abs);
  if (st.status !== 0) return kept(`git status failed since it was classified (${st.err || st.out}); the tree is untouched`);
  const dirty = st.out.split(/\r?\n/).filter(Boolean).length;
  if (dirty > 0) return kept(`changed since it was classified: uncommitted changes (${n(dirty, "file")}); the tree is untouched`);
  const ref = `refs/heads/${entry.branch}`;
  const own = deps.exec("git", ["rev-list", "--count", ref, "^refs/remotes/origin/main"], ctx.mainRoot);
  if (own.status !== 0 || Number(own.out) > 0) return kept(`changed since it was classified: ${own.status === 0 ? `${n(Number(own.out), "commit")} not on origin/main` : own.err || own.out}; the tree is untouched`);
  const probe = `${abs}.removing`;
  try {
    deps.rename(abs, probe);
  } catch (err) {
    return kept(`a process holds the directory (rename refused: ${err.code ?? err.message}); stop it and run again`);
  }
  try {
    deps.rename(probe, abs);
  } catch (err) {
    return failed(`the directory was renamed to ${probe} to test whether a process holds it and could not be renamed back (${err.code ?? err.message}); rename it back by hand`, await deps.dirSize(probe));
  }
  const notes = [];
  const rm = deps.exec("git", ["worktree", "remove", abs], ctx.mainRoot);
  if (rm.status !== 0) {
    const gitErr = rm.err || rm.out;
    if (!deps.exists(abs)) notes.push(`git worktree remove reported an error but the directory is gone (${gitErr})`);
    else if (deps.exists(path.join(abs, ".git"))) {
      const after = deps.exec("git", ["status", "--porcelain"], abs);
      if (after.status === 0 && after.out === "") return kept(`git worktree remove refused and touched nothing (${gitErr})`);
      return failed(`git worktree remove stopped part-way (${gitErr}); the tree is still a worktree with ${n(after.out.split(/\r?\n/).filter(Boolean).length, "path")} deleted or changed, and \`git checkout -- .\` in it restores the tracked files; stop what holds it and run again`, await deps.dirSize(abs));
    } else {
      // Git deleted the tracked files and the .git link, then stopped: the
      // directory is no longer a worktree, so the rest goes directly.
      try {
        deps.removeDir(abs);
      } catch {
        /* reported below from what is left */
      }
      if (deps.exists(abs)) {
        const remaining = await deps.dirSize(abs);
        return failed(`git worktree remove deleted the tracked files and the .git link, then stopped (${gitErr}); ${formatBytes(remaining)} remain at ${abs}, which is no longer a worktree, so delete the directory by hand once nothing holds it; the branch ${entry.branch} stays until then`, remaining);
      }
      notes.push(`git worktree remove stopped part-way (${gitErr}); the rest of the directory was removed directly`);
    }
    // Git drops the record itself when it deletes the .git link; when the
    // record is still there, removing the now-missing path drops it.
    if (parseWorktreeList(deps.exec("git", ["worktree", "list", "--porcelain"], ctx.mainRoot).out).some((e) => samePath(e.path, abs))) {
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
  const branchCell = (r) => (r.stray ? "(not a worktree)" : r.entry.branch ?? (r.entry.detached ? "(detached)" : ""));
  const widths = [DECISION_WIDTH, Math.max(...rows.map((r) => rel(r.entry.path).length)), Math.max(...rows.map((r) => branchCell(r).length)), SIZE_WIDTH];
  return (r) => log([r.decision, rel(r.entry.path), branchCell(r), formatBytes(r.size)].map((v, i) => v.padEnd(widths[i])).concat(r.why).join("  ").trimEnd());
}

// Runs the command and returns its exit code: 1 when a removal failed, and a
// refusal to run at all is thrown before anything is touched.
export async function main(argv, deps = liveDeps) {
  const apply = argv.includes("--apply");
  const unknown = argv.find((a) => a !== "--apply");
  if (unknown) die(`unknown option ${unknown}; the only option is --apply`);
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
  const ctx = {
    mainRoot,
    root: path.join(path.dirname(mainRoot), `${path.basename(mainRoot)}.worktrees`),
    processes: { ok: false, err: "not listed" },
  };

  log("fetching origin with --prune ...");
  gitOrDie(deps, ["fetch", "--prune", "origin"], mainRoot);
  ctx.processes = deps.processes();

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
    rows.push({ entry, facts, verdict, stray: false, sized: verdict.remove || Boolean(entry.prunable && facts && !facts.missing), size: null, decision: verdict.remove ? "remove" : "keep", why: verdict.reasons.join("; ") });
  }
  for (const p of strayDirs(entries, ctx.root, deps.listDirs)) {
    rows.push({ entry: { path: p, branch: null, detached: false }, facts: null, verdict: { remove: false }, stray: true, sized: true, size: null, decision: "keep", why: "not a registered worktree, which is what an interrupted removal or add leaves behind; delete it by hand after checking it" });
  }

  const print = rowPrinter(rows, ctx, log);
  let freed = 0;
  let failed = 0;
  // What went wrong with a row that threw, with the directory's state, so a
  // throw part-way through the run costs one row and not the table.
  const rowError = (row) => (err) => ({ outcome: row.verdict.remove && apply ? "failed" : row.decision, note: `${err.message}; the directory is ${deps.exists(path.resolve(row.entry.path)) ? "still there" : "gone"}`, remaining: null });
  const settle = async (row) => {
    if (row.sized) row.size = await deps.dirSize(path.resolve(row.entry.path));
    if (!apply) return null;
    if (!row.verdict.remove) return { outcome: "kept", note: "" };
    return removeWorktree(row.entry, row.facts, ctx, deps);
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
  }

  const worktrees = rows.filter((r) => !r.stray && r.entry !== mainEntry);
  const removable = worktrees.filter((r) => r.verdict.remove);
  const strays = rows.filter((r) => r.stray);
  const kept = worktrees.length - removable.length;
  const strayNote = strays.length ? `; ${n(strays.length, "directory", "directories")} under the worktrees root ${strays.length === 1 ? "is" : "are"} not a worktree (${formatBytes(strays.reduce((s, r) => s + (r.size ?? 0), 0))})` : "";
  log("");
  if (!apply) {
    const toFree = removable.reduce((sum, r) => sum + (r.size ?? 0), 0);
    log(`${n(worktrees.length, "worktree")} besides the main checkout: ${removable.length} to remove (${formatBytes(toFree)}), ${kept} kept${strayNote}.`);
    log(`Dry run; nothing was removed. Run again with --apply to remove the ${removable.length}.`);
  } else {
    const removed = removable.filter((r) => r.decision === "removed").length;
    const free = deps.freeSpace(mainRoot);
    log(`Removed ${n(removed, "worktree")} and ${removed === 1 ? "its branch" : "their branches"}, freeing ${formatBytes(freed)}; ${n(removable.length - removed - failed + kept, "worktree")} kept${failed ? `; ${failed} failed (see the rows above for what is left)` : ""}${strayNote}.${free != null ? ` Free space now ${formatBytes(free)}.` : ""}`);
  }
  return failed ? 1 : 0;
}

if (process.argv[1] && samePath(fileURLToPath(import.meta.url), process.argv[1])) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (err) {
    if (!(err instanceof Refusal)) throw err;
    console.error("ERROR: " + err.message);
    process.exitCode = 1;
  }
}
