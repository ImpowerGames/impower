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
import { followedByMain, parseUiSteps, unionRect, languageSurface, liveDeps } from "./driver.mjs";
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
  let lines = ["[[portrait]]"];
  const view = { state: { doc: { lines: 1, line: () => ({ from: 0, text: lines[0] }) } }, coordsAtPos: () => ({ left: 100, top: 40, bottom: 60 }) };
  const context = vm.createContext({ document: { querySelector: () => ({ cmTile: { view } }), elementFromPoint: () => ({ closest: () => true }) } });
  const page = {
    keyboard: { press: async (key) => calls.push(["press", key]), type: async (text) => { calls.push(["type", text]); lines = ["[[portrait" + text + "]]"]; } },
    mouse: { move: async (...args) => calls.push(["move", ...args]) },
    evaluate: async (fn, arg) => vm.runInContext(`(${fn})`, context)(arg),
    locator: () => ({ first: () => ({ waitFor: async () => { throw new Error("no widget"); } }) }),
  };
  const deps = { place: async () => ({ placed: true }), read: async (_, kind) => kind === "hover" ? { present: false } : { popupPresent: false } };
  const hover = await languageSurface(page, "hover", { line: 1, col: 4 }, undefined, deps);
  assert.deepEqual(calls.at(-1), ["move", 101, 50, { steps: 5 }]);
  assert.equal(hover.serverResponse, "unobserved");
  assert.match(hover.reason, /cannot distinguish an empty server answer/);
  const completion = await languageSurface(page, "completion", { line: 1, col: 11 }, "~ha", deps);
  assert.equal(completion.textMatches, true);
  assert.deepEqual(calls.at(-1), ["type", "~ha"]);
  assert.equal(completion.serverResponse, "unobserved");
  calls.length = 0;
  const refused = await languageSurface(page, "completion", { line: 5, col: 1 }, "x", { ...deps, place: async () => ({ placed: false, reason: "outside" }) });
  assert.equal(refused.reason, "outside");
  assert.equal(calls.some(([call]) => call === "type"), false);
});

function workerHarness({ unregister = true, source = "installed worker A", reloadFails = false } = {}) {
  const calls = [];
  const listeners = new Set();
  const cdp = new EventEmitter();
  const targetId = "worker-target";
  const controller = { state: "activated", scriptURL: "http://editor.test/sw.js", postMessage: (data, ports) => { for (const fn of listeners) fn({ data, ports }); } };
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
      let result = {};
      if (message.method === "Debugger.enable") event({ method: "Debugger.scriptParsed", params: { scriptId: "script", url: controller.scriptURL } });
      if (message.method === "Debugger.getScriptSource") result = { scriptSource: source };
      if (message.method === "Runtime.evaluate") result = vm.runInContext(message.params.expression, context);
      event({ id: message.id, result });
    }
    return {};
  };
  const page = {
    evaluate: async (fn, arg) => vm.runInContext(`(${fn})`, context)(arg),
    waitForFunction: async (fn) => { const result = vm.runInContext(`(${fn})`, context)(); assert.equal(typeof result, "boolean", "wait predicate must be synchronous"); assert.equal(result, true); },
    waitForTimeout: async () => {},
  };
  const ctx = { newCDPSession: async () => cdp };
  const reload = async () => {
    calls.push("reload");
    if (reloadFails) throw new Error("reload refused");
    cdp.emit("ServiceWorker.workerVersionUpdated", { versions: [{ versionId: "v", scriptURL: controller.scriptURL, status: "activated", runningStatus: "running", targetId }] });
  };
  return { page, ctx, reload, calls, listeners, cdp, event };
}

await asyncCheck("fresh worker unregisters before reload, hashes the installed source and captures worker cache warnings", async () => {
  const h = workerHarness();
  const { report, close } = await liveDeps.reportFreshWorker(h.page, h.ctx, h.reload);
  assert.equal(report.reason, undefined);
  assert.equal(report.controlled, true);
  assert.equal(report.refreshed, true);
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
  for (const options of [{ unregister: false }, { reloadFails: true }]) {
    const h = workerHarness(options);
    const { report } = await reportFreshWorker(h.page, h.ctx, h.reload);
    assert.equal(report.refreshed, false);
    assert.equal(report.sha256, null);
    assert.match(report.reason, /fresh service worker verification failed/);
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

if (failures > 0) {
  console.log(`\n${failures} failing`);
  process.exit(1);
}
console.log("\nall passing");
