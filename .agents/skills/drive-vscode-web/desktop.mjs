import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import net from 'node:net';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sourceFiles, nearestDirMtime, checkBuild, parseFlags, WORKBENCH_CONSOLE_NOISE, liveDeps, openFile } from './driver.mjs';
import { consoleLine, partitionConsole } from '../drive-web-editor/driver.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export const DESKTOP_FLAGS = { '--code': 'value', '--automation': 'value', '--project': 'value', '--file': 'value', '--scenario': 'value', '--expect': 'value', '--out': 'value', '--first': 'value', '--next': 'value', '--timeout': 'number' };

export function desktopOptions(args, repo = root) {
  const { opts, error } = parseFlags(args, DESKTOP_FLAGS);
  if (error) throw new Error('desktop: ' + error);
  const scenario = opts['--scenario'] ?? 'full-build';
  if (!['full-build', 'f5'].includes(scenario)) throw new Error('--scenario must be full-build or f5');
  const automation = opts['--automation'] ?? 'electron';
  if (!['electron', 'cdp'].includes(automation)) throw new Error('--automation must be electron or cdp');
  if (!opts['--code']) throw new Error('--code must name an explicit VS Code executable; the driver never attaches to an existing instance');
  const project = path.resolve(opts['--project'] ?? path.join(repo, '.agents/skills/drive-vscode-web/fixtures/desktop-project'));
  const relative = opts['--file'] ?? 'project/main.sd';
  const script = path.resolve(project, relative);
  if (path.isAbsolute(relative) || path.relative(project, script).startsWith('..') || !relative.endsWith('.sd')) throw new Error('--file must name a .sd file within the whole --project root');
  const timeoutMs = (opts['--timeout'] ?? 90) * 1000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 10000 || timeoutMs > 300000) throw new Error('--timeout must be 10 to 300 seconds');
  if (opts['--project'] && (!opts['--first'] || !opts['--next'])) throw new Error('External projects require --first and --next expected story text');
  return { scenario, automation, project, script, code: path.resolve(opts['--code']), timeoutMs, firstText: opts['--first'] ?? 'Verification first beat.', nextText: opts['--next'] ?? 'Verification second beat.', expect: opts['--expect'], out: opts['--out'] ? path.resolve(opts['--out']) : null };
}

const sameIdentity = (a, b) => a && b && a.pid === b.pid && a.start === b.start;
const powershellJson = script => JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', "$ErrorActionPreference='Stop'; " + script], { windowsHide: true, encoding: 'utf8', timeout: 15000 }) || '[]');
function windowsProcesses(root, known = []) {
  const ids = [root, ...known].map(row => row.pid);
  if (ids.some(pid => !Number.isSafeInteger(pid) || pid < 1)) throw new Error('Invalid owned process identity');
  // Read the OS parent map, but inspect start identities only for our tree.
  // Unrelated elevated/system processes must not authorize or block signalling.
  const rows = powershellJson('$ids=@(' + ids.join(',') + '); $all=@(Get-CimInstance Win32_Process); do { $before=$ids.Count; $ids+=@($all | Where-Object {$_.ParentProcessId -in $ids} | Select-Object -ExpandProperty ProcessId); $ids=@($ids | Select-Object -Unique) } while($ids.Count -ne $before); $all | Where-Object {$_.ProcessId -in $ids} | ForEach-Object { $row=$_; try { $p=Get-Process -Id $row.ProcessId -ErrorAction Stop; [pscustomobject]@{pid=$row.ProcessId; parent=$row.ParentProcessId; start=$p.StartTime.ToUniversalTime().Ticks.ToString()} } catch { if($_.FullyQualifiedErrorId -notlike \'NoProcessFoundForGivenId*\'){throw} } } | ConvertTo-Json -Compress');
  return Array.isArray(rows) ? rows : [rows];
}
function windowsListener(port) {
  const rows = powershellJson('Get-NetTCPConnection -State Listen -LocalPort ' + port + ' -ErrorAction SilentlyContinue | ForEach-Object { [pscustomobject]@{pid=$_.OwningProcess; address=$_.LocalAddress} } | ConvertTo-Json -Compress');
  return Array.isArray(rows) ? rows : [rows];
}
async function privatePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

export function verifyCdpOwnership(owner, current, listeners) {
  if (!sameIdentity(owner, current) || !listeners.length || listeners.some(row => row.pid !== owner.pid || row.address !== '127.0.0.1')) throw new Error('CDP loopback listener does not belong to the spawned PID and start identity');
}

export function ownedDescendants(rows, root, known = []) {
  const owned = new Map([[root.pid, root], ...known.map(row => [row.pid, row])]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) {
      const parent = owned.get(row.parent);
      if (!owned.has(row.pid) && parent && rows.some(current => sameIdentity(parent, current))) { owned.set(row.pid, row); changed = true; }
    }
  }
  return [...owned.values()];
}

// CDP drives only the Chromium renderer. It adds no main-process Node inspector.
// Ownership is established before connecting; the transport cannot prove exit.
export async function launchOwnedCdp(options, deps = {}) {
  if ((deps.platform ?? process.platform) !== 'win32') throw new Error('CDP desktop ownership inspection is currently supported only on Windows');
  const identify = deps.identify ?? (await import('../../../scripts/reviewer-slots.mjs')).processIdentity;
  const processes = deps.processes ?? windowsProcesses;
  const listeners = deps.listeners ?? windowsListener, pause = deps.sleep ?? sleep, now = deps.now ?? Date.now;
  const persist = deps.persist ?? (() => {}), record = deps.record ?? {};
  const port = await (deps.port ?? privatePort)();
  const endpoint = 'http://127.0.0.1:' + port;
  const args = [...options.args, '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=' + port];
  const env = { ...options.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS;
  Object.assign(record, { endpoint, args, mainNodeInspector: false, environment: { removed: ['ELECTRON_RUN_AS_NODE', 'NODE_OPTIONS'], otherwise: 'inherited environment plus private helper plan' }, children: [] });
  const child = (deps.spawn ?? spawn)(options.executablePath, args, { cwd: options.cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let browser, context, timer, owner, samplingError;
  const app = {
    process: () => child,
    windows: () => context?.pages() ?? [],
    on(event, callback) { if (event === 'window') context.on('page', callback); },
    async firstWindow({ timeout }) {
      const by = now() + timeout;
      while (!context.pages().length && now() < by) await pause(100);
      if (!context.pages().length) throw new Error('No owned CDP workbench window');
      return context.pages()[0];
    },
    async close() {
      clearInterval(timer);
      const failed = [], close = record.close = { requestedAt: new Date().toISOString(), transportAck: false, processExitVerified: false };
      try { sample(); } catch (error) { failed.push('Owned tree snapshot failed: ' + error.message); }
      persist();
      if (browser) {
        await Promise.race([(async () => { const session = await browser.newBrowserCDPSession(); await session.send('Browser.close'); close.transportAck = true; })().catch(error => { close.transportError = error.message; }), pause(3000)]);
      }
      const by = now() + 10000;
      while (!record.exit && now() < by) await pause(100);
      if (!record.exit) {
        try {
          if (sameIdentity(owner, identify(child.pid))) {
            child.kill(); close.ownedTerminationRequested = true;
            const until = now() + 5000; while (!record.exit && now() < until) await pause(100);
            failed.push('Owned process required termination after CDP close');
          }
        } catch (error) { failed.push('Owned termination identity was uncertain: ' + error.message); }
      }
      try {
        const rows = processes(owner, record.children);
        const remaining = ownedDescendants(rows, owner, record.children).filter(owned => rows.some(current => sameIdentity(owned, current)));
        close.remainingProcesses = remaining;
        close.processExitVerified = Boolean(record.exit) && remaining.length === 0 && !samplingError && failed.length === 0;
        if (!close.processExitVerified) failed.push('Owned desktop parent/descendant exit was not established');
      } catch (error) { failed.push('Owned process exit inspection failed: ' + error.message); }
      await Promise.race([browser?.close().catch(() => {}), pause(3000)]);
      close.failed = failed; persist();
      if (failed.length) throw new Error(failed.join('\n'));
    },
  };
  deps.onOwned?.(app);
  child.once('exit', (code, signal) => { record.exit = { code, signal }; persist(); });
  child.once('error', error => { record.spawnError = error.message; persist(); });
  record.pid = child.pid; persist();
  owner = identify(child.pid);
  if (!owner) throw new Error('Spawned desktop process identity was unavailable');
  record.identity = owner; persist();
  function sample() {
    if (!owner) throw new Error('Owned process identity was not established');
    record.children = ownedDescendants(processes(owner, record.children), owner, record.children).filter(row => row.pid !== owner.pid);
    persist();
  }
  sample();
  const deadline = now() + options.timeout;
  while (now() < deadline && !record.exit) {
    let available = false;
    try { available = (await (deps.fetch ?? fetch)(endpoint + '/json/version', { signal: AbortSignal.timeout(1000) })).ok; } catch { /* still starting */ }
    if (available) break;
    await pause(200);
  }
  const bound = listeners(port);
  verifyCdpOwnership(owner, identify(child.pid), bound);
  record.listener = bound; persist();
  const chromium = deps.chromium ?? (await import('playwright')).chromium;
  browser = await chromium.connectOverCDP(endpoint, { timeout: options.timeout });
  context = browser.contexts()[0];
  if (!context) throw new Error('Owned CDP connection has no renderer context');
  timer = setInterval(() => { try { sample(); } catch (error) { samplingError = record.samplingError = error.message; persist(); } }, 2000);
  timer.unref();
  return app;
}

// The player and its workspace worker are bundled into game-webview.js.
// A separate player dist does not prove that the webview loaded those bytes.
export function desktopArtifacts(repo) {
  const ext = path.join(repo, 'vscode-sparkdown');
  return ['out/extension.js', 'out/workers/sparkdown-language-server.js', 'out/webviews/game-webview.js',
    'out/data/courier-prime.ttf', 'out/data/courier-prime-bold.ttf', 'out/data/courier-prime-italic.ttf',
    'out/data/courier-prime-bold-italic.ttf', 'out/data/noto-color-emoji.ttf'].map(file => path.join(ext, file));
}

export function artifactEvidence(repo, io = fs) {
  const artifacts = desktopArtifacts(repo);
  const packages = path.join(repo, 'packages');
  const packageSources = io.existsSync(packages) ? io.readdirSync(packages, { withFileTypes: true }).filter(entry => entry.isDirectory()).flatMap(entry => ['src', 'language'].map(dir => path.join(packages, entry.name, dir))) : [];
  const sources = sourceFiles([...packageSources, path.join(repo, 'vscode-sparkdown/src'), path.join(repo, 'vscode-sparkdown/language'), path.join(repo, 'vscode-sparkdown/webviews')], io);
  const failed = [], evidence = [];
  const stampFile = path.join(repo, 'vscode-sparkdown/out/.drive-vscode-desktop-build.json');
  let stamp;
  try { stamp = JSON.parse(io.readFileSync(stampFile, 'utf8')); } catch { /* a first accepted build establishes the stamp */ }
  const sourceHashes = Object.fromEntries(sources.map(file => [path.relative(repo, file.path), crypto.createHash('sha256').update(io.readFileSync(file.path)).digest('hex')]));
  const newest = sources.reduce((best, file) => !best || file.mtimeMs > best.mtimeMs ? file : best, null);
  const unchangedSources = stamp?.sources && JSON.stringify(sourceHashes) === JSON.stringify(stamp.sources);
  const changedSet = stamp?.sources ? [...new Set([...Object.keys(sourceHashes), ...Object.keys(stamp.sources)])].filter(file => (file in sourceHashes) !== (file in stamp.sources)) : [];
  for (const file of artifacts) {
    if (!io.existsSync(file) || !io.statSync(file).isFile() || !io.statSync(file).size) { failed.push('Missing scenario artifact: ' + file); continue; }
    const identity = { file, sha256: crypto.createHash('sha256').update(io.readFileSync(file)).digest('hex'), bytes: io.statSync(file).size, modified: new Date(io.statSync(file).mtimeMs).toISOString() };
    evidence.push(identity);
    if (file.includes(path.join('out', 'data'))) continue;
    const previous = stamp?.artifacts?.[path.relative(repo, file)];
    const unchangedArtifact = previous?.sha256 === identity.sha256 && previous?.modified === identity.modified;
    if (newest && !(unchangedSources && unchangedArtifact) && io.statSync(file).mtimeMs + 1 < newest.mtimeMs) failed.push('Stale scenario artifact: ' + file + ' is older than ' + newest.path);
    if (stamp?.sources && !unchangedSources && unchangedArtifact) failed.push('Scenario source content or source set changed without rebuilding artifact: ' + file);
    // Conservatively watch the whole scenario source set for each binary.
    // Directory times date deletions even when their files are no longer listed.
    for (const source of changedSet) {
      const changedAt = nearestDirMtime(path.join(repo, source), repo, io);
      if (changedAt == null || io.statSync(file).mtimeMs <= changedAt + 1) failed.push('Scenario source set changed without rebuilding artifact: ' + file + ' (' + source + ')');
    }
  }
  const current = Object.fromEntries(evidence.map(a => [path.relative(repo, a.file), { sha256: a.sha256, modified: a.modified }]));
  // Copied fonts are content-checked, so copied mtimes cannot mask an edit.
  for (const artifact of artifacts.filter(file => file.includes(path.join('out', 'data')))) {
    const source = path.join(repo, 'vscode-sparkdown/data', path.basename(artifact));
    if (!io.existsSync(source)) { failed.push('Missing copied data source: ' + source); continue; }
    if (io.existsSync(artifact) && io.existsSync(source) && !io.readFileSync(source).equals(io.readFileSync(artifact))) failed.push('Stale copied data: ' + artifact);
  }
  if (!failed.length) io.writeFileSync(stampFile, JSON.stringify({ sources: sourceHashes, artifacts: current }));
  return { artifacts: evidence, failed, bundledPlayerAndWorker: path.join(repo, 'vscode-sparkdown/out/webviews/game-webview.js'), sourceContentStamp: stampFile };
}

export function diagnosticFailures(actual, expected, project) {
  if (!Array.isArray(actual) || !Array.isArray(expected)) return ['Diagnostics and expected diagnostics must be arrays'];
  const identity = (d, file) => ({ file, severity: d.severity, source: d.source, message: d.message, start: { line: d.start?.line, column: d.start?.column }, end: { line: d.end?.line, column: d.end?.column } });
  const normalized = list => list.map(d => identity(d, path.relative(project, d.file).split(path.sep).join('/'))).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const wanted = expected.map(d => identity(d, d.file.split(path.sep).join('/'))).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return JSON.stringify(normalized(actual)) === JSON.stringify(wanted) ? [] : ['Unexpected diagnostic set; see complete messages, severity, source and locations in diagnostics/expectedDiagnostics'];
}

export function validateExpectedDiagnostics(expected, project) {
  if (!Array.isArray(expected)) throw new Error('--expect must contain an array of full diagnostic identities');
  for (const diagnostic of expected) {
    if (!diagnostic || typeof diagnostic.file !== 'string' || path.isAbsolute(diagnostic.file) || path.relative(project, path.resolve(project, diagnostic.file)).startsWith('..')) throw new Error('Expected diagnostic file must be relative to the whole project root');
    if (!['error', 'warning', 'info', 'hint'].includes(diagnostic.severity) || typeof diagnostic.source !== 'string' || typeof diagnostic.message !== 'string') throw new Error('Expected diagnostics require severity, source and exact message');
    for (const point of [diagnostic.start, diagnostic.end]) if (!point || !Number.isSafeInteger(point.line) || !Number.isSafeInteger(point.column) || point.line < 1 || point.column < 1) throw new Error('Expected diagnostic locations require positive one-based line/column');
  }
}

export function desktopFailures(report, options) {
  const failures = [...(report.failed ?? [])];
  failures.push(...desktopIdentityFailures(report.host, options));
  for (const method of ['textDocument/semanticTokens/full', 'textDocument/semanticTokens/range', 'textDocument/documentSymbol']) {
    if (!report.host?.requests?.some(request => request.method === method && request.success && request.length > 0)) failures.push('Missing successful language request: ' + method);
  }
  if (!report.host?.settled) failures.push('Complete diagnostic snapshots did not settle');
  failures.push(...diagnosticFailures(report.host?.diagnostics, report.expectedDiagnostics, options.project));
  if (!report.preview?.initial || !report.preview?.interaction || !report.preview?.screenshot || !report.preview?.afterScreenshot) failures.push('Game Preview requires known visible content, an interaction and both screenshots');
  if (!report.preview?.inputAttempt?.event?.trusted || !(report.preview.inputAttempt.event.tag === 'CANVAS' || report.preview.inputAttempt.event.gameUI)) failures.push('No trusted pointer input in the actual player canvas/game UI');
  if (!/vscode-webview|vscode-resource/.test(report.preview?.frame ?? '')) failures.push('Story evidence did not identify a player webview frame');
  if (report.consoleErrors?.length) failures.push(...report.consoleErrors.map(line => 'Unclassified console error: ' + line));
  if (report.crash) failures.push('Desktop host crashed: ' + report.crash);
  if (report.timeout) failures.push('Desktop verification timed out: ' + report.timeout);
  if (!report.build?.artifacts?.length || report.build.failed?.length) failures.push(...(report.build?.failed ?? ['Missing artifact provenance']));
  if (options.scenario === 'f5' && !report.f5?.taskEvents?.some(e => e.event === 'task-start' && e.name === 'F5: watch:extension')) failures.push('No observed F5 extension preLaunchTask');
  if (options.scenario === 'f5' && report.f5?.baseline?.artifacts?.length) failures.push('F5 requires a fresh checkout with absent generated outputs; a full build may conceal missing dependencies');
  if (options.scenario === 'f5' && report.f5?.namedLaunchFallback) failures.push('Named configuration API fallback does not verify the actual keyboard F5 trigger');
  return [...new Set(failures)];
}

function desktopIdentityFailures(host, options) {
  const failures = [];
  if (host?.workspaceRoot?.toLowerCase() !== options.project.toLowerCase()) failures.push('Host did not open the specified whole project root');
  let opened;
  try { opened = fileURLToPath(host?.document?.uri); } catch { /* missing/invalid URI is a failed open */ }
  if (opened?.toLowerCase() !== options.script.toLowerCase()) failures.push('Host did not open the requested nested script');
  return failures;
}

export function nativeHostCrash(lines) {
  return lines.split(/\r?\n/).find(line => {
    const match = /Extension host with pid \d+ exited with code: (-?\d+)/.exec(line);
    return match && Number(match[1]) !== 0;
  });
}

export async function palette(page, title) {
  await page.keyboard.press('F1');
  await page.locator('.quick-input-widget input').fill('>' + title);
  const command = page.locator('.quick-input-list .monaco-list-row').filter({ hasText: title }).first();
  await command.waitFor({ timeout: 15000 });
  await command.click();
}

export function f5Ready(events, repo) {
  return events.some(event => event.event === 'parent-ready' && event.root?.toLowerCase() === repo.toLowerCase());
}

export async function playerPointer(canvas, timeoutMs, pause = sleep, now = Date.now) {
  const deadline = now() + timeoutMs;
  let previous, stable = 0;
  while (now() < deadline) {
    const box = await canvas.boundingBox();
    const identity = JSON.stringify(box);
    stable = box?.width > 0 && box?.height > 0 && identity === previous ? stable + 1 : 0;
    if (stable >= 3) return { bounds: box, x: box.x + box.width / 2, y: box.y + box.height / 2 };
    previous = identity;
    await pause(250);
  }
  throw new Error('Visible player canvas geometry did not settle');
}

export async function advancePlayer(page, frame, nextText, timeoutMs, deps = {}) {
  const find = deps.find ?? storyFrame, pointerFor = deps.pointer ?? playerPointer;
  const attempts = [];
  for (let count = 0; count < 3; count++) {
    const canvas = frame.locator('canvas').last();
    await canvas.waitFor({ state: 'visible', timeout: timeoutMs });
    const pointer = await pointerFor(canvas, timeoutMs);
    await frame.evaluate(() => {
      window.__impowerInputEvidence = null;
      window.addEventListener('pointerdown', event => { window.__impowerInputEvidence = { trusted: event.isTrusted, tag: event.target.tagName, id: event.target.id, className: event.target.className, gameUI: Boolean(event.target.closest('#game-ui')) }; }, { capture: true, once: true });
    });
    await page.mouse.click(pointer.x, pointer.y);
    const event = await frame.evaluate(() => window.__impowerInputEvidence ?? null);
    const attempt = { ...pointer, frame: frame.url(), event }; attempts.push(attempt); deps.onAttempt?.(attempt, attempts);
    if (!event?.trusted || !(event.tag === 'CANVAS' || event.gameUI)) throw new Error('Physical pointer input did not reach the player canvas or game UI');
    try {
      await find(page, nextText, Math.min(timeoutMs, 3000));
      return { attempts, result: nextText };
    } catch {
      if (!deps.firstText) throw new Error('Player did not show the goal; no expected intermediate story state permits another click');
      await find(page, deps.firstText, Math.min(timeoutMs, 3000));
      attempt.intermediate = { visible: deps.firstText, observation: 'Initial beat remained visible after the goal wait; a click may have completed typing' };
      deps.onAttempt?.(attempt, attempts);
    }
  }
  throw new Error('Game Preview did not reach the requested changed story state after three bounded physical clicks: ' + nextText);
}

export async function storyFrame(page, text, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      if (frame === page.mainFrame()) continue;
      // Story content must belong to the Game Preview's webview/player, never
      // the Monaco source editor that contains the same expected words.
      const ancestry = [];
      for (let ancestor = frame; ancestor; ancestor = ancestor.parentFrame()) ancestry.push(ancestor.url());
      if (!ancestry.some(url => /vscode-webview|vscode-resource/.test(url))) continue;
      const hit = frame.getByText(text, { exact: true }).first();
      if (await hit.isVisible().catch(() => false)) {
        const visible = await hit.evaluate(element => {
          for (let node = element; node; node = node.parentElement ?? node.getRootNode()?.host) {
            const style = getComputedStyle(node);
            if (Number(style.opacity) === 0 || style.visibility === 'hidden' || style.display === 'none') return false;
          }
          return true;
        }).catch(() => false);
        let visibleFrames = visible;
        for (let ancestor = frame; visibleFrames && ancestor.parentFrame(); ancestor = ancestor.parentFrame()) {
          const element = await ancestor.frameElement();
          visibleFrames = await element.evaluate(element => {
            for (let node = element; node; node = node.parentElement ?? node.getRootNode()?.host) {
              const style = getComputedStyle(node);
              if (Number(style.opacity) === 0 || style.visibility === 'hidden' || style.display === 'none') return false;
            }
            return true;
          }).catch(() => false);
        }
        if (visibleFrames) return { frame, hit };
      }
    }
    await sleep(200);
  }
  throw new Error('Game Preview did not render expected visible story content: ' + text);
}

export const DESKTOP_CONSOLE_NOISE = [
  { name: 'VS Code built-in agent channel startup', match: /^\[error\] Unknown channel: agentHostClient(?:ByokLm|Proxy)$/ },
];

export async function desktop(args, deps = {}) {
  const root = deps.repoRoot ?? path.resolve(here, '../../..');
  const options = desktopOptions(args, root);
  for (const [file, kind] of [[options.code, 'executable'], [options.project, 'project'], [options.script, 'script']]) {
    if (!fs.existsSync(file)) throw new Error('Missing ' + kind + ': ' + file);
    if (kind === 'project' ? !fs.statSync(file).isDirectory() : !fs.statSync(file).isFile()) throw new Error('Invalid ' + kind + ' path type: ' + file);
  }
  const expectedDiagnostics = options.expect ? JSON.parse(fs.readFileSync(options.expect, 'utf8')) : [];
  validateExpectedDiagnostics(expectedDiagnostics, options.project);
  const runDir = options.out ?? fs.mkdtempSync(path.join(os.tmpdir(), 'impower-vscode-desktop-'));
  // A run directory is exclusive, even when the caller chooses its location.
  fs.mkdirSync(runDir, { recursive: true });
  const claim = fs.openSync(path.join(runDir, 'owner.json'), 'wx');
  fs.writeFileSync(claim, JSON.stringify({ pid: process.pid, root, created: new Date().toISOString() }));
  fs.closeSync(claim);
  const report = { scenario: options.scenario, platform: process.platform, automation: options.automation, complete: false, project: options.project, script: options.script, code: options.code, runDir, expectedDiagnostics, failed: [], surfaces: { desktop: 'unavailable', lsp: 'unavailable', preview: 'unavailable' } };
  const persist = () => {
    const file = path.join(runDir, 'report.json');
    fs.writeFileSync(file + '.tmp', JSON.stringify(report, null, 2)); fs.renameSync(file + '.tmp', file);
  };
  persist();
  const before = artifactEvidence(root);
  if (options.scenario === 'f5') {
    report.f5 = { baseline: before, taskEvents: [] };
  }
  const profile = path.join(runDir, 'profile');
  const extensions = path.join(runDir, 'extensions');
  const helper = path.join(extensions, 'impower-verification');
  fs.mkdirSync(path.join(profile, 'User'), { recursive: true });
  fs.mkdirSync(helper, { recursive: true });
  fs.writeFileSync(path.join(profile, 'User/settings.json'), JSON.stringify({ 'security.workspace.trust.enabled': false, 'workbench.startupEditor': 'none', 'update.mode': 'none', 'extensions.autoUpdate': false, 'telemetry.telemetryLevel': 'off', 'window.restoreWindows': 'none', 'sparkdown-language-server.trace.server': 'verbose' }));
  fs.writeFileSync(path.join(helper, 'package.json'), JSON.stringify({ name: 'impower-verification', publisher: 'impower', version: '0.0.0', engines: { vscode: '^1.100.0' }, main: './extension.cjs', activationEvents: ['onStartupFinished'], contributes: { commands: [{ command: 'impower.verification.stopTasks', title: 'Impower Verification: Stop Owned Tasks' }, { command: 'impower.verification.startF5', title: 'Impower Verification: Start Committed F5 Configuration' }] } }));
  fs.copyFileSync(path.join(here, 'desktop-helper.cjs'), path.join(helper, 'extension.cjs'));
  const identity = { head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim(), driverSha256: hash(path.join(here, 'desktop.mjs')), helperSha256: hash(path.join(here, 'desktop-helper.cjs')) };
  report.identity = identity;
  const plan = { ...options, identity, repoRoot: root, runId: crypto.randomUUID(), extensionPath: path.join(root, 'vscode-sparkdown'), result: path.join(runDir, 'host.json'), events: path.join(runDir, 'events.jsonl') };
  const planFile = path.join(runDir, 'plan.json');
  fs.writeFileSync(planFile, JSON.stringify(plan));
  const consoleLines = [], hostLines = [];
  let app, closing = false;
  const owned = launched => {
    app = launched;
    const child = app.process();
    report.process = { pid: child.pid, executableSha256: hash(options.code) };
    const capture = chunk => {
      hostLines.push(chunk.toString());
      if (!closing) report.crash ??= nativeHostCrash(hostLines.join(''));
    };
    child.stdout.on('data', capture); child.stderr.on('data', capture);
    child.once('exit', (code, signal) => { report.process.exit = { code, signal }; if (!closing) report.crash = 'process exited before completion: ' + code + '/' + signal; persist(); });
    persist();
  };
  try {
    if (options.scenario === 'full-build') {
      checkBuild({ ...liveDeps, repoRoot: root, extDir: path.join(root, 'vscode-sparkdown'), packagesDir: path.join(root, 'packages'), die: message => { throw new Error(message); } });
      if (before.failed.length) throw new Error(before.failed.join('\n'));
    } else if (before.artifacts.length) throw new Error('F5 scenario requires absent generated outputs in a fresh dedicated checkout; do not delete active builds or prebuild');
    const launch = { executablePath: options.code, cwd: root, timeout: options.timeoutMs, args: ['--new-window', '--user-data-dir=' + profile, '--extensions-dir=' + extensions, '--skip-welcome', '--skip-release-notes', ...(options.scenario === 'full-build' ? ['--extensionDevelopmentPath=' + plan.extensionPath, options.project] : [root])], env: { ...process.env, IMPOWER_VSCODE_PROBE_PLAN: planFile } };
    if (options.automation === 'cdp') {
      report.cdp = {};
      app = await launchOwnedCdp(launch, { ...deps.cdp, record: report.cdp, persist, onOwned: owned });
    } else {
      const electron = deps.electron ?? (await import('playwright'))._electron;
      owned(await electron.launch(launch));
    }
    const attach = page => {
      page.on('console', msg => consoleLines.push(consoleLine(msg)));
      page.on('pageerror', error => consoleLines.push('[pageerror] ' + error.message));
      page.on('crash', () => { report.crash = 'renderer crashed'; });
      page.on('requestfailed', request => { if (/vscode-webview|vscode-resource/.test(request.url())) consoleLines.push('[error] webview resource ' + request.url() + ': ' + request.failure()?.errorText); });
    };
    app.on('window', attach);
    const parent = await app.firstWindow({ timeout: options.timeoutMs });
    attach(parent);
    await parent.locator('.monaco-workbench').waitFor({ timeout: options.timeoutMs });
    report.parent = { workbench: 'verified' };
    if (options.scenario === 'f5') {
      const readyBy = Date.now() + options.timeoutMs;
      const ready = () => fs.existsSync(plan.events) && f5Ready(fs.readFileSync(plan.events, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)), root);
      while (!ready() && Date.now() < readyBy && !report.crash) await sleep(200);
      if (!ready()) throw new Error('F5 parent helper did not activate its task subscriptions for this repository');
      await parent.keyboard.press('F5');
      await parent.screenshot({ path: path.join(runDir, 'f5-trigger.png') });
      await sleep(2000);
      if (!fs.readFileSync(plan.events, 'utf8').includes('task-start')) {
        await palette(parent, 'Impower Verification: Start Committed F5 Configuration');
        report.f5.namedLaunchFallback = 'vscode.debug.startDebugging(workspace, Launch vscode-sparkdown), retaining committed preLaunchTask';
      }
      report.f5.trigger = 'F5 in impower with committed .vscode/launch.json and preLaunchTask';
    }
    const deadline = Date.now() + options.timeoutMs;
    while (!fs.existsSync(plan.result) && Date.now() < deadline && !report.crash) await sleep(250);
    if (!fs.existsSync(plan.result)) {
      if (fs.existsSync(plan.result + '.progress')) report.host = JSON.parse(fs.readFileSync(plan.result + '.progress', 'utf8'));
      if (report.host && report.host.runId !== plan.runId) { delete report.host; throw new Error('Host progress belongs to a different run'); }
      if (report.host?.document) report.surfaces.lsp = 'failed';
      throw new Error('Timed out awaiting final development host evidence; partial host identity is retained when available');
    }
    report.host = JSON.parse(fs.readFileSync(plan.result, 'utf8'));
    if (report.host.runId !== plan.runId) throw new Error('Host report belongs to a different run');
    report.surfaces.desktop = desktopIdentityFailures(report.host, options).length ? 'failed' : 'verified';
    report.failed.push(...(report.host.failed ?? []));
    report.build = artifactEvidence(root);
    if (report.host.loadedBuild?.extension !== report.build.artifacts.find(a => a.file.endsWith('extension.js'))?.sha256) report.failed.push('Loaded extension fingerprint differs from final artifact provenance');
    report.surfaces.lsp = report.host.failed?.length || diagnosticFailures(report.host.diagnostics, expectedDiagnostics, options.project).length ? 'failed' : 'verified';
    const pages = app.windows();
    report.frames = pages.flatMap(page => page.frames().filter(frame => frame !== page.mainFrame()).map(frame => ({ url: frame.url(), parent: frame.parentFrame()?.url() })));
    let visible;
    for (const page of pages) {
      try { visible = { page, ...await storyFrame(page, options.firstText, options.timeoutMs) }; break; } catch { /* try the development-host window */ }
    }
    if (!visible) throw new Error('Game Preview did not render the known initial scene');
    const initialShot = path.join(runDir, 'preview-before.png'), afterShot = path.join(runDir, 'preview-after.png');
    await visible.page.screenshot({ path: initialShot });
    report.preview = { initial: options.firstText, frame: visible.frame.url(), screenshot: initialShot, pixelsInspected: false };
    // RUN is the real player control. Then advance the rendered first beat.
    let started = false;
    for (const frame of visible.page.frames().filter(frame => frame !== visible.page.mainFrame())) {
      const run = frame.locator('#play-button').first();
      if (await run.isVisible().catch(() => false)) { await run.click(); await run.waitFor({ state: 'hidden', timeout: options.timeoutMs }); started = true; break; }
    }
    if (!started) throw new Error('Game Preview RUN control did not appear');
    const playing = await storyFrame(visible.page, options.firstText, options.timeoutMs);
    const input = await advancePlayer(visible.page, playing.frame, options.nextText, options.timeoutMs, { firstText: options.firstText, onAttempt: (attempt, attempts) => { report.preview.inputAttempt = attempt; report.preview.inputAttempts = [...attempts]; persist(); } });
    await visible.page.screenshot({ path: path.join(runDir, 'interaction-attempt.png') });
    await visible.page.screenshot({ path: afterShot });
    Object.assign(report.preview, { interaction: { action: 'RUN readiness, then bounded physical pointer input with a goal wait after every click', clicks: input.attempts.length, result: input.result }, afterScreenshot: afterShot });
    report.surfaces.preview = 'verified';
  } catch (error) {
    report.failed.push(error.stack ?? error.message);
    if (/timed out|Timeout/i.test(error.message)) report.timeout = error.message;
    if (report.parent?.workbench === 'verified') {
      report.surfaces.desktop = desktopIdentityFailures(report.host, options).length ? 'failed' : 'verified';
      report.surfaces.preview = 'failed';
    }
  } finally {
    report.build = artifactEvidence(root);
    if (app) {
      for (const page of app.windows()) await page.screenshot({ path: path.join(runDir, 'host-' + app.windows().indexOf(page) + '.png') }).catch(() => {});
      if (options.scenario === 'f5') {
        try {
          await palette(app.windows()[0], 'Impower Verification: Stop Owned Tasks');
          const deadline = Date.now() + 15000;
          while (!fs.existsSync(plan.events + '.stopped') && Date.now() < deadline) await sleep(200);
          if (!fs.existsSync(plan.events + '.stopped')) throw new Error('Task exit evidence did not arrive');
        } catch (error) { report.failed.push('Owned F5 task cleanup could not be confirmed: ' + error.message); }
      }
      report.preShutdownNativeCrash = nativeHostCrash(hostLines.join(''));
      closing = true;
      report.shutdownStartedAt = new Date().toISOString(); persist();
      const shutdownOffset = hostLines.join('').length;
      await app.close().catch(error => report.failed.push('Owned host cleanup failed: ' + error.message));
      if (!report.process?.exit) report.failed.push('Owned desktop process exit was not confirmed');
      report.shutdownNativeExits = hostLines.join('').slice(shutdownOffset).split(/\r?\n/).filter(line => /Extension host with pid \d+ exited with code:/.test(line));
    }
    if (report.preShutdownNativeCrash) report.crash ??= report.preShutdownNativeCrash;
    if (report.crash) report.surfaces.desktop = 'failed';
    fs.writeFileSync(path.join(runDir, 'host-process.log'), hostLines.join(''));
    fs.writeFileSync(path.join(runDir, 'renderer.log'), consoleLines.join('\n'));
    const captured = partitionConsole(consoleLines, [...WORKBENCH_CONSOLE_NOISE, ...DESKTOP_CONSOLE_NOISE], 100);
    report.consoleErrors = captured.errors;
    report.consoleNoise = captured.noise;
    if (options.scenario === 'f5') report.f5.taskEvents = fs.existsSync(plan.events) ? fs.readFileSync(plan.events, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
    report.logs = { host: path.join(runDir, 'host-process.log'), renderer: path.join(runDir, 'renderer.log'), extensionHostAndLsp: path.join(profile, 'logs') };
    report.failed = desktopFailures(report, options);
    report.verdict = report.failed.length ? 'failed' : 'verified';
    report.complete = true;
    persist();
  }
  console.log(JSON.stringify(report, null, 2));
  return { report, exitCode: report.failed.length ? 1 : 0 };
}

export async function webDebug(args, deps = liveDeps) {
  const { opts, error } = parseFlags(args, { '--file': 'value', '--shot': 'value', '--first': 'value', '--evaluate': 'value', '--value': 'value', '--breakpoint': 'number' });
  if (error) throw new Error('debug: ' + error);
  if (!opts['--shot']) throw new Error('debug requires --shot for pixel inspection');
  if (opts['--breakpoint'] !== undefined && (!Number.isSafeInteger(opts['--breakpoint']) || opts['--breakpoint'] < 1)) throw new Error('--breakpoint requires a positive one-based source line');
  const state = deps.readState();
  if (!state?.url || !(await deps.recordStands(state)) || !(await deps.isUp(state.url))) throw new Error('No owned web workbench; run up first');
  deps.checkBuild();
  const build = artifactEvidence(root);
  if (build.failed.length) throw new Error(build.failed.join('\n'));
  const report = { surface: 'web-workbench', file: opts['--file'] ?? 'main.sd', build, failed: [], breakpoint: { status: 'unverified', reason: 'This probe uses stopOnEntry and awaiting-interaction pauses; it does not establish breakpoint binding. Earlier builds mapped vscode-test-web sources to file URIs. A breakpoint scenario needs its own verified stop.' } };
  const firstText = opts['--first'] ?? 'The first line.';
  await deps.withWorkbench(state.url, { headless: true }, async ({ page, consoleLines }) => {
    try {
      await page.locator('.monaco-workbench').waitFor({ timeout: 120000 });
      await openFile(page, report.file, report, error => report.failed.push(error));
      if (!report.opened) throw new Error('Requested debugger script did not open');
      if (opts['--breakpoint']) {
        const number = page.locator('.margin-view-overlays .line-numbers').filter({ hasText: new RegExp('^' + opts['--breakpoint'] + '$') }).first();
        await number.waitFor({ timeout: 15000 });
        const box = await number.boundingBox();
        if (!box) throw new Error('Requested breakpoint line is not rendered');
        await page.mouse.click(box.x - 12, box.y + box.height / 2);
        report.breakpoint = { status: 'unverified', line: opts['--breakpoint'], trigger: 'physical click in the source gutter' };
      }
      await palette(page, 'Preview Game');
      await storyFrame(page, firstText, 60000);
      const rendered = page.locator('.view-line');
      const line = await rendered.evaluateAll((elements, text) => elements.findIndex(element => element.textContent.replaceAll('\u00a0', ' ').includes(text)), firstText);
      if (line < 0) throw new Error('Known story text is not visible in the source editor');
      await rendered.nth(line).click();
      await sleep(250);
      await palette(page, 'Sparkdown Debugger: Run & Debug Game');
      await page.locator('.debug-toolbar').waitFor({ timeout: 60000 });
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+D' : 'Control+Shift+D');
      await page.getByText('Variables', { exact: true }).first().waitFor({ timeout: 60000 });
      const player = await storyFrame(page, firstText, 15000);
      const pointer = await playerPointer(player.frame.locator('canvas').last(), 15000);
      await page.mouse.click(pointer.x, pointer.y);
      await sleep(400);
      await page.mouse.click(pointer.x, pointer.y);
      report.pauseTrigger = 'Run & Debug Game, then real player input to awaiting-interaction pause';
      const stack = page.locator('.debug-call-stack .monaco-list-row');
      const deadline = Date.now() + 60000;
      while (!(await stack.allTextContents()).some(text => text.includes(report.file)) && Date.now() < deadline) await sleep(200);
      report.callStack = await stack.allTextContents();
      if (!report.callStack.some(text => text.includes(report.file))) throw new Error('Debugger did not pause with a source frame');
      report.paused = true;
      const variables = page.locator('.debug-variables [aria-label="Scope Vars"]');
      await variables.waitFor({ timeout: 15000 });
      if (await variables.getAttribute('aria-expanded') === 'false') await variables.locator('.monaco-tl-twistie').click();
      await page.locator('.debug-variables .value').first().waitFor({ timeout: 15000 });
      report.variables = await page.locator('.debug-variables .monaco-list-row').allTextContents();
      if (!report.variables.length) throw new Error('Variables pane contains no values');
      await page.screenshot({ path: opts['--shot'] });
      report.screenshot = path.resolve(opts['--shot']);
      await page.keyboard.press('F10');
      const stepBy = Date.now() + 15000;
      while (JSON.stringify(await stack.allTextContents()) === JSON.stringify(report.callStack) && Date.now() < stepBy) await sleep(200);
      report.step = await stack.allTextContents();
      if (JSON.stringify(report.step) === JSON.stringify(report.callStack) || !report.step.length) throw new Error('Step did not move the paused stack');
      await palette(page, 'Focus on Debug Console');
      // Current Monaco uses EditContext and a readonly IME textarea. Send
      // real keyboard input to the console focus established by its command.
      await page.keyboard.type(opts['--evaluate'] ?? 'mood');
      await page.keyboard.press('Enter');
      const value = opts['--value'] ?? '0';
      await page.locator('.repl').getByText(value, { exact: true }).last().waitFor({ timeout: 15000 });
      report.evaluation = { expression: opts['--evaluate'] ?? 'mood', value };
      await page.keyboard.press('F5');
      const continuedBy = Date.now() + 15000;
      while (JSON.stringify(await stack.allTextContents()) === JSON.stringify(report.step) && Date.now() < continuedBy) await sleep(200);
      report.continue = await stack.allTextContents();
      if (JSON.stringify(report.continue) === JSON.stringify(report.step)) throw new Error('Continue left the stack unchanged');
      await page.screenshot({ path: opts['--shot'] + '.continued.png' });
      if (opts['--breakpoint']) {
        report.breakpoint.rows = await page.locator('.debug-breakpoints .monaco-list-row').allTextContents();
        await page.keyboard.press('F5');
        await page.locator('.call-stack-state-message').filter({ hasText: /breakpoint/i }).waitFor({ timeout: 15000 });
        const frames = await stack.allTextContents();
        if (!frames.some(frame => frame.includes(report.file) && frame.includes(String(opts['--breakpoint'])))) throw new Error('Breakpoint pause did not identify the requested source line');
        Object.assign(report.breakpoint, { status: 'verified', reason: 'Paused on breakpoint at the requested source line', callStack: frames });
        await page.screenshot({ path: opts['--shot'] + '.breakpoint.png' });
      }
    } catch (error) { report.failed.push(error.stack ?? error.message); }
    const captured = partitionConsole(consoleLines, WORKBENCH_CONSOLE_NOISE, 100);
    report.consoleErrors = captured.errors;
    report.consoleNoise = captured.noise;
    report.failed.push(...captured.errors.map(error => 'Unclassified console error: ' + error));
    await page.screenshot({ path: opts['--shot'] + '.final.png' }).catch(() => {});
  });
  report.debugger = report.paused && report.variables?.length && report.step?.length && report.evaluation && report.continue?.length ? 'verified' : 'failed';
  report.verdict = report.failed.length ? 'failed' : 'verified';
  deps.log(JSON.stringify(report, null, 2));
  return { report, exitCode: report.failed.length ? 1 : 0 };
}
