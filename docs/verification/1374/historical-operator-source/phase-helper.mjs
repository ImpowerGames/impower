import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

// Private phase helper. The coordinating guard supplies a verified immutable
// candidate, owned profile/session and the shared pair's absolute deadline.
const configPath = process.argv[2];
assert.ok(configPath, "pass the parent-reviewed phase config");
const config = JSON.parse(fs.readFileSync(path.resolve(configPath), "utf8"));
assert.ok(["before", "after"].includes(config.phase));
assert.match(config.expectedHead, /^[a-f0-9]{40}$/);
const root = process.cwd();
assert.equal(path.resolve(config.repoRoot), root);
assert.equal(execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), config.expectedHead);
execFileSync("git", ["diff", "--exit-code"], { cwd: root, stdio: "pipe" });
execFileSync("git", ["diff", "--cached", "--exit-code"], { cwd: root, stdio: "pipe" });
assert.equal(process.env.IMPOWER_DRIVER_SESSION, config.session);
assert.equal(path.resolve(process.env.IMPOWER_DRIVER_PROFILE), path.resolve(config.profile));
assert.ok(Number.isFinite(config.deadlineMs) && config.deadlineMs > Date.now());
const output = path.resolve(config.output);
assert.ok(output !== root && !output.startsWith(root + path.sep), "evidence output must be outside the immutable candidate");
assert.equal(fs.existsSync(output), false, "use a fresh output directory");
fs.mkdirSync(output, { recursive: true });
const helpers = await import(pathToFileURL(path.join(root, ".agents/skills/drive-web-editor/driver.mjs")).href);
const sha = value => createHash("sha256").update(value).digest("hex");
assert.ok(Array.isArray(config.sourceHashes) && config.sourceHashes.length >= 5, "freeze every correction path");
const checkSources = () => {
  for (const entry of config.sourceHashes) {
    const sourcePath = path.resolve(root, entry.path);
    assert.ok(sourcePath.startsWith(root + path.sep), "source freeze escaped candidate root");
    if (entry.state === "deleted") assert.equal(fs.existsSync(sourcePath), false, `source deletion changed: ${entry.path}`);
    else assert.equal(sha(fs.readFileSync(sourcePath)), entry.sha256, `source changed: ${entry.path}`);
  }
};
checkSources();
const fixture = name => {
  const entry = config.fixtures[name];
  const content = fs.readFileSync(entry.path);
  assert.equal(sha(content), entry.sha256, `fixture changed: ${name}`);
  return content.toString("utf8");
};
const sources = {
  renameCanonical: fixture("renameCanonical"),
  renameMarked: fixture("renameMarked"),
  extensionMarked: fixture("extensionMarked"),
  attributeCanonical: fixture("attributeCanonical"),
  attributeMarked: fixture("attributeMarked"),
  attributeDefinitions: fixture("attributeDefinitions"),
  attributeSvg: fixture("attributeSvg"),
};
for (const source of Object.values(sources)) assert.equal(source.includes("\r"), false, "qualified fixtures use LF");
assert.equal(sources.renameCanonical, 'define hero as character with name = "ALICE" end\nALICE:\n  Hello.\n');
assert.equal(sources.renameMarked, '& ' + sources.renameCanonical);
assert.equal(sources.extensionMarked, '& define hero as character with name = "ALICE" end\nscene story\nALICE:\n  Hello.\nend\n');
assert.equal(sources.attributeCanonical.startsWith("define party as filtered_image with image = image.mia "), true);
assert.equal(sources.attributeCanonical.includes("include definitions.sd"), false);
assert.equal(sources.attributeMarked, "include definitions.sd\n& " + sources.attributeCanonical);
assert.equal(sources.attributeCanonical.includes('attributes = { "sd" } end'), true);
assert.equal(fs.readFileSync(path.join(config.renameProject, "main.sd"), "utf8"), sources.renameCanonical);
const vscodeProbeEntry = config.fixtures.vscodeProbe;
assert.equal(sha(fs.readFileSync(vscodeProbeEntry.path)), vscodeProbeEntry.sha256);
assert.ok(config.acceptedErrorRecords && Array.isArray(config.acceptedErrorRecords.pageErrors));
assert.ok(Array.isArray(config.acceptedErrorRecords.workbenchErrors));
// The only adjudicated page exception is the initial load request being
// cleared while handleLoadEditor awaits loadFonts. Empty records allow none.
for (const record of config.acceptedErrorRecords.pageErrors) {
  assert.equal(record.message, "Cannot read properties of undefined (reading 'id')");
  assert.ok(typeof record.requiredPath === "string" && record.requiredPath.includes("script-editor/ScriptEditorController"));
  assert.ok(Array.isArray(record.requiredStackIncludes) && record.requiredStackIncludes.includes("handleLoadEditor"));
  assert.ok(record.requiredStackIncludes.length > 0 && record.requiredStackIncludes.every(value => typeof value === "string" && value.length > 0));
  assert.ok(Array.isArray(record.stages) && record.stages.length > 0);
  assert.ok(record.stages.every(value => ["initial-editor-load", "seed-one-file-rename-project"].includes(value)));
  assert.equal(record.maxCount, 1, "at most once in each candidate phase");
  assert.equal(record.pairMaxCount, 2, "at most twice across the two candidate phases");
}
assert.ok(config.acceptedErrorRecords.pageErrors.length <= 1, "do not split the same exception across multiple allowances");
// No workbench exception has a stage/stack-qualified permission in this packet.
assert.deepEqual(config.acceptedErrorRecords.workbenchErrors, []);
for (const [name, content] of [["main.sd", sources.attributeCanonical], ["definitions.sd", sources.attributeDefinitions], ["mia.svg", sources.attributeSvg]]) {
  assert.equal(fs.readFileSync(path.join(config.project, name), "utf8"), content, `project mismatch: ${name}`);
}
const report = {
  phase: config.phase, head: config.expectedHead, started: new Date().toISOString(),
  pid: process.pid, root, configPath: path.resolve(configPath), configSha256: sha(fs.readFileSync(configPath)),
  session: config.session, profile: config.profile, fixtures: config.fixtures,
  sourceHashes: config.sourceHashes,
  acceptedErrorRecords: config.acceptedErrorRecords,
  commands: [], stages: [], buffers: [], pageErrors: [], rename: [], attributes: [], screenshots: [], shutdown: [],
};
const save = () => fs.writeFileSync(path.join(output, "report.json"), JSON.stringify(report, null, 2));
const stage = name => {
  assert.ok(Date.now() < config.deadlineMs, "shared live pair deadline reached");
  const item = { name, at: new Date().toISOString() };
  report.stages.push(item); console.log(`${config.phase}: ${name} ${item.at}`); save();
};
const webDriver = ".agents/skills/drive-web-editor/driver.mjs";
const vsDriver = ".agents/skills/drive-vscode-web/driver.mjs";
async function command(label, driver, args, cleanup = false) {
  if (!cleanup) stage(label);
  const logPath = path.join(output, `${label}.log`);
  const log = fs.createWriteStream(logPath);
  let stdout = "";
  const started = new Date().toISOString();
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [driver, ...args], { cwd: root, env: process.env, windowsHide: true });
    report.commands.push({ label, args, pid: child.pid, started, logPath }); save();
    child.once("error", reject);
    child.stdout.on("data", data => { stdout += data; log.write(data); });
    child.stderr.on("data", data => log.write(data));
    child.once("close", (code, signal) => resolve({ code, signal, pid: child.pid, finished: new Date().toISOString() }));
  });
  await new Promise(resolve => log.end(resolve));
  Object.assign(report.commands.at(-1), result); save();
  assert.equal(result.code, 0, `${label} did not exit0; retained ${logPath}`);
  return stdout;
}
function installObserver() {
  const methods = new Set(["textDocument/prepareRename", "textDocument/rename", "textDocument/completion"]);
  const trace = { documentId: crypto.randomUUID(), label: "initial", events: [], observerErrors: [], overflow: 0, cap: 512 };
  Object.defineProperty(window, "__1374CorrectionTrace", { value: trace, configurable: true });
  const workerIds = new WeakMap();
  const observed = new WeakSet();
  const requests = new Map();
  let serial = 0;
  const emit = event => {
    if (trace.events.length >= trace.cap) { trace.overflow++; return; }
    trace.events.push({ ...event, ordinal: trace.events.length, documentId: trace.documentId, label: trace.label, at: new Date().toISOString(), monotonicMs: performance.now() });
  };
  const record = (data, direction, workerId) => {
    const encoding = typeof data === "string" ? "string" : "plain-object";
    let value = data;
    if (typeof value === "string") { try { value = JSON.parse(value); } catch { return; } }
    if (!value || typeof value !== "object" || value.jsonrpc !== "2.0" || value.id === undefined) return;
    const key = `${workerId}:${JSON.stringify(value.id)}`;
    if (direction === "to-worker" && methods.has(value.method)) {
      requests.set(key, value.method);
      emit({ kind: "request", direction, workerId, encoding, envelope: value });
    } else if (direction === "from-worker" && requests.has(key) && (Object.hasOwn(value, "result") || Object.hasOwn(value, "error"))) {
      emit({ kind: "response", direction, workerId, encoding, method: requests.get(key), envelope: value });
    }
  };
  const original = Worker.prototype.postMessage;
  Worker.prototype.postMessage = function(...args) {
    try {
      if (!workerIds.has(this)) workerIds.set(this, ++serial);
      const id = workerIds.get(this);
      if (!observed.has(this)) {
        observed.add(this);
        this.addEventListener("message", event => {
          try { record(event.data, "from-worker", id); }
          catch (error) { trace.observerErrors.push(String(error)); }
        });
      }
      record(args[0], "to-worker", id);
    } catch (error) { trace.observerErrors.push(String(error)); }
    return Reflect.apply(original, this, args);
  };
}
const diagnosticProjection = diagnostics => diagnostics.map(d => ({
  code: d.code, severity: d.severity, range: d.range,
  message: typeof d.message === "string" ? d.message : d.message.value,
}));
const prior = config.phase === "after" ? JSON.parse(fs.readFileSync(config.beforeReport, "utf8")) : null;
if (prior) {
  assert.equal(prior.phase, "before"); assert.equal(prior.head, "f5837205e8ec617c0f385c7d1346359d0174cfcc"); assert.equal(prior.behaviorComplete, true);
  assert.equal(prior.failure, undefined); assert.equal(prior.supportedShutdownComplete, true); assert.equal(prior.sourceFreezeUnchanged, true);
  assert.deepEqual(prior.observerProblems, []);
  assert.deepEqual(prior.acceptedErrorRecords, config.acceptedErrorRecords);
  for (const name of Object.keys(config.fixtures)) assert.equal(prior.fixtures[name].sha256, config.fixtures[name].sha256, `before/after fixture changed: ${name}`);
}
let webDown = false;
try {
  await command("preflight", webDriver, ["preflight"]);
  await command("web-up", webDriver, ["up"]);
  await helpers.withEditor(async ({ page, ctx, url, consoleLines }) => {
    let callbackFailure;
    let finalObservationFailure;
    page.on("pageerror", error => { report.pageErrors.push({ at: new Date().toISOString(), stage: report.stages.at(-1)?.name ?? "with-editor-uninitialized", message: error.message, stack: error.stack }); save(); });
    const buffer = async label => {
      try { report.buffers.push({ label, at: new Date().toISOString(), trace: await page.evaluate(() => window.__1374CorrectionTrace ?? null) }); }
      catch (error) { report.buffers.push({ label, at: new Date().toISOString(), readError: error.message }); }
      save();
    };
    // This recorder reads only host-side arrays already collected by the
    // committed driver/helper. It performs no page or application queries.
    // Synchronous writes serialize with save(); clearing the timer before
    // final capture leaves no asynchronous or in-flight write at shutdown.
    let periodicCaptureFailure;
    let periodicSequence = 0;
    const periodicFile = path.join(output, "console-observer-snapshots.jsonl");
    const flushCollected = label => {
      report.consoleLines = [...consoleLines];
      const snapshot = {
        label, sequence: ++periodicSequence, at: new Date().toISOString(),
        consoleLines: report.consoleLines,
        buffers: report.buffers,
      };
      fs.appendFileSync(periodicFile, JSON.stringify(snapshot) + "\n");
      report.periodicCapture = { path: periodicFile, sequence: periodicSequence, at: snapshot.at };
      save();
    };
    const periodicTimer = setInterval(() => {
      try { flushCollected("periodic"); }
      catch (error) {
        periodicCaptureFailure ??= error;
        report.periodicCaptureFailure = { message: error.message, stack: error.stack };
        clearInterval(periodicTimer);
        console.error("periodic evidence capture failed", error);
      }
    }, 1000);
    try {
    page.setDefaultTimeout(30_000);
    await ctx.addInitScript(installObserver);
    const label = async name => {
      stage(name);
      await page.evaluate(value => { window.__1374CorrectionTrace.label = value; }, name);
    };
    const read = async source => {
      const reading = await page.evaluate(async () => {
        const bridge = window.__editorProtocol;
        const request = (method, params = {}) => bridge.send({ jsonrpc: "2.0", id: crypto.randomUUID(), method, params }, 30_000);
        const editor = await request("editor/read");
        const settled = await request("textDocument/diagnosticsSettled", { textDocument: { uri: editor.textDocument.uri }, version: editor.textDocument.version });
        return { editor, settled };
      });
      assert.equal(reading.editor.textDocument.uri, "file://local/main.sd");
      assert.equal(reading.editor.textDocument.text, source);
      assert.equal(reading.settled.uri, reading.editor.textDocument.uri);
      assert.equal(reading.settled.version, reading.editor.textDocument.version);
      reading.diagnosticProjection = diagnosticProjection(reading.settled.diagnostics);
      if (!report.firstLoad) { report.firstLoad = { at: new Date().toISOString(), url, reading }; save(); }
      return reading;
    };
    const load = async (name, source) => {
      await label(`write-${name}`);
      assert.equal(await helpers.writeMainSd(page, source), source.length);
      await buffer(`${name}-before-planned-reload`);
      await helpers.reloadEditorPage(page);
      const mounted = await helpers.ensureScriptEditor(page);
      assert.equal(mounted.present, true); assert.equal(mounted.settled, true);
      await label(name);
      return read(source);
    };
    const shot = async name => {
      const result = await helpers.shotOf(page, "page", path.join(output, `${name}.png`));
      assert.ok(result.screenshot, result.reason); report.screenshots.push(result); save(); return result;
    };
    const positionAt = (source, offset) => {
      const lines = source.slice(0, offset).split("\n");
      return { line: lines.length - 1, character: lines.at(-1).length };
    };
    const requestResponse = async (name, method, position) => {
      await page.waitForFunction(({ name, method, position }) => {
        const trace = window.__1374CorrectionTrace;
        const request = trace?.events.find(e => e.label === name && e.kind === "request" && e.envelope.method === method && e.envelope.params?.textDocument?.uri === "file://local/main.sd" && e.envelope.params?.position?.line === position.line && e.envelope.params?.position?.character === position.character);
        return !!request && trace.events.some(e => e.kind === "response" && e.workerId === request.workerId && e.envelope.id === request.envelope.id);
      }, { name, method, position }, { timeout: 30_000 });
      const pair = await page.evaluate(({ name, method, position }) => {
        const trace = window.__1374CorrectionTrace;
        const request = trace.events.find(e => e.label === name && e.kind === "request" && e.envelope.method === method && e.envelope.params?.textDocument?.uri === "file://local/main.sd" && e.envelope.params?.position?.line === position.line && e.envelope.params?.position?.character === position.character);
        const response = trace.events.find(e => e.kind === "response" && e.workerId === request.workerId && e.envelope.id === request.envelope.id);
        return { documentId: trace.documentId, request, response };
      }, { name, method, position });
      assert.equal(Object.hasOwn(pair.response.envelope, "error"), false);
      assert.equal(Object.hasOwn(pair.response.envelope, "result"), true);
      return pair;
    };
    stage("initial-editor-load");
    await helpers.openEditorPage(page, url);
    await helpers.waitForEditor(page, 120_000);
    stage("seed-one-file-rename-project");
    report.renameSeed = await helpers.seedProject(page, config.renameProject, { expectMainSd: true });
    assert.equal(report.renameSeed.storage, "replaced"); assert.equal(report.renameSeed.files, 1); assert.deepEqual(report.renameSeed.failed, []);
    await buffer("rename-before-planned-seed-reload");
    await helpers.reloadEditorPage(page);
    assert.equal((await helpers.ensureScriptEditor(page)).settled, true);
    for (const mode of ["canonical", "marked"]) {
      const source = sources[mode === "canonical" ? "renameCanonical" : "renameMarked"];
      const item = { mode, source, before: await load(`rename-${mode}`, source) };
      report.rename.push(item); save();
      const contentFrom = source.indexOf("ALICE");
      const position = { line: 0, character: contentFrom + 2 };
      const action = `prepare-${mode}`;
      await label(action);
      assert.equal((await helpers.placeCaret(page, { line: 1, col: position.character + 1 })).placed, true);
      await helpers.pressKey(page, "F2");
      item.prepare = await requestResponse(action, "textDocument/prepareRename", position);
      const expectedRange = { start: { line: 0, character: contentFrom }, end: { line: 0, character: contentFrom + 5 } };
      const rejected = config.phase === "before" && mode === "marked";
      const tooltip = page.locator(".sparkdown-script-editor-root .cm-lsp-rename-tooltip");
      if (rejected) {
        assert.equal(item.prepare.response.envelope.result, null);
        assert.equal(await tooltip.isVisible(), false);
        item.rejectedReading = await read(source);
        item.shot = await shot(`web-rename-${mode}-rejected`);
      } else {
        const result = item.prepare.response.envelope.result;
        assert.deepEqual(result?.range ?? result, expectedRange);
        const input = tooltip.locator(".cm-lsp-rename-input");
        await input.waitFor({ state: "visible" });
        assert.equal(await input.innerText(), "ALICE");
        item.promptShot = await shot(`web-rename-${mode}-prompt`);
        await input.fill("BOB");
        assert.equal(await input.innerText(), "BOB");
        const renameAction = `submit-${mode}`;
        await label(renameAction);
        await tooltip.locator(".cm-lsp-rename-submit").click();
        item.rename = await requestResponse(renameAction, "textDocument/rename", expectedRange.start);
        assert.equal(item.rename.request.envelope.params.newName, "BOB");
        const edit = item.rename.response.envelope.result;
        assert.deepEqual(Object.keys(edit.changes), ["file://local/main.sd"]);
        const edits = edit.changes["file://local/main.sd"];
        const expectedEdits = [
          { range: expectedRange, newText: "BOB" },
          { range: { start: { line: 1, character: 0 }, end: { line: 1, character: 5 } }, newText: "BOB" },
        ];
        const ordered = values => [...values].sort((a, b) => a.range.start.line - b.range.start.line || a.range.start.character - b.range.start.character);
        assert.deepEqual(ordered(edits), expectedEdits);
        assert.deepEqual(edit.documentChanges.map(change => ({ uri: change.textDocument?.uri, edits: ordered(change.edits ?? []) })), [{ uri: "file://local/main.sd", edits: expectedEdits }]);
        const renamed = source.replaceAll("ALICE", "BOB");
        await page.waitForFunction(async expected => {
          const value = await window.__editorProtocol.send({ jsonrpc: "2.0", id: crypto.randomUUID(), method: "editor/read", params: {} }, 10_000);
          return value.textDocument.text === expected;
        }, renamed, { timeout: 30_000 });
        item.after = await read(renamed);
        item.resultShot = await shot(`web-rename-${mode}-result`);
      }
      await buffer(`rename-${mode}-complete`);
      await load(`restore-rename-${mode}`, source);
    }
    stage("seed-whole-artwork-project");
    report.seed = await helpers.seedProject(page, config.project, { expectMainSd: true });
    assert.equal(report.seed.storage, "replaced"); assert.deepEqual(report.seed.failed, []);
    await buffer("artwork-before-planned-seed-reload");
    await helpers.reloadEditorPage(page);
    assert.equal((await helpers.ensureScriptEditor(page)).settled, true);
    for (const mode of ["canonical", "marked"]) {
      const source = sources[mode === "canonical" ? "attributeCanonical" : "attributeMarked"];
      const item = { mode, source, before: await load(`attributes-${mode}`, source) };
      report.attributes.push(item); save();
      item.supportingFiles = {};
      for (const [name, expected] of [["definitions.sd", sources.attributeDefinitions], ["mia.svg", sources.attributeSvg]]) {
        const encoded = await page.evaluate(helpers.readProjectFile, { project: "local", path: name });
        assert.ok(encoded, `missing project input ${name}`);
        assert.equal(Buffer.from(encoded, "base64").toString("utf8"), expected);
        item.supportingFiles[name] = { sha256: sha(Buffer.from(encoded, "base64")), bytes: Buffer.from(encoded, "base64").length };
      }
      const cursor = source.indexOf('"sd"') + 2;
      assert.ok(cursor > 1);
      const cursorPosition = positionAt(source, cursor);
      const action = `complete-attributes-${mode}`;
      await label(action);
      item.surface = await helpers.languageSurface(page, "completion", { line: cursorPosition.line + 1, col: cursorPosition.character + 1 }, "a");
      assert.equal(item.surface.textMatches, true);
      const typed = source.replace('"sd"', '"sad"');
      item.typedReading = await read(typed);
      item.completion = await requestResponse(action, "textDocument/completion", { line: cursorPosition.line, character: cursorPosition.character + 1 });
      const result = item.completion.response.envelope.result;
      const items = result == null ? [] : Array.isArray(result) ? result : result.items;
      assert.ok(Array.isArray(items), "unsupported completion response shape");
      const sad = items.find(value => value.label === "face.sad");
      item.sad = sad;
      const rejected = config.phase === "before" && mode === "marked";
      assert.equal(!!sad, !rejected);
      if (rejected) {
        assert.equal(item.surface.options.includes("face.sad"), false);
      } else {
        assert.equal(item.surface.options.includes("face.sad"), true);
        assert.deepEqual(sad.data.filtered, { image: "mia", attributes: ["face.sad"] });
        const start = typed.indexOf('"sad"') + 1;
        assert.deepEqual(sad.textEdit, { newText: "face.sad", range: { start: positionAt(typed, start), end: positionAt(typed, start + 3) } });
      }
      item.popupShot = await shot(`web-attributes-${mode}-${rejected ? "absent" : "popup"}`);
      if (config.phase === "after" && mode === "marked") {
        const option = page.locator('.sparkdown-script-editor-root .cm-tooltip-autocomplete [role="option"]').filter({ has: page.locator(".cm-completionLabel", { hasText: "face.sad" }) });
        assert.equal(await option.count(), 1);
        await option.click();
        const selected = typed.replace('"sad"', '"face.sad"');
        await page.waitForFunction(async expected => {
          const value = await window.__editorProtocol.send({ jsonrpc: "2.0", id: crypto.randomUUID(), method: "editor/read", params: {} }, 10_000);
          return value.textDocument.text === expected;
        }, selected, { timeout: 30_000 });
        item.selectedReading = await read(selected);
        item.selectedShot = await shot("web-attributes-marked-selected");
      }
      await buffer(`attributes-${mode}-complete`);
      await helpers.pressKey(page, "Escape");
      await load(`restore-attributes-${mode}`, source);
    }
    if (prior) {
      for (const item of report.rename) {
        const previous = prior.rename.find(value => value.mode === item.mode);
        assert.deepEqual(item.before.diagnosticProjection, previous.before.diagnosticProjection);
        if (item.after && previous.after) assert.deepEqual(item.after.diagnosticProjection, previous.after.diagnosticProjection);
      }
      for (const item of report.attributes) {
        const previous = prior.attributes.find(value => value.mode === item.mode);
        assert.deepEqual(item.before.diagnosticProjection, previous.before.diagnosticProjection);
        assert.deepEqual(item.typedReading.diagnosticProjection, previous.typedReading.diagnosticProjection);
      }
    }
    save();
    } catch (error) {
      callbackFailure = error;
      throw error;
    } finally {
      clearInterval(periodicTimer);
      // Capture while withEditor still owns the page, including failed waits.
      // An observation/assertion failure must not replace the original error.
      try {
        report.consoleLines = [...consoleLines];
        await buffer("final-main-page");
        report.consoleLines = [...consoleLines];
        report.consoleClassification = helpers.partitionConsole(consoleLines, helpers.KNOWN_CONSOLE_NOISE, consoleLines.length);
        const counts = config.acceptedErrorRecords.pageErrors.map(() => 0);
        report.pageErrorAcceptance = report.pageErrors.map(error => {
          const index = config.acceptedErrorRecords.pageErrors.findIndex(record =>
            error.message === record.message && record.stages.includes(error.stage) &&
            typeof error.stack === "string" && error.stack.includes(record.requiredPath) &&
            record.requiredStackIncludes.every(value => error.stack.includes(value)));
          if (index < 0) return { error, accepted: false, reason: "no exact stage/stack/path record" };
          const record = config.acceptedErrorRecords.pageErrors[index];
          const count = ++counts[index];
          const previousCount = prior?.pageErrorAllowanceCounts?.[index] ?? 0;
          return { error, index, count, previousCount, accepted: count <= record.maxCount && previousCount + count <= record.pairMaxCount };
        });
        report.pageErrorAllowanceCounts = counts;
        report.unadjudicatedPageErrors = report.pageErrorAcceptance.filter(value => !value.accepted);
        // Driver pageerror lines lack stacks. Match each occurrence once to
        // its already-qualified raw pageerror instead of allowing its message.
        const acceptedPageLines = report.pageErrorAcceptance.filter(value => value.accepted).map(value => `[pageerror] ${value.error.message}`);
        report.unadjudicatedConsoleErrors = report.consoleClassification.errors.filter(line => {
          const index = acceptedPageLines.indexOf(line);
          if (index < 0) return true;
          acceptedPageLines.splice(index, 1);
          return false;
        });
        report.observerProblems = report.buffers.flatMap(buffer => buffer.readError ? [`${buffer.label}: ${buffer.readError}`] : !buffer.trace ? [`${buffer.label}: missing observer`] : [
          ...(buffer.trace.overflow ? [`${buffer.label}: observer overflow ${buffer.trace.overflow}`] : []),
          ...buffer.trace.observerErrors.map(error => `${buffer.label}: ${error}`),
        ]);
        flushCollected("final-before-page-shutdown");
        if (periodicCaptureFailure) throw periodicCaptureFailure;
        assert.deepEqual(report.observerProblems, []);
        assert.deepEqual(report.unadjudicatedConsoleErrors, [], "new console errors require attribution; none are suppressed");
        assert.deepEqual(report.unadjudicatedPageErrors, [], "new page errors require attribution; none are suppressed");
      } catch (captureError) {
        finalObservationFailure = captureError;
        report.finalCaptureFailure = { message: captureError.message, stack: captureError.stack, at: new Date().toISOString(), originalFailurePreserved: !!callbackFailure };
        if (!callbackFailure) throw captureError;
      } finally {
        try { save(); }
        catch (saveError) {
          console.error("final evidence save failed", saveError);
          if (!callbackFailure && !finalObservationFailure) throw saveError;
        }
      }
    }
  });
  await command("web-down", webDriver, ["down"], true); webDown = true;
  await command("vscode-up", vsDriver, ["up", "--sd", config.fixtures.extensionMarked.path]);
  const stdout = await command("vscode-verify", vsDriver, ["verify", "--settle", "60", "--probe", vscodeProbeEntry.path, "--shot", path.join(output, "vscode-marked-rename.png")]);
  let verification;
  for (let index = 0; index < stdout.length; index++) {
    if (stdout[index] !== "{") continue;
    try { verification = JSON.parse(stdout.slice(index)); break; } catch { /* inspect next possible report boundary */ }
  }
  assert.ok(verification, "no complete supported workbench report");
  report.vscode = verification; save();
  assert.deepEqual(verification.failed, []);
  assert.equal(verification.opened, true); assert.equal(verification.editor, "main.sd");
  assert.equal(verification.settled, true);
  assert.equal(verification.extension.activated, true); assert.equal(verification.extension.answered, true);
  assert.ok(verification.consoleErrors.length < 20, "workbench console result reached the driver's cap and is incomplete");
  report.unadjudicatedWorkbenchErrors = [...verification.consoleErrors];
  assert.deepEqual(report.unadjudicatedWorkbenchErrors, [], "new workbench errors require attribution");
  for (const line of sources.extensionMarked.trimEnd().split("\n")) assert.equal(verification.probe.renderedLines.includes(line), true, `workbench source line missing: ${line}`);
  if (prior) assert.deepEqual(verification.diagnostics, prior.vscode.diagnostics);
  report.screenshots.push({ of: "workbench", screenshot: verification.screenshot });
  assert.equal(report.screenshots.length, config.phase === "before" ? 6 : 8);
  report.behaviorComplete = true;
} catch (error) {
  report.failure = { message: error.message, stack: error.stack, at: new Date().toISOString() };
  process.exitCode = 1;
} finally {
  for (const [name, driver] of [["final-web-down", webDriver], ["final-vscode-down", vsDriver]]) {
    try {
      await command(name, driver, ["down"], true);
      report.shutdown.push({ name, exit: 0 });
    } catch (error) { report.shutdown.push({ name, error: error.message }); process.exitCode = 1; }
  }
  report.finished = new Date().toISOString();
  report.webDownBeforeWorkbench = webDown;
  report.supportedShutdownComplete = report.shutdown.every(item => item.exit === 0);
  report.outerCensusRequired = true;
  report.desktopRenameCommandsVerified = false;
  report.workbenchFullDiagnosticArraysObserved = false;
  try {
    checkSources();
    for (const [name, entry] of Object.entries(config.fixtures)) assert.equal(sha(fs.readFileSync(entry.path)), entry.sha256, `fixture changed during live: ${name}`);
    assert.equal(sha(fs.readFileSync(configPath)), report.configSha256, "phase config changed during live");
    execFileSync("git", ["diff", "--exit-code"], { cwd: root, stdio: "pipe" });
    execFileSync("git", ["diff", "--cached", "--exit-code"], { cwd: root, stdio: "pipe" });
    report.sourceFreezeUnchanged = true;
  } catch (error) { report.sourceFreezeUnchanged = false; report.sourceFreezeError = error.message; process.exitCode = 1; }
  save();
}
