import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { executionCommands, executionEnvironment, startExecutionService, validateExecutionShape, executionClientCommand } from "./reviewer-execution.mjs";
import { requestExecution } from "./reviewer-execution-client.mjs";
import { runHandoff } from "./agent-handoff.mjs";
import { createReviewJob } from "./review-supervisor.mjs";

// A reviewer must be able to author its own UI attempts without receiving
// arbitrary coordinator commands or widening its filesystem permissions.
assert.doesNotThrow(() => validateExecutionShape({ role: "review", execution: [
  { id: "author", kind: "editor", maxRequests: 20, timeoutSeconds: 600 },
] }), "the launcher accepts a bounded editor delegation");
// Keep the base-facing assertion above imports that did not exist on the base.
const { saveScreenshots } = await import("./reviewer-execution-client.mjs");
const { validateEditorRequest } = await import("./reviewer-editor.mjs");
const oversizedSteps = Array.from({ length: 8 }, () => ({ action: "type", field: "search", text: "x".repeat(4096) }));
assert.throws(() => validateEditorRequest({ requestId: "too-long", command: "ui", steps: oversizedSteps }), /step payload/, "combined text must fit the Windows command line");

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "impower-review-execution-"));
console.log(`Scratch repository: ${scratch}`);
const root = path.join(scratch, "repo"), evidence = path.join(scratch, "evidence");
fs.mkdirSync(root); fs.mkdirSync(evidence);
const browserCache = path.join(scratch, "browser-cache");
const cacheExecutable = path.join(browserCache, "chromium-999999", "chrome-win", "chrome.exe");
fs.mkdirSync(path.dirname(cacheExecutable), { recursive: true }); fs.writeFileSync(cacheExecutable, "fixture");
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true,
  env: { ...process.env, GIT_AUTHOR_NAME: "test", GIT_AUTHOR_EMAIL: "test@example.invalid", GIT_COMMITTER_NAME: "test", GIT_COMMITTER_EMAIL: "test@example.invalid" } }).trim();
const write = (name, body) => { const file = path.join(root, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, body); };
git("init");
write("packages/example/package.json", "{}");
write("packages/example/a.test.ts", "// fixture\n");
write("scripts/test-suite.mjs", `console.log(JSON.stringify({ args: process.argv.slice(2), token: process.env.IMPOWER_REVIEW_EXECUTION_TOKEN, gh: process.env.GH_TOKEN })); console.log("Test Files  1 passed (1)\\nTests  2 passed (2)");`);
write("scripts/bench/engine-bench.mjs", `console.log("measured fixture"); process.exitCode=3;`);
write("scripts/bench/preview-bench.mjs", `console.log("started"); setTimeout(()=>console.log("finished"), 250);`);
// A process fixture exercises the real transport, argv, files and cleanup.
// It does not stand in for the separate live browser acceptance.
write(".agents/skills/drive-web-editor/driver.mjs", `import fs from "node:fs"; import path from "node:path"; import assert from "node:assert/strict";
const args=process.argv.slice(2);
console.log(JSON.stringify({args,session:process.env.IMPOWER_DRIVER_SESSION,gh:process.env.GH_TOKEN,cache:process.env.PLAYWRIGHT_BROWSERS_PATH}));
if(args[0]==="ui") {
 const { launchEditorBrowser } = await import(${JSON.stringify(new URL("../.agents/skills/drive-web-editor/driver.mjs", import.meta.url).href)});
 await launchEditorBrowser({headless:true,dir:fs.mkdtempSync(path.join(${JSON.stringify(scratch)},"browser-profile-")),playwright:async()=>({chromium:{
  executablePath:()=>${JSON.stringify(path.join(scratch, "missing-browser.exe"))},
  launchPersistentContext:async(dir,options)=>{assert.equal(options.executablePath,${JSON.stringify(cacheExecutable)},"delegated child must select the coordinator's custom browser cache");return {};}
 }})});
}
for(let i=0;i<args.length;i++) if(args[i]==="--shot" || args[i]==="--shot-of") {
 const file=args[i+(args[i]==="--shot"?1:2)];
 fs.writeFileSync(file,Buffer.from([137,80,78,71,13,10,26,10,1]));
}
if(args.includes("--sd")) console.log(fs.readFileSync(args[args.indexOf("--sd")+1],"utf8"));
`);
git("add", "."); git("commit", "-m", "fixture");
const head = git("rev-parse", "HEAD");
const operations = [
  { id: "tests", kind: "vitest", package: "packages/example", files: ["a.test.ts"] },
  { id: "engine", kind: "engine-bench", mode: "step", samples: 1, warmup: 0 },
  { id: "preview", kind: "preview-bench", mode: "both", samples: 1, warmup: 0 },
];
const commands = executionCommands(operations, root);
const editorGrant = { id: "author", kind: "editor", maxRequests: 3, timeoutSeconds: 60 };
const authorRequest = { requestId: "find-hello", command: "ui", script: "Hello reviewer!\n", steps: [
  { action: "open", value: "find" }, { action: "type", field: "search", text: "Hello" },
  { action: "click", value: "next" }, { action: "shot", target: "find" },
] };
for (const invalid of [
  { ...editorGrant, maxRequests: 0 }, { ...editorGrant, maxRequests: 101 },
  { ...editorGrant, args: ["--probe", "bad.js"] }, { ...editorGrant, environment: {} },
]) assert.throws(() => executionCommands([invalid], root));
for (const invalid of [
  { ...authorRequest, script: "x".repeat(65537) }, { ...authorRequest, script: "\u0000" },
  { ...authorRequest, requestId: "../escape" }, { ...authorRequest, project: root },
  { ...authorRequest, command: "up" }, { ...authorRequest, steps: [{ action: "probe", value: "bad.js" }] },
  { ...authorRequest, steps: [{ action: "shot", target: "../../secret" }] },
  { ...authorRequest, steps: [{ action: "press", value: "Control+l" }] },
  { ...authorRequest, steps: [{ action: "complete", line: 1, column: 1, text: "x", path: "bad" }] },
  { ...authorRequest, steps: Array(31).fill({ action: "open", value: "find" }) },
  { ...authorRequest, steps: Array(5).fill({ action: "shot", target: "page" }) },
]) assert.throws(() => validateEditorRequest(invalid));
const editorDirectory = path.join(scratch, "editor"); fs.mkdirSync(editorDirectory);
const previousBrowserCache = process.env.PLAYWRIGHT_BROWSERS_PATH;
process.env.PLAYWRIGHT_BROWSERS_PATH = browserCache;
const editorService = await startExecutionService({ operations: [editorGrant], root, directory: editorDirectory, head });
const editorOptions = { env: editorService.environment, pollMs: 10, request: authorRequest };
try {
  await assert.rejects(requestExecution("author", { ...editorOptions, request: { requestId: "too-long", command: "ui", steps: oversizedSteps } }), /step payload/);
  assert.deepEqual(fs.readdirSync(editorDirectory), [], "reject oversized steps before creating a session or launching servers");
  const result = await requestExecution("author", editorOptions);
  assert.equal(result.passed, true);
  assert.match(result.output, /Hello reviewer!/);
  const invoked = JSON.parse(result.output.split("\n")[0]);
  assert.deepEqual(invoked.args.slice(3, 9), ["--open", "find", "--type", "search=Hello", "--click", "next"]);
  assert.match(invoked.session, /^review-/);
  assert.equal(invoked.gh, undefined);
  assert.equal(invoked.cache, browserCache);
  assert.equal(result.screenshots.length, 2);
  const copied = saveScreenshots(result, scratch);
  assert.ok(copied.screenshots.every(shot => fs.existsSync(shot.path) && !shot.base64));
  assert.equal((await requestExecution("author", editorOptions)).log, result.log, "same request reuses evidence");
  await assert.rejects(requestExecution("author", { ...editorOptions, request: { ...authorRequest, script: "Different" } }), /different content/);
  await assert.rejects(requestExecution("author", { ...editorOptions, request: { ...authorRequest, requestId: "bad", steps: [{ action: "probe" }] } }), /invalid editor step/);
  const second = { requestId: "state", command: "ui", steps: [] };
  if (process.platform === "win32") {
    const requestFile = path.join(scratch, "request.json"); fs.writeFileSync(requestFile, JSON.stringify(second));
    const output = await new Promise((resolve, reject) => execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-File", fileURLToPath(new URL("./reviewer-execution-client.ps1", import.meta.url)), "author", requestFile], { cwd: scratch, env: { ...process.env, ...editorService.environment }, windowsHide: true }, (error, stdout) => error ? reject(error) : resolve(stdout)));
    const copiedResult = JSON.parse(output);
    assert.ok(fs.existsSync(copiedResult.screenshots[0].path));
    assert.equal(copiedResult.screenshots[0].base64, undefined);
  } else await requestExecution("author", { ...editorOptions, request: second });
  const longText = String.fromCharCode(92) + '"'.repeat(1000) + "x".repeat(3000);
  const large = { requestId: "large-valid", command: "ui", steps: Array.from({ length: 3 }, () => ({ action: "type", field: "search", text: longText })) };
  const largeResult = await requestExecution("author", { ...editorOptions, request: large });
  assert.equal(largeResult.passed, true, "large allowed text survives actual Windows argv quoting");
  const largeArgs = JSON.parse(largeResult.output.split("\n")[0]).args;
  assert.deepEqual(largeArgs.slice(1, 7), large.steps.flatMap(step => ["--type", `search=${step.text}`]));
  await assert.rejects(requestExecution("author", { ...editorOptions, request: { ...second, requestId: "fourth" } }), /budget exhausted/);
} finally {
  try { await editorService.close(); }
  finally {
    if (previousBrowserCache === undefined) delete process.env.PLAYWRIGHT_BROWSERS_PATH;
    else process.env.PLAYWRIGHT_BROWSERS_PATH = previousBrowserCache;
  }
}
const sessionDirectory = path.join(editorDirectory, fs.readdirSync(editorDirectory)[0]);
assert.ok(fs.existsSync(path.join(sessionDirectory, "up.log")));
assert.ok(fs.existsSync(path.join(sessionDirectory, "down.log")), "service shuts down the owned server session");
const up = JSON.parse(fs.readFileSync(path.join(sessionDirectory, "up.log"), "utf8").trim());
const down = JSON.parse(fs.readFileSync(path.join(sessionDirectory, "down.log"), "utf8").trim());
assert.equal(up.session, down.session);
assert.deepEqual(down.args, ["down"]);
console.log("PASS: editor grant, bounded author requests, screenshots through both clients, replay, request budget and owned cleanup");
// Real launcher/reviewer process round trip. Only the eventual public report
// is deliberately absent; delegated execution must finish before that refusal.
const reviewer = path.join(scratch, "reviewer.mjs"), prompt = path.join(scratch, "prompt.txt"), planFile = path.join(scratch, "plan.json");
fs.writeFileSync(prompt, "fixture review");
fs.writeFileSync(reviewer, `import fs from "node:fs"; import assert from "node:assert/strict"; import { requestExecution } from ${JSON.stringify(new URL("./reviewer-execution-client.mjs", import.meta.url).href)}; let prompt=""; for await (const c of process.stdin) prompt+=c; if(prompt.startsWith('Reviewer route probe')){console.log('OK');process.exit(0);} let result; try { result=await requestExecution("tests"); } catch(error) { assert.fail("Delegated tests must be available: " + error.message); } assert.equal(result.passed,true); fs.writeFileSync(/Write (.*?) with the editor tool/.exec(prompt)[1],JSON.stringify({head:${JSON.stringify(head)},next:null,commentIds:[],summary:"delegated test ran"}));`);
fs.writeFileSync(planFile, JSON.stringify({ worktree: root, pr: 737, writer: "writer-test", writerEffort: "medium", reviewer: "reviewer-test", completedReviewRound: 0, maxSteps: 1, first: "review", journal: path.join(scratch, "journal.jsonl"), steps: { review: { role: "review", round: 1, model: "reviewer-test", executable: process.execPath, args: [reviewer, "--model", "reviewer-test"], prompt, next: [null], execution: operations } } }));
await assert.rejects(runHandoff(planFile, { jobRoot: scratch, slotRoot: path.join(scratch, "slots") }), /posted comment IDs/);
const journal = fs.readFileSync(path.join(scratch, "journal.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
const execution = journal.find(row => row.event === "execution-service");
assert.equal(JSON.parse(fs.readFileSync(path.join(execution.directory, "tests.json"))).passed, true);
assert.equal(fs.readdirSync(path.join(scratch, "slots")).length, 0, "service drains before slot release");
const supervised = path.join(scratch, "supervised");
await createReviewJob({ worktree: root, jobDir: supervised, head, base: head, pr: 737, writer: "writer-test", writerEffort: "medium", permissions: { mode: "fixture" }, reviewer: "reviewer-test", round: 1, completedReviewRound: 0,
  destination: { threadId: "fixture", turnId: "fixture", cwd: root }, reviews: [{ id: "tests", transport: "native-claude-json", executable: process.execPath, args: ["--model", "reviewer-test", "--effort", "high", "--permission-mode", "dontAsk", "--output-format", "json"], effort: "high", permissions: "dontAsk", prompt, execution: operations }] },
  { preflight: async () => ({ supported: true }) }, { jobRoot: scratch, verifyExecutable: () => {} });
assert.deepEqual(JSON.parse(fs.readFileSync(path.join(supervised, "handoff.json"))).steps.tests.execution, operations, "supervised plans preserve the exact caller grants");
assert.equal(commands[0].args[1], "run");
assert.deepEqual(commands[0].args.slice(-2), ["--wait", "600"], "the reservation wait defaults to the run budget, not a fixed 300");
assert.equal(commands[0].waitSeconds, 600);
const patient = executionCommands([{ ...operations[0], timeoutSeconds: 900, waitSeconds: 1200 }], root)[0];
assert.deepEqual(patient.args.slice(-2), ["--wait", "1200"], "a step may set its own bounded wait");
assert.equal(patient.timeoutSeconds, 900);
assert.equal(patient.waitSeconds, 1200);
assert.deepEqual(executionCommands([{ ...operations[0], timeoutSeconds: 1800 }], root)[0].args.slice(-2), ["--wait", "1800"], "the wait follows the operation's timeout");
assert.equal(executionCommands([operations[1]], root)[0].waitSeconds, undefined, "only Vitest waits for the reservation");
assert.throws(() => executionCommands([{ ...operations[0], waitSeconds: 0 }], root), /waitSeconds/);
assert.throws(() => executionCommands([{ ...operations[0], waitSeconds: 1801 }], root), /waitSeconds/);
assert.throws(() => executionCommands([{ ...operations[1], waitSeconds: 10 }], root), /Unknown execution operation field/);
assert.deepEqual(commands[1].args.slice(1), ["--fixture", "--mode", "step", "--samples", "1", "--warmup", "0"]);
for (const alteration of [ { command: "arbitrary" }, { env: { NODE_OPTIONS: "--import bad" } }, { args: ["--project", "outside"] } ]) {
  assert.throws(() => executionCommands([{ ...operations[0], ...alteration }], root), /Unknown execution operation field/);
}
for (const files of [["../a.test.ts"], ["--a.test.ts"], [path.join(root, "packages/example/a.test.ts")], ["a*.test.ts"], ["missing.test.ts"]]) {
  assert.throws(() => executionCommands([{ ...operations[0], files }], root));
}
write("packages/example/untracked.test.ts", "// untracked\n");
assert.throws(() => executionCommands([{ ...operations[0], files: ["untracked.test.ts"] }], root), /tracked file/);
fs.unlinkSync(path.join(root, "packages/example/untracked.test.ts"));
assert.throws(() => validateExecutionShape({ role: "implement", execution: operations }), /only supported on review/);
assert.throws(() => executionCommands([operations[0], operations[0]], root), /unique/);
assert.throws(() => executionCommands([{ ...operations[1], samples: 101 }], root), /samples/);
assert.throws(() => executionCommands([{ ...operations[1], mode: "unknown" }], root), /benchmark/);
assert.throws(() => executionCommands([{ ...operations[1], timeoutSeconds: 0 }], root), /timeoutSeconds/);
const env = executionEnvironment({ Path: "bin", TEMP: "temp", GH_TOKEN: "secret", OPENAI_API_KEY: "secret", NODE_OPTIONS: "--import bad", IMPOWER_REVIEW_EXECUTION_TOKEN: "secret", GIT_CONFIG_COUNT: "2" });
assert.deepEqual(env, { Path: "bin", TEMP: "temp", NODE_OPTIONS: "--max-old-space-size=1024" });

const service = await startExecutionService({ operations, root, directory: evidence, head });
const options = { env: service.environment, pollMs: 10 };
const url = service.environment.IMPOWER_REVIEW_EXECUTION_URL;
const headers = { authorization: `Bearer ${service.environment.IMPOWER_REVIEW_EXECUTION_TOKEN}` };
try {
  assert.equal((await fetch(url + "/operations")).status, 403);
  assert.equal((await fetch(url + "/operations/tests?args=bad", { method: "POST", headers })).status, 404);
  assert.equal((await fetch(url + "/operations/tests", { method: "POST", headers, body: "{}" })).status, 400);
  assert.equal((await requestExecution(undefined, options)).length, 3);
  const tested = await requestExecution("tests", options);
  assert.equal(tested.passed, true);
  assert.equal(tested.head, head);
  assert.match(tested.output, /Test Files  1 passed/);
  assert.equal(JSON.parse(tested.output.split("\n")[0]).token, undefined);
  assert.equal(JSON.parse(tested.output.split("\n")[0]).gh, undefined);
  assert.equal((await requestExecution("tests", options)).log, tested.log, "repeated request returns retained evidence without another run");
  if (process.platform === "win32") {
    const output = await new Promise((resolve, reject) => execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-File", fileURLToPath(new URL("./reviewer-execution-client.ps1", import.meta.url)), "tests"], { env: { ...process.env, ...service.environment }, windowsHide: true }, (error, stdout) => error ? reject(error) : resolve(stdout)));
    assert.equal(JSON.parse(output).passed, true, "Windows client requires no sandbox access to the Node installation");
    const quotedRoot = path.join(scratch, "client ' $(Write-Output unexpected)");
    fs.mkdirSync(path.join(quotedRoot, "scripts"), { recursive: true });
    fs.copyFileSync(fileURLToPath(new URL("./reviewer-execution-client.ps1", import.meta.url)), path.join(quotedRoot, "scripts/reviewer-execution-client.ps1"));
    const quotedOutput = await new Promise((resolve, reject) => execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", executionClientCommand(quotedRoot) + " tests"], { env: { ...process.env, ...service.environment }, windowsHide: true }, (error, stdout) => error ? reject(error) : resolve(stdout)));
    assert.equal(JSON.parse(quotedOutput).passed, true, "the supplied PowerShell command preserves literal shell metacharacters in paths");
  } else console.log("SKIP: Windows PowerShell client runs in the Windows matrix leg");
  if (process.platform !== "win32") {
    const quotedRoot = path.join(scratch, "client ' $(printf unexpected)");
    fs.mkdirSync(path.join(quotedRoot, "scripts"), { recursive: true });
    fs.copyFileSync(fileURLToPath(new URL("./reviewer-execution-client.mjs", import.meta.url)), path.join(quotedRoot, "scripts/reviewer-execution-client.mjs"));
    const quotedOutput = await new Promise((resolve, reject) => execFile("sh", ["-c", executionClientCommand(quotedRoot) + " tests"], { env: { ...process.env, ...service.environment }, windowsHide: true }, (error, stdout) => error ? reject(error) : resolve(stdout)));
    assert.equal(JSON.parse(quotedOutput).passed, true, "the supplied POSIX command preserves literal shell metacharacters in paths");
  }
  const failed = await requestExecution("engine", options);
  assert.equal(failed.exit, 3);
  assert.equal(failed.passed, false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(evidence, "engine.json"))).exit, 3);
  const started = await fetch(url + "/operations/preview", { method: "POST", headers });
  assert.equal((await started.json()).state, "running");
  await service.close();
  assert.match(fs.readFileSync(path.join(evidence, "preview.log"), "utf8"), /finished/, "shutdown drains the actual command before returning");
  await assert.rejects(fetch(url + "/operations", { headers }));
} finally { await service.close(); }

// Frozen input changes refuse execution, and the shutdown preserves the failure.
const changed = await startExecutionService({ operations, root, directory: evidence, head });
write("packages/example/a.test.ts", "// changed\n");
await assert.rejects(requestExecution("tests", { env: changed.environment }), /worktree changed/);
await assert.rejects(changed.close(), /worktree changed/);
git("restore", "packages/example/a.test.ts");

// Hold one admitted operation until the second request has been refused. This
// does not race a one-second timeout against Windows process-identity probes.
const serialDirectory = path.join(scratch, "serial"); fs.mkdirSync(serialDirectory);
let releaseRun;
const heldRun = new Promise(resolve => { releaseRun = resolve; });
const serial = await startExecutionService({ operations, root, directory: serialDirectory, head }, {
  run: async command => { await heldRun; return { id: command.id, exit: 0, signal: null }; },
});
try {
  await fetch(serial.environment.IMPOWER_REVIEW_EXECUTION_URL + "/operations/preview", { method: "POST", headers: { authorization: `Bearer ${serial.environment.IMPOWER_REVIEW_EXECUTION_TOKEN}` } });
  await assert.rejects(requestExecution("tests", { env: serial.environment }), /Another operation/);
} finally { releaseRun(); await serial.close(); }

// A Vitest run that never took the machine-wide reservation is not a result:
// it reports `notRun`, never a pass, whatever exit status the runner gave.
const marker = "test-suite: not run: Existing suite running\n";
for (const [label, exit, line] of [["exit 75", 75, marker], ["marker with exit 0", 0, marker], ["exit 75 without marker", 75, ""]]) {
  const notRunDirectory = fs.mkdtempSync(path.join(scratch, "not-run-"));
  const notRunLog = path.join(notRunDirectory, "tests.log");
  fs.writeFileSync(notRunLog, `{"status":"waiting"}\n${line}`);
  const waiting = await startExecutionService({ operations: [operations[0]], root, directory: notRunDirectory, head }, { run: async command => ({ id: command.id, exit, signal: null, log: notRunLog }) });
  try {
    const result = await requestExecution("tests", { env: waiting.environment, pollMs: 10 });
    assert.equal(result.passed, false, label);
    assert.equal(result.notRun, true, label);
  } finally { await waiting.close(); }
}
const ranDirectory = fs.mkdtempSync(path.join(scratch, "ran-"));
const ranLog = path.join(ranDirectory, "tests.log");
fs.writeFileSync(ranLog, "1 failed\n");
const ran = await startExecutionService({ operations: [operations[0]], root, directory: ranDirectory, head }, { run: async command => ({ id: command.id, exit: 1, signal: null, log: ranLog }) });
try {
  const result = await requestExecution("tests", { env: ran.environment, pollMs: 10 });
  assert.equal(result.passed, false);
  assert.notEqual(result.notRun, true, "a real failure is not a not-run");
} finally { await ran.close(); }

// A real owned child timeout cannot be a pass.
write("scripts/bench/preview-bench.mjs", `console.log("waiting"); setTimeout(()=>{}, 30000);`);
git("add", "."); git("commit", "-m", "timeout fixture");
const timeoutDirectory = path.join(scratch, "timeout"); fs.mkdirSync(timeoutDirectory);
const timed = await startExecutionService({ operations: [{ ...operations[2], timeoutSeconds: 1 }, operations[0]], root, directory: timeoutDirectory, head: git("rev-parse", "HEAD") });
try {
  const timedHeaders = { authorization: `Bearer ${timed.environment.IMPOWER_REVIEW_EXECUTION_TOKEN}` };
  await fetch(timed.environment.IMPOWER_REVIEW_EXECUTION_URL + "/operations/preview", { method: "POST", headers: timedHeaders });
  const result = await requestExecution("preview", { env: timed.environment, pollMs: 10 });
  assert.equal(result.timedOut, true);
  assert.equal(result.passed, false);
} finally { await timed.close(); }

// A Vitest child queued behind another suite for longer than timeoutSeconds
// still starts and finishes: the reservation wait is added to the kill budget.
write("scripts/test-suite.mjs", `setTimeout(() => { console.log("Test Files  1 passed (1)"); }, 1500);`);
git("add", "."); git("commit", "-m", "queued suite fixture");
const queuedDirectory = path.join(scratch, "queued"); fs.mkdirSync(queuedDirectory);
const queued = await startExecutionService({ operations: [{ ...operations[0], timeoutSeconds: 1, waitSeconds: 5 }], root, directory: queuedDirectory, head: git("rev-parse", "HEAD") });
try {
  const queuedHeaders = { authorization: `Bearer ${queued.environment.IMPOWER_REVIEW_EXECUTION_TOKEN}` };
  await fetch(queued.environment.IMPOWER_REVIEW_EXECUTION_URL + "/operations/tests", { method: "POST", headers: queuedHeaders });
  const result = await requestExecution("tests", { env: queued.environment, pollMs: 10 });
  assert.equal(result.timedOut, false, "queueing past timeoutSeconds does not consume the run's budget");
  assert.equal(result.passed, true);
} finally { await queued.close(); }
console.log("PASS: delegated tests and benchmarks, authentication, fixed inputs, retained failures, freeze, serial execution and drained shutdown");

// The client must be told when returned output is incomplete, while the
// coordinator retains the complete log for inspection.
write("scripts/bench/engine-bench.mjs", `console.log("x".repeat(4 * 1024 * 1024 + 64));`);
git("add", "."); git("commit", "-m", "large output fixture");
const largeDirectory = path.join(scratch, "large-output"); fs.mkdirSync(largeDirectory);
const large = await startExecutionService({ operations: [operations[1]], root, directory: largeDirectory, head: git("rev-parse", "HEAD") });
try {
  const result = await requestExecution("engine", { env: large.environment, pollMs: 10 });
  assert.equal(Buffer.byteLength(result.output), 4 * 1024 * 1024);
  assert.ok(fs.statSync(result.log).size > Buffer.byteLength(result.output), "complete output stays in the coordinator log");
  assert.equal(result.outputTruncated, true, "reviewer is explicitly told its response is incomplete");
  assert.equal(result.outputBytes, fs.statSync(result.log).size);
} finally { await large.close(); }

// A service failure after a command drains must not hide confirmed reviewer
// exit or leak the machine-wide reviewer slot.
fs.unlinkSync(path.join(root, ".git", "agent-review-job.json"));
write("scripts/bench/preview-bench.mjs", `import fs from "node:fs"; fs.writeFileSync("unexpected-output", "dirty");`);
git("add", "."); git("commit", "-m", "dirty command fixture");
const dirtyHead = git("rev-parse", "HEAD"), dirtyJournal = path.join(scratch, "dirty-journal.jsonl");
fs.writeFileSync(reviewer, `import fs from "node:fs"; import assert from "node:assert/strict"; import { requestExecution } from ${JSON.stringify(new URL("./reviewer-execution-client.mjs", import.meta.url).href)}; let prompt=""; for await(const c of process.stdin) prompt+=c; if(prompt.startsWith('Reviewer route probe')){console.log('OK');process.exit(0);} const result=await requestExecution("preview"); assert.equal(result.passed,false); fs.writeFileSync(/Write (.*?) with the editor tool/.exec(prompt)[1],JSON.stringify({head:${JSON.stringify(dirtyHead)},next:null,commentIds:[],summary:"service failure observed"}));`);
const dirtyPlan = JSON.parse(fs.readFileSync(planFile));
dirtyPlan.journal = dirtyJournal;
dirtyPlan.steps.review.execution = [operations[2]];
fs.writeFileSync(planFile, JSON.stringify(dirtyPlan));
await assert.rejects(runHandoff(planFile, { jobRoot: scratch, slotRoot: path.join(scratch, "dirty-slots") }), /worktree changed/);
const dirtyRows = fs.readFileSync(dirtyJournal, "utf8").trim().split("\n").map(JSON.parse);
assert.equal(dirtyRows.find(row => row.event === "exited")?.code, 0, "service failure retains the confirmed reviewer exit");
assert.equal(fs.readdirSync(path.join(scratch, "dirty-slots")).length, 0, "drained service failure releases the exited reviewer's slot");
assert.equal(fs.existsSync(path.join(root, ".git", "agent-handoff.lock")), false);
console.log("PASS: service failure preserves diagnosis and confirmed exit without leaking reviewer capacity");

// A second cleanup error must retain the delegated command's failure too.
for (const mode of ["journal", "slot", "both"]) {
  fs.unlinkSync(path.join(root, "unexpected-output"));
  const combinedJournal = path.join(scratch, `combined-${mode}.jsonl`);
  const combinedSlots = path.join(scratch, `combined-${mode}-slots`);
  dirtyPlan.journal = combinedJournal;
  fs.writeFileSync(planFile, JSON.stringify(dirtyPlan));
  const writeSync = fs.writeSync;
  fs.writeSync = (fd, data, ...args) => {
    if (typeof data === "string") {
      if (mode !== "slot" && data.includes('"event":"exited"')) throw new Error("injected exit journal failure");
      if (mode !== "journal" && data.includes('"phase":"exited"')) throw new Error("injected slot release failure");
    }
    return writeSync(fd, data, ...args);
  };
  try {
    await assert.rejects(runHandoff(planFile, { jobRoot: scratch, slotRoot: combinedSlots }), error => {
      assert.match(error.message, /worktree changed/, "the delegated failure survives later cleanup failures");
      assert.match(error.message, /Child exit confirmed/);
      if (mode !== "slot") assert.match(error.message, /injected exit journal failure/);
      if (mode !== "journal") assert.match(error.message, /injected slot release failure/);
      return true;
    });
  } finally { fs.writeSync = writeSync; }
  assert.equal(fs.existsSync(path.join(root, ".git", "agent-handoff.lock")), false);
  assert.equal(fs.readdirSync(combinedSlots).length, mode === "journal" ? 0 : 1, "only a failed slot release retains its reservation");
}
console.log("PASS: combined service, exit-journal and slot-release failures preserve every diagnosis");
