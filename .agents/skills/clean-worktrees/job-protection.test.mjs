import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { classifyJob, cleanJobs, liveDeps, jobRootOf, main, parseWorktreeList } from './clean-worktrees.mjs';

const scratch = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'job-protection-')));
console.log(`Scratch repository: ${scratch}`);
const mainRoot = path.join(scratch, 'repo');
fs.mkdirSync(mainRoot);
function git(...args) {
  const r = spawnSync('git', args, { cwd: mainRoot, encoding: 'utf8', windowsHide: true });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}
function isRegistered(checkout) {
  const normalize = (value) => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
  return parseWorktreeList(git('worktree', 'list', '--porcelain')).some((entry) => normalize(entry.path) === normalize(checkout));
}
git('init', '-b', 'main');
git('config', 'user.email', 'scratch@example.com');
git('config', 'user.name', 'Scratch');
fs.writeFileSync(path.join(mainRoot, '.gitignore'), 'ignored.txt\n');
git('add', '.');
git('commit', '-m', 'fixture');
const ctx = { mainRoot, processes: { ok: true, list: [] } };
const deps = { ...liveDeps, pidAlive: () => false, log: () => {}, exec: (cmd, args, cwd) => cmd === 'gh' ? { status: 0, out: 'closed PR' } : liveDeps.exec(cmd, args, cwd) };
const root = jobRootOf(mainRoot);
let sequence = 0;
function job() {
  const name = `pr-${++sequence}`;
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  return { name, dir };
}
const fixtureLinks = [];
function unlinkFixture(link) {
  if (!fs.existsSync(link)) return;
  try { fs.unlinkSync(link); } catch { fs.rmdirSync(link); }
}
try {
  for (const state of ['clean', 'dirty', 'unmerged']) {
    const { name, dir } = job();
    const checkout = path.join(dir, 'checkout');
    git('worktree', 'add', '-b', `fixture-${state}`, checkout);
    fs.writeFileSync(path.join(checkout, 'ignored.txt'), 'preserve ignored');
    if (state !== 'clean') fs.writeFileSync(path.join(checkout, 'change.txt'), state);
    if (state === 'unmerged') {
      const run = (args) => { const r = spawnSync('git', args, { cwd: checkout, windowsHide: true }); assert.equal(r.status, 0); };
      run(['add', '.']); run(['commit', '-m', 'unmerged']);
    }
    const verdict = classifyJob(name, dir, deps, ctx);
    assert.equal(verdict.remove, false, `${state} registered descendant was removable`);
    assert.ok(verdict.reason.includes(checkout), verdict.reason);
    cleanJobs(ctx, deps, true, () => {});
    assert.equal(fs.readFileSync(path.join(checkout, 'ignored.txt'), 'utf8'), 'preserve ignored');
    assert.ok(isRegistered(checkout));
  }
  const openDeps = { ...deps, exec: (cmd, args, cwd) => cmd === 'gh' ? { status: 0, out: 'open PR' } : deps.exec(cmd, args, cwd) };
  const embedded = job();
  fs.mkdirSync(path.join(embedded.dir, 'embedded', '.git'), { recursive: true });
  fs.writeFileSync(path.join(embedded.dir, 'embedded', 'ignored.txt'), 'embedded sentinel');
  assert.equal(classifyJob(embedded.name, embedded.dir, openDeps, ctx).remove, false, 'an open PR\'s embedded repository was removable');
  assert.equal(classifyJob(embedded.name, embedded.dir, deps, ctx).remove, true, 'a closed PR\'s embedded repository kept it');
  cleanJobs(ctx, deps, true, () => {});
  assert.equal(fs.existsSync(embedded.dir), false, 'the closed PR\'s embedded repository survived apply');
  for (const kind of ['bare', 'uppercase']) {
    const fixture = job();
    const repository = path.join(fixture.dir, 'repository');
    git('init', ...(kind === 'bare' ? ['--bare'] : []), repository);
    if (kind === 'uppercase') {
      fs.renameSync(path.join(repository, '.git'), path.join(repository, '.GIT-temp'));
      fs.renameSync(path.join(repository, '.GIT-temp'), path.join(repository, '.GIT'));
    }
    fs.writeFileSync(path.join(repository, 'ignored.txt'), `${kind} sentinel`);
    const openVerdict = classifyJob(fixture.name, fixture.dir, openDeps, ctx);
    assert.equal(openVerdict.remove, false, `an open PR's ${kind} repository was removable`);
    assert.ok(openVerdict.reason.includes(`protected embedded Git repository ${repository}`), openVerdict.reason);
    assert.equal(classifyJob(fixture.name, fixture.dir, deps, ctx).remove, true, `a closed PR's ${kind} repository kept it`);
    cleanJobs(ctx, deps, true, () => {});
    assert.equal(fs.existsSync(repository), false, `the closed PR's ${kind} repository survived apply`);
  }
  {
    const inside = job();
    git('init', path.join(inside.dir, 'repo'));
    fs.mkdirSync(path.join(inside.dir, 'checkout'));
    fs.writeFileSync(path.join(inside.dir, 'checkout', '.git'), `gitdir: ${path.join(inside.dir, 'repo', '.git')}\n`);
    assert.equal(classifyJob(inside.name, inside.dir, deps, ctx).remove, true, 'a .git file pointing inside the job directory kept it');
    const outsideRepo = path.join(scratch, 'outside-repo');
    git('init', outsideRepo);
    const outside = job();
    fs.mkdirSync(path.join(outside.dir, 'checkout'));
    fs.writeFileSync(path.join(outside.dir, 'checkout', '.git'), `gitdir: ${path.join(outsideRepo, '.git')}\n`);
    const outsideVerdict = classifyJob(outside.name, outside.dir, deps, ctx);
    assert.equal(outsideVerdict.remove, false, 'a .git file pointing outside the job directory was removable');
    assert.match(outsideVerdict.reason, /worktree of a repository outside the job directory/);
    const linkedOut = job();
    const linkedRepo = path.join(linkedOut.dir, 'repo');
    git('init', linkedRepo);
    fs.mkdirSync(path.join(linkedRepo, '.git', 'worktrees', 'probe'), { recursive: true });
    fs.writeFileSync(path.join(linkedRepo, '.git', 'worktrees', 'probe', 'gitdir'), `${path.join(scratch, 'linked-elsewhere', '.git')}\n`);
    const linkedVerdict = classifyJob(linkedOut.name, linkedOut.dir, deps, ctx);
    assert.equal(linkedVerdict.remove, false, 'a repository with a linked worktree outside the job directory was removable');
    assert.match(linkedVerdict.reason, /linked worktree .* is outside the job directory/);
    const linkedIn = job();
    const innerRepo = path.join(linkedIn.dir, 'repo');
    git('init', innerRepo);
    fs.mkdirSync(path.join(innerRepo, '.git', 'worktrees', 'probe'), { recursive: true });
    fs.writeFileSync(path.join(innerRepo, '.git', 'worktrees', 'probe', 'gitdir'), `${path.join(linkedIn.dir, 'probe', '.git')}\n`);
    assert.equal(classifyJob(linkedIn.name, linkedIn.dir, deps, ctx).remove, true, 'a repository whose linked worktree is inside the job directory kept it');
    cleanJobs(ctx, deps, true, () => {});
    assert.equal(fs.existsSync(inside.dir), false);
    assert.equal(fs.existsSync(linkedIn.dir), false);
    assert.ok(fs.existsSync(outside.dir) && fs.existsSync(linkedOut.dir), 'a job directory something outside depends on was removed');
    assert.ok(fs.existsSync(path.join(outsideRepo, '.git')));
    fs.rmSync(outside.dir, { recursive: true, force: true });
    fs.rmSync(linkedOut.dir, { recursive: true, force: true });
  }
  {
    const testDir = path.join(root, 'test-fixture-abc');
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(path.join(testDir, 'owner.jsonl'), JSON.stringify({ event: 'test-owner', pid: 4000000 }) + '\n');
    git('init', path.join(testDir, 'fixture-repo'));
    assert.equal(classifyJob('test-fixture-abc', testDir, deps, ctx).remove, true, 'a dead test\'s embedded repository kept its scratch directory');
    cleanJobs(ctx, deps, true, () => {});
    assert.equal(fs.existsSync(testDir), false);
  }
  const unknown = job();
  assert.equal(classifyJob(unknown.name, unknown.dir, { ...deps, exec: (cmd, ...args) => cmd === 'git' ? { status: 1, err: 'inventory denied' } : deps.exec(cmd, ...args) }, ctx).remove, false, 'unknown inventory was removable');
  assert.equal(classifyJob(unknown.name, unknown.dir, { ...deps, readEntries: () => { throw new Error('ownership denied'); } }, ctx).remove, false, 'unreadable ownership was removable');
  fs.writeFileSync(path.join(unknown.dir, 'sentinel'), 'unknown sentinel');
  const denied = cleanJobs(ctx, { ...deps, exec: (cmd, ...args) => cmd === 'git' ? { status: 1, err: 'inventory denied' } : deps.exec(cmd, ...args) }, true, () => {});
  assert.ok(denied.rows.every((row) => row.decision === 'kept'));
  assert.equal(fs.readFileSync(path.join(unknown.dir, 'sentinel'), 'utf8'), 'unknown sentinel');
  const late = job();
  const link = path.join(late.dir, 'shared');
  fixtureLinks.push(link);
  fs.symlinkSync(mainRoot, link, 'junction');
  assert.equal(classifyJob(late.name, late.dir, deps, ctx).remove, true);
  let registered = false;
  const records = [];
  cleanJobs(ctx, deps, true, (row) => {
    records.push(row);
    if (row.path === late.dir && row.decision === 'removing' && !registered) {
      registered = true;
      git('worktree', 'add', '-b', 'late', path.join(late.dir, 'late'));
      fs.writeFileSync(path.join(late.dir, 'late', 'ignored.txt'), 'late sentinel');
    }
  });
  assert.equal(fs.readFileSync(path.join(late.dir, 'late', 'ignored.txt'), 'utf8'), 'late sentinel');
  assert.ok(fs.lstatSync(link).isSymbolicLink(), 'apply unlinked a protected job before rechecking');
  assert.ok(isRegistered(path.join(late.dir, 'late')));
  assert.ok(records.some((row) => row.path === late.dir && row.decision === 'kept' && row.why.includes('protected registered worktree')));
  const partial = job();
  const partialLink = path.join(partial.dir, 'shared');
  fixtureLinks.push(partialLink);
  fs.symlinkSync(mainRoot, partialLink, 'junction');
  let latePartial = false;
  const partialDeps = { ...deps, exec: (cmd, args, cwd) => {
    if (cmd === 'git' && !fs.existsSync(partialLink) && !latePartial) {
      latePartial = true;
      git('worktree', 'add', '-b', 'partial', path.join(partial.dir, 'checkout'));
      fs.writeFileSync(path.join(partial.dir, 'checkout', 'ignored.txt'), 'partial sentinel');
    }
    return deps.exec(cmd, args, cwd);
  } };
  const partialResult = cleanJobs(ctx, partialDeps, true, () => {});
  assert.equal(partialResult.failed, 1);
  assert.ok(partialResult.rows.some((row) => row.name === partial.name && row.decision === 'failed' && row.why.includes('already unlinked')));
  assert.equal(fs.readFileSync(path.join(partial.dir, 'checkout', 'ignored.txt'), 'utf8'), 'partial sentinel');
  assert.ok(isRegistered(path.join(partial.dir, 'checkout')));
  assert.ok(fs.existsSync(path.join(mainRoot, '.gitignore')), 'partial unlink damaged its target');
  const broken = job();
  const brokenCheckout = path.join(broken.dir, 'checkout');
  git('worktree', 'add', '-b', 'broken', brokenCheckout);
  fs.writeFileSync(path.join(brokenCheckout, 'ignored.txt'), 'broken sentinel');
  console.log(`Scratch marker removal: ${brokenCheckout}`);
  fs.unlinkSync(path.join(brokenCheckout, '.git'));
  assert.equal(classifyJob(broken.name, broken.dir, deps, ctx).remove, false);
  git('remote', 'add', 'origin', mainRoot);
  git('fetch', 'origin');
  git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');
  const privateTemp = path.join(scratch, 'temp');
  fs.mkdirSync(privateTemp);
  const fullLogs = [];
  const fullDeps = { ...deps, log: (line) => fullLogs.push(line), cwd: () => mainRoot, tmpdir: () => privateTemp, driverHome: () => path.join(scratch, 'driver'), processes: () => ctx.processes };
  console.log(`Scratch full apply: ${scratch}`);
  assert.equal(await main(['--apply', '--root', mainRoot], fullDeps), 0);
  assert.ok(fs.existsSync(path.join(brokenCheckout, 'ignored.txt')), 'full apply deleted extant checkout after pruning ownership');
  assert.equal(fs.readFileSync(path.join(brokenCheckout, 'ignored.txt'), 'utf8'), 'broken sentinel');
  assert.ok(isRegistered(brokenCheckout), 'pruning discarded extant ownership');
  assert.ok(fullLogs.some((line) => line.includes('protected extant worktree ownership') && line.includes(brokenCheckout)));
  console.log(`Scratch uncertain-ownership apply: ${scratch}`);
  assert.equal(await main(['--apply', '--root', mainRoot], { ...fullDeps, lstat: (value) => {
    if (path.resolve(value) === path.resolve(brokenCheckout)) { const error = new Error('fixture ownership denied'); error.code = 'EACCES'; throw error; }
    return deps.lstat(value);
  } }), 0);
  assert.ok(fullLogs.some((line) => line.includes('worktree ownership could not be inspected') && line.includes(brokenCheckout)));
  assert.ok(isRegistered(brokenCheckout));
  assert.equal(fs.readFileSync(path.join(brokenCheckout, 'ignored.txt'), 'utf8'), 'broken sentinel');
  const probeClone = (dir, name = 'probe-clone') => {
    const clone = path.join(dir, 'round-1', 'reviewer-a-1', name);
    fs.mkdirSync(path.dirname(clone), { recursive: true });
    const r = spawnSync('git', ['clone', '-q', mainRoot, clone], { windowsHide: true, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    fs.mkdirSync(path.join(clone, 'node_modules'));
    fs.writeFileSync(path.join(clone, 'ignored.txt'), 'install output the clone ignores');
    return clone;
  };
  const cloneJob = job();
  const cleanClone = probeClone(cloneJob.dir);
  fs.writeFileSync(path.join(cloneJob.dir, 'round-1', 'reviewer-a-1', 'report.md'), 'report');
  const cloneVerdict = classifyJob(cloneJob.name, cloneJob.dir, deps, ctx);
  assert.equal(cloneVerdict.remove, true, `a clean probe clone kept its closed PR's directory: ${cloneVerdict.reason}`);
  const cloneRun = cleanJobs(ctx, deps, true, () => {});
  assert.ok(cloneRun.rows.some((row) => row.name === cloneJob.name && row.decision === 'removed'), JSON.stringify(cloneRun.rows));
  assert.equal(fs.existsSync(cleanClone), false, 'the clean probe clone survived apply');
  assert.equal(fs.existsSync(cloneJob.dir), false);
  const heldJob = job();
  const heldClone = probeClone(heldJob.dir);
  const heldCheckout = path.join(heldJob.dir, 'checkout');
  git('worktree', 'add', '-b', 'held-beside-clone', heldCheckout);
  fs.writeFileSync(path.join(heldCheckout, 'ignored.txt'), 'held sentinel');
  const heldVerdict = classifyJob(heldJob.name, heldJob.dir, deps, ctx);
  assert.equal(heldVerdict.remove, false, 'a registered worktree beside a probe clone was removable');
  assert.ok(heldVerdict.reason.includes(`protected registered worktree ${heldCheckout}`), heldVerdict.reason);
  cleanJobs(ctx, deps, true, () => {});
  assert.equal(fs.readFileSync(path.join(heldCheckout, 'ignored.txt'), 'utf8'), 'held sentinel');
  assert.ok(fs.existsSync(path.join(heldClone, '.git')));
  assert.ok(isRegistered(heldCheckout));
  for (const state of ['untracked', 'committed', 'tagged', 'reflog', 'custom-reflog', 'linked', 'am', 'assume-unchanged']) {
    const fixture = job();
    const clone = probeClone(fixture.dir);
    const inClone = (...args) => { const r = spawnSync('git', ['-c', 'user.email=scratch@example.com', '-c', 'user.name=Scratch', ...args], { cwd: clone, windowsHide: true, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
    if (state === 'untracked' || state === 'committed' || state === 'reflog') fs.writeFileSync(path.join(clone, 'probe.txt'), state);
    if (state === 'committed' || state === 'reflog') {
      inClone('add', 'probe.txt');
      inClone('commit', '-q', '-m', 'local only');
      if (state === 'reflog') inClone('reset', '-q', '--hard', 'origin/main');
    }
    if (state === 'tagged' || state === 'custom-reflog') {
      const local = inClone('commit-tree', 'HEAD^{tree}', '-p', 'HEAD', '-m', 'local only');
      if (state === 'tagged') inClone('tag', 'saved-work', local);
      else { inClone('update-ref', '--create-reflog', 'refs/probe/saved', local); inClone('update-ref', 'refs/probe/saved', 'HEAD'); }
    }
    const external = path.join(scratch, `linked-${fixture.name}`);
    if (state === 'linked') inClone('worktree', 'add', '-q', '--detach', external, 'HEAD');
    if (state === 'am') {
      const patch = ['From 0000000000000000000000000000000000000000 Mon Sep 17 00:00:00 2001', 'From: Scratch <scratch@example.com>', 'Date: Mon, 12 Oct 2026 00:00:00 +0000', 'Subject: [PATCH] pending', '', '---', '', 'diff --git a/.gitignore b/.gitignore', '--- a/.gitignore', '+++ b/.gitignore', '@@ -1 +1 @@', '-not-the-content', '+pending-unique-work', '-- ', '2.40.1', ''].join('\n');
      const r = spawnSync('git', ['-c', 'user.email=scratch@example.com', '-c', 'user.name=Scratch', 'am'], { cwd: clone, input: patch, windowsHide: true, encoding: 'utf8' });
      assert.notEqual(r.status, 0, 'the fixture patch applied');
      assert.ok(fs.existsSync(path.join(clone, '.git', 'rebase-apply')), r.stderr);
    }
    if (state === 'assume-unchanged') {
      inClone('update-index', '--assume-unchanged', '.gitignore');
      fs.appendFileSync(path.join(clone, '.gitignore'), 'hidden-unique-work\n');
      assert.equal(inClone('status', '--porcelain', '--untracked-files=all'), '', 'the fixture change shows in status');
    }
    const verdict = classifyJob(fixture.name, fixture.dir, deps, ctx);
    if (state === 'linked') {
      assert.equal(verdict.remove, false, 'a probe clone with a linked worktree outside the job directory was removable');
      assert.match(verdict.reason, /linked worktree .* is outside the job directory/);
      cleanJobs(ctx, deps, true, () => {});
      assert.ok(fs.existsSync(path.join(clone, '.git')), 'apply removed the linked probe clone');
      assert.ok(fs.existsSync(path.join(external, '.git')), 'apply broke the linked worktree');
      inClone('worktree', 'remove', '--force', external);
      fs.rmSync(fixture.dir, { recursive: true, force: true });
    } else {
      assert.equal(verdict.remove, true, `a ${state} probe clone kept its closed PR's directory: ${verdict.reason}`);
      cleanJobs(ctx, deps, true, () => {});
      assert.equal(fs.existsSync(fixture.dir), false, `apply kept the ${state} probe clone`);
    }
  }
  {
    const fixture = job();
    const clone = probeClone(fixture.dir);
    fs.writeFileSync(path.join(clone, '.git', 'HEAD'), 'ref: refs/heads/no-such\n');
    const damaged = path.join(fixture.dir, 'round-1', 'reviewer-a-1', 'damaged');
    fs.mkdirSync(path.join(damaged, '.git'), { recursive: true });
    fs.writeFileSync(path.join(damaged, '.git', 'HEAD'), 'garbage');
    assert.equal(classifyJob(fixture.name, fixture.dir, deps, ctx).remove, true, 'a damaged repository kept the closed PR\'s directory');
    cleanJobs(ctx, deps, true, () => {});
    assert.equal(fs.existsSync(fixture.dir), false);
  }
  const openJob = job();
  const openClone = probeClone(openJob.dir);
  const openVerdict = classifyJob(openJob.name, openJob.dir, { ...deps, exec: (cmd, args, cwd) => cmd === 'gh' ? { status: 0, out: 'open PR' } : deps.exec(cmd, args, cwd) }, ctx);
  assert.equal(openVerdict.remove, false);
  assert.ok(openVerdict.reason.includes(`protected embedded Git repository ${path.dirname(path.join(openClone, '.git'))}`), openVerdict.reason);
  fs.rmSync(openJob.dir, { recursive: true, force: true });
  const dotted = job();
  const dottedCheckout = path.join(dotted.dir, '..checkout');
  git('worktree', 'add', '-b', 'dotted', dottedCheckout);
  git('worktree', 'lock', dottedCheckout);
  fs.writeFileSync(path.join(dottedCheckout, 'ignored.txt'), 'dotted sentinel');
  console.log(`Scratch marker removal: ${dottedCheckout}`);
  fs.unlinkSync(path.join(dottedCheckout, '.git'));
  const dottedVerdict = classifyJob(dotted.name, dotted.dir, deps, ctx);
  assert.equal(dottedVerdict.remove, false, '..checkout registered descendant was removable');
  assert.ok(dottedVerdict.reason.includes(dottedCheckout));
  cleanJobs(ctx, deps, true, () => {});
  assert.equal(fs.readFileSync(path.join(dottedCheckout, 'ignored.txt'), 'utf8'), 'dotted sentinel');
  assert.ok(isRegistered(dottedCheckout));
  const ordinary = job();
  cleanJobs(ctx, deps, true, () => {});
  assert.equal(fs.existsSync(ordinary.dir), false, 'ordinary closed job was retained');
  const actualJobs = path.join(scratch, 'actual-jobs');
  assert.ok(root.startsWith(scratch + path.sep) && actualJobs.startsWith(scratch + path.sep));
  console.log(`Scratch job-root alias: ${root} -> ${actualJobs}`);
  fs.renameSync(root, actualJobs);
  fs.symlinkSync(actualJobs, root, 'junction');
  fixtureLinks.push(root);
  const alias = job();
  const aliasCheckout = path.join(actualJobs, alias.name, 'checkout');
  git('worktree', 'add', '-b', 'alias', aliasCheckout);
  git('worktree', 'lock', aliasCheckout);
  fs.writeFileSync(path.join(aliasCheckout, 'ignored.txt'), 'alias sentinel');
  fs.unlinkSync(path.join(aliasCheckout, '.git'));
  const aliasVerdict = classifyJob(alias.name, alias.dir, deps, ctx);
  assert.equal(aliasVerdict.remove, false, 'physical registered descendant behind parent junction was removable');
  assert.ok(aliasVerdict.reason.includes(aliasCheckout));
  const unresolved = classifyJob(alias.name, alias.dir, { ...deps, realpath: () => { const error = new Error('fixture resolution denied'); error.code = 'EACCES'; throw error; } }, ctx);
  assert.equal(unresolved.remove, false, 'uncertain physical ownership was removable');
  assert.match(unresolved.reason, /ownership path could not be resolved/);
  cleanJobs(ctx, deps, true, () => {});
  assert.equal(fs.readFileSync(path.join(aliasCheckout, 'ignored.txt'), 'utf8'), 'alias sentinel');
  assert.ok(isRegistered(aliasCheckout));
  console.log('PASS review-job ownership protection');
} finally {
  for (const link of fixtureLinks) unlinkFixture(link);
  fs.rmSync(scratch, { recursive: true, force: true });
}
