#!/usr/bin/env node
// Pins parseUiSteps, which turns `driver.mjs ui` arguments into steps and
// refuses anything malformed before a browser is launched (#423). Run:
//   node .claude/skills/drive-web-editor/ui-steps.test.mjs
//
// The failure this guards against: a flag with a missing or empty value used
// to produce a step that matched no branch and vanished, so `ui --sd` or
// `--type "=Hello"` printed a clean report saying the run did nothing, which
// the skill reads as a pass. And an unknown panel, field, button or
// screenshot target used to throw from inside the step loop, after the
// browser was up and earlier steps had run, taking the whole report with it.
// A screen name is only shape-checked here: whether the tab exists is decided
// at run time, where the failure lists the tabs present.
//
// Pure function, no browser. Node's built-in assert only.

import assert from "node:assert/strict";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import vm from "node:vm";
import { MessageChannel } from "node:worker_threads";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { followedByMain, parseUiSteps, unionRect, languageSurface, waitLanguageSurface, liveDeps, readLanguageSurface, placeCaret, shotOf } from "./driver.mjs";
import { reportFreshWorker, workerSession } from "./worker-report.mjs";

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
  // Measured on 2026-09-04 the editor renders these nine; the parser does not
  // pin the list, and a name that is not on the page fails at run time with
  // the tabs present listed.
  for (const name of ["logic", "assets", "share", "main", "scripts", "files", "urls", "game", "screenplay", "future-tab"]) {
    assert.deepEqual(parseUiSteps(["--screen", name]), [{ screen: name }]);
  }
  assert.throws(() => parseUiSteps(["--screen", "Logic"]), /lowercase/);
  assert.throws(() => parseUiSteps(["--screen", "main scripts"]), /lowercase/);
});

check("a --screen logic is 'followed by main' only when the very next step is --screen main", () => {
  // The condition the ui loop hands switchScreen, decided from the parsed
  // steps. Only --screen main waits for the script editor, so only it may
  // turn a logic switch's missing editor into a note.
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

await asyncCheck("hover uses pointer movement, completion types text, and missing surfaces are unknown server responses", async () => {
  const calls = [];
  let lines = ["intro", "[[portrait]]"], mainVisible = true;
  const view = { state: { doc: { lines: 2, line: (n) => ({ from: n === 1 ? 0 : 6, text: lines[n - 1] }) } }, coordsAtPos: (pos) => ({ left: 100 + pos * 8, top: 40, bottom: 60 }) };
  const context = vm.createContext({ document: { querySelector: (selector) => selector === '[role="tab"][id$="-trigger-main"]' ? (mainVisible ? {} : null) : selector === ".sparkdown-script-editor-root .cm-content" ? { cmTile: { view } } : null, elementFromPoint: () => ({ closest: () => true }) } });
  const page = {
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
  assert.match(hover.reason, /cannot distinguish an empty server answer/);
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
  const context = vm.createContext({ document: { querySelectorAll: (selector) => nodes.get(selector) ?? [] }, getComputedStyle: (e) => ({ visibility: e.hidden ? "hidden" : "visible" }), innerWidth: 800, innerHeight: 600 });
  const shots = [];
  const page = { evaluate: async (fn, arg) => JSON.parse(JSON.stringify(await vm.runInContext(`(${fn})`, context)(arg))), waitForTimeout: (ms) => new Promise(resolve => setTimeout(resolve, ms)), viewportSize: () => ({ width: 800, height: 600 }), screenshot: async (args) => shots.push(args) };
  return { page, popup, info, hover, nodes, shots, rectangle };
}

await asyncCheck("real DOM reader distinguishes labels, details, image dimensions and parked surfaces", async () => {
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
  assert.equal((await readLanguageSurface(h.page, "hover")).present, false);
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
  assert.equal((await waitLanguageSurface({}, "hover", { ...timing, read })).present, true);
  assert.equal(clock, 100);
  clock = 0;
  assert.equal((await waitLanguageSurface({}, "completion", { ...timing, read })).infoPanelPresent, true);
  assert.equal(clock, 250);
  clock = 0;
  const missing = await waitLanguageSurface({}, "completion", { ...timing, read: async () => ({ popupPresent: true, infoPanelPresent: false }) });
  assert.equal(missing.popupPresent, true);
  assert.equal(clock, 200);
  clock = 0;
  assert.equal((await waitLanguageSurface({}, "hover", { ...timing, read: async () => ({ present: false }) })).present, false);
  assert.equal(clock, 500);
});

await asyncCheck("a windowed completion list is disclosed and all viewport edges reject parked surfaces", async () => {
  const h = surfaceFixture();
  assert.equal((await readLanguageSurface(h.page, "completion")).optionsTruncated, false);
  const query = h.popup.querySelector;
  h.popup.querySelector = (s) => s === '.cm-completionListIncompleteTop, .cm-completionListIncompleteBottom' ? {} : query(s);
  assert.equal((await readLanguageSurface(h.page, "completion")).optionsTruncated, true);
  for (const [x, y] of [[-300, 0], [0, -300], [800, 0], [0, 600]]) {
    h.hover.rect = h.rectangle(x, y, 180, 180);
    assert.equal((await readLanguageSurface(h.page, "hover")).present, false);
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

await asyncCheck("go-to converts a one-based column, verifies the caret, and distinguishes an absent editor", async () => {
  const state = { doc: { lines: 2, line: (n) => ({ length: n === 2 ? 12 : 3 }), lineAt: () => ({ number: 2, from: 4 }) }, selection: { main: { head: 4 } } };
  const context = vm.createContext({ document: { querySelector: () => ({ cmTile: { view: { state } } }) } });
  const page = { evaluate: async (fn, arg) => vm.runInContext(`(${fn})`, context)(arg) };
  let typed, opens = 0;
  const actions = { present: async () => ({ present: true }), open: async () => { opens++; return { open: true }; }, type: async (_, field, text) => { assert.equal(field, "line"); typed = text; return { matches: true }; }, submit: async () => { state.selection.main.head = 4 + Number(typed.split(":")[1]); } };
  assert.equal((await placeCaret(page, { line: 2, col: 7 }, actions)).placed, true);
  assert.equal(typed, "2:6");
  assert.equal((await placeCaret(page, { line: 2, col: 14 }, actions)).placed, false);
  assert.equal(opens, 1);
  assert.equal((await placeCaret(page, { line: 2, col: 7 }, { ...actions, present: async () => ({ present: false, reason: "put --screen logic before this step" }) })).reason, "put --screen logic before this step");
  assert.equal(opens, 1);
  assert.equal((await placeCaret(page, { line: 2, col: 8 }, { ...actions, submit: async () => {} })).placed, false);
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
    const context = vm.createContext({ document: {
      querySelector: (selector) => selector === '[role="tab"][id$="-trigger-main"]' ? {} : selector === '.sparkdown-script-editor-root .cm-content' ? { cmTile: { view } } : null,
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
      ? { present: placed }
      : { popupPresent: placed, infoPanelPresent: placed };
    const out = await languageSurface(page, kind, { line: 1, col: 9 }, "x", { place: async () => ({ placed: true }), read });
    assert.ok(pauses > 0, `${kind} must wait for placement`);
    assert.equal(kind === "hover" ? out.present : out.popupPresent, true);
    assert.equal(out.serverResponse, undefined);
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

if (failures > 0) {
  console.log(`\n${failures} failing`);
  process.exit(1);
}
console.log("\nall passing");
