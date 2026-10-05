// Source-only preparation. Run only after the authorized candidate setup.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  assert.equal(entry.isSymbolicLink(), false, 'Private evidence must not be linked');
  const file = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(file) : [file];
});
const packet = {
  created: new Date().toISOString(),
  capMs: 840000,
  node: process.execPath,
  npmCli: 'C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js',
  output: path.join(here, 'attempt-1'),
  candidates: [],
  privateFiles: [],
  executionAuthorized: false,
};
assert.ok(fs.existsSync(packet.npmCli));
assert.equal(fs.existsSync(packet.output), false, 'Preserve every prior attempt');
const received = JSON.parse(fs.readFileSync(path.join(here, 'received-manifest.json'), 'utf8'));
for (const entry of received.files) assert.equal(hash(entry.path), entry.expectedSha256);
for (const name of ['phase-helper.mjs', 'guard-prepared.mjs', 'prepare-packet.mjs', 'before-config-template.json', 'after-config-template.json', 'received-manifest.json']) {
  const file = path.join(here, name);
  packet.privateFiles.push({ path: file, sha256: hash(file) });
}
for (const file of [...walk(path.join(here, 'received-originals')), ...walk(path.join(here, 'rename-project'))]) {
  packet.privateFiles.push({ path: file, sha256: hash(file) });
}
for (const phase of ['before', 'after']) {
  const configTemplate = path.join(here, phase + '-config-template.json');
  const config = JSON.parse(fs.readFileSync(configTemplate, 'utf8'));
  const c = { phase, root: config.repoRoot, head: config.expectedHead, session: config.session, profile: config.profile, configTemplate, helper: '.1374-final-correction-live.mjs' };
  const git = args => execFileSync('git', args, { cwd: c.root, encoding: 'utf8', windowsHide: true, maxBuffer: 16000000 }).trimEnd();
  assert.equal(git(['rev-parse', 'HEAD']), c.head);
  assert.equal(git(['diff', '--name-only']), '');
  assert.equal(git(['diff', '--cached', '--name-only']), '');
  c.status = git(['status', '--porcelain=v1']);
  assert.ok(!fs.existsSync(c.profile), 'Use a new owned profile');
  c.files = git(['ls-tree', '-rz', '--full-tree', 'HEAD']).split('\0').filter(Boolean).map(row => {
    const [meta, relative] = row.split('\t');
    const [mode, type, blob] = meta.split(' ');
    assert.equal(type, 'blob');
    const file = path.join(c.root, relative);
    const bytes = fs.readFileSync(file);
    assert.equal(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'), blob, relative);
    return { path: relative, mode, blob, sha256: hash(file) };
  });
  const tracked = new Set(c.files.map(file => file.path));
  c.extras = [...new Set(git(['ls-files', '-z', '--cached', '--others', '--exclude-standard']).split('\0').filter(file => file && !tracked.has(file)))].sort().map(file => ({ path: file, sha256: hash(path.join(c.root, file)) }));
  assert.deepEqual(c.extras.map(file => file.path), [c.helper], 'Only the reviewed private helper may be untracked');
  const helperHash = hash(path.join(c.root, c.helper));
  assert.equal(helperHash, hash(path.join(here, 'phase-helper.mjs')), 'Candidate helper must match reviewed private source');
  assert.equal(helperHash, packet.helperSha256 ?? helperHash, 'Identical helper required for both phases');
  packet.helperSha256 = helperHash;
  const installRoot = path.join(c.root, 'node_modules');
  assert.ok(fs.lstatSync(installRoot).isDirectory());
  assert.equal(fs.lstatSync(installRoot).isSymbolicLink(), false);
  c.install = { entries: fs.readdirSync(installRoot).sort(), bin: fs.readdirSync(path.join(installRoot, '.bin')).sort(), links: {}, anchors: [] };
  for (const name of fs.readdirSync(path.join(installRoot, '@impower'))) {
    const target = fs.realpathSync(path.join(installRoot, '@impower', name));
    assert.ok(target.toLowerCase().startsWith(path.resolve(c.root).toLowerCase() + path.sep), 'Workspace link escapes its own candidate');
    c.install.links[name] = target;
  }
  for (const relative of ['package-lock.json', 'node_modules/.package-lock.json', 'node_modules/vite/package.json', 'node_modules/esbuild/package.json', 'node_modules/@esbuild/win32-x64/esbuild.exe', 'node_modules/playwright-core/package.json', 'node_modules/typescript/lib/typescript.js', 'node_modules/vitest/package.json']) {
    const file = path.join(c.root, relative);
    c.install.anchors.push({ path: relative, sha256: hash(file), realpath: fs.realpathSync(file) });
  }
  for (const source of config.sourceHashes) {
    const file = path.join(c.root, source.path);
    if (source.state === 'deleted') assert.equal(fs.existsSync(file), false);
    else assert.equal(hash(file), source.sha256);
  }
  packet.candidates.push(c);
}
const readiness = path.join(here, 'readiness-v2.json');
assert.equal(fs.existsSync(readiness), false, 'Do not replace an audited packet');
fs.writeFileSync(readiness, JSON.stringify(packet, null, 2));
console.log(JSON.stringify({ path: readiness, sha256: hash(readiness), helperSha256: packet.helperSha256, executionAuthorized: false, candidates: packet.candidates.map(c => ({ phase: c.phase, head: c.head, tracked: c.files.length, extras: c.extras, status: c.status })) }, null, 2));
