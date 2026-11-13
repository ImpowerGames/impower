#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import vm from "node:vm";
import { MessageChannel } from "node:worker_threads";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { focusProjectName, focusScriptName, openAppMenu, openAssetInspector, openDrawerOrRail, openFileMenu, openPreviewSettings, openProblems, openSettings, wheelList, editorViewOf, followedByMain, parseUiSteps, unionRect, languageSurface, waitLanguageSurface, liveDeps, readLanguageSurface, placeCaret, settleViewTransitions, shotOf, pressInEditor, playPreview, playReached, playerReady, revealPreview, REVEALS, NAMED_STEP_BODIES, PREVIEW_PANE_SELECTOR, SHOW_PREVIEW_SELECTOR, DRIVER_PREVIEW_KEY, previewSavedHidden, advanceGame, insertText, scrubReport, diagnosticsAt } from "./driver.mjs";
import { reportFreshWorker, workerSession } from "./worker-report.mjs";
import { NAMED_STEPS } from "./steps.mjs";

let failures = 0;
const check = (name, fn) => {
  try {
    fn();
    console.log(`PASS: ${name}`);
  } catch (err) {
    failures++;
    console.log(`FAIL: ${name}`);
    console.log(`  ${String(err.message).split("\n").join("\n  ")}`);
  }
};

check("well-formed steps parse in order", () => {
  assert.deepEqual(
    parseUiSteps(["--project", "game.zip", "--sd", "r.sd", "--screen", "assets", "--open", "find", "--type", "search=Hello", "--press", "Control+Shift+g", "--click", "replaceAll", "--toggle", "case", "--shot", "a.png", "--shot-of", "find", "b.png", "--close", "find", "--probe", "p.js", "--headed"]),
    [
      { project: "game.zip" },
      { sd: "r.sd" },
      { screen: "assets" },
      { open: "find" },
      { type: "search", text: "Hello" },
      { press: "Control+Shift+g" },
      { click: "replaceAll" },
      { toggle: "case" },
      { shotOf: "page", out: "a.png" },
      { shotOf: "find", out: "b.png" },
      { close: "find" },
      { probe: "p.js" },
    ],
  );
});

check("a literal backslash-n in --type text becomes a line break, and an = inside the text is kept", () => {
  assert.deepEqual(parseUiSteps(["--type", "replace=one\\n  two"]), [{ type: "replace", text: "one\n  two" }]);
  assert.deepEqual(parseUiSteps(["--type", "search=a=b"]), [{ type: "search", text: "a=b" }]);
  assert.deepEqual(parseUiSteps(["--type", "search="]), [{ type: "search", text: "" }]);
});

check("a flag with a missing or empty value is refused, not dropped", () => {
  assert.throws(() => parseUiSteps(["--sd"]), /--sd needs a value/);
  assert.throws(() => parseUiSteps(["--project", "--shot", "x.png"]), /--project needs a value/);
  assert.throws(() => parseUiSteps(["--screen", ""]), /--screen needs a value/);
  assert.throws(() => parseUiSteps(["--open", "--shot", "x.png"]), /--open needs a value/);
  assert.throws(() => parseUiSteps(["--shot-of", "find"]), /--shot-of needs a value/);
  assert.throws(() => parseUiSteps(["--type", "=Hello"]), /field name/);
  assert.throws(() => parseUiSteps(["--type", "Hello"]), /field=text/);
});

check("an unknown panel, field, button, toggle or shot target is refused by name (a screen is checked at run time)", () => {
  assert.throws(() => parseUiSteps(["--open", "finnd"]), /unknown panel "finnd"/);
  assert.throws(() => parseUiSteps(["--close", "search"]), /unknown panel "search"/);
  assert.throws(() => parseUiSteps(["--type", "serch=x"]), /unknown field "serch"/);
  assert.throws(() => parseUiSteps(["--click", "closs"]), /unknown button "closs"/);
  assert.throws(() => parseUiSteps(["--toggle", "regex"]), /unknown toggle "regex"/);
  assert.throws(() => parseUiSteps(["--shot-of", "bogus", "x.png"]), /unknown --shot-of target "bogus"/);
  assert.throws(() => parseUiSteps(["--bogus"]), /unknown argument --bogus/);
});

check("a --sd before a --project is refused, since the seed would remove or replace the main.sd it wrote; after the last --project it parses", () => {
  assert.throws(() => parseUiSteps(["--sd", "r.sd", "--project", "assets-only"]), /^Error: ui: --sd \(step 1\) comes before --project \(step 2\), whose seed would remove or replace the main\.sd it wrote; put every --sd after the last --project$/);
  assert.throws(() => parseUiSteps(["--sd", "r.sd", "--project", "game.zip", "--sd", "s.sd"]), /--sd \(step 1\) comes before --project \(step 2\)/);
  assert.throws(() => parseUiSteps(["--project", "a", "--sd", "r.sd", "--shot", "x.png", "--project", "b"]), /--sd \(step 2\) comes before --project \(step 4\)/);
  assert.deepEqual(parseUiSteps(["--project", "a", "--project", "b", "--sd", "r.sd", "--sd", "s.sd"]), [{ project: "a" }, { project: "b" }, { sd: "r.sd" }, { sd: "s.sd" }]);
  assert.deepEqual(parseUiSteps(["--sd", "r.sd", "--shot", "x.png"]), [{ sd: "r.sd" }, { shotOf: "page", out: "x.png" }]);
});

check("a --press combo that names no key is refused at parse time", () => {
  assert.throws(() => parseUiSteps(["--press", "Control+"]), /names no key|empty/);
  assert.deepEqual(parseUiSteps(["--press", "Control++"]), [{ press: "Control++" }]);
});

check("a screen is any lowercase tab value, so a tab the editor grows later is not refused before the run", () => {
  for (const name of ["logic", "assets", "share", "main", "scripts", "files", "urls", "game", "screenplay", "future-tab"]) {
    assert.deepEqual(parseUiSteps(["--screen", name]), [{ screen: name }]);
  }
  assert.throws(() => parseUiSteps(["--screen", "Logic"]), /lowercase/);
  assert.throws(() => parseUiSteps(["--screen", "main scripts"]), /lowercase/);
});

check("a --screen logic is 'followed by main' only when the very next step is --screen main", () => {
  assert.equal(followedByMain(parseUiSteps(["--screen", "logic", "--screen", "main"]), 0), true);
  assert.equal(followedByMain(parseUiSteps(["--screen", "logic", "--screen", "scripts"]), 0), false);
  assert.equal(followedByMain(parseUiSteps(["--screen", "logic", "--screen", "assets", "--shot", "b.png"]), 0), false);
  assert.equal(followedByMain(parseUiSteps(["--screen", "logic", "--shot", "b.png", "--screen", "main"]), 0), false);
  assert.equal(followedByMain(parseUiSteps(["--screen", "logic"]), 0), false);
  assert.equal(followedByMain(parseUiSteps(["--screen", "assets", "--screen", "logic", "--screen", "main"]), 1), true);
});

check("completion, hover and fresh worker steps retain their order and crop targets", () => {
  assert.deepEqual(parseUiSteps(["--fresh-sw", "--complete", "7:3=~fil=x", "--shot-of", "completion", "c.png", "--hover", "5:19", "--shot-of", "hover", "h.png"]), [
    { freshSw: true },
    { complete: { line: 7, col: 3 }, text: "~fil=x" },
    { shotOf: "completion", out: "c.png" },
    { hover: { line: 5, col: 19 } },
    { shotOf: "hover", out: "h.png" },
  ]);
});

check("language surface positions require positive safe integers and completion text", () => {
  for (const spec of ["0:1", "1:0", "-1:2", "1.5:2", "1:2:3", "9007199254740992:1"]) {
    assert.throws(() => parseUiSteps(["--hover", spec]), /position/);
    assert.throws(() => parseUiSteps(["--complete", `${spec}=x`]), /position/);
  }
  assert.throws(() => parseUiSteps(["--complete", "1:2="]), /text/);
  assert.throws(() => parseUiSteps(["--complete", "1:2"]), /text/);
});

check("completion crop includes a separate info panel and clips to the viewport", () => {
  assert.deepEqual(unionRect([{ x: 100, y: 80, width: 200, height: 100 }, { x: 300, y: 60, width: 180, height: 150 }], { width: 450, height: 200 }), { x: 100, y: 60, width: 350, height: 140 });
  assert.equal(unionRect([null, { x: 500, y: 1, width: 20, height: 30 }], { width: 400, height: 200 }), null);
});

const asyncCheck = async (name, fn) => {
  try { await fn(); console.log(`PASS: ${name}`); }
  catch (err) { failures++; console.log(`FAIL: ${name}\n  ${err.stack}`); }
};

function protocolGlobals({ text = () => "portrait", coordinates = { left: 172, right: 180, top: 40, bottom: 60 }, hover = () => null, diagnostics = () => [], uri = () => "file://local/main.sd" } = {}) {
  const state = { selection: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, messages: [], ignoreSelect: false };
  const bridge = { send: async (message) => {
    state.messages.push(message);
    if (message.method === "editor/select") { if (!state.ignoreSelect) state.selection = message.params.range; return; }
    if (message.method === "editor/read") return { textDocument: { uri: uri(), version: 1, text: text() }, selection: state.selection, coordinates };
    if (message.method === "textDocument/hover") return hover();
    if (message.method === "textDocument/diagnosticsSettled") return { uri: "file://local/main.sd", version: 1, diagnostics: diagnostics() };
    throw new Error("Unexpected method: " + message.method);
  } };
  return { crypto, window: { __editorProtocol: bridge }, protocolState: state };
}

await asyncCheck("hover uses protocol measurements and values while completion types text", async () => {
  const calls = [];
  let lines = ["intro", "[[portrait]]"], mainVisible = true;
  const view = { state: { doc: { lines: 2, line: (n) => ({ from: n === 1 ? 0 : 6, text: lines[n - 1] }) } }, coordsAtPos: (pos) => ({ left: 100 + pos * 8, top: 40, bottom: 60 }) };
  const context = vm.createContext({ ...protocolGlobals({ text: () => lines.join("\n"), uri: () => (mainVisible ? "file://local/main.sd" : "file://local/Scripts/chapter_1.sd") }), document: { querySelector: (selector) => selector === ".sparkdown-script-editor-root .cm-content" ? { cmTile: { view } } : null, elementFromPoint: () => ({ closest: () => true }) } });
  const page = {
    waitForFunction: async () => {},
    keyboard: { press: async (key) => calls.push(["press", key]), type: async (text) => { calls.push(["type", text]); lines[1] = "[[portrait" + text + "]]"; } },
    mouse: { move: async (...args) => calls.push(["move", ...args]) },
    evaluate: async (fn, arg) => vm.runInContext(`(${fn})`, context)(arg),
    locator: () => ({ first: () => ({ waitFor: async () => { throw new Error("no widget"); } }) }),
  };
  const deps = { place: async () => ({ placed: true }), wait: async () => ({}), read: async (_, kind) => kind === "hover" ? { present: false } : { popupPresent: false } };
  const hover = await languageSurface(page, "hover", { line: 2, col: 4 }, undefined, deps);
  assert.deepEqual(calls.at(-1), ["move", 173, 50, { steps: 5 }]);
  assert.equal(hover.serverResponse, "unobserved");
  assert.deepEqual(hover.caret, { placed: true });
  assert.deepEqual(JSON.parse(JSON.stringify(hover.pointer)), { x: 173, y: 50 });
  assert.match(hover.reason, /language server returned no hover/);
  const completion = await languageSurface(page, "completion", { line: 2, col: 11 }, "~ha", deps);
  assert.equal(completion.textMatches, true);
  assert.equal(completion.editorView, "main");
  assert.deepEqual(calls.at(-1), ["type", "~ha"]);
  assert.equal(completion.serverResponse, "unobserved");
  page.keyboard.type = async () => { lines[1] += "wrong"; };
  const mismatch = await languageSurface(page, "completion", { line: 2, col: 11 }, "x", deps);
  assert.equal(mismatch.textMatches, false);
  assert.match(mismatch.reason, /typed text differs/);
  mainVisible = false;
  const otherFile = await languageSurface(page, "completion", { line: 2, col: 11 }, "x", deps);
  assert.equal(otherFile.typed, undefined);
  assert.equal(otherFile.editorView, "scripts-view");
  assert.match(otherFile.reason, /main.sd/);
  calls.length = 0;
  const refused = await languageSurface(page, "completion", { line: 5, col: 1 }, "x", { ...deps, place: async () => ({ placed: false, reason: "outside" }) });
  assert.equal(refused.reason, "outside");
  assert.equal(calls.some(([call]) => call === "type"), false);
});

function workerHarness({ unregister = true, source = "installed worker A", reloadFails = false, controllerFails = false, controllerMessage = "page.waitForFunction: Timeout", answers = true, rejectInstall = false, rejectTeardown = false } = {}) {
  const calls = [];
  const listeners = new Set();
  const cdp = new EventEmitter();
  const targetId = "worker-target";
  const controller = { state: "activated", scriptURL: "http://editor.test/sw.js", postMessage: (data, ports) => { if (answers) for (const fn of listeners) fn({ data, ports }); else ports[0].postMessage("wrong worker"); } };
  const registration = { active: controller, scope: "http://editor.test/", unregister: async () => { calls.push("unregister"); return unregister; } };
  const navigator = { serviceWorker: { controller, getRegistrations: async () => [registration], getRegistration: async () => registration } };
  const self = { addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn) };
  const context = vm.createContext({ navigator, self, MessageChannel, setTimeout, clearTimeout });
  const event = (message) => cdp.emit("Target.receivedMessageFromTarget", { sessionId: "nested", message: JSON.stringify(message) });
  cdp.detach = async () => calls.push("detach");
  cdp.send = async (method, params) => {
    calls.push(method);
    if (method === "Target.attachToTarget") { assert.equal(params.targetId, targetId); return { sessionId: "nested" }; }
    if (method === "Target.sendMessageToTarget") {
      const message = JSON.parse(params.message);
      calls.push(message.method);
      let result = {};
      if (message.method === "Debugger.enable") event({ method: "Debugger.scriptParsed", params: { scriptId: "script", url: controller.scriptURL } });
      if (message.method === "Debugger.getScriptSource") result = { scriptSource: source };
      if (message.method === "Runtime.evaluate") {
        result = rejectInstall && message.params.expression.includes("addEventListener") ? { exceptionDetails: { text: "listener installation refused" } }
          : rejectTeardown && message.params.expression.startsWith("self.removeEventListener") ? { exceptionDetails: { text: "teardown refused" } }
          : vm.runInContext(message.params.expression, context);
      }
      event({ id: message.id, result });
    }
    return {};
  };
  const page = {
    evaluate: async (fn, arg) => vm.runInContext(`(${fn})`, context)(arg),
    waitForFunction: async (fn) => { if (controllerFails) throw new Error(controllerMessage); const result = vm.runInContext(`(${fn})`, context)(); assert.equal(typeof result, "boolean", "wait predicate must be synchronous"); assert.equal(result, true); },
    waitForTimeout: async () => {},
  };
  const ctx = { newCDPSession: async () => cdp };
  const reload = async () => {
    calls.push("reload");
    if (reloadFails) throw new Error("reload refused");
    cdp.emit("ServiceWorker.workerVersionUpdated", { versions: [{ versionId: "v", scriptURL: controller.scriptURL, status: "activated", runningStatus: "running", targetId }] });
  };
  return { page, ctx, reload, calls, listeners, cdp, event, controller };
}

await asyncCheck("fresh worker unregisters before reload, hashes the installed source and captures worker cache warnings", async () => {
  const h = workerHarness();
  const { report, close } = await liveDeps.reportFreshWorker(h.page, h.ctx, h.reload);
  assert.equal(report.reason, undefined);
  assert.equal(report.controlled, true);
  assert.equal(report.refreshed, true);
  assert.equal(report.target, "editor");
  assert.equal(report.origin, "http://editor.test");
  assert.ok(h.calls.includes("Debugger.disable"));
  assert.equal(report.sha256, crypto.createHash("sha256").update("installed worker A").digest("hex"));
  assert.ok(h.calls.indexOf("unregister") < h.calls.indexOf("reload"));
  assert.equal(h.listeners.size, 0, "controller probe listener removed");
  h.event({ method: "Runtime.consoleAPICalled", params: { type: "warning", args: [{ value: "Cache.put failed: quota" }] } });
  assert.deepEqual(report.warnings, ["Cache.put failed: quota"]);
  await close();
  assert.ok(h.calls.includes("Target.detachFromTarget"));
  assert.equal(h.cdp.listenerCount("Target.receivedMessageFromTarget"), 0);
  const second = workerHarness({ source: "installed worker B" });
  const changed = await reportFreshWorker(second.page, second.ctx, second.reload);
  assert.notEqual(changed.report.sha256, report.sha256);
  await changed.close();
});

await asyncCheck("failed worker unregister or reload reports failure, skips script proof and closes CDP", async () => {
  for (const options of [{ unregister: false }, { reloadFails: true }, { controllerFails: true }]) {
    const h = workerHarness(options);
    const { report } = await reportFreshWorker(h.page, h.ctx, h.reload);
    assert.equal(report.refreshed, false);
    assert.equal(report.sha256, null);
    assert.match(report.reason, /fresh service worker verification failed/);
    if (options.controllerFails) {
      assert.match(report.reason, /controller wait failed.*inspect consoleErrors/);
      assert.match(report.reason, /page.waitForFunction: Timeout/);
    }
    assert.equal(h.calls.includes("Target.attachToTarget"), false);
    assert.ok(h.calls.includes("detach"));
    if (options.unregister === false) assert.equal(h.calls.includes("reload"), false);
  }
});

await asyncCheck("worker CDP timeout rejects and leaves no response listener after close", async () => {
  const cdp = new EventEmitter();
  cdp.send = async () => ({ sessionId: "silent" });
  const session = await workerSession(cdp, "target", 10);
  await assert.rejects(session.send("Debugger.enable"), /timed out/);
  await session.close();
  assert.equal(cdp.listenerCount("Target.receivedMessageFromTarget"), 0);
});

await asyncCheck("worker identity is checked again at the end and rejects a replaced version", async () => {
  const h = workerHarness();
  const monitor = await reportFreshWorker(h.page, h.ctx, h.reload);
  assert.equal(monitor.report.verifiedAtEnd, false);
  await monitor.finish();
  assert.equal(monitor.report.verifiedAtEnd, true);
  assert.equal(monitor.report.controlled, true);
  h.cdp.emit("ServiceWorker.workerVersionUpdated", { versions: [{ versionId: "v", status: "redundant" }] });
  await monitor.finish();
  assert.equal(monitor.report.controlled, false);
  assert.match(monitor.report.reason, /worker version was replaced/);
  await monitor.close();
  await monitor.close();
  assert.equal(h.calls.filter((call) => call === "detach").length, 1);
});

await asyncCheck("an unanswered controller ping or rejected listener installation cannot establish identity", async () => {
  for (const options of [{ answers: false }, { rejectInstall: true }]) {
    const h = workerHarness(options);
    const monitor = await reportFreshWorker(h.page, h.ctx, h.reload);
    assert.equal(monitor.report.refreshed, false);
    assert.match(monitor.report.reason, options.answers === false ? /did not answer/ : /listener installation refused/);
    assert.equal(h.listeners.size, 0);
    assert.ok(h.calls.includes("detach"));
  }
});

await asyncCheck("worker warnings and exceptions retain 25 entries and count the dropped messages", async () => {
  const h = workerHarness();
  const monitor = await reportFreshWorker(h.page, h.ctx, h.reload);
  for (let i = 0; i < 27; i++) {
    h.event({ method: "Runtime.consoleAPICalled", params: { type: "warning", args: [{ value: `warning ${i}` }] } });
    h.event({ method: "Runtime.exceptionThrown", params: { exceptionDetails: { exception: { description: `failure ${i}` } } } });
  }
  assert.deepEqual(monitor.report.warnings, Array.from({ length: 25 }, (_, i) => `warning ${i}`));
  assert.deepEqual(monitor.report.errors, Array.from({ length: 25 }, (_, i) => `failure ${i}`));
  assert.equal(monitor.report.warningsDropped, 2);
  assert.equal(monitor.report.errorsDropped, 2);
  await monitor.close();
});

function surfaceFixture() {
  const rectangle = (x, y, width, height) => ({ x, y, width, height, left: x, top: y, right: x + width, bottom: y + height });
  const image = { currentSrc: "blob:rendered", src: "fallback", naturalWidth: 150, naturalHeight: 150, getBoundingClientRect: () => rectangle(310, 90, 180, 180) };
  const option = (label, detail) => ({ innerText: `${label}\n${detail}`, querySelector: (selector) => selector === ".cm-completionLabel" ? { innerText: label } : selector === ".cm-completionDetail" ? { innerText: detail } : null });
  const items = [option("hat", "character"), option("hat.on", "layer")];
  const popup = { rect: rectangle(100, 100, 200, 90), getBoundingClientRect() { return this.rect; }, querySelectorAll: (s) => s === '[role="option"]' ? items : [], querySelector: (s) => s === '[aria-selected="true"]' ? items[0] : null };
  const info = { rect: rectangle(300, 80, 200, 200), getBoundingClientRect() { return this.rect; }, querySelector: (s) => s === "img" ? image : null };
  const hover = { ...info, innerText: "portrait" };
  const nodes = new Map([
    [".sparkdown-script-editor-root .cm-tooltip-hover", [hover]],
    [".sparkdown-script-editor-root .cm-tooltip-autocomplete", [popup]],
    [".sparkdown-script-editor-root .cm-completionInfo", [info]],
  ]);
  const context = vm.createContext({ ...protocolGlobals({ hover: () => ({ contents: { kind: "markdown", value: "portrait" }, images: [{ src: "blob:protocol", naturalWidth: 150, naturalHeight: 150 }] }) }), document: { querySelectorAll: (selector) => nodes.get(selector) ?? [] }, getComputedStyle: (e) => ({ visibility: e.hidden ? "hidden" : "visible" }), innerWidth: 800, innerHeight: 600 });
  const shots = [];
  const page = { waitForFunction: async () => {}, evaluate: async (fn, arg) => JSON.parse(JSON.stringify(await vm.runInContext(`(${fn})`, context)(arg))), waitForTimeout: (ms) => new Promise(resolve => setTimeout(resolve, ms)), viewportSize: () => ({ width: 800, height: 600 }), screenshot: async (args) => shots.push(args) };
  page.locator = () => ({ first: () => ({ screenshot: async (args) => {
    if (hover.rect.y < 0) await page.waitForTimeout(50);
    if (hover.rect.y < 0 || hover.rect.x < 0 || hover.rect.x >= 800 || hover.rect.y >= 600) throw new Error("Not visible");
    shots.push({ ...args, clip: { x: hover.rect.x, y: hover.rect.y, width: hover.rect.width, height: hover.rect.height } });
  } }) });
  return { page, popup, info, hover, nodes, shots, rectangle };
}

await asyncCheck("completion reads its rendered list and hover reads protocol contents and intrinsic size", async () => {
  const h = surfaceFixture();
  const completion = await readLanguageSurface(h.page, "completion");
  assert.deepEqual(completion.options, ["hat", "hat.on"]);
  assert.deepEqual(completion.items, [{ label: "hat", detail: "character" }, { label: "hat.on", detail: "layer" }]);
  assert.equal(completion.selected, "hat");
  assert.equal(completion.infoPanelPresent, true);
  assert.equal(completion.imgSrc, "blob:rendered");
  assert.deepEqual(completion.imgRect, { x: 310, y: 90, width: 180, height: 180 });
  assert.equal(completion.naturalWidth, 150);
  assert.equal(completion.naturalHeight, 150);
  assert.equal((await readLanguageSurface(h.page, "hover")).text, "portrait");
  h.hover.rect = h.rectangle(0, -10000, 180, 180);
  assert.equal((await readLanguageSurface(h.page, "hover")).present, true, "server hover remains available when the widget is parked");
  h.info.hidden = true;
  assert.equal((await readLanguageSurface(h.page, "completion")).infoPanelPresent, false);
});

await asyncCheck("actual screenshot call includes visible information and permits an absent panel", async () => {
  const h = surfaceFixture();
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "impower-501-crop-"));
  try {
    await shotOf(h.page, "hover", path.join(scratch, "visible-hover.png"));
    assert.deepEqual(h.shots.at(-1).clip, { x: 300, y: 80, width: 200, height: 200 });
    await shotOf(h.page, "completion", path.join(scratch, "completion.png"));
    assert.deepEqual(h.shots.at(-1).clip, { x: 100, y: 80, width: 400, height: 200 });
    h.info.rect = h.rectangle(300, -10000, 200, 200);
    await shotOf(h.page, "completion", path.join(scratch, "parked.png"));
    assert.deepEqual(h.shots.at(-1).clip, { x: 100, y: 100, width: 200, height: 90 });
    h.nodes.delete(".sparkdown-script-editor-root .cm-completionInfo");
    await shotOf(h.page, "completion", path.join(scratch, "missing.png"));
    assert.deepEqual(h.shots.at(-1).clip, { x: 100, y: 100, width: 200, height: 90 });
    h.hover.rect = h.rectangle(0, -10000, 180, 180);
    const before = h.shots.length;
    assert.equal((await shotOf(h.page, "hover", path.join(scratch, "hover.png"))).screenshot, null);
    assert.equal(h.shots.length, before);
  } finally { fs.rmdirSync(scratch); }
});

await asyncCheck("surface waits follow viewport placement and allow missing optional information", async () => {
  let clock = 0;
  const pauses = [];
  const timing = { now: () => clock, pause: async (ms) => { pauses.push(ms); clock += ms; }, timeout: 500, infoTimeout: 200 };
  const read = async (_, kind) => kind === "hover" ? { present: clock >= 100 } : { popupPresent: clock >= 100, infoPanelPresent: clock >= 250 };
  assert.equal((await waitLanguageSurface({}, "hover", { ...timing, read })).present, false);
  assert.equal(clock, 0, "an empty protocol reply must not trigger polling");
  clock = 0;
  assert.equal((await waitLanguageSurface({}, "completion", { ...timing, read })).infoPanelPresent, true);
  assert.equal(clock, 250);
  clock = 0;
  const missing = await waitLanguageSurface({}, "completion", { ...timing, read: async () => ({ popupPresent: true, infoPanelPresent: false }) });
  assert.equal(missing.popupPresent, true);
  assert.equal(clock, 200);
  clock = 0;
  assert.equal((await waitLanguageSurface({}, "hover", { ...timing, read: async () => ({ present: false }) })).present, false);
  assert.equal(clock, 0);
});

await asyncCheck("a windowed completion list is disclosed and all viewport edges reject parked surfaces", async () => {
  const h = surfaceFixture();
  assert.equal((await readLanguageSurface(h.page, "completion")).optionsTruncated, false);
  const query = h.popup.querySelector;
  h.popup.querySelector = (s) => s === '.cm-completionListIncompleteTop, .cm-completionListIncompleteBottom' ? {} : query(s);
  assert.equal((await readLanguageSurface(h.page, "completion")).optionsTruncated, true);
  for (const [x, y] of [[-300, 0], [0, -300], [800, 0], [0, 600]]) {
    h.hover.rect = h.rectangle(x, y, 180, 180);
    assert.equal((await readLanguageSurface(h.page, "hover")).present, true, "server hover remains available when the widget is parked");
    assert.deepEqual(unionRect([{ x: 10, y: 10, width: 20, height: 20 }, { x, y, width: 180, height: 180 }], { width: 800, height: 600 }), { x: 10, y: 10, width: 20, height: 20 });
  }
});

await asyncCheck("the final controller ping rejects a different answer even with an activated version", async () => {
  const h = workerHarness();
  const monitor = await reportFreshWorker(h.page, h.ctx, h.reload);
  h.controller.postMessage = (_, ports) => ports[0].postMessage("other worker");
  await monitor.finish();
  assert.equal(monitor.report.verifiedAtEnd, false);
  assert.equal(monitor.report.controlled, false);
  assert.match(monitor.report.reason, /another worker or no worker/);
  await monitor.close();
});

await asyncCheck("protocol selection converts columns, verifies the result, and refuses absent editors", async () => {
  const globals = protocolGlobals({ text: () => "abc\n123456789012" });
  const context = vm.createContext(globals);
  const page = { waitForFunction: async () => {}, evaluate: async (fn, arg) => vm.runInContext(`(${fn})`, context)(arg) };
  const actions = { present: async () => ({ present: true }) };
  assert.equal((await placeCaret(page, { line: 2, col: 7 }, actions)).placed, true);
  const selections = () => globals.protocolState.messages.filter((m) => m.method === "editor/select");
  assert.deepEqual(JSON.parse(JSON.stringify(selections()[0].params.range.start)), { line: 1, character: 6 });
  assert.equal((await placeCaret(page, { line: 2, col: 14 }, actions)).placed, false);
  assert.equal(selections().length, 1);
  assert.equal((await placeCaret(page, { line: 2, col: 7 }, { present: async () => ({ present: false, reason: "editor absent" }) })).reason, "editor absent");
  assert.equal(selections().length, 1);
  globals.protocolState.ignoreSelect = true;
  assert.equal((await placeCaret(page, { line: 2, col: 8 }, actions)).placed, false);
});

await asyncCheck("controller cleanup errors preserve the proved identity and the original installation failure", async () => {
  const h = workerHarness({ rejectTeardown: true });
  const monitor = await reportFreshWorker(h.page, h.ctx, h.reload);
  assert.equal(monitor.report.controlled, true);
  assert.equal(monitor.report.reason, undefined);
  assert.deepEqual(monitor.report.cleanupErrors, ["teardown refused"]);
  assert.equal(h.listeners.size, 0, "an answered listener removes itself before replying");
  await monitor.finish();
  assert.equal(monitor.report.verifiedAtEnd, true);
  assert.equal(monitor.report.controlled, true);
  assert.deepEqual(monitor.report.cleanupErrors, ["teardown refused", "teardown refused"]);
  await monitor.close();
  const failed = workerHarness({ rejectInstall: true, rejectTeardown: true });
  const bad = await reportFreshWorker(failed.page, failed.ctx, failed.reload);
  assert.match(bad.report.reason, /listener installation refused/);
  assert.deepEqual(bad.report.cleanupErrors, ["teardown refused"]);
});

await asyncCheck("language steps wait for placement through the production wait", async () => {
  for (const kind of ["hover", "completion"]) {
    let placed = false, line = "portrait", pauses = 0;
    const view = { state: { doc: { lines: 1, line: () => ({ from: 0, text: line }) } }, coordsAtPos: () => ({ left: 10, top: 10, bottom: 30 }) };
    const context = vm.createContext({ ...protocolGlobals({ text: () => line, coordinates: { left: 10, top: 10, bottom: 30 } }), document: {
      querySelector: (selector) => selector === '.sparkdown-script-editor-root .cm-content' ? { cmTile: { view } } : null,
      elementFromPoint: () => ({ closest: () => true }),
    } });
    const page = {
      keyboard: { press: async () => {}, type: async (text) => { line += text; } },
      mouse: { move: async () => {} },
      waitForTimeout: async () => { pauses++; placed = true; },
      waitForFunction: async () => {},
      evaluate: async (fn, arg) => vm.runInContext(`(${fn})`, context)(arg),
    };
    const read = async () => kind === "hover"
      ? { present: true, serverResponse: "received" }
      : { popupPresent: placed, infoPanelPresent: placed };
    const out = await languageSurface(page, kind, { line: 1, col: 9 }, "x", { place: async () => ({ placed: true }), read });
    assert.equal(pauses > 0, kind === "completion");
    assert.equal(kind === "hover" ? out.present : out.popupPresent, true);
    assert.equal(out.serverResponse, kind === "hover" ? "received" : undefined);
  }
});

await asyncCheck("surface crops wait for placement through the production reader", async () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "impower-501-delayed-crop-"));
  try {
    for (const kind of ["hover", "completion"]) {
      const h = surfaceFixture();
      const surface = kind === "hover" ? h.hover : h.popup;
      const placed = surface.rect;
      surface.rect = h.rectangle(0, -10000, 200, 200);
      let pauses = 0;
      h.page.waitForTimeout = async () => { pauses++; surface.rect = placed; };
      const out = await shotOf(h.page, kind, path.join(scratch, `${kind}.png`));
      assert.ok(pauses > 0, `${kind} crop must wait for placement`);
      assert.equal(out.screenshot, path.join(scratch, `${kind}.png`));
      assert.equal(h.shots.length, 1);
      assert.ok(h.shots[0].clip.y >= 0);
    }
  } finally { fs.rmdirSync(scratch); }
});

await asyncCheck("controller recovery advice precedes the complete failure cause", async () => {
  const cause = "page.waitForFunction: Timeout\n" + "call log detail\n".repeat(100) + "end of call log";
  const h = workerHarness({ controllerFails: true, controllerMessage: cause });
  const { report } = await reportFreshWorker(h.page, h.ctx, h.reload);
  assert.ok(report.reason.includes(cause), "the cause must remain complete");
  assert.ok(report.reason.indexOf("inspect consoleErrors") < report.reason.indexOf(cause), "advice must precede a long cause");
});

await asyncCheck("scrubbing refuses playback modes and waits for the selected source target", async () => {
  const globals = protocolGlobals({ text: () => "first\nsecond" });
  let game = { launchState: "play", position: { uri: "file://local/main.sd", line: 0 } };
  const subscribers = new Set();
  const bridge = globals.window.__editorProtocol;
  const originalSend = bridge.send;
  bridge.subscribe = (listener) => { subscribers.add(listener); return () => subscribers.delete(listener); };
  bridge.send = async (message) => {
    if (message.method === "preview/gameState") return game;
    if (message.method === "textDocument/didSelect") {
      setTimeout(() => {
        game = { ...game, position: { uri: message.params.textDocument.uri, line: message.params.selectedRange.start.line } };
        for (const listener of subscribers) listener({ method: "preview/didChangeGameState", params: game });
      }, 15);
      return;
    }
    return originalSend(message);
  };
  const context = vm.createContext({ ...globals, setTimeout, clearTimeout });
  const page = { waitForFunction: async () => {}, evaluate: async (fn, arg) => { context.arg = arg; return vm.runInContext("(" + fn.toString() + ")(arg)", context); } };
  for (const launchState of ["play", "pause"]) {
    game.launchState = launchState;
    assert.equal((await liveDeps.clickLine(page, 2)).clicked, false);
  }
  assert.equal(globals.protocolState.messages.filter(m => m.method === "editor/select").length, 0);
  for (const launchState of [null, "preview"]) {
    game = { launchState, position: { uri: "file://local/main.sd", line: 0 } };
    const result = await liveDeps.clickLine(page, 2);
    assert.equal(result.clicked, true, `a ${launchState} game state refused the scrub`);
    assert.equal(result.cursorLine, 2);
    assert.equal(result.x, 173);
    assert.equal(result.y, 50);
    assert.equal(result.previousPosition.line, 0);
    assert.equal(result.position.line, 1);
    assert.equal(result.positionError, undefined);
    assert.equal(subscribers.size, 0);
  }
  let reads = 0;
  bridge.send = async (message) => {
    if (message.method === "preview/gameState") {
      if (++reads > 1) throw new Error("preview/gameState handler failed");
      return { launchState: "preview", position: { uri: "file://local/main.sd", line: 0 } };
    }
    if (message.method === "textDocument/didSelect") return;
    return originalSend(message);
  };
  const failed = await liveDeps.clickLine(page, 2);
  assert.equal(failed.clicked, true);
  assert.equal(failed.position, null);
  assert.match(failed.positionError, /preview\/gameState handler failed/);
  assert.equal(subscribers.size, 0);
});

await asyncCheck("a press focuses the script editor first and reports whether the document text changed", async () => {
  const calls = [];
  let text = "x=1", version = 1, formatAfterReads = 0;
  const bridge = { send: async (message) => {
    calls.push(message.method);
    if (message.method === "editor/select") { calls.push(`focus:${message.params.takeFocus}`); return; }
    if (message.method === "editor/read") {
      if (formatAfterReads > 0 && --formatAfterReads === 0) { text = "x = 1"; version += 1; }
      return { textDocument: { uri: "file://local/main.sd", version, text }, selection: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } } };
    }
    throw new Error("Unexpected method: " + message.method);
  } };
  const context = vm.createContext({ crypto, window: { __editorProtocol: bridge } });
  const page = {
    waitForFunction: async () => {},
    keyboard: { press: async (key) => { calls.push(`press:${key}`); if (key === "Shift+Alt+F" || key === "Control+s") formatAfterReads = 3; } },
    evaluate: async (fn, arg) => vm.runInContext(`(${fn})`, context)(arg),
  };
  const wait = async () => true;
  const formatted = await pressInEditor(page, "Shift+Alt+f", { wait, commandWaitMs: 2_000 });
  assert.ok(calls.indexOf("focus:true") < calls.indexOf("press:Shift+Alt+F"), "focus precedes the key");
  assert.equal(formatted.sent, "Shift+Alt+F");
  assert.deepEqual(formatted.version, { before: 1, after: 2 });
  assert.equal(formatted.textChanged, true);
  assert.equal(formatted.text, "x = 1");
  const unchanged = await pressInEditor(page, "ArrowLeft", { wait });
  assert.deepEqual(unchanged.version, { before: 2, after: 2 });
  assert.equal(unchanged.textChanged, false);
  assert.equal(unchanged.text, undefined);
  text = "y=2";
  const saved = await pressInEditor(page, "Control+s", { wait, commandWaitMs: 2_000 });
  assert.deepEqual(saved.version, { before: 2, after: 3 });
  assert.equal(saved.text, "x = 1");
});

check("play, insert and scrub steps parse with their bounds (#969)", () => {
  assert.deepEqual(parseUiSteps(["--play", "start", "--insert", "3:1=a\\nb", "--scrub", "5", "--play", "stop"]), [
    { play: "start" },
    { insert: { line: 3, col: 1 }, text: "a\nb" },
    { scrub: 5 },
    { play: "stop" },
  ]);
  assert.deepEqual(parseUiSteps(["--insert", "1:2=x=y"]), [{ insert: { line: 1, col: 2 }, text: "x=y" }]);
  assert.equal(parseUiSteps(["--insert", "1:1=a\\\\nb\\tc"])[0].text, "a\\nb\\tc");
  assert.throws(() => parseUiSteps(["--play", "pause"]), /start or stop/);
  for (const v of ["0", "-1", "1.5", "x"]) assert.throws(() => parseUiSteps(["--scrub", v]), /positive line|needs a value/);
  assert.throws(() => parseUiSteps(["--insert", "1:1="]), /1\.\.4096/);
  assert.throws(() => parseUiSteps(["--insert", "1:1=" + "a".repeat(4097)]), /1\.\.4096/);
  assert.equal(parseUiSteps(["--insert", "1:1=" + "a".repeat(4096)])[0].text.length, 4096);
  assert.throws(() => parseUiSteps(["--insert", "0:1=a"]), /position/);
  assert.throws(() => parseUiSteps(["--insert", "1:1"]), /line:col=text/);
});

const silent = async () => async () => [];

function playPage(visible) {
  const clicks = [];
  return { clicks, page: {
    locator: (selector) => ({ first: () => ({
      isVisible: async () => visible(selector),
      click: async () => clicks.push(selector),
    }) }),
  } };
}

await asyncCheck("play reports the launch state it reached, and a click whose state never comes is a failure", async () => {
  let launchState = "preview";
  const { page, clicks } = playPage((sel) => sel.includes(launchState === "play" ? "Stop" : "Play From Here"));
  let clock = 0, calls = 0;
  const request = async () => { if (clicks.length && ++calls > 2) launchState = "play"; return { launchState }; };
  const opts = { request, notifications: silent, now: () => clock, pause: async (ms) => { clock += ms; }, timeout: 1000 };
  const started = await playPreview(page, "start", opts);
  assert.equal(started.clicked, true);
  assert.equal(started.reached, true);
  assert.equal(started.running, true);
  assert.equal(started.control, "Stop");
  assert.equal(started.reason, undefined);
  clock = 0;
  const stuck = playPage((sel) => sel.includes("Play From Here"));
  const failed = await playPreview(stuck.page, "start", { ...opts, request: async () => ({ launchState: "preview" }) });
  assert.equal(failed.clicked, true);
  assert.equal(failed.reached, false);
  assert.match(failed.reason, /did not start/);
  const none = await playPreview(playPage(() => false).page, "stop", opts);
  assert.equal(none.clicked, false);
  assert.match(none.reason, /Stop control is not on screen/);
});

check("advance takes an optional positive click count", () => {
  assert.deepEqual(parseUiSteps(["--play", "start", "--advance", "--shot", "a.png", "--advance", "3", "--advance"]), [
    { play: "start" },
    { advance: 1 },
    { shotOf: "page", out: "a.png" },
    { advance: 3 },
    { advance: 1 },
  ]);
  for (const v of ["0", "-1", "1.5", "x"]) assert.throws(() => parseUiSteps(["--advance", v]), /positive click count/);
});

await asyncCheck("advance reports each click's text, launch state and game notifications, and refuses a click with no game running", async () => {
  const beats = [
    { text: "Goodbye.", launchState: "play", notes: [{ method: "game/didExecute", params: {} }] },
    { text: "Hello.", launchState: "preview", notes: [{ method: "game/exited", params: { reason: "finished" } }] },
  ];
  let state = { launchState: "play" }, pending = [{ method: "game/stale", params: null }], made = 0;
  const deps = {
    request: async () => state,
    click: async () => {
      const beat = beats[made++];
      state = { launchState: beat.launchState };
      pending.push(...beat.notes);
      return { clicked: true, at: { x: 10, y: 20 } };
    },
    settle: async () => ({ settled: true, text: beats[made - 1].text }),
    notifications: async () => async () => pending.splice(0),
  };
  const first = await advanceGame({}, 1, deps);
  assert.equal(first.reason, undefined);
  assert.equal(first.clicked, 1);
  assert.deepEqual(first.clicks, [{ click: 1, at: { x: 10, y: 20 }, settled: true, visible: "Goodbye.", launchState: "play", notifications: [{ method: "game/didExecute", params: {} }] }]);
  const second = await advanceGame({}, 1, deps);
  assert.equal(second.launchState, "preview");
  assert.deepEqual(second.clicks[0].notifications, [{ method: "game/exited", params: { reason: "finished" } }]);
  const idle = await advanceGame({}, 2, deps);
  assert.equal(idle.clicked, 0);
  assert.equal(made, 2);
  assert.match(idle.reason, /no game is running \(launch state preview\)/);
  state = { launchState: "play" };
  const noFrame = await advanceGame({}, 1, { ...deps, click: async () => ({ clicked: false, reason: "no same-origin player frame is on the page" }) });
  assert.equal(noFrame.clicked, 0);
  assert.match(noFrame.reason, /player frame/);
});

await asyncCheck("an ended PLAY counts as running: advance clicks it, and play stop leaves it for the preview", async () => {
  let state = { launchState: "play" }, made = 0;
  const notes = [
    [{ method: "game/finished", params: { kind: "out" } }, { method: "game/ended", params: { kind: "out" } }],
    [],
  ];
  let pending = [];
  const deps = {
    request: async () => state,
    click: async () => {
      pending.push(...notes[made++]);
      state = { launchState: "ended" };
      return { clicked: true, at: { x: 1, y: 2 } };
    },
    settle: async () => ({ settled: true, text: "Hello." }),
    notifications: async () => async () => pending.splice(0),
  };
  const out = await advanceGame({}, 2, deps);
  assert.equal(out.reason, undefined);
  assert.equal(out.clicked, 2);
  assert.deepEqual(out.clicks.map((c) => c.launchState), ["ended", "ended"]);
  assert.deepEqual(out.clicks[0].notifications.map((n) => n.method), ["game/finished", "game/ended"]);
  assert.deepEqual(out.clicks[1].notifications, []);
  let launchState = "ended";
  const { page, clicks } = playPage((sel) => sel.includes(launchState === "preview" ? "Play From Here" : "Stop"));
  let clock = 0;
  const opts = { notifications: silent, now: () => clock, pause: async (ms) => { clock += ms; }, timeout: 1000 };
  const stopped = await playPreview(page, "stop", { ...opts, request: async () => { if (clicks.length) launchState = "preview"; return { launchState }; } });
  assert.equal(stopped.launchStateBefore, "ended");
  assert.equal(stopped.reached, true);
  assert.equal(stopped.running, false);
  const quick = playPage(() => true);
  const started = await playPreview(quick.page, "start", { ...opts, request: async () => ({ launchState: quick.clicks.length ? "ended" : "preview" }) });
  assert.equal(started.launchState, "ended");
  assert.equal(started.running, true);
});

check("Play's reached rule reads the transition the player reports, so a run that starts and ends at once counts", () => {
  const idle = { launchState: "preview", run: null };
  assert.equal(playReached("start", idle, [{ launchState: "preview", run: 1 }, { launchState: "preview", run: null }]), true);
  assert.equal(playReached("start", idle, [{ launchState: "ended", run: 1 }]), true);
  assert.equal(playReached("start", idle, [{ launchState: "play", run: null }]), true);
  assert.equal(playReached("start", idle, [idle, idle]), false);
  assert.equal(playReached("start", { launchState: "preview", run: 4 }, [{ launchState: "preview", run: 4 }]), false);
  assert.equal(playReached("start", idle, []), false);
  assert.equal(playReached("stop", { launchState: "play", run: 2 }, [{ launchState: "play", run: 2 }, { launchState: "preview", run: null }]), true);
  assert.equal(playReached("stop", { launchState: "play", run: 2 }, [{ launchState: "ended", run: 2 }]), false);
});

check("the player is ready for Play once it reports a launch state and a loaded program", () => {
  assert.equal(playerReady(null), false);
  assert.equal(playerReady({ launchState: null, programLoaded: false }), false);
  assert.equal(playerReady({ launchState: "preview", programLoaded: false }), false);
  assert.equal(playerReady({ launchState: "preview", programLoaded: true }), true);
  assert.equal(playerReady({ launchState: "preview" }), true);
});

await asyncCheck("play reaches a story that starts and resets between polls from the run its notifications report, with the control back on Play", async () => {
  const { page, clicks } = playPage((sel) => sel.includes("Play From Here"));
  let clock = 0, pending = [];
  const notifications = async () => async () => pending.splice(0);
  page.locator = ((inner) => (selector) => {
    const loc = inner(selector);
    return { first: () => ({ ...loc.first(), click: async () => { clicks.push(selector); pending.push({ launchState: "preview", run: 1 }, { launchState: "ended", run: 1 }, { launchState: "preview", run: null }); } }) };
  })(page.locator);
  const started = await playPreview(page, "start", { request: async () => ({ launchState: "preview", programLoaded: true, run: null }), notifications, now: () => clock, pause: async (ms) => { clock += ms; }, timeout: 1000 });
  assert.equal(started.clicked, true);
  assert.equal(started.reached, true);
  assert.equal(started.reason, undefined);
  assert.equal(started.launchState, "preview");
  assert.equal(started.control, "Play From Here");
  assert.deepEqual(started.passedThrough, ["preview", "ended"]);
  assert.ok(clock < 1000, `it stops polling once the run is seen, not at the budget (${clock} ms)`);
});

await asyncCheck("play waits for the player to load the story before pressing, and does not press one that never loads", async () => {
  const { page, clicks } = playPage((sel) => sel.includes("Play From Here"));
  let clock = 0, asked = 0, clickedAtAsk = null;
  page.locator = ((inner) => (selector) => {
    const loc = inner(selector);
    return { first: () => ({ ...loc.first(), click: async () => { clickedAtAsk = asked; clicks.push(selector); } }) };
  })(page.locator);
  const request = async () => {
    asked++;
    if (clicks.length) return { launchState: "play", programLoaded: true, run: 1 };
    return asked < 4 ? { launchState: null, programLoaded: false, run: null } : { launchState: "preview", programLoaded: true, run: null };
  };
  const opts = { notifications: silent, now: () => clock, pause: async (ms) => { clock += ms; }, timeout: 1000 };
  const started = await playPreview(page, "start", { ...opts, request });
  assert.equal(clickedAtAsk, 4);
  assert.equal(started.launchStateBefore, "preview");
  assert.equal(started.reached, true);
  clock = 0;
  const never = playPage((sel) => sel.includes("Play From Here"));
  const refused = await playPreview(never.page, "start", { ...opts, request: async () => ({ launchState: null, programLoaded: false }) });
  assert.equal(refused.clicked, false);
  assert.deepEqual(never.clicks, []);
  assert.match(refused.reason, /the player had not loaded the story within 1s \(launch state null\), so Play was not pressed/);
});

function previewPage({ paneShown = false, showButton = true, paneShowsOnPress = true } = {}) {
  const state = { paneShown, pressed: [], claimedBeforePress: null, storage: {} };
  const page = {
    evaluate: async (_fn, [key, op]) => {
      if (op === "claim") state.storage[key] = "1";
      return state.storage[key] === "1";
    },
    locator: (selector) => ({
      first: () => ({
        isVisible: async () => (selector === PREVIEW_PANE_SELECTOR ? state.paneShown : selector === SHOW_PREVIEW_SELECTOR ? showButton : false),
        click: async () => {
          state.pressed.push(selector);
          if (selector === SHOW_PREVIEW_SELECTOR) state.claimedBeforePress = state.storage[DRIVER_PREVIEW_KEY] === "1";
          if (selector === SHOW_PREVIEW_SELECTOR && paneShowsOnPress) state.paneShown = true;
        },
        waitFor: async () => {
          if (selector === PREVIEW_PANE_SELECTOR && !state.paneShown) throw new Error("timeout");
        },
      }),
    }),
  };
  return { page, state };
}

await asyncCheck("the preview is revealed the way an author does, by the title bar's Show the preview button, and each missing piece is named", async () => {
  const hidden = previewPage();
  assert.deepEqual(await revealPreview(hidden.page), { revealed: true });
  assert.deepEqual(hidden.state.pressed, [SHOW_PREVIEW_SELECTOR]);
  assert.equal(hidden.state.claimedBeforePress, true, "the run claims the pane before pressing, so a run killed after the press still owns it");
  const shown = previewPage({ paneShown: true });
  assert.deepEqual(await revealPreview(shown.page), { revealed: false });
  assert.deepEqual(shown.state.pressed, []);
  assert.deepEqual(shown.state.storage, {});
  const noButton = previewPage({ showButton: false });
  const missing = await revealPreview(noButton.page);
  assert.equal(missing.revealed, false);
  assert.match(missing.reason, /the preview pane is not on screen and the title bar's Show the preview button is not either/);
  const stuck = previewPage({ paneShowsOnPress: false });
  const noPane = await revealPreview(stuck.page, { timeout: 10 });
  assert.equal(noPane.revealed, true, "a press that showed nothing still leaves the claim for the run to hide and release");
  assert.match(noPane.reason, /the preview pane did not show within 0\.01 s of pressing Show the preview/);
});

check("the saved-hidden check reads only the loaded project's workspace, so another project's saved preview cannot hold a run", () => {
  const read = (entries) => {
    const saved = globalThis.localStorage;
    globalThis.localStorage = { getItem: (key) => entries[key] ?? null };
    try {
      return previewSavedHidden();
    } finally {
      globalThis.localStorage = saved;
    }
  };
  const revealed = JSON.stringify({ preview: { revealed: true } });
  const hidden = JSON.stringify({ preview: { revealed: false } });
  assert.equal(read({ "workspace/local": hidden, "workspace/other": revealed }), true);
  assert.equal(read({ "workspace/local": revealed }), false);
  assert.equal(read({ project: "p1", "workspace/p1": revealed, "workspace/local": hidden }), false);
  assert.equal(read({ project: "p1", "workspace/p1": hidden }), true);
  assert.equal(read({}), true);
});

check("the steps whose surface sits in the preview pane reveal it first, every reveal a step names exists, and every built step has a body", () => {
  for (const [name, def] of Object.entries(NAMED_STEPS)) {
    if (def.reveals) assert.ok(Object.hasOwn(REVEALS, def.reveals), `${name} reveals ${def.reveals}`);
    assert.equal(Object.hasOwn(NAMED_STEP_BODIES, name), !def.builtBy, name);
  }
  assert.deepEqual(Object.keys(NAMED_STEPS).filter((name) => NAMED_STEPS[name].reveals === "preview"), ["preview-settings", "play", "problems"]);
});

function gamePage({ frameUrl = "http://localhost:1/__player/index.html", box = { x: 800, y: 100, width: 400, height: 600 } } = {}) {
  const clicks = [];
  const listeners = [];
  const win = { __editorProtocol: { subscribe: (fn) => { listeners.push(fn); return () => {}; } } };
  const main = { url: () => "http://localhost:1/" };
  const player = { url: () => frameUrl, locator: (sel) => ({ first: () => ({ boundingBox: async () => (sel === "#game" ? box : null) }) }) };
  const page = {
    mainFrame: () => main,
    frames: () => [main, player],
    mouse: { click: async (x, y) => { clicks.push({ x, y }); for (const fn of listeners) fn({ method: "game/exited", params: { reason: "finished" } }); } },
    waitForFunction: async () => {},
    evaluate: async (fn) => fn(),
  };
  return { page, win, clicks, listeners, emit: (message) => listeners.forEach((fn) => fn(message)) };
}

await asyncCheck("advance's own click finds the player frame and clicks the centre of #game, and its own collector reports the game notifications", async () => {
  let launchState = "play";
  const { page, win, clicks, listeners, emit } = gamePage();
  const saved = globalThis.window;
  globalThis.window = win;
  try {
    const opts = { request: async () => ({ launchState }), settle: async () => ({ settled: true, text: "Hello." }) };
    const out = await advanceGame(page, 2, opts);
    assert.equal(out.reason, undefined);
    assert.deepEqual(clicks, [{ x: 1000, y: 400 }, { x: 1000, y: 400 }]);
    assert.equal(listeners.length, 1);
    assert.deepEqual(out.clicks.map((c) => c.at), [{ x: 1000, y: 400 }, { x: 1000, y: 400 }]);
    assert.deepEqual(out.clicks[0].notifications, [{ method: "game/exited", params: { reason: "finished" } }]);
    emit({ method: "game/stale", params: null });
    emit({ method: "editor/didChange", params: {} });
    const again = await advanceGame(page, 1, opts);
    assert.equal(listeners.length, 1);
    assert.deepEqual(again.clicks[0].notifications, [{ method: "game/exited", params: { reason: "finished" } }]);
    const noFrame = await advanceGame(gamePage({ frameUrl: "http://localhost:1/other.html" }).page, 1, opts);
    assert.equal(noFrame.clicked, 0);
    assert.match(noFrame.reason, /no same-origin player frame/);
    const hidden = gamePage({ box: { x: 0, y: 0, width: 0, height: 0 } });
    const noView = await advanceGame(hidden.page, 1, opts);
    assert.equal(noView.clicked, 0);
    assert.deepEqual(hidden.clicks, []);
    assert.match(noView.reason, /#game\) is not on screen/);
  } finally {
    globalThis.window = saved;
  }
});

await asyncCheck("insert puts text at the position, reads it back and reports the preview route", async () => {
  let doc = "line one\nline two", version = 1, selection = { start: { line: 0, character: 0 } };
  const inserted = [];
  const request = async (method) => method === "editor/read" ? { textDocument: { uri: "u", version, text: doc }, selection } : null;
  const notify = async (_, params) => { selection = params.range; };
  const page = { keyboard: { insertText: async (t) => {
    inserted.push(t);
    const lines = doc.split("\n");
    const offset = lines.slice(0, selection.start.line).reduce((n, l) => n + l.length + 1, 0) + selection.start.character;
    doc = doc.slice(0, offset) + t + doc.slice(offset);
    version++;
  } }, waitForTimeout: async () => {} };
  const deps = { request, notify, settle: async () => ({ settled: true }), route: async () => "main : 1 → main : 2", pause: async () => {} };
  const out = await insertText(page, { line: 2, col: 6 }, "(x\nnew", deps);
  assert.deepEqual(inserted, ["(x\nnew"]);
  assert.equal(doc, "line one\nline (x\nnewtwo");
  assert.equal(out.textMatches, true);
  assert.equal(out.readBack, "line (x\nnewtwo");
  assert.deepEqual(out.version, { before: 1, after: 2 });
  assert.deepEqual(out.preview, { settled: true, route: "main : 1 → main : 2" });
  assert.equal(out.reason, undefined);
  const outside = await insertText(page, { line: 9, col: 1 }, "x", deps);
  assert.equal(outside.inserted, false);
  assert.match(outside.reason, /outside the open document/);
  page.keyboard.insertText = async (t) => { doc = "(" + t + ")" + doc; version++; };
  const garbled = await insertText(page, { line: 1, col: 1 }, "(", { ...deps, versionWaitMs: 0 });
  assert.equal(garbled.textMatches, false);
  assert.match(garbled.reason, /differs from the requested insert/);
});

check("a scrub report fails when the click, the position or the rendered text says it did not land", () => {
  const base = { settle: { settled: true, text: "Hello" }, route: "main : 3", scrubCheck: { outcome: "landed" } };
  const ok = scrubReport(3, { ...base, scrub: { clicked: true, line: 3, totalLines: 5, position: { line: 2 } } });
  assert.equal(ok.reason, undefined);
  assert.equal(ok.route, "main : 3");
  assert.match(scrubReport(3, { ...base, scrub: { clicked: false, reason: "Stop the running preview before scrubbing" } }).reason, /did not run: Stop the running preview/);
  assert.match(scrubReport(9, { ...base, scrub: { clicked: true, line: 5, totalLines: 5, position: { line: 4 } } }).reason, /past the end/);
  assert.match(scrubReport(3, { ...base, scrub: { clicked: true, line: 3, position: { line: 0 } } }).reason, /did not move/);
  assert.match(scrubReport(3, { ...base, scrub: { clicked: true, line: 3, position: null, positionError: "preview/gameState handler failed" } }).reason, /did not move to line 3 \(position null; preview\/gameState handler failed\)/);
  assert.match(scrubReport(3, { ...base, scrub: { clicked: true, line: 3, position: { line: 2 } }, scrubCheck: { outcome: "elsewhere", reason: "showing 1" } }).reason, /not confirmed/);
  assert.equal(scrubReport(3, { ...base, scrub: { clicked: true, line: 3, position: { line: 2 } }, scrubCheck: { outcome: "inconclusive", reason: "?" } }).reason, undefined);
});

await asyncCheck("hover reports a diagnostic at the position and its lint tooltip instead of failing on an empty server hover", async () => {
  const diagnostic = { message: { kind: "markdown", value: "Choice mark must be inside choose" }, severity: 1, range: { start: { line: 6, character: 0 }, end: { line: 6, character: 1 } } };
  const found = await diagnosticsAt({}, { line: 7, col: 1 }, { diagnostics: async () => ({ diagnostics: [diagnostic, { ...diagnostic, range: { start: { line: 2, character: 0 }, end: { line: 2, character: 4 } } }] }) });
  assert.deepEqual(found, [{ message: "Choice mark must be inside choose", severity: "error", range: diagnostic.range }]);
  const moves = [];
  const context = vm.createContext(protocolGlobals({ text: () => "x\n\n\n\n\n\n* [Go]", diagnostics: () => [diagnostic] }));
  const page = {
    keyboard: { press: async () => {} },
    mouse: { move: async (x, y) => moves.push([x, y]) },
    waitForFunction: async () => {},
    evaluate: async (fn, arg) => vm.runInContext(`(${fn})`, context)(arg),
    locator: () => ({ first: () => ({ waitFor: async () => {}, innerText: async () => "Choice mark must be inside choose" }) }),
  };
  const hoverDeps = { place: async () => ({ placed: true }), wait: async () => ({}), read: async () => ({ present: false, serverResponse: "empty" }) };
  const out = await languageSurface(page, "hover", { line: 7, col: 1 }, undefined, hoverDeps);
  assert.equal(out.reason, undefined, "a diagnostic hover is not a missing hover");
  assert.equal(out.diagnostics[0].message, "Choice mark must be inside choose");
  assert.deepEqual(out.diagnosticTooltip, { present: true, text: "Choice mark must be inside choose" });
  assert.ok(moves.length >= 2, "a second pointer move opens the lint tooltip");
  assert.deepEqual(out.tooltipPointer, { x: moves[1][0] + 2, y: moves[1][1] }, "inside a mark the second move stays at the position");
  const reads = [];
  const edgeContext = vm.createContext(protocolGlobals({ text: () => "x\n\n\n\n\n\n* [Go]", diagnostics: () => [diagnostic] }));
  const send = edgeContext.window.__editorProtocol.send;
  edgeContext.window.__editorProtocol.send = async (message) => {
    if (message.method === "editor/read" && message.params?.position) {
      reads.push(message.params.position);
      const { character } = message.params.position;
      return { ...(await send(message)), coordinates: { left: 40 + 9 * character, right: 49 + 9 * character, top: 250, bottom: 268 } };
    }
    return send(message);
  };
  moves.length = 0;
  const edge = await languageSurface({ ...page, evaluate: async (fn, arg) => vm.runInContext(`(${fn})`, edgeContext)(arg) }, "hover", { line: 7, col: 2 }, undefined, hoverDeps);
  assert.equal(edge.reason, undefined);
  assert.deepEqual(reads.at(-1), { line: 6, character: 0 }, "the tooltip move measures the last character inside the mark");
  assert.deepEqual(edge.tooltipPointer, { x: 42, y: 259 });
  assert.deepEqual(moves.at(-1), [42, 259]);
  const multiline = { ...diagnostic, range: { start: { line: 0, character: 0 }, end: { line: 1, character: 0 } } };
  const lineContext = vm.createContext(protocolGlobals({ text: () => "abc\nnext", diagnostics: () => [multiline] }));
  const lineSend = lineContext.window.__editorProtocol.send;
  lineContext.window.__editorProtocol.send = async (message) => {
    if (message.method === "editor/read" && message.params?.position) {
      reads.push(message.params.position);
      const { character } = message.params.position;
      return { ...(await lineSend(message)), coordinates: { left: 40 + 9 * character, right: 49 + 9 * character, top: 120, bottom: 138 } };
    }
    return lineSend(message);
  };
  const wrapped = await languageSurface({ ...page, evaluate: async (fn, arg) => vm.runInContext(`(${fn})`, lineContext)(arg) }, "hover", { line: 2, col: 1 }, undefined, hoverDeps);
  assert.equal(wrapped.reason, undefined);
  assert.deepEqual(reads.at(-1), { line: 0, character: 2 }, "an end at column 0 aims at the previous line's last character");
  assert.deepEqual(wrapped.tooltipPointer, { x: 60, y: 129 });
  page.locator = () => ({ first: () => ({ waitFor: async () => { throw new Error("timeout"); } }) });
  const unseen = await languageSurface(page, "hover", { line: 7, col: 1 }, undefined, hoverDeps);
  assert.match(unseen.reason, /tooltip did not open/);
});

await asyncCheck("--step drawer reports the desktop rail when it is on screen, without clicking anything", async () => {
  const clicks = [];
  const page = {
    evaluate: async () => ({ x: 0, width: 232, collapsed: false }),
    locator: () => ({ first: () => ({ count: async () => 1, click: async () => clicks.push("menu") }) }),
  };
  assert.deepEqual(await openDrawerOrRail(page), { step: "drawer", ran: true, opened: "rail", rail: { x: 0, width: 232, collapsed: false } });
  assert.deepEqual(clicks, []);
});

await asyncCheck("--step drawer opens the drawer below the desktop width and fails by name when neither is there", async () => {
  const clicks = [];
  const opened = {
    evaluate: async () => null,
    locator: () => ({ first: () => ({ count: async () => 1, click: async () => clicks.push("menu") }) }),
    waitForFunction: async () => true,
  };
  assert.deepEqual(await openDrawerOrRail(opened), { step: "drawer", ran: true, opened: "drawer" });
  assert.deepEqual(clicks, ["menu"]);
  const stuck = { ...opened, waitForFunction: async () => { throw new Error("timeout"); } };
  assert.match((await openDrawerOrRail(stuck, { timeout: 1000 })).reason, /the drawer did not open within 1 s/);
  const none = { evaluate: async () => null, locator: () => ({ first: () => ({ count: async () => 0 }) }) };
  assert.match((await openDrawerOrRail(none)).reason, /neither the desktop rail, the drawer's Open Menu button nor the phone's app menu/);
});

const appMenuPage = ({ buttons = 1, opens = true, sheet = true, clicks = [], selectors = [] } = {}) => ({
  waitForFunction: async () => true,
  evaluate: async () => sheet,
  locator: (selector) => {
    selectors.push(selector);
    return {
      first: () => ({
        count: async () => buttons,
        click: async () => clicks.push(selector),
        waitFor: async () => {
          if (!opens) throw new Error("timeout");
        },
      }),
    };
  },
});

await asyncCheck("--step app-menu presses the title bar's App menu or the rail's footer and reports a sheet or a popover", async () => {
  const clicks = [];
  const selectors = [];
  assert.deepEqual(await openAppMenu(appMenuPage({ clicks, selectors })), { step: "app-menu", ran: true, opened: "sheet" });
  assert.ok(selectors[0].includes('button[aria-label="App menu"]'), selectors[0]);
  assert.ok(selectors[0].includes('aside[aria-label="Sidebar"] button[aria-haspopup="menu"]'), selectors[0]);
  assert.deepEqual(clicks, [selectors[0]]);
  assert.deepEqual(await openAppMenu(appMenuPage({ sheet: false })), { step: "app-menu", ran: true, opened: "popover" });
  assert.match((await openAppMenu(appMenuPage({ opens: false }), { timeout: 1000 })).reason, /the app menu did not open within 1 s/);
  assert.match((await openAppMenu(appMenuPage({ buttons: 0 }))).reason, /no app menu button on the page/);
});

await asyncCheck("--step drawer opens the app menu on a phone, which has neither a rail nor a drawer", async () => {
  const page = {
    waitForFunction: async () => true,
    evaluate: async (_fn, selector) => (selector === 'aside[aria-label="Sidebar"]' ? null : true),
    locator: (selector) => ({
      first: () => ({
        count: async () => (selector.includes("Open Menu") ? 0 : 1),
        click: async () => {},
        waitFor: async () => {},
      }),
    }),
  };
  assert.deepEqual(await openDrawerOrRail(page), { step: "drawer", ran: true, opened: "app-menu", menu: "sheet" });
});

await asyncCheck("--step focus-project-name clicks the name field and reports its value and selection, or fails by name", async () => {
  const field = (state) => ({ waitFor: async () => {}, click: async () => {}, evaluate: async () => state });
  const page = (state) => ({ locator: () => ({ first: () => field(state) }) });
  assert.deepEqual(await focusProjectName(page({ focused: true, selected: true, value: "Untitled story" })), { step: "focus-project-name", ran: true, value: "Untitled story", selected: true });
  assert.match((await focusProjectName(page({ focused: false, selected: false, value: "x" }))).reason, /did not take focus/);
  const missing = { locator: () => ({ first: () => ({ waitFor: async () => { throw new Error("timeout"); } }) }) };
  assert.match((await focusProjectName(missing, { timeout: 2000 })).reason, /no project name field on the page within 2 s/);
});

check("the editor view comes from the open document's URI: the project's own main.sd is main, any other script is scripts-view, no editor is null", () => {
  assert.equal(editorViewOf("file://local/main.sd"), "main");
  assert.equal(editorViewOf("file:///main.sd"), "main");
  assert.equal(editorViewOf("file://local/Scripts/chapter_1.sd"), "scripts-view");
  assert.equal(editorViewOf("file://local/Scripts/Drafts/main.sd"), "scripts-view");
  assert.equal(editorViewOf(null), null);
});

function scriptsPageStub({ hash = "#write", rows = ["Main", "Definitions", "chapter_1.sd"], showsPage = true, menuOpens = true } = {}) {
  const state = { hash, clicked: [], menuOpen: false };
  const timeout = async () => { throw new Error("timeout"); };
  const page = {
    state,
    evaluate: async (fn) => {
      const src = String(fn);
      if (src.includes('location.hash = "#scripts"')) { if (showsPage) state.hash = "#scripts"; return; }
      if (src.includes(".test(location.hash)")) return state.hash === "#scripts";
      throw new Error(`stub page asked something it has no answer for: ${src.slice(0, 80)}`);
    },
    locator: (selector) => {
      if (selector === 'section[aria-label="Scripts"]') return { first: () => ({ waitFor: state.hash === "#scripts" ? async () => {} : timeout }) };
      if (selector === 'button[aria-label^="Options for "]') {
        return {
          first: () => ({ waitFor: rows.length ? async () => {} : timeout }),
          evaluateAll: async (fn) => fn(rows.map((name) => ({ getAttribute: () => `Options for ${name}` }))),
          nth: (i) => ({ click: async () => { state.clicked.push(rows[i]); state.menuOpen = menuOpens; } }),
        };
      }
      if (selector === '[role="menu"]') return { first: () => ({ waitFor: state.menuOpen ? async () => {} : timeout, evaluate: async () => { state.settledMenu = true; } }) };
      throw new Error(`stub page has no locator for ${selector}`);
    },
  };
  return page;
}

await asyncCheck("--step file-menu goes to the Scripts page, opens the first row menu that is not Main's and reports the row", async () => {
  const page = scriptsPageStub();
  assert.deepEqual(await openFileMenu(page), { step: "file-menu", ran: true, row: "Definitions" });
  assert.equal(page.state.hash, "#scripts");
  assert.deepEqual(page.state.clicked, ["Definitions"]);
  assert.equal(page.state.settledMenu, true, "the step waits for the open menu's animations before reporting");
  const onlyMain = scriptsPageStub({ hash: "#scripts", rows: ["Main"] });
  assert.deepEqual(await openFileMenu(onlyMain), { step: "file-menu", ran: true, row: "Main" });
  assert.deepEqual(onlyMain.state.clicked, ["Main"]);
});

await asyncCheck("--step file-menu fails by name when the Scripts page, a row menu button or the menu itself never appears", async () => {
  const noPage = scriptsPageStub({ showsPage: false });
  assert.deepEqual(await openFileMenu(noPage, { timeout: 1000 }), { step: "file-menu", ran: false, reason: "the Scripts page did not appear within 1 s of going to #scripts" });
  const noRows = scriptsPageStub({ rows: [] });
  assert.deepEqual(await openFileMenu(noRows, { timeout: 2000 }), { step: "file-menu", ran: false, reason: "no row menu button (Options for …) on the Scripts page within 2 s" });
  const stuck = scriptsPageStub({ menuOpens: false });
  assert.deepEqual(await openFileMenu(stuck, { timeout: 1000 }), { step: "file-menu", ran: false, row: "Definitions", reason: "the menu for Definitions did not open within 1 s of pressing Options for Definitions" });
});

function assetsPageStub({ hash = "#write", levels = [["Open folder Backdrops, 3 images", "Open folder Portraits, 1 image"], ["Open image harbor, modified just now · 5 kB"]], showsPage = true, opens = true, host = "dock" } = {}) {
  const state = { hash, level: 0, clicked: [] };
  const timeout = async () => { throw new Error("timeout"); };
  const labels = () => levels[state.level] ?? [];
  return {
    state,
    evaluate: async (fn) => {
      const src = String(fn);
      if (src.includes('location.hash = "#collection"')) { if (showsPage) state.hash = "#collection"; return; }
      throw new Error(`stub page asked something it has no answer for: ${src.slice(0, 80)}`);
    },
    waitForFunction: async () => {
      if (!labels().length) throw new Error("timeout");
    },
    locator: (selector) => {
      if (selector === '[data-assets-action="add"]') return { first: () => ({ waitFor: state.hash === "#collection" ? async () => {} : timeout }) };
      if (selector === '[role="listitem"] button[aria-label^="Open "]') {
        return {
          first: () => ({ waitFor: async () => { if (!labels().length) throw new Error("timeout"); } }),
          evaluateAll: async (fn) => fn(labels().map((label) => ({ getAttribute: () => label }))),
          nth: (i) => ({
            click: async () => {
              const label = labels()[i];
              state.clicked.push(label.split(",")[0]);
              if (label.startsWith("Open folder ")) state.level += 1;
              else state.open = opens;
            },
          }),
        };
      }
      if (selector === 'section[aria-label="Asset details"]') {
        return { first: () => ({ waitFor: state.open ? async () => {} : timeout, getAttribute: async () => host }) };
      }
      throw new Error(`stub page has no locator for ${selector}`);
    },
  };
}

await asyncCheck("--step asset-inspector goes to #collection, opens folders until a file row shows, presses it and reports the inspector's host", async () => {
  const page = assetsPageStub();
  assert.deepEqual(await openAssetInspector(page), { step: "asset-inspector", ran: true, asset: "harbor", host: "dock" });
  assert.equal(page.state.hash, "#collection");
  assert.deepEqual(page.state.clicked, ["Open folder Backdrops", "Open image harbor"]);
  const phone = assetsPageStub({ levels: [["Open audio chime, modified just now · 22 kB"]], host: "sheet" });
  assert.deepEqual(await openAssetInspector(phone), { step: "asset-inspector", ran: true, asset: "chime", host: "sheet" });
});

await asyncCheck("--step asset-inspector fails by name when the Assets page, a file row or the inspector never appears", async () => {
  assert.deepEqual(await openAssetInspector(assetsPageStub({ showsPage: false }), { timeout: 1000 }), {
    step: "asset-inspector",
    ran: false,
    reason: "the Assets page did not appear within 1 s of going to #collection",
  });
  assert.deepEqual(await openAssetInspector(assetsPageStub({ levels: [["Open folder Empty, empty"], []] }), { timeout: 2000 }), {
    step: "asset-inspector",
    ran: false,
    reason: "opening Empty did not change the list within 2 s",
  });
  assert.deepEqual(await openAssetInspector(assetsPageStub({ levels: [[]] }), { timeout: 1000 }), {
    step: "asset-inspector",
    ran: false,
    reason: "no file row on the Assets page within 1 s, in its type folder or the 4 first folders inside it",
  });
  assert.deepEqual(await openAssetInspector(assetsPageStub({ opens: false }), { timeout: 1000 }), {
    step: "asset-inspector",
    ran: false,
    asset: "harbor",
    reason: "the inspector did not open within 1 s of pressing harbor",
  });
});

await asyncCheck("--step settings=<section> goes to #project?section=<section>, waits for its heading to take focus and reports the index mark, or names the sections it found", async () => {
  const page = ({ focuses, sections = [] }) => {
    const calls = [];
    return {
      calls,
      evaluate: async (fn, arg) => {
        calls.push(arg ?? null);
        if (arg !== undefined) return undefined;
        if (String(fn).includes("data-settings-section")) return sections;
        return { hash: "#project?section=save-settings", marked: "save-settings" };
      },
      waitForFunction: async () => {
        if (!focuses) throw new Error("timeout");
      },
    };
  };
  const landed = page({ focuses: true });
  assert.deepEqual(await openSettings(landed, "save-settings"), { step: "settings", section: "save-settings", ran: true, hash: "#project?section=save-settings", marked: "save-settings" });
  assert.equal(landed.calls[0], "save-settings");
  assert.match(
    (await openSettings(page({ focuses: false, sections: ["theme-preferences", "save-settings"] }), "appearance", { timeout: 2000 })).reason,
    /no Settings section "appearance" took focus within 2 s; the page has: theme-preferences, save-settings/,
  );
  assert.match((await openSettings(page({ focuses: false }), "save-settings", { timeout: 2000 })).reason, /the Settings page did not open within 2 s/);
});

await asyncCheck("--step focus-script-name clicks the open script's name field, or says Main's name is fixed", async () => {
  const selectors = [];
  const field = (state) => ({ waitFor: async () => {}, click: async () => {}, evaluate: async () => state });
  const page = (state) => ({ locator: (selector) => (selectors.push(selector), { first: () => field(state) }) });
  assert.deepEqual(await focusScriptName(page({ focused: true, selected: true, value: "intro" })), { step: "focus-script-name", ran: true, value: "intro", selected: true });
  assert.deepEqual(selectors, ["input[data-script-name]"]);
  const missing = { locator: () => ({ first: () => ({ waitFor: async () => { throw new Error("timeout"); } }) }) };
  assert.match((await focusScriptName(missing, { timeout: 2000 })).reason, /no script name .*Main's name is fixed.* within 2 s/);
});

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function inFakeDocument(fakeDocument, run) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, "document");
  const previous = globalThis.document;
  globalThis.document = fakeDocument;
  try {
    return await run({ evaluate: (fn, arg) => fn(arg) });
  } finally {
    if (had) globalThis.document = previous;
    else delete globalThis.document;
  }
}

await asyncCheck("a screenshot is not taken until the page's running view transition has finished", async () => {
  const transition = deferred();
  const order = [];
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "impower-1009-transition-"));
  try {
    await inFakeDocument({ activeViewTransition: { finished: transition.promise }, getAnimations: () => [] }, async (page) => {
      page.screenshot = async () => {
        order.push("shot");
      };
      const shot = shotOf(page, "page", path.join(scratch, "page.png"));
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.deepEqual(order, [], "the screenshot waits while the transition runs");
      order.push("finished");
      transition.resolve();
      await shot;
    });
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
  assert.deepEqual(order, ["finished", "shot"]);
});

await asyncCheck("the wait covers ::view-transition animations only, gives up at its cap, and skips a page that cannot answer", async () => {
  const crossfade = deferred();
  const unrelated = deferred();
  const animations = [
    { effect: { pseudoElement: "::view-transition-old(root)" }, finished: crossfade.promise },
    { effect: { pseudoElement: null }, finished: unrelated.promise },
  ];
  const waited = inFakeDocument({ getAnimations: () => animations }, (page) => settleViewTransitions(page, { timeout: 2000 }));
  setTimeout(() => crossfade.resolve(), 20);
  assert.equal(await waited, 1, "the unrelated animation that never finishes is not awaited");
  const stuck = deferred();
  const started = Date.now();
  assert.equal(
    await inFakeDocument({ activeViewTransition: { finished: stuck.promise }, getAnimations: () => [] }, (page) => settleViewTransitions(page, { timeout: 50 })),
    -1,
  );
  assert.ok(Date.now() - started < 1000, "a transition that never finishes is given up on at the cap");
  assert.equal(await inFakeDocument({ getAnimations: () => [] }, (page) => settleViewTransitions(page)), 0);
  assert.equal(await settleViewTransitions({ evaluate: () => { throw new Error("no document"); } }), 0);
  assert.equal(await settleViewTransitions({ evaluate: async () => { throw new Error("closed"); } }), 0);
});

await asyncCheck("--step preview-settings presses the gear and reports the quick toggles, or fails by name", async () => {
  const clicks = [];
  const toggles = [{ name: "Show idle animations", checked: true }];
  const opened = {
    locator: (selector) => ({ first: () => ({ isVisible: async () => true, click: async () => clicks.push(selector) }) }),
    waitForFunction: async () => true,
    evaluate: async () => toggles,
  };
  assert.deepEqual(await openPreviewSettings(opened), { step: "preview-settings", ran: true, toggles });
  assert.deepEqual(clicks, ['button[aria-label="Preview settings"]']);
  const stuck = { ...opened, waitForFunction: async () => { throw new Error("timeout"); } };
  assert.match((await openPreviewSettings(stuck, { timeout: 1000 })).reason, /settings menu did not open within 1 s/);
  const hidden = { locator: () => ({ first: () => ({ isVisible: async () => false }) }) };
  assert.match((await openPreviewSettings(hidden)).reason, /settings button is not on screen/);
});

await asyncCheck("--step problems presses the problems toggle unless the panel is open, and reports the panel or dialog it opened", async () => {
  const clicks = [];
  const report = { surface: "panel", cards: [{ name: "In the script, 2 problems", open: true }], entries: 2 };
  const toggle = (expanded) => ({
    isVisible: async () => true,
    getAttribute: async () => expanded,
    click: async () => clicks.push("toggle"),
    textContent: async () => " 2 problems ",
  });
  const page = (expanded) => ({
    locator: () => ({ first: () => toggle(expanded) }),
    waitForFunction: async () => true,
    evaluate: async () => report,
  });
  assert.deepEqual(await openProblems(page("false")), { step: "problems", ran: true, toggle: "2 problems", ...report });
  assert.deepEqual(clicks, ["toggle"]);
  await openProblems(page("true"));
  assert.deepEqual(clicks, ["toggle"]);
  const stuck = { ...page("false"), waitForFunction: async () => { throw new Error("timeout"); } };
  assert.match((await openProblems(stuck, { timeout: 1000 })).reason, /neither the Problems panel nor its dialog \(Problems to fix or Problems and playback messages\) opened within 1 s/);
  const hidden = { locator: () => ({ first: () => ({ isVisible: async () => false }) }) };
  assert.match((await openProblems(hidden)).reason, /problems toggle under the game is not on screen/);
});

await asyncCheck("--step problems accepts the phone layout's sheet, whose title for the whole story is Problems and playback messages", async () => {
  const sheet = { textContent: "Problems and playback messages Whole story", getBoundingClientRect: () => ({ height: 600 }) };
  const fakeDocument = { getElementById: () => null, querySelectorAll: (selector) => (selector === '[role="dialog"]' ? [sheet] : []) };
  const page = {
    locator: () => ({ first: () => ({ isVisible: async () => true, getAttribute: async () => "false", click: async () => {}, textContent: async () => "No problems" }) }),
    waitForFunction: async (fn, arg) => {
      const saved = globalThis.document;
      globalThis.document = fakeDocument;
      try {
        if (!fn(arg)) throw new Error("timeout");
      } finally {
        globalThis.document = saved;
      }
    },
    evaluate: async () => ({ surface: "dialog", cards: [], entries: 0 }),
  };
  assert.deepEqual(await openProblems(page), { step: "problems", ran: true, toggle: "No problems", surface: "dialog", cards: [], entries: 0 });
});

await asyncCheck("--step wheel-list wheels each overflowing list with the mouse over its clipped text and fails a list that does not move or stops before its end, a leak, or a list that fits", async () => {
  const list = { index: 0, list: { tag: "div", class: "min-h-0 overflow-y-auto", label: "Search" }, scrollHeight: 2700, clientHeight: 400 };
  const over = { tag: "span", class: "min-w-0 truncate", label: "Search", overflow: "hidden", text: "Main" };
  const wheelPage = ({ lists = [list], pickOver = over, afterWheel = 400, atEnd = 2300, behind = 0, maxAtEnd = 2300 } = {}) => {
    const calls = [];
    let tops = { 0: 0, 7: 0, "page:main": 0 };
    return {
      calls,
      mouse: {
        move: async (x, y) => calls.push(["move", x, y]),
        wheel: async (dx, dy) => {
          calls.push(["wheel", dy]);
          const wheels = calls.filter(([kind]) => kind === "wheel").length;
          tops = wheels === 1 ? { ...tops, 0: afterWheel } : { ...tops, 0: atEnd, 7: behind };
        },
      },
      waitForTimeout: async () => {},
      evaluate: async (_fn, [op]) => {
        if (op === "plan") return { layer: null, lists };
        if (op === "pick") return { own: "0", ancestors: ["page:main"], max: 2300, tops: { ...tops, 0: 0 }, over: pickOver, ...(pickOver ? { point: { x: 100, y: 120 } } : {}) };
        if (op === "tops") return { ...tops };
        if (op === "extent") return { top: tops[0], max: maxAtEnd };
        return true;
      },
    };
  };
  const passing = wheelPage();
  const ok = await wheelList(passing);
  assert.equal(ok.ran, true, ok.reason);
  assert.deepEqual(ok.lists[0].scrollTop, { before: 0, afterWheel: 400, atEnd: 2300, max: 2300 });
  assert.equal(ok.lists[0].moved, true);
  assert.deepEqual(ok.lists[0].leakedTo, []);
  assert.deepEqual(passing.calls.slice(0, 2), [["move", 100, 120], ["wheel", 400]]);
  const trapped = await wheelList(wheelPage({ afterWheel: 0, atEnd: 0 }));
  assert.equal(trapped.ran, false);
  assert.match(trapped.reason, /the wheel over span\.min-w-0 \(overflow hidden\) did not scroll the list "Search" \(scrollTop 0 -> 0\)/);
  const stalled = await wheelList(wheelPage({ afterWheel: 400, atEnd: 400, maxAtEnd: 2200 }));
  assert.equal(stalled.ran, false);
  assert.equal(stalled.lists[0].moved, true);
  assert.equal(stalled.lists[0].reachedEnd, false);
  assert.match(stalled.reason, /the wheel moved the list "Search" but it stopped at scrollTop 400 of 2200 before its end/);
  const grown = await wheelList(wheelPage({ atEnd: 2600, maxAtEnd: 2600 }));
  assert.equal(grown.ran, true, grown.reason);
  assert.deepEqual(grown.lists[0].scrollTop, { before: 0, afterWheel: 400, atEnd: 2600, max: 2600 });
  const leaking = await wheelList(wheelPage({ behind: 120 }));
  assert.equal(leaking.ran, false);
  assert.match(leaking.reason, /past its end also scrolled 7, which is not a list it sits in/);
  const fits = await wheelList(wheelPage({ lists: [] }));
  assert.equal(fits.ran, false);
  assert.match(fits.reason, /no list on screen holds more than fits/);
  const bare = await wheelList(wheelPage({ pickOver: null }));
  assert.equal(bare.ran, false);
  assert.match(bare.reason, /no list on screen has clipped element or text under a visible point/);
});

if (failures > 0) {
  console.log(`\n${failures} failing`);
  process.exit(1);
}
console.log("\nall passing");
