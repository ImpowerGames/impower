import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { spawnDetached } from "../../../scripts/detached-launch.mjs";
import { checkBuild, liveDeps, parseFlags, buildRule } from "./driver.mjs";
import { connectCDP } from "./cdp.mjs";
import { processStartedMs, pidAlive, stopLinuxTree } from "../drive-web-editor/driver.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const sha = data => createHash("sha256").update(data).digest("hex");
const readJson = file => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; } };
const files = dir => fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]) : [];

// These exact messages come from VS Code's bundled Copilot proposal metadata,
// even with Copilot disabled. A changed message/version remains a failure.
export function classifyRuntimeErrors(errors, version) {
  const known = new Set([
    "31c71b74177b9336e5e354733a837c043e8a6ff2607ceb05e8baeb4a57952493",
    "18c29dc5005de398295c54f2de68f73e81f0b3f46d3112a2e77d2f4f5c025bde",
  ]);
  const jsDebug = new Set([
    "9bcae2997bddf4f5218482494baa9370f6bd0728e2019395e447e67722202e4b",
    "8f30347620adf6b6b4f0ba8a87480fc544089385d39012ea715ba40e55b3b77c",
  ]);
  const classify = error => version !== "1.140.0" ? null
    : known.has(sha(error)) ? "vscode1140BundledCopilotProposals"
    : jsDebug.has(sha(error.replace(/node:[0-9]+/g, "node:PID"))) ? "vscode1140JsDebugUrlParseDeprecation" : null;
  return {
    noise: errors.filter(e => classify(e.error)).map(e => ({ ...e, classification: classify(e.error) })),
    unexpected: errors.filter(e => !classify(e.error)),
  };
}

export function diagnosticFailures(actual, expected, project) {
  const normalize = d => {
    const relative = path.relative(project, path.resolve(project, d.file)).replaceAll("\\", "/");
    return { file: process.platform === "win32" ? relative.toLowerCase() : relative, message: d.message, severity: d.severity, source: d.source, ...(d.line == null ? {} : { line: d.line }) };
  };
  const remaining = actual.map(normalize);
  const missing = [];
  for (const expectation of expected) {
    const e = normalize(expectation);
    const index = remaining.findIndex(d => Object.entries(e).every(([k, v]) => d[k] === v));
    if (index < 0) missing.push(e); else remaining.splice(index, 1);
  }
  return { unexpected: remaining, missing };
}

export function lspHealth(log) {
  const failed = log.split(/\r?\n/).filter(line => /Request .* failed|Request failed:|server.*(?:crashed|stopped|exited)|Starting server failed|Error:.*importScripts/i.test(line));
  const semanticResponses = [...log.matchAll(/Received response 'textDocument\/semanticTokens\/(full|range)[^\n]*/g)].map(m => ({ method: m[1], failed: /Request failed:/.test(m[0]) }));
  return { failed, semanticResponses };
}

export function hostCrashes(log) {
  return log.split(/\r?\n/).filter(line => /Extension host.*(?:crashed|exited with code: (?!0(?:,|$)))|UtilityProcess.*reason 'crashed'/i.test(line));
}

export function scriptProvenance(url, source, checkout, io = fs) {
  const relative = ["extension.js", "workers/sparkdown-language-server.js", "webviews/game-webview.js"].find(p => url.split("#")[0].endsWith("/" + p));
  if (!relative) return null;
  const artifact = path.join(checkout, "vscode-sparkdown/out", relative);
  const loaded = sha(source);
  const normalizePath = value => process.platform === "win32" ? value.toLowerCase() : value;
  const expectedPath = artifact.replaceAll("\\", "/");
  const loadedPath = decodeURIComponent(new URL(url).pathname);
  const fromCheckout = normalizePath(loadedPath) === normalizePath(expectedPath.startsWith("/") ? expectedPath : "/" + expectedPath);
  const disk = io.readFileSync(artifact, "utf8");
  // VS Code's web worker host loads CommonJS through new Function. CDP
  // includes this exact host wrapper and sourceURL around the original bytes.
  const wrapped = `(function anonymous(module,exports,require\n) {\n${disk}\n//# sourceURL=${url}\n})`;
  return { url, artifact, sha256: loaded, artifactSha256: sha(disk), bytes: Buffer.byteLength(source), matches: fromCheckout && (loaded === sha(disk) || relative === "extension.js" && loaded === sha(wrapped)) };
}

export async function pollUntil(read, why, { timeout, exited = () => false, interval = 500 }) {
  const deadline = Date.now() + timeout;
  for (;;) {
    if (exited()) throw new Error("Owned desktop process exited");
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error(why);
    let timer;
    let value;
    try {
      value = await Promise.race([
        Promise.resolve().then(read),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(why)), remaining); }),
      ]);
    } finally { clearTimeout(timer); }
    if (value) return value;
    await sleep(Math.min(interval, Math.max(0, deadline - Date.now())));
  }
}

export async function stopDesktop(owner, {
  alive = pidAlive, started = processStartedMs, platform = process.platform,
  stopWindows = pid => execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true, stdio: "pipe" }),
  stopLinux = stopLinuxTree, timeout = 10000,
} = {}) {
  if (!owner?.pid || !owner.startedMs) throw new Error("Desktop ownership was not established");
  if (!alive(owner.pid)) throw new Error("Desktop exited before owned-tree shutdown; descendant shutdown is unverified");
  if (await started(owner.pid) !== owner.startedMs) throw new Error("Desktop PID identity changed; refusing to stop it");
  if (platform === "win32") stopWindows(owner.pid);
  else if (platform === "linux") await stopLinux(owner.pid);
  else throw new Error(`Desktop shutdown is unsupported on ${platform}`);
  await pollUntil(() => !alive(owner.pid), "Owned desktop process did not exit after shutdown", { timeout, interval: 50 });
}

export function validateScenario(spec) {
  if (!spec || typeof spec.file !== "string" || !Array.isArray(spec.expectedDiagnostics)) throw new Error("Scenario needs file and expectedDiagnostics (an explicit array)");
  if (!spec.preview?.text || !Array.isArray(spec.preview.steps) || !spec.preview.steps.length) throw new Error("Scenario needs preview.text and at least one preview interaction step");
  for (const d of spec.expectedDiagnostics) if (!["file", "message", "severity", "source"].every(k => typeof d[k] === "string")) throw new Error("Expected diagnostics need file, message, severity and source");
  for (const s of spec.preview.steps) if (!(s.selector || s.textButton) || !s.text) throw new Error("Each preview step needs a selector or textButton and resulting text");
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

export async function command(page, title, id) {
  const deadline = Date.now() + 60000;
  for (;;) {
    await page.keyboard.press("Escape");
    // Reopen the palette while extensions register their commands: an already
    // open command list is a snapshot and does not gain late contributions.
    await page.locator(".part.statusbar").click({ position: { x: 200, y: 10 }, timeout: 10000 });
    await page.keyboard.press("F1");
    await page.locator(".quick-input-widget input").fill(">" + title);
    const row = id ? page.locator(`[data-quick-input-id="${id}"]`) : page.locator(".quick-input-widget .monaco-list-row").filter({ hasText: title }).first();
    if (await row.isVisible()) { await row.click(); break; }
    if (Date.now() >= deadline) throw new Error(`Workbench command unavailable: ${id ?? title}`);
    await sleep(500);
  }
  await page.locator(".quick-input-widget").waitFor({ state: "hidden", timeout: 10000 });
}

export async function ensurePreviewVisible(page, reveal = () => command(page, "Sparkdown: Preview Game", "sparkdown.previewGame")) {
  const frame = page.locator("iframe.webview");
  const tab = page.getByRole("tab", { name: /^Game Preview/ }).first();
  // Debugger navigation into an included script can cover the preview tab.
  // Revealing the existing panel preserves its running game and context.
  if (await tab.getAttribute("aria-selected") !== "true" || !await frame.isVisible()) await reveal();
  return await tab.getAttribute("aria-selected") === "true" && await frame.isVisible();
}

// Runs in the webview's outer document. Its active frame owns the actual
// extension content; never count hidden text or a mounted empty panel as ready.
export function previewRead(step) {
  const frame = document.getElementById("active-frame");
  const d = frame?.contentDocument;
  if (!d?.querySelector("spark-web-player")) return null;
  const w = d.defaultView;
  const visible = el => {
    if (!el || !el.getBoundingClientRect().width || !el.getBoundingClientRect().height) return false;
    for (let p = el; p; p = p.parentElement) {
      const style = w.getComputedStyle(p);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
    }
    return true;
  };
  const leafText = [...d.querySelectorAll("#game span, #game .text")].filter(el => visible(el) && !el.querySelector("span, .text")).map(el => el.textContent).join("");
  let element;
  if (step?.selector) element = d.querySelector(step.selector);
  if (step?.textButton) element = [...d.querySelectorAll(".choice, button, [role=button]")].find(el => visible(el) && el.textContent.trim() === step.textButton);
  const box = element?.getBoundingClientRect();
  return {
    visible: visible(d.querySelector("spark-web-player")), text: leafText,
    playing: d.querySelector("#play-button")?.style?.display === "none",
    bodyText: d.body.innerText, bodyClass: d.body.className,
    target: box && visible(element) ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : null,
    images: [...d.images].filter(visible).map(img => ({ src: img.src, width: img.getBoundingClientRect().width, height: img.getBoundingClientRect().height, loaded: img.complete && img.naturalWidth > 0 })),
  };
}

export async function desktop(args) {
  if (!["win32", "linux"].includes(process.platform)) throw new Error("Desktop scenarios require Windows or Linux process ownership support");
  const { opts, error } = parseFlags(args, { "--code": "value", "--project": "value", "--scenario": "value", "--mode": "value", "--out": "value", "--timeout": "value" });
  const mode = opts["--mode"];
  if (error || !opts["--code"] || !["full", "f5"].includes(mode)) throw new Error(error ?? "desktop requires --code <executable> --mode full|f5; full uses an existing full build, f5 presses F5 in the checkout");
  const project = path.resolve(opts["--project"] ?? path.join(here, "fixtures/desktop"));
  const spec = readJson(path.resolve(opts["--scenario"] ?? path.join(here, "fixtures/desktop/scenario.json")));
  validateScenario(spec);
  if (!fs.statSync(project).isDirectory() || !fs.statSync(path.resolve(project, spec.file)).isFile()) throw new Error("Project or scenario script is missing");
  const evidence = opts["--out"] ? path.resolve(opts["--out"]) : fs.mkdtempSync(path.join(os.tmpdir(), "impower-desktop-"));
  if (fs.existsSync(path.join(evidence, "scenario.json"))) throw new Error(`Evidence directory already used: ${evidence}`);
  fs.mkdirSync(evidence, { recursive: true });
  const report = { mode, project, file: spec.file, executable: path.resolve(opts["--code"]), evidence, failed: [], unavailable: [] };
  const buildDeps = { ...liveDeps, surface: "desktop", die: message => { throw new Error(message); } };
  let browser, wire, child, exited = false;
  const targets = new Map(), runtimeErrors = [], scripts = [];
  const timeout = Number(opts["--timeout"] ?? 180) * 1000;
  if (!Number.isFinite(timeout) || timeout < 1000 || timeout > 600000) throw new Error("--timeout must be 1–600 seconds");
  const wait = (read, why, budget = timeout) => pollUntil(read, why, { timeout: budget, exited: () => exited });
  try {
    if (mode === "full") report.build = checkBuild(buildDeps);
    const profile = path.join(evidence, "profile");
    const extensions = path.join(evidence, "extensions");
    fs.mkdirSync(path.join(profile, "User"), { recursive: true });
    fs.mkdirSync(extensions, { recursive: true });
    fs.cpSync(path.join(here, "desktop-harness"), path.join(extensions, "impower-testing.impower-desktop-driver-1.0.0"), { recursive: true });
    fs.writeFileSync(path.join(profile, "User", "settings.json"), JSON.stringify({
      "security.workspace.trust.enabled": false, "workbench.startupEditor": "none",
      "workbench.enableExperiments": false, "telemetry.telemetryLevel": "off", "update.mode": "none",
      "extensions.autoUpdate": "off", "window.restoreWindows": "none", "files.simpleDialog.enable": true,
      "extensions.ignoreRecommendations": true,
      "debug.saveBeforeStart": "none",
      "chat.disableAIFeatures": true, "workbench.secondarySideBar.defaultVisibility": "hidden",
      "sparkdown-language-server.trace.server": "verbose", "git.enabled": false,
      ...spec.settings,
    }, null, 2));
    const scenarioPath = path.join(evidence, "scenario.json");
    fs.writeFileSync(scenarioPath, JSON.stringify({ ...spec, project, evidence, mode }, null, 2));
    const port = await freePort();
    const endpoint = `http://127.0.0.1:${port}`;
    const hostLog = fs.openSync(path.join(evidence, "desktop.log"), "a");
    child = spawnDetached(report.executable, [mode === "f5" ? root : project,
      ...(mode === "full" ? [`--extensionDevelopmentPath=${path.join(root, "vscode-sparkdown")}`] : []),
      "--new-window", "--user-data-dir", profile, "--extensions-dir", extensions,
      `--remote-debugging-port=${port}`, "--disable-updates", "--disable-workspace-trust",
      "--disable-extension", "github.copilot", "--disable-extension", "github.copilot-chat",
    ], { cwd: root, env: { ...process.env, IMPOWER_DESKTOP_SCENARIO: scenarioPath }, stdio: ["ignore", hostLog, hostLog] });
    fs.closeSync(hostLog);
    child.once("exit", () => { exited = true; });
    child.once("error", e => { report.failed.push(e.message); exited = true; });
    report.owner = { pid: child.pid, startedMs: await processStartedMs(child.pid), profile, extensions, port };
    if (!report.owner.startedMs) throw new Error("Cannot establish desktop process identity");
    fs.writeFileSync(path.join(evidence, "owner.json"), JSON.stringify(report.owner));
    await wait(async () => { try { return (await fetch(`${endpoint}/json/version`, { signal: AbortSignal.timeout(1500) })).ok; } catch { return false; } }, "Desktop debugger endpoint never opened");
    wire = await connectCDP(endpoint);
    wire.on(e => {
      if (e.method === "Runtime.exceptionThrown") runtimeErrors.push({ target: e.sessionId, error: e.params.exceptionDetails.exception?.description ?? e.params.exceptionDetails.text });
      if (e.method === "Runtime.consoleAPICalled" && e.params.type === "error") runtimeErrors.push({ target: e.sessionId, error: e.params.args.map(a => a.value ?? a.description ?? a.type).join(" ") });
      if (e.method === "Debugger.scriptParsed" && /(?:extension\.js|game-webview\.js|sparkdown-language-server\.js)/.test(e.params.url)) scripts.push({ target: e.sessionId, ...e.params });
    });
    const observe = async () => {
      const { targetInfos } = await wire.send("Target.getTargets");
      for (const id of targets.keys()) if (!targetInfos.some(t => t.targetId === id)) targets.delete(id);
      for (const target of targetInfos.filter(t => ["page", "iframe", "worker"].includes(t.type))) {
        if (targets.has(target.targetId)) continue;
        try {
          const { sessionId } = await wire.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
          targets.set(target.targetId, { ...target, sessionId });
          await wire.send("Runtime.enable", {}, sessionId);
          await wire.send("Debugger.enable", {}, sessionId);
          await wire.send("Runtime.runIfWaitingForDebugger", {}, sessionId);
        } catch (error) {
          const current = await wire.send("Target.getTargets");
          if (current.targetInfos.some(t => t.targetId === target.targetId)) throw error;
          targets.delete(target.targetId); // A short-lived worker ended during attachment.
        }
      }
    };
    const { chromium } = await import("playwright");
    browser = await chromium.connectOverCDP(endpoint);
    for (const context of browser.contexts()) context.setDefaultTimeout(30000);
    let page = await wait(() => browser.contexts().flatMap(c => c.pages()).find(p => p.url().includes("workbench")), "No desktop workbench");
    await page.waitForSelector(".monaco-workbench", { timeout });
    console.log(`desktop: ${mode} workbench opened; evidence ${evidence}`);
    await observe();
    for (const label of ["Continue without Signing In", "Get Started"]) {
      const button = page.getByText(label, { exact: true });
      if (await button.isVisible().catch(() => false)) await button.click();
    }
    if (mode === "f5") {
      await command(page, "View: Run and Debug", "workbench.view.debug");
      await page.getByText("Launch vscode-sparkdown", { exact: true }).waitFor({ timeout: 30000 });
      // Invoke F5's command after command registration; an early synthetic
      // key can be consumed while the Run and Debug view is still loading.
      await command(page, "Debug: Start Debugging", "workbench.action.debug.start");
      console.log("desktop: waiting for the F5 task and development host");
      page = await wait(async () => {
        for (const p of browser.contexts().flatMap(c => c.pages())) if ((await p.title()).includes("Extension Development Host")) return p;
      }, "F5 never opened an Extension Development Host");
      await page.waitForSelector(".monaco-workbench", { timeout });
      report.build = checkBuild(buildDeps);
      report.launch = readJson(path.join(evidence, "launch-report.json"));
      if (report.launch?.preLaunchTask !== "F5: watch" || !report.launch.args.includes(project)) throw new Error("F5 did not resolve the checked-in task and requested project");
      console.log("desktop: F5 built the runtime and opened the scenario project");
    }
    await command(page, "Impower Driver: Run Scenario", "impower.driver.run");
    report.host = await wait(async () => { await observe(); return readJson(path.join(evidence, "host-report.json")); }, "Language/preview command harness timed out");
    console.log("desktop: language checks complete; waiting for Game Preview");
    report.failed.push(...report.host.failed);
    if (report.host.extension?.path && path.resolve(report.host.extension.path).toLowerCase() !== path.join(root, "vscode-sparkdown").toLowerCase()) report.failed.push("The host loaded a different extension checkout");
    if (!report.host.workspace?.some(p => path.resolve(p).toLowerCase() === project.toLowerCase())) report.failed.push("The host opened a different workspace root");
    report.diagnostics = diagnosticFailures(report.host.diagnostics ?? [], spec.expectedDiagnostics, project);
    if (report.diagnostics.unexpected.length || report.diagnostics.missing.length) report.failed.push("Diagnostics differ from scenario expectations");
    const target = await wait(async () => { await observe(); return [...targets.values()].find(t => t.type === "iframe" && t.url.includes("extensionId=impowergames.sparkdown")); }, "Game Preview webview never opened");
    const readPreview = async step => {
      if (!await ensurePreviewVisible(page)) return null;
      const result = await wire.send("Runtime.evaluate", { expression: `(${previewRead.toString()})(${JSON.stringify(step ?? null)})`, returnByValue: true }, target.sessionId, timeout);
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
      return result.result.value;
    };
    report.preview = { steps: [] };
    const textVisible = async text => {
      const state = await readPreview();
      report.preview.last = state;
      return state?.visible && state.text?.includes(text) ? state : null;
    };
    await wait(() => textVisible(spec.preview.text), `Game Preview never displayed expected text: ${spec.preview.text}`);
    await page.screenshot({ path: path.join(evidence, "preview.png") });
    for (const step of spec.preview.steps) {
      const bounds = await page.locator("iframe.webview").boundingBox();
      if (bounds) await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      const state = await wait(async () => { const s = await readPreview(step); return s?.target ? s : null; }, `Preview control unavailable: ${step.selector ?? step.textButton}`);
      const outer = await page.locator("iframe.webview").boundingBox();
      if (!outer) throw new Error("Preview iframe has no visible bounds");
      if (step.selector === "#play-button") await page.screenshot({ path: path.join(evidence, "run-control.png") });
      await page.mouse.click(outer.x + state.target.x, outer.y + state.target.y);
      if (step.selector === "#play-button") await wait(async () => (await readPreview())?.playing, "RUN never entered playback");
      if (step.textButton) await wait(async () => !(await readPreview(step))?.target, "Choice did not advance");
      const after = await wait(() => textVisible(step.text), `Preview interaction never displayed: ${step.text}`);
      report.preview.steps.push({ action: step.selector ?? step.textButton, after });
      await page.screenshot({ path: path.join(evidence, `preview-step-${report.preview.steps.length}.png`) });
    }
    if (spec.debug) {
      await command(page, "Impower Driver: Verify Debugger", "impower.driver.debug");
      report.debug = await wait(() => readJson(path.join(evidence, "debug-report.json")), "Debugger verification timed out");
      report.failed.push(...report.debug.failed);
      await page.screenshot({ path: path.join(evidence, "debug.png") });
    }
    await command(page, "Impower Driver: Read Final Diagnostics", "impower.driver.diagnostics");
    report.finalDiagnostics = await wait(() => readJson(path.join(evidence, "diagnostics-report.json")), "Final diagnostics timed out");
    report.failed.push(...report.finalDiagnostics.failed);
    const finalDifference = diagnosticFailures(report.finalDiagnostics.diagnostics ?? [], spec.expectedDiagnostics, project);
    report.diagnosticsAfterInteraction = finalDifference;
    if (finalDifference.unexpected.length || finalDifference.missing.length) report.failed.push("Final diagnostics differ from scenario expectations");
    await observe();
  } catch (error) {
    report.failed.push(String(error.stack ?? error));
    if (!browser) report.unavailable.push("Desktop runtime was not reached");
  } finally {
    try {
      report.loadedScripts = [];
      for (const script of scripts) {
        try {
          const { scriptSource } = await wire.send("Debugger.getScriptSource", { scriptId: script.scriptId }, script.target, 5000);
          const provenance = scriptProvenance(script.url, scriptSource, root);
          if (provenance) report.loadedScripts.push(provenance);
        } catch (error) { report.failed.push(`Loaded script evidence unavailable: ${script.url}: ${error.message}`); }
      }
      for (const name of ["extension.js", "game-webview.js", "sparkdown-language-server.js"]) {
        if (!report.loadedScripts.some(s => s.url.includes(name) && s.matches)) report.failed.push(`Loaded ${name} was not verified against this checkout's artifact`);
      }
      if (report.loadedScripts.some(s => !s.matches)) report.failed.push("Loaded script bytes or location differ from this checkout");
      const logFiles = files(path.join(evidence, "profile", "logs"));
      const lspFiles = logFiles.filter(f => /Sparkdown Language Server\.log$/.test(f));
      report.hostCrashes = hostCrashes([...logFiles.filter(f => /(?:main|exthost|renderer)\.log$/.test(f)), path.join(evidence, "desktop.log")].filter(f => fs.existsSync(f)).map(f => fs.readFileSync(f, "utf8")).join("\n"));
      report.failed.push(...report.hostCrashes);
      report.lsp = lspHealth(lspFiles.map(f => fs.readFileSync(f, "utf8")).join("\n"));
      report.logs = { host: logFiles.filter(f => /exthost.*\.log$/.test(f)), lsp: lspFiles, runtime: path.join(evidence, "runtime-errors.json") };
      if (!lspFiles.length) report.failed.push("No language-server log captured");
      report.failed.push(...report.lsp.failed);
      for (const method of ["range", "full"]) if (!report.lsp.semanticResponses.some(r => r.method === method && !r.failed)) report.failed.push(`No successful ${method} semantic-token response in language-server trace`);
      const classified = classifyRuntimeErrors(runtimeErrors, report.host?.version);
      report.consoleNoise = classified.noise.reduce((counts, error) => { counts[error.classification] = (counts[error.classification] ?? 0) + 1; return counts; }, {});
      report.runtimeErrors = classified.unexpected;
      if (classified.unexpected.length) report.failed.push(`${classified.unexpected.length} unclassified runtime errors`);
      fs.writeFileSync(path.join(evidence, "runtime-errors.json"), JSON.stringify(runtimeErrors, null, 2));
      if (browser) {
        for (const [index, page] of browser.contexts().flatMap(c => c.pages()).entries()) await page.screenshot({ path: path.join(evidence, `final-${index}.png`), timeout: 5000 }).catch(() => {});
      }
    } catch (error) { report.failed.push(`Desktop evidence collection failed: ${error.message}`); }
    // Evidence I/O failure must not bypass shutdown of the owned host.
    if (browser) await browser.close().catch(error => report.failed.push(`Desktop browser disconnect failed: ${error.message}`));
    try { wire?.close(); } catch (error) { report.failed.push(`Desktop observer disconnect failed: ${error.message}`); }
    if (child) {
      try {
        await stopDesktop(report.owner);
        report.stopped = true;
      } catch (e) { report.failed.push(`Owned desktop shutdown failed: ${e.message}`); }
    }
    try {
      report.artifacts = buildRule(path.join(root, "vscode-sparkdown"), path.join(root, "packages"), fs, "desktop").filter(g => fs.existsSync(g.artifact)).map(g => ({ path: g.artifact, sha256: sha(fs.readFileSync(g.artifact)) }));
    } catch (error) { report.failed.push(`Disk artifact evidence unavailable: ${error.message}`); }
    fs.writeFileSync(path.join(evidence, "report.json"), JSON.stringify(report, null, 2));
  }
  console.log(JSON.stringify({ report: path.join(evidence, "report.json"), failed: report.failed, unavailable: report.unavailable, stopped: report.stopped }, null, 2));
  return report.failed.length ? 1 : 0;
}
