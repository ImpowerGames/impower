import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const root = path.dirname(fileURLToPath(import.meta.url));
assert.ok(fs.existsSync(path.join(root, "test-suite.mjs")),
  "package verification must provide durable status/resume instead of manual log concatenation");
const { verifyResult, aggregate } = await import("./test-suite.mjs");
const file = path.resolve("fixture.test.ts");
const report = () => ({ success: true, numTotalTestSuites: 1, numPassedTestSuites: 1,
  numFailedTestSuites: 0, numPendingTestSuites: 0, numTotalTests: 1,
  numPassedTests: 1, numFailedTests: 0, numPendingTests: 0, numTodoTests: 0,
  testResults: [{ name: file, status: "passed", assertionResults: [
    { fullName: "suite checks café", status: "passed", failureMessages: [] },
  ] }] });
const log = "Test Files  1 passed (1)\nTests  1 passed (1)\n";
assert.equal(verifyResult(file, 0, null, report(), log).status, "passed");
assert.equal(verifyResult(file, 0, null, report(), log + "console: example text says no tests\n").status, "passed");
assert.notEqual(verifyResult(file, 0, null, report(), "partial output").status, "passed");
assert.notEqual(verifyResult(file, 0, null, report(), log + "Worker exited unexpectedly").status, "passed");
assert.notEqual(verifyResult(file, null, null, report(), log).status, "passed");
assert.notEqual(verifyResult(file, 0, null, {}, log).status, "passed");
const empty = report(); empty.testResults[0].assertionResults = [];
assert.notEqual(verifyResult(file, 0, null, empty, log).status, "passed");
const partial = report(); partial.numTotalTests = 2;
assert.notEqual(verifyResult(file, 0, null, partial, log).status, "passed");
assert.notEqual(verifyResult(file, 0, null, report(), log.replace("Tests  1 passed", "Tests  1 failed")).status, "passed");
assert.notEqual(verifyResult(file, 0, null, report(), log.replace("Test Files  1 passed", "Test Files  1 failed")).status, "passed");
const badName=report(); badName.testResults[0].name=123;
assert.equal(verifyResult(file,0,null,badName,log).status,"failed");
const skipped = report();
skipped.numTotalTests = 3; skipped.numPendingTests = 1; skipped.numTodoTests = 1;
skipped.testResults[0].assertionResults.push({fullName:"suite platform skip",status:"skipped",failureMessages:[]}, {fullName:"suite future",status:"todo",failureMessages:[]});
const withSkips = verifyResult(file, 0, null, skipped, "Test Files  1 passed (1)\nTests  1 passed | 1 skipped | 1 todo (3)\n");
assert.equal(withSkips.status,"passed");
assert.deepEqual(withSkips.skips.map(s=>s.name),["suite platform skip","suite future"]);
assert.notEqual(aggregate({ files: [file, "unfinished.test.ts"], attempts: [
  { file, status: "passed", failures: [], skips: [], tests: 1 },
] }).status, "passed");
console.log("PASS: durable runner rejects incomplete suite and exit-zero partial evidence");

const { acquire, reservationState, processIdentity, read, windowsVitestProcesses } = await import("./test-suite-process.mjs");
const { execute, status } = await import("./test-suite.mjs");
const { fingerprinter, canonicalPath, childEnvironment } = await import("./test-suite-identity.mjs");
assert.deepEqual(childEnvironment({Path:"native spelling",NODE_OPTIONS:"--max-old-space-size=8192",FORCE_COLOR:"1"}),
  {Path:"native spelling",NODE_OPTIONS:"--max-old-space-size=1024",NO_COLOR:"1"});
assert.deepEqual(windowsVitestProcesses('{"ProcessId":123,"CommandLine":"node scripts/test-suite.mjs"}',123),[]);
assert.deepEqual(windowsVitestProcesses('{"ProcessId":123,"CommandLine":"node vitest.mjs"}',124),[123]);
assert.deepEqual(windowsVitestProcesses('[]'),[]);
assert.deepEqual(windowsVitestProcesses(''),[]);
assert.deepEqual(windowsVitestProcesses('[{"ProcessId":123,"CommandLine":null}]',124),[123]);
assert.throws(()=>windowsVitestProcesses('{"ProcessId":123}'),/Malformed/);
const owner = { pid: 42, start: "first" }, child = { pid: 43, start: "second" };
assert.equal(reservationState({ owner, phase: "running", child }, pid => pid === 43 ? child : null), "running");
assert.equal(reservationState({ owner, phase: "launching" }, () => null), "unknown");
assert.equal(reservationState({ owner, phase: "running", child }, () => ({ pid: 43, start: "reused" })), "interrupted");
assert.throws(() => reservationState({ owner, phase: "running", child }, () => { throw new Error("denied"); }), /denied/);

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "impower-suite-"));
console.log(`Scratch repository: ${scratch}`);
const git = (...args) => {
  const result = spawnSync("git", args, { cwd: scratch, windowsHide: true, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
};
git("init");
fs.writeFileSync(path.join(scratch, "package.json"), "{}");
fs.writeFileSync(path.join(scratch, ".gitignore"), "node_modules/\n");
for (const name of ["a.test.ts", "b.spec.tsx"]) fs.writeFileSync(path.join(scratch, name), "source");
git("add", ".gitignore", "package.json", "a.test.ts", "b.spec.tsx");
const fingerprint = fingerprinter();
const before = fingerprint(scratch, ["a.test.ts", "b.spec.tsx"]);
fs.writeFileSync(path.join(scratch, "a.test.ts"), "changed");
assert.notEqual(fingerprint(scratch, ["a.test.ts", "b.spec.tsx"]), before, "dirty content invalidates");
fs.writeFileSync(path.join(scratch, "a.test.ts"), "source");
assert.equal(fingerprint(scratch, ["a.test.ts", "b.spec.tsx"]), before);
fs.mkdirSync(path.join(scratch, "node_modules"));
fs.writeFileSync(path.join(scratch, "node_modules", "dependency.js"), "first");
const dependency = fingerprint(scratch, ["a.test.ts", "b.spec.tsx"]);
fs.writeFileSync(path.join(scratch, "node_modules", "dependency.js"), "other");
assert.notEqual(fingerprint(scratch, ["a.test.ts", "b.spec.tsx"]), dependency);
assert.notEqual(fingerprint(scratch, ["a.test.ts"]), fingerprint(scratch, ["a.test.ts", "b.spec.tsx"]));
fs.writeFileSync(path.join(scratch, ".git", "config-extra"), "ignored journal");
const enginePath = path.join(scratch, ".git", "engine.mjs");
fs.writeFileSync(enginePath, `import fs from "node:fs"; import path from "node:path";
const [mode, root, output, file] = process.argv.slice(2);
if (mode === "discover") fs.writeFileSync(output, JSON.stringify(fs.readdirSync(root).filter(f=>/\\.(test|spec)\\.(ts|tsx)$/.test(f)).map(f=>path.join(root,f))));
else {
  if (!process.execArgv.includes("--max-old-space-size=1024") || process.env.NODE_OPTIONS !== "--max-old-space-size=1024") throw Error("uncapped");
  console.log("started café");
  if (file.endsWith("b.spec.tsx")) {
    const deadline=Date.now()+45000;
    while (fs.existsSync(path.join(root,".git","slow")) && Date.now()<deadline) await new Promise(r=>setTimeout(r,100));
  }
  const failed = fs.existsSync(path.join(root,".git","fail")) && file.endsWith("b.spec.tsx");
  const report = ${JSON.stringify(report())};
  report.testResults[0].name=file;
  if(failed) { report.success=false; report.numPassedTests=0; report.numFailedTests=1; report.numFailedTestSuites=1; report.numPassedTestSuites=0; report.testResults[0].status="failed"; report.testResults[0].assertionResults[0].status="failed"; report.testResults[0].assertionResults[0].failureMessages=["expected true"]; }
  console.log("Test Files  1 " + (failed?"failed":"passed") + " (1)\\nTests  1 " + (failed?"failed":"passed") + " (1)");
  fs.writeFileSync(output,JSON.stringify(report));
  process.exitCode=failed?1:0;
}`);
const lockRoot = path.join(scratch, ".git", "machine");
const options = { packageRoot: scratch, enginePath, root: lockRoot, census: () => [], fingerprint: () => "unchanged" };
const directory = path.join(scratch, ".git", "run");
fs.writeFileSync(path.join(scratch, ".git", "fail"), "");
const failed = await execute({ ...options, directory });
assert.equal(failed.status, "failed");
assert.equal(failed.completed.length, 2);
assert.equal(failed.failures[0].name, "suite checks café");
const initial = read(path.join(directory, "run.json"));
assert.equal((await execute({ ...options, directory })).status, "failed");
assert.equal(read(path.join(directory, "run.json")).attempts.length, initial.attempts.length, "failed files require explicit retry");
fs.unlinkSync(path.join(scratch, ".git", "fail"));
assert.equal((await execute({ ...options, directory, retry: [path.join(scratch, "b.spec.tsx")] })).status, "passed");
assert.equal(read(path.join(directory, "run.json")).attempts.length, initial.attempts.length + 1);
assert.equal(status(directory, { fingerprint: () => "changed" }).status, "stale");
await assert.rejects(execute({ ...options, directory, fingerprint: () => "changed" }), /identity changed/);

const reservation = acquire("first", { root: lockRoot, census: () => [] });
assert.throws(() => acquire("second", { root: lockRoot, census: () => [] }), /running/);
reservation.release();
assert.throws(() => acquire("third", { root: lockRoot, census: () => [999] }), /already running/);
fs.writeFileSync(path.join(lockRoot,"reservation.json"),"broken");
assert.throws(() => acquire("fourth", {root:lockRoot,census:()=>[]}), /JSON|Unexpected/);
fs.unlinkSync(path.join(lockRoot,"reservation.json"));
const uncertain=acquire("uncertain", {root:lockRoot,census:()=>[],identify:()=>owner});
uncertain.update({phase:"launching"});
assert.throws(() => acquire("fifth",{root:lockRoot,census:()=>[],identify:()=>null}),/unknown/);
uncertain.update({phase:"exited"}); uncertain.release();

const coordinator = path.join(scratch, ".git", "coordinator.mjs");
fs.writeFileSync(coordinator, `import { execute } from ${JSON.stringify(new URL("./test-suite.mjs", import.meta.url).href)};
await execute({...${JSON.stringify({ ...options, directory: path.join(scratch, ".git", "interrupted") })}, census:()=>[], fingerprint:()=>"unchanged"});`);
fs.writeFileSync(path.join(scratch, ".git", "slow"), "");
const launched = spawn(process.execPath, [coordinator], { stdio: "ignore", windowsHide: true });
const exited = new Promise(resolve => launched.once("exit", resolve));
const interrupted = path.join(scratch, ".git", "interrupted");
const until = async (check, message) => {
  const end = Date.now() + 30000;
  while (Date.now() < end) { if (check()) return; await new Promise(r => setTimeout(r, 100)); }
  assert.fail(message);
};
let active;
await until(() => {
  try { active = read(path.join(interrupted, "run.json")).attempts.at(-1); return active.file?.endsWith("b.spec.tsx") && active.status === "running"; }
  catch { return false; }
}, "second file running");
assert.equal(status(interrupted, { fingerprint: () => "unchanged" }).unfinished[0].status, "running", "yield remains observable");
assert.equal(status(interrupted, { fingerprint: () => { throw Error("live status must not scan inputs"); } }).status, "running");
await assert.rejects(execute({ ...options, directory: interrupted }), /running/);
launched.kill();
await exited;
assert.equal(status(interrupted, { fingerprint: () => "unchanged" }).unfinished[0].status, "running", "surviving child remains running");
await assert.rejects(execute({ ...options, directory: interrupted }), /running/);
fs.unlinkSync(path.join(scratch, ".git", "slow"));
await until(() => !processIdentity(active.child.pid), "surviving child exited");
assert.equal(status(interrupted, { fingerprint: () => "unchanged" }).unfinished[0].status, "interrupted");
assert.equal((await execute({ ...options, directory: interrupted })).status, "passed");
const resumed = read(path.join(interrupted, "run.json"));
assert.equal(resumed.attempts.filter(a => a.file?.endsWith("a.test.ts")).length, 1, "completed file retained");
assert.equal(resumed.attempts.filter(a => a.file?.endsWith("b.spec.tsx")).length, 2, "incomplete file retried once");
assert.ok(fs.readFileSync(path.join(resumed.attempts.at(-1).directory, "output.log"), "utf8").includes("café"));
console.log("PASS: resource caps, dirty/dependency identity, failure inventories, explicit retry, yielding, concurrency, orphan reconciliation and serial resume");

const unknownDirectory=path.join(scratch,".git","unknown");
fs.mkdirSync(unknownDirectory);
const unknownRun={...resumed,directory:canonicalPath(unknownDirectory),active:true,owner,
  attempts:[{...active,owner,child:null,status:"unknown",directory:path.join(canonicalPath(unknownDirectory),active.id)}]};
fs.writeFileSync(path.join(unknownDirectory,"run.json"),JSON.stringify(unknownRun));
const unknownStatus=status(unknownDirectory,{identify:()=>null,fingerprint:()=>{throw Error("unknown ownership must not verify identity");}});
assert.equal(unknownStatus.status,"unknown");
assert.equal(unknownStatus.identityChecked,false);

// Same bytes, different index membership must invalidate reusable coverage.
fs.writeFileSync(path.join(scratch,"c.test.ts"),"untracked test");
const identityOptions={...options,fingerprint:undefined,directory:path.join(scratch,".git","membership")};
assert.equal((await execute(identityOptions)).expected,2);
const membershipBefore=fingerprinter()(scratch,[]);
git("add","c.test.ts");
assert.notEqual(fingerprinter()(scratch,[]),membershipBefore,"tracked membership contributes to identity");
assert.equal(status(identityOptions.directory).status,"stale");
await assert.rejects(execute(identityOptions),/identity changed/);

const environmentDirectory=path.join(scratch,".git","environment");
const flag="IMPOWER_TEST_SUITE_ENV_FIXTURE";
const originalFlag=process.env[flag];
try {
  process.env[flag]="off";
  const environmentBefore=fingerprinter()(scratch,[]);
  assert.equal((await execute({...identityOptions,directory:environmentDirectory})).status,"passed");
  process.env[flag]="on";
  assert.notEqual(fingerprinter()(scratch,[]),environmentBefore,"forwarded environment contributes to identity");
  assert.equal(status(environmentDirectory).status,"stale");
  await assert.rejects(execute({...identityOptions,directory:environmentDirectory}),/identity changed/);
} finally { if(originalFlag===undefined)delete process.env[flag]; else process.env[flag]=originalFlag; }

// Exercise alias paths through the production API, including a not-yet-created
// journal directory and resume. Windows additionally uses the real 8.3 spelling.
const alias=path.join(path.dirname(scratch),path.basename(scratch)+"-alias");
fs.symlinkSync(scratch,alias,process.platform==="win32"?"junction":"dir");
assert.equal(canonicalPath(alias),canonicalPath(scratch));
const aliasOptions={...options,packageRoot:alias,directory:path.join(alias,".git","alias-run")};
assert.equal((await execute(aliasOptions)).status,"passed");
assert.equal((await execute(aliasOptions)).status,"passed");
if(process.platform==="win32") {
  const short=execFileSync("powershell.exe",["-NoProfile","-NonInteractive","-Command","$f=New-Object -ComObject Scripting.FileSystemObject; $f.GetFolder($env:IMPOWER_ALIAS_FIXTURE).ShortPath"],{encoding:"utf8",windowsHide:true,env:{...process.env,IMPOWER_ALIAS_FIXTURE:scratch}}).trim();
  assert.equal(canonicalPath(short),canonicalPath(scratch));
  assert.equal((await execute({...options,packageRoot:short,directory:path.join(short,".git","short-run")})).status,"passed");
  const single=execFileSync("powershell.exe",["-NoProfile","-NonInteractive","-Command","@([pscustomobject]@{ProcessId=123;CommandLine='node scripts/test-suite.mjs'}) | ConvertTo-Json -Compress"],{encoding:"utf8",windowsHide:true});
  assert.deepEqual(windowsVitestProcesses(single,123),[]);
}
console.log("PASS: unknown aggregate status, contradictory file summaries, index-only changes, environment reuse refusal, path aliases and singleton Windows census");

// The sparse tooling CI has no npm installation. The protocol/process fixtures
// above always run; a full checkout additionally exercises the installed engine.
let installed = false;
try { createRequire(import.meta.url).resolve("vitest/node"); installed = true; }
catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }
if (!installed) console.log("SKIP: real Vitest integration requires workspace dependencies (process and evidence fixtures ran)");
else {
  const real = fs.mkdtempSync(path.join(os.tmpdir(), "impower-real-suite-"));
  console.log(`Scratch repository: ${real}`);
  const realGit = args => {
    const result = spawnSync("git", args, { cwd: real, windowsHide: true, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  };
  realGit(["init"]);
  fs.writeFileSync(path.join(real, "package.json"), '{"type":"module"}');
  fs.symlinkSync(path.resolve(root,"../node_modules"), path.join(real,"node_modules"), process.platform === "win32" ? "junction" : "dir");
  fs.writeFileSync(path.join(real,".gitignore"),"node_modules/\n");
  fs.writeFileSync(path.join(real,"vitest.config.ts"),'import {defineConfig} from "vitest/config"; export default defineConfig({test:{include:["src/**/*.{test,spec}.{ts,tsx}"],exclude:["**/excluded/**"]}});');
  fs.mkdirSync(path.join(real,"src","excluded"),{recursive:true});
  // Total V8 heap includes a runtime/platform-dependent young generation. Pin
  // the worker to a fresh process using the same repository old-space cap.
  const expectedHeapLimit=Number(execFileSync(process.execPath,["--max-old-space-size=1024","-e","process.stdout.write(String(require('node:v8').getHeapStatistics().heap_size_limit))"],{encoding:"utf8",windowsHide:true,env:childEnvironment()}));
  assert.ok(Number.isSafeInteger(expectedHeapLimit) && expectedHeapLimit>0);
  const testSource=`import {it,expect} from "vitest"; import v8 from "node:v8"; it("bounded",()=>{expect(v8.getHeapStatistics().heap_size_limit).toBe(${expectedHeapLimit});expect(process.execArgv.join(" ")).toContain("max-old-space-size=1024");}); it.skip("platform skip",()=>{}); it.todo("future");`;
  for(const file of ["one.test.ts","two.spec.tsx","bracket[1].test.ts","excluded/ignored.spec.tsx"]) fs.writeFileSync(path.join(real,"src",file),testSource);
  realGit(["add","."]);
  fs.writeFileSync(path.join(real,"src","untracked.test.ts"),testSource);
  const realDirectory=path.join(real,".git","run");
  // Real children use the production machine reservation. Only the expensive
  // full-install identity scan is replaced; dirty/dependency identity is tested above.
  const realOptions={directory:realDirectory,packageRoot:real,fingerprint:()=>"fixed fixture inputs"};
  const result=await execute(realOptions);
  assert.equal(result.status,"passed",JSON.stringify(result));
  assert.equal(result.expected,3);
  assert.equal(result.tests,9);
  assert.equal(result.skips.length,6);
  const verified=status(realDirectory,{fingerprint:realOptions.fingerprint});
  assert.equal(verified.status,"passed");
  assert.ok(verified.attempts.filter(a=>a.mode==="run").every(a=>a.exit===0 && a.tests===3));
  assert.equal((await execute(realOptions)).status,"passed");
  assert.equal(status(realDirectory,{fingerprint:realOptions.fingerprint}).attempts.length,verified.attempts.length);
  fs.writeFileSync(path.join(real,"vitest.workspace.ts"),'export default [{test:{name:"only-project",include:["src/**/*.{test,spec}.{ts,tsx}"],exclude:["**/excluded/**"]}}];');
  realGit(["add","vitest.workspace.ts"]);
  const workspaceDirectory=path.join(real,".git","workspace-run");
  await assert.rejects(execute({...realOptions,directory:workspaceDirectory}),/Discovery failed/);
  const workspaceAttempt=read(path.join(workspaceDirectory,"run.json")).attempts.at(-1);
  assert.match(fs.readFileSync(path.join(workspaceAttempt.directory,"output.log"),"utf8"),/workspace\/browser\/typecheck\/pool-routing configurations are unsupported/);
  console.log("PASS: installed Vitest glob semantics, tracked-only TS/TSX test/spec, literal brackets, exact single-file execution, worker heap, skip inventory and resume");
  console.log("PASS: an automatically discovered single-project workspace is refused");
}
