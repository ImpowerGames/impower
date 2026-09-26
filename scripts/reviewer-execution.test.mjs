import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { executionCommands, executionEnvironment, startExecutionService, validateExecutionShape } from "./reviewer-execution.mjs";
import { requestExecution } from "./reviewer-execution-client.mjs";
import { runHandoff } from "./agent-handoff.mjs";
import { createReviewJob } from "./review-supervisor.mjs";

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "impower-review-execution-"));
console.log(`Scratch repository: ${scratch}`);
const root = path.join(scratch, "repo"), evidence = path.join(scratch, "evidence");
fs.mkdirSync(root); fs.mkdirSync(evidence);
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true,
  env: { ...process.env, GIT_AUTHOR_NAME: "test", GIT_AUTHOR_EMAIL: "test@example.invalid", GIT_COMMITTER_NAME: "test", GIT_COMMITTER_EMAIL: "test@example.invalid" } }).trim();
const write = (name, body) => { const file = path.join(root, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, body); };
git("init");
write("packages/example/package.json", "{}");
write("packages/example/a.test.ts", "// fixture\n");
write("scripts/test-suite.mjs", `console.log(JSON.stringify({ args: process.argv.slice(2), token: process.env.IMPOWER_REVIEW_EXECUTION_TOKEN, gh: process.env.GH_TOKEN })); console.log("Test Files  1 passed (1)\\nTests  2 passed (2)");`);
write("scripts/bench/engine-bench.mjs", `console.log("measured fixture"); process.exitCode=3;`);
write("scripts/bench/preview-bench.mjs", `console.log("started"); setTimeout(()=>console.log("finished"), 250);`);
git("add", "."); git("commit", "-m", "fixture");
const head = git("rev-parse", "HEAD");
const operations = [
  { id: "tests", kind: "vitest", package: "packages/example", files: ["a.test.ts"] },
  { id: "engine", kind: "engine-bench", mode: "step", samples: 1, warmup: 0 },
  { id: "preview", kind: "preview-bench", mode: "both", samples: 1, warmup: 0 },
];
const commands = executionCommands(operations, root);
// Real launcher/reviewer process round trip. Only the eventual public report
// is deliberately absent; delegated execution must finish before that refusal.
const reviewer = path.join(scratch, "reviewer.mjs"), prompt = path.join(scratch, "prompt.txt"), planFile = path.join(scratch, "plan.json");
fs.writeFileSync(prompt, "fixture review");
fs.writeFileSync(reviewer, `import fs from "node:fs"; import assert from "node:assert/strict"; import { requestExecution } from ${JSON.stringify(new URL("./reviewer-execution-client.mjs", import.meta.url).href)}; let prompt=""; for await (const c of process.stdin) prompt+=c; let result; try { result=await requestExecution("tests"); } catch(error) { assert.fail("Delegated tests must be available: " + error.message); } assert.equal(result.passed,true); fs.writeFileSync(/Write (.*?) with the editor tool/.exec(prompt)[1],JSON.stringify({head:${JSON.stringify(head)},next:null,commentIds:[],summary:"delegated test ran"}));`);
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
assert.deepEqual(commands[0].args.slice(-2), ["--wait", "300"]);
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
  } else console.log("SKIP: Windows PowerShell client runs in the Windows matrix leg");
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

// A second operation cannot race the first, and timeout cannot be a pass.
write("scripts/bench/preview-bench.mjs", `console.log("waiting"); setTimeout(()=>{}, 30000);`);
git("add", "."); git("commit", "-m", "timeout fixture");
const timeoutDirectory = path.join(scratch, "timeout"); fs.mkdirSync(timeoutDirectory);
const timed = await startExecutionService({ operations: [{ ...operations[2], timeoutSeconds: 1 }, operations[0]], root, directory: timeoutDirectory, head: git("rev-parse", "HEAD") });
try {
  const timedHeaders = { authorization: `Bearer ${timed.environment.IMPOWER_REVIEW_EXECUTION_TOKEN}` };
  await fetch(timed.environment.IMPOWER_REVIEW_EXECUTION_URL + "/operations/preview", { method: "POST", headers: timedHeaders });
  await assert.rejects(requestExecution("tests", { env: timed.environment }), /Another operation/);
  const result = await requestExecution("preview", { env: timed.environment, pollMs: 10 });
  assert.equal(result.timedOut, true);
  assert.equal(result.passed, false);
} finally { await timed.close(); }
console.log("PASS: delegated tests and benchmarks, authentication, fixed inputs, retained failures, freeze, serial execution and drained shutdown");
