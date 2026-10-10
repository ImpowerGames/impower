import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import childProcess, { execFileSync, spawn } from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
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
const originalSpawnSync = childProcess.spawnSync;
const localeNames = Object.keys(process.env).filter(name => /^(?:LC_ALL|LANG|LANGUAGE)$/i.test(name));
const originalLocale = Object.fromEntries(localeNames.map(name => [name, process.env[name]]));
try {
  for (const name of localeNames) delete process.env[name];
  process.env.LC_ALL = 'de_DE.UTF-8';
  process.env.LANG = 'de_DE.UTF-8';
  process.env.LANGUAGE = 'de';
  childProcess.spawnSync = (executable, args, settings) => {
    assert.equal(executable, 'git');
    assert.deepEqual(args.slice(-2), ['rev-parse', '--is-inside-work-tree']);
    const locale = settings.env ?? process.env;
    if (locale.LC_ALL === 'C') assert.equal(locale.GIT_DISCOVERY_ACROSS_FILESYSTEM, '1', 'physical ancestor discovery crosses mount boundaries');
    return { status: 128, stderr: locale.LC_ALL === 'C' && locale.LANGUAGE === 'C' ? 'fatal: not a git repository (or any of the parent directories): .git\n' : 'fatal: Kein Git-Repository' };
  };
  syncBuiltinESMExports();
  assert.ok(allocateWriterArtifacts(options).artifactDir, 'a localized nonrepository parent remains allocatable');
  const beforeUnknown = fs.readdirSync(scratch);
  childProcess.spawnSync = () => ({ status: 128, stderr: 'fatal: unable to read configuration' });
  syncBuiltinESMExports();
  assert.throws(() => allocateWriterArtifacts(options), /Cannot verify/);
  assert.deepEqual(fs.readdirSync(scratch), beforeUnknown, 'unknown probe failure remains fail-closed before allocation');
} finally {
  childProcess.spawnSync = originalSpawnSync;
  syncBuiltinESMExports();
  for (const name of Object.keys(process.env).filter(name => /^(?:LC_ALL|LANG|LANGUAGE)$/i.test(name))) delete process.env[name];
  Object.assign(process.env, originalLocale);
}
const beforeRefusals = fs.readdirSync(scratch);
for (const invalid of [{ writer: '' }, { session: '' }, { issue: 0 }, { parent: '.' }, { parent: root }, { parent: path.join(scratch, 'missing') }]) assert.throws(() => allocateWriterArtifacts({ ...options, ...invalid }));
assert.deepEqual(fs.readdirSync(scratch), beforeRefusals, 'refused inputs allocate nothing');
const foreign = path.join(scratch, 'foreign-repo');
fs.mkdirSync(foreign);
console.log(`Scratch repository: ${foreign}`);
execFileSync('git', ['init', '--quiet', foreign], { windowsHide: true });
assert.throws(() => allocateWriterArtifacts({ ...options, parent: foreign }), /Git repository/);
assert.deepEqual(fs.readdirSync(foreign), ['.git'], 'foreign checkout receives no artifacts');
const foreignScratch = path.join(foreign, 'scratch');
fs.mkdirSync(foreignScratch);
const originalGitEnvironment = Object.fromEntries(Object.entries(process.env).filter(([name]) => /^GIT_/i.test(name)));
try {
  for (const name of Object.keys(originalGitEnvironment)) delete process.env[name];
  process.env.GIT_CEILING_DIRECTORIES = foreign;
  assert.throws(() => allocateWriterArtifacts({ ...options, parent: foreignScratch }), /Git repository/, 'inherited discovery ceiling cannot hide a foreign checkout');
  assert.deepEqual(fs.readdirSync(foreignScratch), [], 'hidden checkout receives no artifacts');
  process.env.GIT_DIR = path.join(scratch, 'missing-routing-target');
  process.env.GIT_WORK_TREE = foreign;
  process.env.GIT_CONFIG_COUNT = 'not-an-integer';
  process.env.GIT_DISCOVERY_ACROSS_FILESYSTEM = '0';
  assert.ok(allocateWriterArtifacts(options).artifactDir, 'ambient routing/config/boundary overrides do not break a physical nonrepository parent');
  assert.throws(() => allocateWriterArtifacts({ ...options, parent: foreignScratch }), /Git repository/);
} finally {
  for (const name of Object.keys(process.env).filter(name => /^GIT_/i.test(name))) delete process.env[name];
  Object.assign(process.env, originalGitEnvironment);
}
const broken = path.join(scratch, 'broken-gitdir');
fs.mkdirSync(broken);
console.log(`Scratch broken repository: ${broken}`);
fs.writeFileSync(path.join(broken, '.git'), 'gitdir: missing-metadata\n');
assert.throws(() => allocateWriterArtifacts({ ...options, parent: broken }), /Cannot verify/, 'broken metadata is unverifiable, not safe nonrepository space');
assert.deepEqual(fs.readdirSync(broken), ['.git'], 'broken checkout receives no artifacts');
const incomplete = path.join(scratch, 'incomplete-checkout');
console.log(`Scratch incomplete repository: ${incomplete}`);
execFileSync('git', ['init', '--quiet', incomplete], { windowsHide: true });
fs.renameSync(path.join(incomplete, '.git', 'HEAD'), path.join(incomplete, '.git', 'HEAD.saved'));
const incompleteParent = path.join(incomplete, 'scratch');
fs.mkdirSync(incompleteParent);
assert.throws(() => allocateWriterArtifacts({ ...options, parent: incompleteParent }), /Cannot verify/, 'incomplete ancestor metadata must not look like ordinary nonrepository space');
assert.deepEqual(fs.readdirSync(incompleteParent), [], 'incomplete checkout receives no artifacts');
const bare = path.join(scratch, 'bare-repository');
console.log(`Scratch bare repository: ${bare}`);
execFileSync('git', ['init', '--quiet', '--bare', bare], { windowsHide: true });
const bareEntries = fs.readdirSync(bare);
assert.throws(() => allocateWriterArtifacts({ ...options, parent: bare }), /Git repository/);
assert.deepEqual(fs.readdirSync(bare), bareEntries, 'bare repository receives no artifacts');
for (const damage of ['missing-head', 'damaged-head', 'missing-objects', 'missing-refs', 'damaged-config']) {
  const damagedBare = path.join(scratch, `bare-${damage}`);
  console.log(`Scratch damaged bare repository: ${damagedBare}`);
  execFileSync('git', ['init', '--quiet', '--bare', damagedBare], { windowsHide: true });
  fs.renameSync(path.join(damagedBare, 'HEAD'), path.join(damagedBare, 'HEAD.saved'));
  if (damage === 'damaged-head') fs.writeFileSync(path.join(damagedBare, 'HEAD'), 'invalid head\n');
  if (damage === 'missing-objects') fs.renameSync(path.join(damagedBare, 'objects'), path.join(damagedBare, 'objects.saved'));
  if (damage === 'missing-refs') fs.renameSync(path.join(damagedBare, 'refs'), path.join(damagedBare, 'refs.saved'));
  if (damage === 'damaged-config') {
    fs.renameSync(path.join(damagedBare, 'config'), path.join(damagedBare, 'config.saved'));
    fs.writeFileSync(path.join(damagedBare, 'config'), 'invalid config\n');
  }
  const damagedParent = path.join(damagedBare, 'scratch');
  fs.mkdirSync(damagedParent);
  assert.throws(() => allocateWriterArtifacts({ ...options, parent: damagedParent }), /Cannot verify/, `${damage} bare metadata refuses before allocation`);
  assert.deepEqual(fs.readdirSync(damagedParent), [], 'damaged bare storage receives no artifacts');
}
const outcomeBare = path.join(scratch, 'bare-config-outcomes');
console.log(`Scratch config-outcome repository: ${outcomeBare}`);
execFileSync('git', ['init', '--quiet', '--bare', outcomeBare], { windowsHide: true });
fs.renameSync(path.join(outcomeBare, 'HEAD'), path.join(outcomeBare, 'HEAD.saved'));
fs.renameSync(path.join(outcomeBare, 'refs'), path.join(outcomeBare, 'refs.saved'));
const outcomeParent = path.join(outcomeBare, 'scratch');
fs.mkdirSync(outcomeParent);
try {
  for (const fault of [{ status: 128, signal: null, stderr: 'fatal: injected failure' }, { status: null, signal: 'SIGTERM', stderr: '' }, { status: 0, signal: 'SIGTERM', stderr: '' }, { status: 1, signal: null, stderr: 'unexpected failure' }]) {
    let injected = 0;
    childProcess.spawnSync = (executable, args, settings) => {
      if (executable === 'git' && args[0] === 'config') { injected++; return { ...fault, stdout: '' }; }
      return originalSpawnSync(executable, args, settings);
    };
    syncBuiltinESMExports();
    assert.throws(() => allocateWriterArtifacts({ ...options, parent: outcomeParent }), /Cannot verify/, 'unexpected config outcomes cannot become absent metadata');
    assert.ok(injected, 'only the config result was injected; discovery and fixture remain real');
    assert.deepEqual(fs.readdirSync(outcomeParent), [], 'failed config verification writes nothing');
  }
} finally {
  childProcess.spawnSync = originalSpawnSync;
  syncBuiltinESMExports();
}
const ordinaryNames = path.join(scratch, 'ordinary-metadata-names');
fs.mkdirSync(ordinaryNames);
fs.mkdirSync(path.join(ordinaryNames, 'objects'));
fs.mkdirSync(path.join(ordinaryNames, 'refs'));
fs.writeFileSync(path.join(ordinaryNames, 'config'), '[application]\nname = ordinary\n');
assert.ok(allocateWriterArtifacts({ ...options, parent: ordinaryNames }).artifactDir, 'generic config/objects/refs names alone are ordinary storage');
fs.writeFileSync(path.join(ordinaryNames, 'config'), `[include]\npath = "${path.join(bare, 'config').split(path.sep).join('/')}"\n`);
assert.ok(allocateWriterArtifacts({ ...options, parent: ordinaryNames }).artifactDir, 'metadata recognition reads only the explicit config without following includes');
fs.writeFileSync(path.join(ordinaryNames, 'config'), 'invalid config\n');
const malformedOrdinaryBefore = fs.readdirSync(ordinaryNames);
assert.throws(() => allocateWriterArtifacts({ ...options, parent: ordinaryNames }), /Cannot verify/, 'malformed ordinary config with storage names is unverifiable');
assert.deepEqual(fs.readdirSync(ordinaryNames), malformedOrdinaryBefore, 'malformed ordinary config refusal writes nothing');
const linkedMetadata = path.join(scratch, 'linked-metadata');
fs.mkdirSync(linkedMetadata);
const objectsLink = path.join(linkedMetadata, 'objects');
fs.symlinkSync(path.join(bare, 'objects'), objectsLink, process.platform === 'win32' ? 'junction' : 'dir');
const linkedMetadataBefore = fs.readdirSync(linkedMetadata);
assert.throws(() => allocateWriterArtifacts({ ...options, parent: linkedMetadata }), /Cannot verify/);
assert.deepEqual(fs.readdirSync(linkedMetadata), linkedMetadataBefore, 'uncertain linked metadata receives no artifacts');
fs.unlinkSync(objectsLink);
const linked = path.join(scratch, 'linked');
fs.symlinkSync(scratch, linked, process.platform === 'win32' ? 'junction' : 'dir');
assert.throws(() => allocateWriterArtifacts({ ...options, parent: linked }), /linked/);
const descendant = path.join(linked, 'descendant');
fs.mkdirSync(path.join(scratch, 'descendant'));
assert.throws(() => allocateWriterArtifacts({ ...options, parent: descendant }), /linked/);
fs.unlinkSync(linked);
const portableRoot = path.join(scratch, " linked with 'quotes'");
fs.mkdirSync(portableRoot);
const originalExecFileSync = childProcess.execFileSync;
try {
  childProcess.execFileSync = (executable, args, settings) => {
    if (executable === 'git' && args.includes('worktree') && args.includes('list')) {
      return args.includes('-z') ? `worktree ${portableRoot}\0HEAD fixture\0locked reason\nworktree unrelated\0\0` : `worktree ${portableRoot}\nHEAD fixture\n\n`;
    }
    return originalExecFileSync(executable, args, settings);
  };
  syncBuiltinESMExports();
  assert.throws(() => allocateWriterArtifacts({ ...options, parent: portableRoot }), /inside a checkout/);
  assert.deepEqual(fs.readdirSync(portableRoot), [], 'portable NUL-record refusal writes nothing');
} finally {
  childProcess.execFileSync = originalExecFileSync;
  syncBuiltinESMExports();
}
const pathnameRepo = path.join(scratch, 'pathname-repo');
console.log(`Scratch pathname repository: ${pathnameRepo}`);
execFileSync('git', ['init', '--quiet', pathnameRepo], { windowsHide: true });
execFileSync('git', ['-C', pathnameRepo, '-c', 'user.name=Artifact test', '-c', 'user.email=artifact@example.invalid', 'commit', '--allow-empty', '--quiet', '-m', 'fixture'], { windowsHide: true });
const worktreeNames = process.platform === 'win32' ? [" linked with 'quotes'"] : [' linked\nline "quotes" ', ' linked\twith spaces '];
for (const name of worktreeNames) {
  const linkedRoot = path.join(scratch, name);
  if (!fs.existsSync(linkedRoot)) execFileSync('git', ['-C', pathnameRepo, 'worktree', 'add', '--detach', '--quiet', linkedRoot], { windowsHide: true });
  else execFileSync('git', ['-C', pathnameRepo, 'worktree', 'add', '--detach', '--quiet', '--force', linkedRoot], { windowsHide: true });
  fs.renameSync(path.join(linkedRoot, '.git'), path.join(linkedRoot, '.git.saved'));
  const linkedParent = path.join(linkedRoot, 'artifacts');
  fs.mkdirSync(linkedParent);
  const listing = execFileSync('git', ['-C', pathnameRepo, 'worktree', 'list', '--porcelain', '-z'], { encoding: 'utf8', windowsHide: true });
  if (process.platform === 'win32') {
    assert.ok(listing.split('\0').filter(record => record.startsWith('worktree ')).some(record => fs.existsSync(record.slice(9)) && fs.realpathSync.native(record.slice(9)) === fs.realpathSync.native(linkedRoot)), 'real Git preserves the physical worktree pathname across Windows short aliases');
  } else {
    assert.ok(listing.split('\0').includes(`worktree ${linkedRoot.split(path.sep).join('/')}`), 'real Git preserves the complete worktree pathname');
  }
  assert.throws(() => allocateWriterArtifacts({ ...options, parent: linkedParent, worktree: pathnameRepo }), /inside a checkout/, 'registered damaged worktree remains refused with unusual pathname');
  assert.deepEqual(fs.readdirSync(linkedParent), [], 'registered worktree refusal writes nothing');
}
console.log(process.platform === 'win32' ? 'LIMITATION: real POSIX newline/trailing-space worktree names cannot execute on Windows' : 'PASS: real POSIX newline/whitespace worktree paths remain registered and refused');
console.log('PASS: initial artifact paths isolate concurrent writers and retries, record ownership, and refuse unsafe parents/identities');
