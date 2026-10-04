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
  const r = spawnSync('git', args, { cwd: mainRoot, encoding: 'utf8' });
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
try {
  for (const state of ['clean', 'dirty', 'unmerged']) {
    const { name, dir } = job();
    const checkout = path.join(dir, 'checkout');
    git('worktree', 'add', '-b', `fixture-${state}`, checkout);
    fs.writeFileSync(path.join(checkout, 'ignored.txt'), 'preserve ignored');
    if (state !== 'clean') fs.writeFileSync(path.join(checkout, 'change.txt'), state);
    if (state === 'unmerged') {
      const run = (args) => { const r = spawnSync('git', args, { cwd: checkout }); assert.equal(r.status, 0); };
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
  const unknown = job();
  assert.equal(classifyJob(unknown.name, unknown.dir, { ...deps, exec: (cmd, ...args) => cmd === 'git' ? { status: 1, err: 'inventory denied' } : deps.exec(cmd, ...args) }, ctx).remove, false, 'unknown inventory was removable');
  assert.equal(classifyJob(unknown.name, unknown.dir, { ...deps, readEntries: () => { throw new Error('ownership denied'); } }, ctx).remove, false, 'unreadable ownership was removable');
  fs.writeFileSync(path.join(unknown.dir, 'sentinel'), 'unknown sentinel');
  const denied = cleanJobs(ctx, { ...deps, exec: (cmd, ...args) => cmd === 'git' ? { status: 1, err: 'inventory denied' } : deps.exec(cmd, ...args) }, true, () => {});
  assert.ok(denied.rows.every((row) => row.decision === 'kept'));
  assert.equal(fs.readFileSync(path.join(unknown.dir, 'sentinel'), 'utf8'), 'unknown sentinel');
  const late = job();
  const link = path.join(late.dir, 'shared');
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
  const ordinary = job();
  cleanJobs(ctx, deps, true, () => {});
  assert.equal(fs.existsSync(ordinary.dir), false, 'ordinary closed job was retained');
  // Remove only fixture links before disposing of this printed scratch root.
  fs.rmdirSync(link);
  console.log('PASS review-job ownership protection');
} finally {
  // Only this printed scratch root is disposable; never touch live jobs.
  fs.rmSync(scratch, { recursive: true, force: true });
}
