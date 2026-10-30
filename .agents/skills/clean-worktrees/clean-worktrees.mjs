#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CHECKOUT_OWNER_FILE, PROFILE_CLAIM_FILE, PROFILE_CLAIM_MS, PROFILE_LOCK_STALE_MS, checkoutDir, checkoutStateFiles, driverHome } from "../drive-web-editor/session-dir.mjs";
import { jobRootOf } from "../../../scripts/review-job-root.mjs";
import { processIdentity } from "../../../scripts/reviewer-slots.mjs";

const norm = (p) => {
  const r = path.resolve(p);
  return process.platform === "win32" ? r.toLowerCase() : r;
};
const samePath = (a, b) => norm(a) === norm(b);
const isUnder = (child, parent) => {
  const rel = path.relative(norm(parent), norm(child));
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
};
const n = (count, noun, plural = `${noun}s`) => `${count} ${count === 1 ? noun : plural}`;

export function pidAlive(pid, kill = process.kill) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    kill(pid, 0);
    return true;
  } catch (err) {
    return err?.code === "EPERM";
  }
}

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

export function linkReason(scan, dir) {
  const rel = (p) => path.relative(dir, p);
  const out = scan.links.filter((l) => !samePath(l.target, dir) && !isUnder(l.target, dir));
  if (out.length) return `${n(out.length, "link")} inside it ${out.length === 1 ? "points" : "point"} outside it (${listSome(out.map((l) => `${rel(l.link)} -> ${l.target}`), 3)}); git worktree remove follows a junction and deletes what it points at, so remove the link itself by hand and run again`;
  if (scan.unreadable.length) return `${n(scan.unreadable.length, "directory or link", "directories or links")} inside it could not be read (${listSome(scan.unreadable.map((u) => u.replace(`${dir}${path.sep}`, "")), 3)}), so whether a link inside it points outside it cannot be told; left for a person`;
  return null;
}

function listProcesses(exec) {
  const r =
    process.platform === "win32"
      ? exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", '$all = Get-CimInstance Win32_Process; $now = [DateTime]::UtcNow; $all | ForEach-Object { "$($_.ProcessId)`t$($_.ParentProcessId)`t$(if ($_.CreationDate) { [int64]($now - $_.CreationDate.ToUniversalTime()).TotalMilliseconds })`t$($_.Name)`t$($_.CommandLine)" }'], undefined, 60_000)
      : exec("ps", ["-eo", "pid=,ppid=,etimes=,comm=,args="], undefined, 60_000);
  if (r.status !== 0) return { ok: false, err: r.err || `exit ${r.status}` };
  return { ok: true, list: parseProcesses(r.out) };
}

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
  exec(cmd, args, cwd, timeout) {
    const r = spawnSync(cmd, args, { cwd, encoding: "utf8", windowsHide: true, timeout, maxBuffer: 64 * 1024 * 1024 });
    return { status: r.status, out: (r.stdout ?? "").trim(), err: ((r.stderr ?? "") + (r.error ? r.error.message : "")).trim() };
  },
  processes: () => listProcesses(liveDeps.exec),
  exists: (p) => fs.existsSync(p),
  mtimeMs: (p) => {
    try {
      return fs.statSync(p).mtimeMs;
    } catch {
      return null;
    }
  },
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
  processStart: (() => {
    const seen = new Map();
    return (pid) => {
      if (!seen.has(pid)) seen.set(pid, processIdentity(pid)?.start ?? null);
      return seen.get(pid);
    };
  })(),
  driverHome: () => driverHome(),
  readEntries: (p) => fs.readdirSync(p, { withFileTypes: true }),
  lstat: (p) => fs.lstatSync(p),
  realpath: (p) => fs.realpathSync.native(p),
  readLog: (p) => {
    try {
      return fs.readFileSync(p, "utf8");
    } catch {
      return "";
    }
  },
  appendLog: (p, line) => fs.appendFileSync(p, `${line}\n`),
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

export function usersOf(dir, processes, selfPid, platform = process.platform) {
  const win = platform === "win32";
  const fold = (s) => win ? s.replaceAll("\\", "/").toLowerCase() : s;
  const resolved = (win ? path.win32 : path.posix).resolve(dir);
  const boundary = win ? '(?![^\\s"\'/\\\\])' : '(?![^\\s"\'/])';
  const needle = new RegExp(fold(resolved).replace(/[.*+?^${}()|[\]\\/]/g, "\\$&") + boundary);
  return processes.filter((p) => p.pid !== selfPid && needle.test(fold(p.cmd ?? "")));
}

const listSome = (items, max) => (items.length > max ? `${items.slice(0, max).join(", ")} and ${items.length - max} more` : items.join(", "));

function detachedKeeps(facts) {
  const keep = [];
  if (facts.inProgress?.length) keep.push(`an operation is in progress in it (${facts.inProgress.join(", ")}); finish or abort it first`);
  if (facts.headLogUnknown) keep.push(`${facts.headLogUnknown}; left for a person`);
  if (facts.headLogOrphans > 0) keep.push(`its HEAD reflog or per-worktree refs (refs/worktree, bisect, rewritten) reach ${n(facts.headLogOrphans, "commit")} that origin/main, every branch, remote and tag do not, which removing it would leave unreferenced`);
  if (facts.headIdleMs != null && facts.headIdleMs < DETACHED_IDLE_MS) keep.push(`its HEAD moved ${Math.max(0, Math.round(facts.headIdleMs / 60000))} min ago, within ${DETACHED_IDLE_MS / 3600000} hours; a fresh checkout a session may be working in, so remove it by hand when it is done`);
  return keep;
}

export function classify(entry, facts) {
  const keep = [];
  if (!facts.insideRoot) keep.push(facts.isMain ? "the main checkout" : `outside ${facts.root}`);
  if (facts.isDefault) keep.push(`the default branch ${entry.branch}, which is never removed wherever it is checked out`);
  if (entry.locked) keep.push(`locked (${entry.locked})`);
  if (facts.missing) keep.push(facts.probeLeft ? `its directory is gone and ${path.resolve(entry.path)}${PROBE_SUFFIX} is beside it, which is what an interrupted run's probe leaves; rename it back by hand, and do not run \`git worktree prune\`, which would drop the record the renamed tree points at` : "its directory is gone; `git worktree prune` drops the record");
  else if (entry.prunable) keep.push(`git no longer sees it as a worktree (${entry.prunable}) but the directory is still there, so whether it has uncommitted changes cannot be told; check it by hand, then delete it by hand`);
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

const gitOrDie = (deps, args, cwd) => {
  const r = deps.exec("git", args, cwd);
  if (r.status !== 0) die(`git ${args.join(" ")} failed in ${cwd}: ${r.err || r.out}`);
  return r.out;
};

const DRIVERS = [
  { driver: ".agents/skills/drive-web-editor/driver.mjs", sessions: true, states: [".agents/skills/drive-web-editor/.state.json", ".agents/skills/resolve-issue/.state.json", ".claude/skills/drive-web-editor/.state.json", ".claude/skills/resolve-issue/.state.json"] },
  { driver: ".agents/skills/drive-vscode-web/driver.mjs", states: [".agents/skills/drive-vscode-web/.state.json", ".claude/skills/drive-vscode-web/.state.json"] },
  { driver: ".agents/skills/resolve-issue/driver.mjs", states: [".agents/skills/resolve-issue/.state.json"] },
];

const LEGACY_DRIVERS = DRIVERS.map((d) => ({
  driver: d.driver.replace(".agents", ".claude"),
  states: [...new Set(d.states.map((s) => s.replace(".agents", ".claude")))],
}));

const stateFileOf = (worktree, d, exists) => {
  const files = d.states.map((s) => path.join(worktree, s));
  return files.find(exists) ?? files[0];
};

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

export function recordedServers(stateFiles, deps, detail) {
  const judged = stateFiles.map((file) => recordedServer(file, deps, detail));
  return judged.find((j) => j.state !== "down") ?? judged[0];
}

export function serverRows(results) {
  return results.filter((s) => s.state !== "down");
}

function statusOf(worktree, deps) {
  const lines = gitOrDie(deps, ["status", "--porcelain", "--ignored=matching"], worktree).split(/\r?\n/).filter(Boolean);
  return { dirty: lines.filter((l) => !l.startsWith("!!")).length, ignored: lines.filter((l) => l.startsWith("!!")).map((l) => l.slice(3)) };
}

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
  const own = deps.exec("git", ["for-each-ref", "--format=%(objectname)", "refs/worktree", "refs/bisect", "refs/rewritten"], abs);
  if (own.status !== 0) {
    facts.headLogUnknown = `its per-worktree refs could not be read (${own.err || own.out || `exit ${own.status}`})`;
    return facts;
  }
  const held = [...new Set([...hashes, ...own.out.split(/\r?\n/).filter(Boolean)])];
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

const bytesUnder = async (dir, deps) => (await deps.scan(dir)).bytes;

function registration(abs, ctx, deps) {
  const r = deps.exec("git", ["worktree", "list", "--porcelain"], ctx.mainRoot);
  if (r.status !== 0) return { known: false, err: r.err || r.out || `exit ${r.status}` };
  return { known: true, registered: parseWorktreeList(r.out).some((e) => samePath(e.path, abs)) };
}

// workaround(git): on Windows `git worktree remove` deletes entries before a held one and drops its record before reporting the failure
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

async function removeDirect(abs, deps) {
  try {
    deps.removeDir(abs);
  } catch {
  }
  return deps.exists(abs) ? bytesUnder(abs, deps) : null;
}

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
      return kept(`git worktree remove refused (${gitErr}) and kept its record; nothing more was touched`);
    }
    const remaining = await removeDirect(abs, deps);
    if (remaining !== null) return failed(`git worktree remove stopped part-way (${gitErr}) and dropped its record, so ${abs} is no longer a worktree; ${formatBytes(remaining)} remain there; delete the directory by hand once nothing holds it${afterHand}`, remaining);
    notes.push(`git worktree remove stopped part-way (${gitErr}) and dropped its record; the rest of the directory was removed directly`);
  }
  if (registration(abs, ctx, deps).registered !== false) {
    const again = deps.exec("git", ["worktree", "remove", abs], ctx.mainRoot);
    if (again.status !== 0) notes.push(`its record could not be dropped (${again.err || again.out}); \`git worktree prune\` drops it`);
  }
  return null;
}

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

function pruneDeadRecords(entries, ctx, deps) {
  if (!entries.some((e) => e.prunable)) return { pruned: [] };
  const inventory = registeredWorktrees(ctx, deps);
  if (inventory.reason) return { pruned: [], waiting: inventory.reason };
  const dead = inventory.entries.filter((e) => e.prunable);
  if (!dead.length) return { pruned: [] };
  const probe = dead.find((e) => deps.exists(`${path.resolve(e.path)}${PROBE_SUFFIX}`));
  if (probe) return { pruned: [], waiting: `${path.resolve(probe.path)}${PROBE_SUFFIX} is beside a dead record, which is what an interrupted run's probe leaves; rename it back by hand first, since pruning would drop the record it points at` };
  const uncertain = [];
  const extant = dead.filter((e) => {
    const abs = path.resolve(e.path);
    if (!deps.lstat) return deps.exists(abs);
    try { deps.lstat(abs); return true; }
    catch (err) {
      if (err.code !== "ENOENT") uncertain.push(`${abs}: ${err.code ?? err.message}`);
      return false;
    }
  });
  if (uncertain.length) return { pruned: [], waiting: `worktree ownership could not be inspected: ${uncertain.join(", ")}` };
  if (extant.length) return { pruned: [], waiting: `protected extant worktree ownership: ${extant.map((e) => path.resolve(e.path)).join(", ")}; repair the missing Git marker before pruning` };
  const r = deps.exec("git", ["worktree", "prune"], ctx.mainRoot);
  if (r.status !== 0) return { pruned: [], waiting: `git worktree prune failed (${r.err || r.out})` };
  return { pruned: dead.map((e) => path.resolve(e.path)) };
}

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

const RUNS_SCRIPT = /clean-worktrees\.mjs"?\s.*--remove\b/;

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

export function checkoutSpellings(p) {
  const r = path.resolve(p);
  const out = new Set([r]);
  if (/^[a-zA-Z]:/.test(r)) {
    out.add(r[0].toUpperCase() + r.slice(1));
    out.add(r[0].toLowerCase() + r.slice(1));
  }
  return [...out];
}

export function driverDirKeeps(dir, deps, nowMs, processes) {
  const keep = [];
  const why = (err) => String(err?.code ?? err?.message ?? err).split("\n")[0];
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
      if (name === CHECKOUT_OWNER_FILE && entry.isFile()) continue;
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

export function recordedCheckout(dir, deps) {
  const why = (err) => String(err?.code ?? err?.message ?? err).split("\n")[0];
  const file = path.join(dir, CHECKOUT_OWNER_FILE);
  let st;
  try {
    st = deps.lstat(file);
  } catch (err) {
    if (err?.code === "ENOENT") return { keep: "matches no worktree and holds no owner record, so which checkout it served cannot be told; delete it by hand once no session uses it" };
    return { keep: `its owner record could not be inspected (${why(err)})` };
  }
  if (!st.isFile()) return { keep: "its owner record is not a file" };
  let checkout;
  try {
    checkout = JSON.parse(deps.readFile(file))?.checkout;
  } catch (err) {
    return { keep: `its owner record could not be read (${why(err)})` };
  }
  if (typeof checkout !== "string" || !path.isAbsolute(checkout)) return { keep: "its owner record names no absolute checkout path" };
  try {
    deps.lstat(checkout);
    return { keep: `its recorded checkout ${checkout} still exists` };
  } catch (err) {
    if (err?.code === "ENOENT") return { checkout };
    return { keep: `whether its recorded checkout ${checkout} still exists could not be told (${why(err)})` };
  }
}

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
    const recorded = worktree === undefined ? recordedCheckout(dir, deps) : null;
    const subject = recorded ? `its recorded checkout ${recorded.checkout} no longer exists` : `the driver directory of ${rel(worktree)}, which ${apply ? "was" : "would be"} removed`;
    if (recorded?.keep) {
      decision = apply ? "kept" : "keep";
      why = recorded.keep;
    } else {
      const keep = driverDirKeeps(dir, deps, nowMs, ctx.processes);
      if (keep.length) {
        decision = apply ? "kept" : "keep";
        why = `${subject}; ${keep.join("; ")}`;
      } else if (!apply) {
        decision = "remove";
        why = `${subject}; no session in it is in use`;
      } else {
        why = `${subject}; no session in it is in use`;
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

export { jobRootOf };

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

export function recordedProcessAlive(pid, starts, deps) {
  if (!deps.pidAlive(pid)) return false;
  if (!starts.size || !deps.processStart) return true;
  let now;
  try {
    now = deps.processStart(pid);
  } catch {
    return "unreadable";
  }
  return now !== null && starts.has(now);
}

export function numberState(number, deps, cwd) {
  const r = deps.exec("gh", ["api", `repos/{owner}/{repo}/issues/${number}`, "--jq", '.state + " " + (if .pull_request then "PR" else "issue" end)'], cwd, 60_000);
  const m = r.status === 0 ? /^(open|closed) (PR|issue)$/.exec(r.out) : null;
  if (m) return { state: m[1], kind: m[2] };
  return { state: null, err: r.err || (r.status === 0 ? `unexpected output ${JSON.stringify(r.out)}` : "no output") };
}

function registeredWorktrees(ctx, deps) {
  let inventory;
  try { inventory = deps.exec("git", ["worktree", "list", "--porcelain"], ctx.mainRoot); }
  catch (err) { inventory = { status: 1, err: err.message }; }
  const entries = inventory.status === 0 ? parseWorktreeList(inventory.out) : [];
  const reason = !entries.length || entries.some((entry) => !path.isAbsolute(entry.path)) || !entries.some((entry) => samePath(entry.path, ctx.mainRoot)) ? `registered worktree inventory could not be read (${inventory.err || "incomplete inventory"})` : null;
  return { entries, reason };
}

function physicalPath(value, deps) {
  let current = path.resolve(value);
  const suffix = [];
  while (true) {
    try { return path.join((deps.realpath ?? liveDeps.realpath)(current), ...suffix); }
    catch (err) {
      if (err.code !== "ENOENT" || path.dirname(current) === current) throw err;
      suffix.unshift(path.basename(current));
      current = path.dirname(current);
    }
  }
}

function embeddedCloneReason(clone, deps, ctx) {
  const kept = (why) => `protected embedded Git repository ${clone} (${why})`;
  const git = (args, cwd = clone) => {
    try { return deps.exec("git", args, cwd, 60_000); }
    catch (err) { return { status: null, out: "", err: err.message }; }
  };
  const top = git(["rev-parse", "--show-toplevel"]);
  let own = false;
  if (top.status === 0) {
    try { own = samePath(physicalPath(top.out, deps), physicalPath(clone, deps)); } catch {}
  }
  if (!own) return kept(`it does not answer as its own repository${top.err ? `: ${top.err}` : ""}`);
  const status = git(["status", "--porcelain", "--untracked-files=all"]);
  if (status.status !== 0) return kept(`git status could not be read${status.err ? `: ${status.err}` : ""}`);
  if (status.out) return kept("it has uncommitted or untracked files");
  const flagged = git(["ls-files", "-v"]);
  if (flagged.status !== 0) return kept(`its index could not be read${flagged.err ? `: ${flagged.err}` : ""}`);
  if (flagged.out.split("\n").some((line) => /^[a-zS] /.test(line))) return kept("it has files marked assume-unchanged or skip-worktree, whose changes status does not show");
  for (const name of [...IN_PROGRESS, "sequencer"]) {
    const where = git(["rev-parse", "--git-path", name]);
    if (where.status !== 0 || !where.out) return kept(`git could not locate its ${name} state${where.err ? `: ${where.err}` : ""}`);
    if ((deps.exists ?? liveDeps.exists)(path.resolve(clone, where.out))) return kept(`a git operation is unfinished in it (${name})`);
  }
  const linked = git(["worktree", "list", "--porcelain"]);
  if (linked.status !== 0) return kept(`its worktrees could not be listed${linked.err ? `: ${linked.err}` : ""}`);
  const others = parseWorktreeList(linked.out).filter((entry) => { try { return !samePath(physicalPath(entry.path, deps), physicalPath(clone, deps)); } catch { return true; } });
  if (others.length) return kept(`it has linked worktrees: ${others.map((entry) => entry.path).join(", ")}`);
  const head = git(["rev-parse", "--verify", "-q", "HEAD^{commit}"]);
  if (head.status !== 0 || !head.out) return kept(`its HEAD could not be read${head.err ? `: ${head.err}` : ""}`);
  const refs = git(["for-each-ref", "--format=%(objectname) %(*objectname) %(refname)"]);
  if (refs.status !== 0) return kept(`its refs could not be listed${refs.err ? `: ${refs.err}` : ""}`);
  const tips = new Set([head.out]);
  for (const line of refs.out.split("\n").filter(Boolean)) {
    const [object, peeled, name] = line.split(" ");
    if (!name || name.startsWith("refs/remotes/")) continue;
    if (name.startsWith("refs/tags/") && git(["rev-parse", "-q", "--verify", name], ctx.mainRoot).out === object) continue;
    tips.add(peeled || object);
  }
  const reflogs = git(["log", "-g", "--format=%H", "--exclude=refs/remotes/*", "--all", "HEAD"]);
  if (reflogs.status !== 0) return kept(`its reflogs could not be read${reflogs.err ? `: ${reflogs.err}` : ""}`);
  for (const commit of reflogs.out.split(/\s+/).filter(Boolean)) tips.add(commit);
  for (const tip of tips) {
    if (git(["cat-file", "-e", `${tip}^{commit}`], ctx.mainRoot).status !== 0) return kept(`commit ${tip.slice(0, 12)} is not on origin/main`);
    const on = git(["merge-base", "--is-ancestor", tip, "refs/remotes/origin/main"], ctx.mainRoot);
    if (on.status === 1) return kept(`commit ${tip.slice(0, 12)} is not on origin/main`);
    if (on.status !== 0) return kept(`whether commit ${tip.slice(0, 12)} is on origin/main could not be told${on.err ? `: ${on.err}` : ""}`);
  }
  return null;
}

function jobProtection(dir, deps, ctx, { judgeClones = false, approved, trusted } = {}) {
  const reasons = [];
  const { entries, reason } = registeredWorktrees(ctx, deps);
  if (reason) reasons.push(reason);
  let physicalDir;
  try { physicalDir = physicalPath(dir, deps); }
  catch (err) { reasons.push(`job ownership path could not be resolved at ${dir}: ${err.code ?? err.message}`); }
  for (const entry of entries) {
    let physicalEntry;
    try { physicalEntry = physicalPath(entry.path, deps); }
    catch (err) { reasons.push(`registered ownership path could not be resolved at ${entry.path}: ${err.code ?? err.message}`); }
    if (samePath(entry.path, dir) || isUnder(entry.path, dir) || (physicalDir && physicalEntry && (samePath(physicalEntry, physicalDir) || isUnder(physicalEntry, physicalDir)))) reasons.push(`protected registered worktree ${path.resolve(entry.path)}`);
  }
  const pending = [dir];
  while (pending.length) {
    const current = pending.pop();
    try {
      const stat = (deps.lstat ?? liveDeps.lstat)(current);
      if (stat.isSymbolicLink()) {
        if (samePath(current, dir)) reasons.push(`job root is a link: ${current}`);
        continue;
      }
      const children = (deps.readEntries ?? liveDeps.readEntries)(current);
      const names = new Set(children.map((entry) => entry.name.toLowerCase()));
      if (names.has("head") && names.has("objects") && names.has("refs")) reasons.push(`protected embedded Git repository ${current}`);
      for (const entry of children) {
        const child = path.join(current, entry.name);
        if (entry.name.toLowerCase() === ".git") {
          const clone = judgeClones && entry.isDirectory() && !entry.isSymbolicLink();
          const key = path.resolve(current);
          const why = !clone ? `protected embedded Git repository ${current}` : trusted?.has(key) ? null : embeddedCloneReason(current, deps, ctx);
          if (why) reasons.push(why);
          else approved?.add(key);
        }
        else if (entry.isDirectory() && !entry.isSymbolicLink()) pending.push(child);
      }
    } catch (err) {
      reasons.push(`repository ownership could not be inspected at ${current}: ${err.code ?? err.message}`);
    }
  }
  return reasons.join("; ");
}

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
  const judgeClones = github?.state === "closed";
  const approvedClones = new Set();
  const protection = jobProtection(dir, deps, ctx, { judgeClones, approved: approvedClones });
  if (protection) keep.unshift(protection);
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
  if (test && !journals.length) keep.push("a test directory with no journal naming its process; left for a person");
  if (keep.length) return { remove: false, reason: keep.join("; ") };
  const why = m ? `${github.kind} #${m[1]} is closed and` : "a test's scratch directory, and";
  return { remove: true, judgeClones, approvedClones, reason: `${why} no process its journals record is running; ${n(journals.length, "journal")}` };
}

export function removeJobDir(dir, guard = () => {}) {
  let changed = 0;
  const check = () => {
    try { guard(); }
    catch (err) {
      if (changed) throw new Error(`${err.message}; ${n(changed, "link")} already unlinked, targets untouched; preserve remaining artifacts for recovery`);
      throw err;
    }
  };
  const removedLink = () => { changed++; };
  check();
  const unlinked = unlinkLinksIn(dir, check, removedLink);
  check();
  if (unlinkLinksIn(dir, check, removedLink) !== 0) throw new Error(`a link reappeared inside ${dir} while it was being removed; nothing further was deleted`);
  check();
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
  return unlinked;
}

function unlinkLinksIn(dir, guard = () => {}, removedLink = () => {}) {
  let found = 0;
  const pending = [dir];
  while (pending.length) {
    const d = pending.pop();
    for (const it of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, it.name);
      if (it.isSymbolicLink()) {
        guard();
        found++;
        try {
          fs.unlinkSync(p);
        } catch {
          fs.rmdirSync(p);
        }
        removedLink();
      } else if (it.isDirectory()) pending.push(p);
    }
  }
  return found;
}

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
          const unlinked = removeJobDir(dir, () => {
            const protection = jobProtection(dir, deps, ctx, { judgeClones: verdict.judgeClones, trusted: verdict.approvedClones });
            if (protection) throw new Refusal(protection);
          });
          decision = "removed";
          if (unlinked) why += `; ${n(unlinked, "link")} unlinked first, targets untouched`;
        } catch (err) {
          if (err instanceof Refusal) decision = "kept";
          else { failed++; decision = "failed"; }
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

export const filerJobRootOf = (mainRoot) => `${path.resolve(mainRoot)}.filer-jobs`;

export function classifyFilerJob(dir, deps, ctx) {
  const why = (err) => String(err?.code ?? err?.message ?? err).split("\n")[0];
  const file = path.join(dir, "owner.json");
  let record;
  try {
    if (!deps.lstat(file).isFile()) return { remove: false, reason: "its owner.json is not a file; left for a person" };
    record = JSON.parse(deps.readFile(file));
  } catch (err) {
    return { remove: false, reason: err?.code === "ENOENT" ? "holds no owner.json, so whose run it was cannot be told; left for a person" : `its owner.json could not be read (${why(err)})` };
  }
  const keep = [];
  const protection = jobProtection(dir, deps, ctx);
  if (protection) keep.push(protection);
  let lock = null;
  try {
    lock = deps.readFile(`${file}.lock`);
  } catch (err) {
    if (err?.code !== "ENOENT") keep.push(`its ownership lock could not be read (${why(err)})`);
  }
  if (lock !== null) {
    let pid;
    try { pid = JSON.parse(lock)?.pid; } catch { pid = undefined; }
    if (!Number.isSafeInteger(pid)) keep.push("its ownership lock names no process");
    else if (deps.pidAlive(pid) && pid !== deps.pid()) keep.push(`its ownership lock names pid ${pid}, still running`);
  }
  let finished;
  if (record?.state === "removed") finished = "its run removed its tree";
  else if (typeof record?.tree !== "string" || !path.isAbsolute(record.tree)) keep.push("its owner.json names no absolute tree and does not report it removed");
  else if (ctx.worktrees.reason) keep.push(ctx.worktrees.reason);
  else if (ctx.worktrees.entries.some((entry) => samePath(entry.path, record.tree))) keep.push(`its tree ${record.tree} is still a registered worktree`);
  else if (deps.exists(record.tree)) keep.push(`its tree ${record.tree} is still there`);
  else finished = `its tree ${record.tree} is gone and registered nowhere`;
  const using = commandLineReason(dir, deps, ctx);
  if (using) keep.push(using);
  if (keep.length) return { remove: false, reason: keep.join("; ") };
  return { remove: true, reason: `a finished filing run: ${finished}` };
}

export async function cleanFilerJobs(ctx, deps, apply, record) {
  const root = filerJobRootOf(ctx.mainRoot);
  const names = deps.listDirs(root);
  if (!names.length) return { failed: 0, rows: [] };
  const log = deps.log;
  log("");
  log(`filer job directories under ${root}:`);
  const jobCtx = { ...ctx, worktrees: registeredWorktrees(ctx, deps) };
  const rows = [];
  let failed = 0;
  let removable = 0;
  let bytes = 0;
  for (const name of names) {
    const dir = path.join(root, name);
    const verdict = classifyFilerJob(dir, deps, jobCtx);
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
          removeJobDir(dir, () => {
            const again = classifyFilerJob(dir, deps, { ...jobCtx, worktrees: registeredWorktrees(ctx, deps) });
            if (!again.remove) throw new Refusal(again.reason);
          });
          decision = "removed";
        } catch (err) {
          if (err instanceof Refusal) decision = "kept";
          else { failed++; decision = "failed"; }
          why = `${err.message}; the directory is ${deps.exists(dir) ? "still there" : "gone"}; ${why}`;
        }
      }
      record({ decision, path: dir, why });
    }
    rows.push({ name, decision, why, size });
    log(`${decision.padEnd(DECISION_WIDTH)}  ${name}  ${formatBytes(size).padEnd(SIZE_WIDTH)}  ${why}`);
  }
  log(`${n(names.length, "filer job directory", "filer job directories")}: ${removable} ${apply ? "removable" : "to remove"} (${formatBytes(bytes)}), ${names.length - removable} kept.`);
  return { failed, rows };
}

const REDGREEN_AGE_MS = 24 * 60 * 60 * 1000;

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
  let owner = null;
  try {
    owner = JSON.parse(deps.readFile(path.join(dir, "owner.json")))?.pid;
  } catch {
  }
  if (deps.pidAlive(owner) && owner !== deps.pid()) keep.push(`its owner.json names pid ${owner}, which is running; a red/green run may still be restoring from it`);
  const using = commandLineReason(dir, deps, ctx);
  if (using) keep.push(using);
  if (keep.length) return { remove: false, reason: keep.join("; ") };
  return { remove: true, reason: `a redgreen snapshot last written ${hours(age)} ago` };
}

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

export async function cleanScratch(ctx, deps, apply, record) {
  const log = deps.log;
  const tmp = path.join(ctx.mainRoot, ".tmp");
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
  const filerJobs = await cleanFilerJobs(ctx, deps, apply, record);
  const scratch = await cleanScratch(ctx, deps, apply, record);
  return failed || drivers.failed || jobs.failed || filerJobs.failed || scratch.failed ? 1 : 0;
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
