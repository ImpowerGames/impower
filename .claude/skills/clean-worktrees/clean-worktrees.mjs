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
// A worktree is removed only when every commit on its branch is on
// origin/main, its tree is clean, and nothing is using it. Everything else is
// kept, with every reason that applies: the main checkout and any other path
// outside the worktrees directory, a locked worktree or one whose directory
// is gone, a detached head, uncommitted changes, commits on neither
// origin/main nor the branch's remote, dev servers that the worktree's own
// driver reports up or launching, and a branch with no commits of its own,
// which is a fresh worktree a session may be working in. A merged branch's
// tip is the second parent of a merge on main and never sits on main's
// first-parent line, which is how a merged branch is told from a fresh one.
//
// Everything that touches the system goes through `deps` (git and the driver
// through `exec`, the file system through the rest), so
// clean-worktrees.test.mjs runs the whole command in-process against stubbed
// output, and classify and serversFrom take their inputs as parameters so
// their tables are pinned without even that.

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

export const liveDeps = {
  cwd: () => process.cwd(),
  // `exec` runs git and the worktree drivers; `out` and `err` are trimmed, and
  // a command that could not start reports its error as `err` with a null status.
  exec(cmd, args, cwd, timeout) {
    const r = spawnSync(cmd, args, { cwd, encoding: "utf8", windowsHide: true, timeout });
    return { status: r.status, out: (r.stdout ?? "").trim(), err: ((r.stderr ?? "") + (r.error ? r.error.message : "")).trim() };
  },
  exists: (p) => fs.existsSync(p),
  isEmptyDir: (p) => fs.existsSync(p) && fs.readdirSync(p).length === 0,
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

// The decision for one worktree from the facts gathered about it. Every
// reason to keep is listed, so a dirty tree on a merged branch says both. The
// main checkout is the one path outside the worktrees directory that is
// always there, so it shares the rule and gets its own wording.
export function classify(entry, facts) {
  const keep = [];
  const n = (count, noun) => `${count} ${noun}${count === 1 ? "" : "s"}`;
  if (!facts.insideRoot) keep.push(facts.isMain ? "the main checkout" : `outside ${facts.root}`);
  if (entry.locked) keep.push(`locked (${entry.locked})`);
  if (entry.prunable || facts.missing) keep.push(`its directory is gone${entry.prunable ? ` (${entry.prunable})` : ""}; \`git worktree prune\` drops the record`);
  if (entry.detached) keep.push("detached head, no branch; left for a person");
  const remote = `origin/${entry.branch}`;
  if (entry.branch && !facts.isMain && !entry.prunable && !facts.missing) {
    if (facts.dirty > 0) keep.push(`uncommitted changes (${n(facts.dirty, "file")})`);
    if (facts.ownCommits > 0) {
      if (!facts.remoteExists) keep.push(`${n(facts.ownCommits, "commit")} not on origin/main, and no ${remote} holds them`);
      else if (facts.unpushed > 0) keep.push(`${n(facts.unpushed, "commit")} on neither origin/main nor ${remote}`);
      else keep.push(`${n(facts.ownCommits, "commit")} not on origin/main (all on ${remote}; a pull request may be open)`);
    } else if (facts.onFirstParent) {
      keep.push(`no commits of its own${facts.remoteExists ? ` (${remote} exists)` : ", never pushed"}; a session may be working in it`);
    }
    const s = facts.servers;
    if (s.state === "up") keep.push(`dev servers up at ${s.url} (pid ${s.pid})`);
    else if (s.state === "launching") keep.push(`dev servers launching (pid ${s.pid} alive, ${s.url} not answering); the worktree's driver \`down\` settles it`);
    else if (s.state === "unknown") keep.push(`its driver could not report its servers (${s.detail})`);
  }
  if (keep.length) return { remove: false, reasons: keep };
  return { remove: true, reasons: [`merged into origin/main; ${remote} ${facts.remoteExists ? "still exists" : "is gone"}`] };
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
  if (!driver) return { state: "down" };
  const r = deps.exec(process.execPath, [driver, "status"], worktree, 60_000);
  return serversFrom(`${r.out}\n${r.err}`, deps.pidAlive);
}

function gatherFacts(entry, ctx, deps) {
  const abs = path.resolve(entry.path);
  const facts = {
    isMain: samePath(abs, ctx.mainRoot),
    insideRoot: isUnder(abs, ctx.root),
    root: ctx.root,
    missing: !deps.exists(abs),
    dirty: 0,
    ownCommits: 0,
    unpushed: 0,
    remoteExists: false,
    onFirstParent: false,
    servers: { state: "down" },
  };
  if (facts.isMain || entry.detached || entry.prunable || facts.missing) return facts;
  facts.dirty = gitOrDie(deps, ["status", "--porcelain"], abs).split(/\r?\n/).filter(Boolean).length;
  const ref = `refs/heads/${entry.branch}`;
  const remoteRef = `refs/remotes/origin/${entry.branch}`;
  facts.remoteExists = deps.exec("git", ["rev-parse", "--verify", "-q", remoteRef], ctx.mainRoot).status === 0;
  facts.ownCommits = Number(gitOrDie(deps, ["rev-list", "--count", ref, "^refs/remotes/origin/main"], ctx.mainRoot));
  facts.unpushed = facts.remoteExists
    ? Number(gitOrDie(deps, ["rev-list", "--count", ref, "^refs/remotes/origin/main", `^${remoteRef}`], ctx.mainRoot))
    : facts.ownCommits;
  facts.onFirstParent = ctx.firstParent.has(entry.head);
  facts.servers = probeServers(abs, deps);
  return facts;
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

// `git worktree remove` first; when it refuses a tree that is still clean,
// which on Windows means a process holds a file in it, the directory is
// removed directly and the record pruned. A tree that is no longer clean is
// left as it is. The branch goes with `-d`, and with `-D` when `-d` refuses,
// because `-d` compares against the local main, which may be behind the
// origin/main every commit was already found on. An empty type directory left
// under the root goes too. The direct removal is the one destructive call
// here that git does not guard, so it is made only under the root.
function removeWorktree(entry, ctx, deps) {
  const abs = path.resolve(entry.path);
  if (!isUnder(abs, ctx.root)) return { ok: false, note: `refusing to remove a path outside ${ctx.root}` };
  const notes = [];
  const rm = deps.exec("git", ["worktree", "remove", abs], ctx.mainRoot);
  if (rm.status !== 0) {
    const status = deps.exec("git", ["status", "--porcelain"], abs);
    if (status.status !== 0 || status.out !== "") return { ok: false, note: `git worktree remove: ${rm.err || rm.out}; the tree is no longer clean, so it stays` };
    try {
      deps.removeDir(abs);
    } catch (err) {
      return { ok: false, note: `git worktree remove: ${rm.err || rm.out}; removing the directory: ${err.message}` };
    }
    gitOrDie(deps, ["worktree", "prune"], ctx.mainRoot);
    notes.push("directory removed directly after git worktree remove refused");
  }
  let del = deps.exec("git", ["branch", "-d", entry.branch], ctx.mainRoot);
  if (del.status !== 0) {
    del = deps.exec("git", ["branch", "-D", entry.branch], ctx.mainRoot);
    if (del.status !== 0) return { ok: false, note: `worktree removed; git branch -D ${entry.branch}: ${del.err || del.out}` };
    notes.push("branch deleted with -D; -d compares against the local main");
  }
  const parent = path.dirname(abs);
  if (isUnder(parent, ctx.root) && deps.isEmptyDir(parent)) {
    deps.removeEmptyDir(parent);
    notes.push(`removed the empty ${path.relative(ctx.root, parent)}${path.sep}`);
  }
  return { ok: true, note: notes.join("; ") };
}

// ------------------------------------------------------------------ table ---

function printTable(rows, ctx, log) {
  const rel = (p) => path.relative(path.dirname(ctx.mainRoot), path.resolve(p)) || ".";
  const cells = rows.map((r) => [r.decision, rel(r.entry.path), r.entry.branch ?? (r.entry.detached ? "(detached)" : ""), formatBytes(r.size), r.why]);
  const widths = [0, 1, 2, 3].map((i) => Math.max(...cells.map((c) => c[i].length)));
  for (const c of cells) log(c.map((v, i) => (i < 4 ? v.padEnd(widths[i]) : v)).join("  ").trimEnd());
}

// Runs the command and returns its exit code; a refusal is thrown as an error
// before anything is touched.
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
  if (!mainEntry || mainEntry.bare) die("the first worktree is bare; run from the main checkout");
  if (!samePath(top.out, mainEntry.path)) die(`run from the main checkout, ${mainEntry.path}; this is the worktree ${top.out}`);
  const mainRoot = path.resolve(mainEntry.path);
  const ctx = {
    mainRoot,
    root: path.join(path.dirname(mainRoot), `${path.basename(mainRoot)}.worktrees`),
    firstParent: new Set(),
  };

  log("fetching origin with --prune ...");
  gitOrDie(deps, ["fetch", "--prune", "origin"], mainRoot);
  ctx.firstParent = new Set(gitOrDie(deps, ["rev-list", "--first-parent", "refs/remotes/origin/main"], mainRoot).split(/\s+/));

  const rows = [];
  for (const entry of entries) {
    const facts = gatherFacts(entry, ctx, deps);
    const verdict = classify(entry, facts);
    const size = verdict.remove ? await deps.dirSize(path.resolve(entry.path)) : null;
    rows.push({ entry, facts, verdict, size, decision: verdict.remove ? "remove" : "keep", why: verdict.reasons.join("; ") });
  }

  let freed = 0;
  let failed = 0;
  if (apply) {
    for (const row of rows) {
      if (!row.verdict.remove) {
        row.decision = "kept";
        continue;
      }
      const r = removeWorktree(row.entry, ctx, deps);
      if (r.ok) {
        freed += row.size;
        row.decision = "removed";
        row.why = `${row.why}${r.note ? `; ${r.note}` : ""}`;
      } else {
        failed++;
        row.decision = "failed";
        row.why = `${r.note}; ${row.why}`;
      }
    }
    gitOrDie(deps, ["worktree", "prune"], mainRoot);
  }

  printTable(rows, ctx, log);
  const removable = rows.filter((r) => r.verdict.remove);
  const kept = rows.length - 1 - removable.length;
  const toFree = removable.reduce((sum, r) => sum + r.size, 0);
  log("");
  if (!apply) {
    log(`${rows.length - 1} worktrees besides the main checkout: ${removable.length} to remove (${formatBytes(toFree)}), ${kept} kept.`);
    log(`Dry run; nothing was removed. Run again with --apply to remove the ${removable.length}.`);
  } else {
    const removed = removable.length - failed;
    const free = deps.freeSpace(mainRoot);
    log(`Removed ${removed} worktrees and their branches, freeing ${formatBytes(freed)}; ${kept} kept${failed ? `; ${failed} failed (see above)` : ""}.${free != null ? ` Free space now ${formatBytes(free)}.` : ""}`);
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
