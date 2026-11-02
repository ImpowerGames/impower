import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as filer from "../filer-worktree.mjs";
import { testShell } from "../../.agents/skills/drive-web-editor/redgreen.mjs";

export async function verifyRemoval(selected = "all") {
  const { create, remove, ownShellUsers } = filer;
  const scratch = fs.mkdtempSync(path.join(process.env.IMPOWER_SYSTEM_TMPDIR || os.tmpdir(), "filer-removal-"));
  const root = path.join(scratch, "repo");
  fs.mkdirSync(root);
  console.log(`Scratch repository: ${root}`);
  const git = (args, cwd = root) => {
    const result = spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git(["init", "-b", "main"]);
  git(["config", "user.name", "Fixture"]);
  git(["config", "user.email", "fixture@example.invalid"]);
  git(["config", "core.longpaths", "false"]);
  fs.writeFileSync(path.join(root, ".gitignore"), "ignored/\nignored.txt\n");
  fs.writeFileSync(path.join(root, "tracked.txt"), "tracked sentinel\n");
  git(["add", "."]);
  git(["commit", "-m", "fixture"]);
  git(["update-ref", "refs/remotes/origin/main", "HEAD"]);
  git(["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main"]);
  const external = path.join(scratch, "external");
  git(["worktree", "add", "-b", "external", external]);
  fs.writeFileSync(path.join(external, "untracked.txt"), "untracked sentinel\n");
  fs.writeFileSync(path.join(external, "ignored.txt"), "ignored sentinel\n");
  const sentinels = ["tracked.txt", "untracked.txt", "ignored.txt"].map(name => [name, fs.readFileSync(path.join(external, name))]);
  const preserved = () => {
    for (const [name, bytes] of sentinels) assert.deepEqual(fs.readFileSync(path.join(external, name)), bytes, name);
  };
  const removed = (record) => {
    assert.ok(!fs.existsSync(record.tree));
    assert.ok(!git(["worktree", "list", "--porcelain"]).includes(record.tree.replaceAll(path.sep, "/")));
    assert.equal(spawnSync("git", ["show-ref", "--quiet", "--verify", `refs/heads/${record.branch}`], { cwd: root, windowsHide: true }).status, 1);
    assert.equal(JSON.parse(fs.readFileSync(record.record)).state, "removed");
    assert.equal(JSON.parse(fs.readFileSync(record.record)).cleanupPending, undefined);
    preserved();
  };
  if (["all", "commit"].includes(selected)) {
    const base = git(["rev-parse", "HEAD"]);
    fs.writeFileSync(path.join(root, "tracked.txt"), "new main sentinel\n");
    git(["commit", "-am", "advance main"]);
    git(["update-ref", "refs/remotes/origin/main", "HEAD"]);
    const owner = "commit-filer";
    const record = await create({ root, owner, toolingOnly: true, commit: base });
    assert.equal(git(["rev-parse", "HEAD"], record.tree), base, "requested reproduction commit must be checked out");
    assert.equal(git(["symbolic-ref", "--short", "HEAD"], record.tree), record.branch);
    assert.equal(JSON.parse(fs.readFileSync(record.record)).head, base);
    fs.writeFileSync(path.join(record.tree, "probe.txt"), "commit probe\n");
    const link = path.join(record.tree, "borrowed");
    fs.symlinkSync(external, link, process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(remove(record.record, owner), /outside|External/);
    preserved();
    assert.ok(fs.existsSync(path.join(record.tree, "probe.txt")));
    fs.unlinkSync(link);
    await remove(record.record, owner);
    removed(record);
    assert.match(fs.readFileSync(JSON.parse(fs.readFileSync(record.record)).leftovers[0].patch, "utf8"), /commit probe/);
    const defaultRecord = await create({ root, owner, toolingOnly: true });
    assert.equal(git(["rev-parse", "HEAD"], defaultRecord.tree), git(["rev-parse", "origin/main"]));
    await remove(defaultRecord.record, owner);
    removed(defaultRecord);
    const inventory = () => JSON.stringify({ jobs: fs.readdirSync(`${root}.filer-jobs`), trees: git(["worktree", "list", "--porcelain"]), branches: git(["for-each-ref", "refs/heads"]) });
    const before = inventory();
    for (const commit of ["missing-commit", "--help", "", "HEAD:tracked.txt", 42]) {
      await assert.rejects(create({ root, owner, toolingOnly: true, commit }));
      assert.equal(inventory(), before, "invalid commits must not allocate ownership or branches");
    }
    const cli = await filer.main(["create", "--root", root, "--owner", owner, "--tooling-only", "--commit", "HEAD~1"]);
    assert.equal(JSON.parse(fs.readFileSync(cli.record)).head, base);
    await remove(cli.record, owner);
    removed(cli);
    console.log("PASS: specified and default commits, attached ownership, invalid-input preservation, CLI and probe/branch removal");
  }
  if (["all", "long-paths"].includes(selected)) {
    const owner = "long-path-filer", record = await create({ root, owner, toolingOnly: true });
    const probe = path.join(...Array.from({ length: 5 }, (_, i) => `${i}-${"long-path".repeat(5)}`), "probe.txt");
    const probeFile = path.join(record.tree, probe);
    assert.ok(probeFile.length > 300);
    fs.mkdirSync(path.dirname(probeFile), { recursive: true });
    fs.writeFileSync(probeFile, "long untracked probe\n");
    const ignoredFile = path.join(record.tree, "ignored", probe);
    fs.mkdirSync(path.dirname(ignoredFile), { recursive: true });
    fs.writeFileSync(ignoredFile, "long ignored probe\n");
    const link = path.join(record.tree, "borrowed");
    fs.symlinkSync(external, link, process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(remove(record.record, owner), /outside|External/);
    preserved();
    assert.ok(fs.existsSync(probeFile));
    fs.unlinkSync(link);
    const output = await remove(record.record, owner);
    assert.doesNotMatch(output, /stopped part-way|removed directly|Filename too long/);
    assert.ok(output.includes(`owned branch removed: ${record.branch}`));
    removed(record);
    const saved = JSON.parse(fs.readFileSync(record.record));
    assert.match(fs.readFileSync(saved.leftovers[0].patch, "utf8"), /long untracked probe/);
    assert.equal(git(["config", "core.longpaths"]), "false");
    console.log("PASS: long paths, untracked patch, owned branch removal and external sentinels");
  }
  if (["all", "own-shells"].includes(selected)) {
    const owner = "own-shell-filer", record = await create({ root, owner, toolingOnly: true });
    fs.writeFileSync(path.join(record.tree, "probe.txt"), "deferred probe\n");
    const executable = process.platform === "win32" ? testShell() : "/bin/bash";
    const shell = spawn(executable, ["--noprofile", "--norc", "-c", "read -r probe", record.tree], { cwd: root, windowsHide: true, stdio: ["pipe", "ignore", "ignore"] });
    const closed = new Promise(resolve => shell.once("close", resolve));
    await new Promise((resolve, reject) => { shell.once("spawn", resolve); shell.once("error", reject); });
    try {
      await assert.rejects(remove(record.record, owner), /own shells.*--defer/);
      assert.ok(fs.existsSync(path.join(record.tree, "probe.txt")));
      const helper = fileURLToPath(new URL("../filer-worktree.mjs", import.meta.url));
      const deferred = spawnSync(process.execPath, [helper, "remove", "--record", record.record, "--owner", owner, "--defer"], { cwd: root, windowsHide: true, encoding: "utf8" });
      assert.equal(deferred.status, 0, deferred.stderr);
      assert.equal(deferred.stdout.trim(), `cleanup pending: ${record.tree} ${record.branch}`);
      const saved = JSON.parse(fs.readFileSync(record.record));
      assert.equal(saved.state, "active");
      assert.equal(git(["rev-parse", `refs/heads/${record.branch}`]), saved.head);
      assert.ok(git(["worktree", "list", "--porcelain"]).includes(record.tree.replaceAll(path.sep, "/")));
      assert.ok(saved.cleanupPending.shells.some(p => p.pid === shell.pid));
      assert.ok(fs.existsSync(record.tree));
      assert.match(fs.readFileSync(saved.leftovers[0].patch, "utf8"), /deferred probe/);
      assert.equal(git(["status", "--porcelain"], record.tree), "");
      assert.equal(shell.exitCode, null);
      preserved();
    } finally { shell.stdin.end(); await closed; }
    await remove(record.record, owner);
    removed(record);
    console.log("PASS: own shells defer without termination, retain evidence, and allow later removal");
    const processes = [
      { pid: 10, ppid: 20, name: "node.exe", age: 100, cmd: "helper" },
      { pid: 20, ppid: 30, name: "powershell.exe", age: 200, cmd: "caller" },
      { pid: 30, ppid: 40, name: "node.exe", age: 300, cmd: "session" },
      { pid: 40, ppid: 0, name: "host.exe", age: 400, cmd: "host" },
      { pid: 50, ppid: 30, name: "bash.exe", age: 250, cmd: record.tree },
      { pid: 60, ppid: 50, name: "bash.exe", age: 200, cmd: record.tree },
    ];
    assert.equal(ownShellUsers(record.tree, processes, 10).onlyOwnShells, true);
    for (const changed of [
      { ...processes[4], ppid: 40 },
      { ...processes[4], name: "node.exe" },
      { ...processes[4], age: null },
      { ...processes[4], age: 350 },
      { ...processes[4], ppid: 60 },
    ]) assert.equal(ownShellUsers(record.tree, [...processes.slice(0, 4), changed, processes[5]], 10).onlyOwnShells, false);
    const foreign = await create({ root, owner, toolingOnly: true });
    fs.writeFileSync(path.join(foreign.tree, "probe.txt"), "preserved foreign hold\n");
    const worker = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)", foreign.tree], { cwd: root, windowsHide: true, stdio: "ignore" });
    const workerClosed = new Promise(resolve => worker.once("close", resolve));
    await new Promise((resolve, reject) => { worker.once("spawn", resolve); worker.once("error", reject); });
    try {
      await assert.rejects(remove(foreign.record, owner, { defer: true }), /other or unverifiable processes/);
      assert.equal(fs.readFileSync(path.join(foreign.tree, "probe.txt"), "utf8"), "preserved foreign hold\n");
      assert.equal(JSON.parse(fs.readFileSync(foreign.record)).cleanupPending, undefined);
      preserved();
    } finally { worker.kill(); await workerClosed; }
    await remove(foreign.record, owner);
    removed(foreign);
    console.log("PASS: foreign workers, unrelated shells, missing ages, reused parent PIDs and cycles do not qualify for deferral");
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await verifyRemoval(process.argv[2]);
