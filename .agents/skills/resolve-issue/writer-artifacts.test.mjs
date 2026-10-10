import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = name => process.argv[2] === '--base'
  ? execFileSync('git', ['show', `${process.argv[3]}:${name}`], { cwd: root, encoding: 'utf8', windowsHide: true })
  : fs.readFileSync(path.join(root, name), 'utf8');
assert.match(read('.agents/skills/resolve-issue/SKILL.md'), /writer-artifacts\.mjs/, 'the initial writer route must allocate before creating artifacts');
const publication = read('.agents/skills/resolve-issue/references/publishing.md');
assert.match(publication, /git commit -F "\$COMMIT_MESSAGE"/);
assert.match(publication, /--body-file "\$PR_BODY"/);
// The revision option checks the selected workflow consumers. Allocator behavior
// below always exercises this checkout's helper, including in revision controls.
const { allocateWriterArtifacts } = await import('./writer-artifacts.mjs');
const { protectPrivatePath } = await import('../../../scripts/reviewer-security.mjs');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'impower-writer-artifacts-'));
console.log(`Scratch artifact directory: ${scratch}`);
const options = { parent: scratch, issue: 1457, writer: 'writer-A', session: 'same-parent-session', worktree: root };
const run = () => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [path.join(root, '.agents/skills/resolve-issue/writer-artifacts.mjs'), '--parent', scratch, '--issue', '1457', '--writer', 'writer-A', '--session', options.session], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '', errors = '';
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { errors += data; });
  child.on('error', reject);
  child.on('close', code => code === 0 ? resolve(JSON.parse(output)) : reject(new Error(errors)));
});
const allocations = await Promise.all([run(), run()]);
assert.notEqual(allocations[0].artifactDir, allocations[1].artifactDir, 'simultaneous same-issue/session/writer attempts are exclusive');
for (const [index, allocation] of allocations.entries()) {
  const owner = JSON.parse(fs.readFileSync(allocation.ownerFile, 'utf8'));
  assert.equal(owner.writer, options.writer);
  assert.equal(owner.session, options.session);
  assert.equal(owner.issue, options.issue);
  assert.equal(owner.artifactDir, allocation.artifactDir);
  assert.equal(path.dirname(allocation.commitMessage), allocation.artifactDir);
  assert.equal(path.dirname(allocation.prBody), allocation.artifactDir);
  protectPrivatePath(allocation.artifactDir, { verifyOnly: true });
  for (const file of [allocation.commitMessage, allocation.prBody, path.join(allocation.artifactDir, 'diff3.log')]) fs.writeFileSync(file, `attempt ${index}`);
}
for (const [index, allocation] of allocations.entries()) {
  for (const file of [allocation.commitMessage, allocation.prBody, path.join(allocation.artifactDir, 'diff3.log')]) assert.equal(fs.readFileSync(file, 'utf8'), `attempt ${index}`, 'initial artifacts remain owned by their attempt');
}
const retry = allocateWriterArtifacts(options);
assert.ok(allocations.every(allocation => allocation.artifactDir !== retry.artifactDir));
const beforeRefusals = fs.readdirSync(scratch);
for (const invalid of [{ writer: '' }, { session: '' }, { issue: 0 }, { parent: '.' }, { parent: root }, { parent: path.join(scratch, 'missing') }]) assert.throws(() => allocateWriterArtifacts({ ...options, ...invalid }));
assert.deepEqual(fs.readdirSync(scratch), beforeRefusals, 'refused inputs allocate nothing');
const foreign = path.join(scratch, 'foreign-repo');
fs.mkdirSync(foreign);
console.log(`Scratch repository: ${foreign}`);
execFileSync('git', ['init', '--quiet', foreign], { windowsHide: true });
assert.throws(() => allocateWriterArtifacts({ ...options, parent: foreign }), /Git repository/);
assert.deepEqual(fs.readdirSync(foreign), ['.git'], 'foreign checkout receives no artifacts');
const linked = path.join(scratch, 'linked');
fs.symlinkSync(scratch, linked, process.platform === 'win32' ? 'junction' : 'dir');
assert.throws(() => allocateWriterArtifacts({ ...options, parent: linked }), /linked/);
const descendant = path.join(linked, 'descendant');
fs.mkdirSync(path.join(scratch, 'descendant'));
assert.throws(() => allocateWriterArtifacts({ ...options, parent: descendant }), /linked/);
fs.unlinkSync(linked);
console.log('PASS: initial artifact paths isolate concurrent writers and retries, record ownership, and refuse unsafe parents/identities');
