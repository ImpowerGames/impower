import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { protectPrivatePath } from '../../../scripts/reviewer-security.mjs';

const within = (root, file) => {
  const relative = path.relative(root, file);
  return !relative || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
};

function physicalDirectory(directory) {
  if (typeof directory !== 'string' || !path.isAbsolute(directory)) throw new Error('Artifact parent must be an existing absolute directory');
  let current = path.resolve(directory);
  while (true) {
    const stat = fs.lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Artifact parent has a linked or non-directory ancestor: ${current}`);
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return fs.realpathSync.native(directory);
}

function metadataEntry(file) {
  try {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) throw new Error(`Cannot verify linked artifact parent metadata: ${file}`);
    return stat;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new Error(`Cannot verify artifact parent metadata: ${file}`, { cause: error });
  }
}

function recognizableAdmin(directory, env) {
  const config = path.join(directory, 'config');
  const configStat = metadataEntry(config);
  const objects = metadataEntry(path.join(directory, 'objects'));
  const refs = metadataEntry(path.join(directory, 'refs'));
  if (!objects?.isDirectory() && !refs?.isDirectory()) return false;
  // Corroborate damaged/missing config with the canonical Git storage layout;
  // generic objects/refs/config names alone do not identify a repository.
  if (['objects/info', 'objects/pack', 'refs/heads', 'refs/tags'].every(name => metadataEntry(path.join(directory, name))?.isDirectory())) return true;
  if (configStat) {
    if (!configStat.isFile()) throw new Error(`Cannot verify artifact parent metadata: ${config}`);
    // Establish readability separately: a Git parse error is not proof of absence.
    fs.readFileSync(config);
    const read = (type, key) => {
      const result = spawnSync('git', ['config', '--file', config, '--no-includes', `--type=${type}`, '--get', key], { encoding: 'utf8', windowsHide: true, env });
      if (result.error || result.signal || ![0, 1].includes(result.status) || (result.status === 1 && (result.stdout || result.stderr))) throw new Error(`Cannot verify artifact parent metadata: ${config}`, { cause: result.error });
      // --get returns 1 for an absent key. Every other failed read is uncertain.
      return result.status === 0 ? result.stdout.trim() : null;
    };
    if (read('int', 'core.repositoryformatversion') !== null && read('bool', 'core.bare') !== null) return true;
  }
  return false;
}

export function allocateWriterArtifacts({ parent, issue, writer, session, worktree = process.cwd() }) {
  if (!Number.isSafeInteger(issue) || issue < 1) throw new Error('A positive issue number is required');
  for (const [name, value] of Object.entries({ writer, session })) {
    if (typeof value !== 'string' || !value.trim() || value.length > 256 || /[\u0000-\u001f\u007f]/.test(value)) throw new Error(`A nonempty ${name} identity without control characters is required`);
  }
  const directory = physicalDirectory(parent);
  // Check physical repository discovery, independent of ambient Git routing,
  // config injection, ceilings or mount boundaries. Keep ordinary PATH/auth.
  const gitEnv = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^(?:GIT_.*|LC_ALL|LANG|LANGUAGE)$/i.test(name)));
  Object.assign(gitEnv, { LC_ALL: 'C', LANG: 'C', LANGUAGE: 'C', GIT_DISCOVERY_ACROSS_FILESYSTEM: '1' });
  const git = (args) => execFileSync('git', ['-C', worktree, ...args], { encoding: 'utf8', windowsHide: true, env: gitEnv }).trim();
  const roots = git(['worktree', 'list', '--porcelain']).split('\n').filter(line => line.startsWith('worktree ')).map(line => line.slice(9));
  for (const root of roots) {
    if (fs.existsSync(root) && within(fs.realpathSync.native(root), directory)) throw new Error(`Artifact parent is inside a checkout: ${root}`);
  }
  // Also reject an unrelated repository, not only this repository's worktrees.
  const probe = spawnSync('git', ['-C', directory, 'rev-parse', '--is-inside-work-tree'], { encoding: 'utf8', windowsHide: true, env: gitEnv });
  if (probe.status === 0) throw new Error(`Artifact parent is inside a Git repository: ${directory}`);
  if (probe.error || probe.status !== 128 || probe.stderr.trim() !== 'fatal: not a git repository (or any of the parent directories): .git') throw new Error(`Cannot verify artifact parent is outside Git repositories: ${directory}`);
  // Git can emit the ordinary no-repository diagnostic for incomplete .git
  // metadata. Its physical presence still makes this ancestor unverifiable.
  for (let ancestor = directory; ; ancestor = path.dirname(ancestor)) {
    const metadata = path.join(ancestor, '.git');
    if (metadataEntry(metadata) || recognizableAdmin(ancestor, gitEnv)) throw new Error(`Cannot verify artifact parent with repository metadata: ${ancestor}`);
    if (path.dirname(ancestor) === ancestor) break;
  }
  const artifactDir = fs.mkdtempSync(path.join(directory, `writer-${issue}-`));
  protectPrivatePath(artifactDir);
  const result = { artifactDir, commitMessage: path.join(artifactDir, 'commit-msg.txt'), prBody: path.join(artifactDir, 'pr-body.md'), ownerFile: path.join(artifactDir, 'owner.json') };
  const owner = { issue, writer, session, attempt: path.basename(artifactDir), worktree: fs.realpathSync.native(worktree), createdAt: new Date().toISOString(), ...result };
  fs.writeFileSync(result.ownerFile, JSON.stringify(owner, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  fs.writeFileSync(result.commitMessage, '', { flag: 'wx', mode: 0o600 });
  fs.writeFileSync(result.prBody, '', { flag: 'wx', mode: 0o600 });
  if (JSON.stringify(JSON.parse(fs.readFileSync(result.ownerFile, 'utf8'))) !== JSON.stringify(owner)) throw new Error(`Artifact ownership read-back failed: ${result.ownerFile}`);
  return result;
}

export function main(args = process.argv.slice(2)) {
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    if (!['--parent', '--issue', '--writer', '--session'].includes(name) || options[name.slice(2)] !== undefined || !args[index + 1]) throw new Error('Use --parent <existing-absolute-directory> --issue <number> --writer <identity> --session <identity>');
    options[name.slice(2)] = name === '--issue' ? Number(args[index + 1]) : args[index + 1];
  }
  return allocateWriterArtifacts(options);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(main(), null, 2)); }
  catch (error) { console.error(`writer-artifacts: ${error.message}`); process.exitCode = 1; }
}
