import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { classifyJob, cleanJobs, liveDeps, jobRootOf } from './clean-worktrees.mjs';

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'job-protection-'));
console.log(`Scratch repository: ${scratch}`);
const mainRoot = path.join(scratch, 'repo');
fs.mkdirSync(mainRoot);
function git(...args) {
  const r = spawnSync('git', args, { cwd: mainRoot, encoding: 'utf8', windowsHide: true });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}
git('init');
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
    assert.ok(git('worktree', 'list', '--porcelain').includes(checkout.replaceAll(path.sep, '/')));
  }
  const embedded = job();
  fs.mkdirSync(path.join(embedded.dir, 'embedded', '.git'), { recursive: true });
  assert.equal(classifyJob(embedded.name, embedded.dir, deps, ctx).remove, false, 'embedded repository was removable');
  fs.writeFileSync(path.join(embedded.dir, 'embedded', 'ignored.txt'), 'embedded sentinel');
  cleanJobs(ctx, deps, true, () => {});
  assert.equal(fs.readFileSync(path.join(embedded.dir, 'embedded', 'ignored.txt'), 'utf8'), 'embedded sentinel');
  for (const kind of ['bare', 'uppercase']) {
    const fixture = job();
    const repository = path.join(fixture.dir, 'repository');
    git('init', ...(kind === 'bare' ? ['--bare'] : []), repository);
    if (kind === 'uppercase') {
      fs.renameSync(path.join(repository, '.git'), path.join(repository, '.GIT-temp'));
      fs.renameSync(path.join(repository, '.GIT-temp'), path.join(repository, '.GIT'));
    }
    fs.writeFileSync(path.join(repository, 'ignored.txt'), `${kind} sentinel`);
    assert.equal(classifyJob(fixture.name, fixture.dir, deps, ctx).remove, false, `${kind} repository was removable`);
    cleanJobs(ctx, deps, true, () => {});
    assert.equal(fs.readFileSync(path.join(repository, 'ignored.txt'), 'utf8'), `${kind} sentinel`);
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
  assert.ok(git('worktree', 'list', '--porcelain').includes(path.join(late.dir, 'late').replaceAll(path.sep, '/')));
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
  assert.ok(git('worktree', 'list', '--porcelain').includes(path.join(partial.dir, 'checkout').replaceAll(path.sep, '/')));
  assert.ok(fs.existsSync(path.join(mainRoot, '.gitignore')), 'partial unlink damaged its target');
  const ordinary = job();
  cleanJobs(ctx, deps, true, () => {});
  assert.equal(fs.existsSync(ordinary.dir), false, 'ordinary closed job was retained');
  console.log('PASS review-job ownership protection');
} finally {
  // Only this printed scratch root is disposable; never touch live jobs.
  for (const link of fixtureLinks) unlinkFixture(link);
  fs.rmSync(scratch, { recursive: true, force: true });
}
