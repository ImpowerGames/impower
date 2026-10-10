// agent-tooling-timeout-ms: 900000
// Current sparse check measured538124ms;254s is a conservative historical
// whole-check allowance for the installed branch, plus about108s margin.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { processIdentity } from "./test-suite-process.mjs";

if (process.argv.includes("--progress-boundaries") || process.argv.includes("--progress-first")) {
  await ownedProgressBoundaries();
} else if (process.argv.includes("--owned-boundaries") || process.argv.includes("--waiting-holder")) {
  await ownedBoundaries();
} else {
// Journal/admission tests use an explicit coordinator protocol adapter. Its
// synthetic proofs carry no containment credit; actual helpers run below in
// ownedBoundaries and in the separate cross-platform helper/API checks.
const coordinatorAdapter = await import("./fixtures/test-suite-coordinator-adapter.mjs");
const coordinatorDependencies = { prepareRuntime: coordinatorAdapter.prepareRuntime,
  prepareChild: coordinatorAdapter.prepareChild, ownedChild: coordinatorAdapter.ownedChild,
  // Unit protocol identities are synthetic. Native/API cases omit this seam.
  identify:pid=>pid===process.pid?processIdentity(pid):null };
const root = path.dirname(fileURLToPath(import.meta.url));
assert.ok(fs.existsSync(path.join(root, "test-suite.mjs")),
  "package verification must provide durable status/resume instead of manual log concatenation");
const { verifyResult, aggregate, directTerminalSummary } = await import("./test-suite.mjs");
const { main: packageMain } = await import("./test-suite.mjs");
const packageScratch = fs.mkdtempSync(path.join(os.tmpdir(), "impower-package-preflight-"));
console.log(`Package preflight scratch: ${packageScratch}`);
const plainFile = path.join(packageScratch, "plain-file");
fs.writeFileSync(plainFile, "fixture");
const noManifest = path.join(packageScratch, "no-manifest");
fs.mkdirSync(noManifest);
const directoryManifest = path.join(packageScratch, "directory-manifest");
fs.mkdirSync(path.join(directoryManifest, "package.json"), { recursive: true });
for (const target of [path.join(packageScratch, "missing"), plainFile, noManifest, directoryManifest]) {
  for (const command of ["run", "start"]) {
    let censusCalls = 0;
    await assert.rejects(packageMain([command, target, ...(command === "run" ? ["fixture.test.ts"] : [])], {
      vitestPath: plainFile,
      root: path.join(packageScratch, "reservation"),
      census: () => { censusCalls++; throw new Error("must not queue"); },
    }), error => error.message.includes(path.resolve(target)) && error.message.includes("package directory")
      && error.message.includes("packages/sparkdown"), `${command} explains invalid package path ${target}`);
    assert.equal(censusCalls, 0, "invalid package paths are refused before queue admission");
    assert.equal(fs.existsSync(path.join(packageScratch, "reservation")), false);
  }
}
console.log("PASS: run and start explain invalid package directories before queue admission");
const literalPackage = path.join(packageScratch, "literal-tests");
fs.mkdirSync(literalPackage);
fs.writeFileSync(path.join(literalPackage, "package.json"), '{"type":"module"}');
fs.writeFileSync(path.join(literalPackage, "valid.test.ts"), "fixture");
const literalStore = path.join(packageScratch, "literal-reservation");
const literalMarker = path.join(packageScratch, "literal-child-started");
const literalChild = path.join(packageScratch, "literal-child.mjs");
fs.writeFileSync(literalChild, `import fs from "node:fs"; fs.writeFileSync(${JSON.stringify(literalMarker)}, "started");`);
fs.mkdirSync(path.join(literalPackage, "directory.test.ts"));
fs.writeFileSync(path.join(packageScratch, "outside.test.ts"), "fixture");
const outsideTests = path.join(packageScratch, "outside-tests");
fs.mkdirSync(outsideTests);
fs.writeFileSync(path.join(outsideTests, "outside.test.ts"), "fixture");
fs.symlinkSync(outsideTests, path.join(literalPackage, "escape"), process.platform === "win32" ? "junction" : "dir");
const namespaceInputs = process.platform === "win32" ? [path.toNamespacedPath(path.join(literalPackage, "valid.test.ts"))] : [];
for (const requested of namespaceInputs) {
  assert.equal(fs.statSync(requested).isFile(), true, "namespace refusal covers an existing regular file");
  assert.equal(fs.realpathSync.native(requested), fs.realpathSync.native(path.join(literalPackage, "valid.test.ts")));
  await assert.rejects(packageMain(["run", literalPackage, requested], { vitestPath: literalChild, root: literalStore,
    census: () => { throw new Error("unsupported namespace reached admission"); } }), /unsupported Windows namespace syntax.*ordinary relative or absolute path/);
}
for (const invalid of ["missing.test.ts", "valid.test.ts\r", "valid.test.ts\n", "valid.test.ts ", "*.test.ts", "valid?.test.ts", ...namespaceInputs,
  "--passWithNoTests", "directory.test.ts", "../outside.test.ts", "escape/outside.test.ts", "valid.ts", "valid.test.js"]) {
  let literalCensusCalls = 0;
  await assert.rejects(packageMain(["run", literalPackage, "valid.test.ts", invalid], {
    vitestPath: literalChild, root: literalStore,
    census: () => { literalCensusCalls++; return []; },
  }), error => error.message.includes(JSON.stringify(invalid)) && error.message.includes("test file")
    && !/[\r\n]/.test(error.message), "a mixed request refuses its escaped invalid input before queue admission");
  assert.equal(literalCensusCalls, 0);
  assert.equal(fs.existsSync(literalStore), false, "invalid files create no reservation store or child");
  assert.equal(fs.existsSync(literalMarker), false, "a mixed invalid list starts no child");
}
for (const control of ["\u007f", "\u0085", "\u2028", "\u2029"]) {
  const requested = `valid${control}.test.ts`;
  await assert.rejects(packageMain(["run", literalPackage, requested], { vitestPath: literalChild, root: literalStore }),
    error => !error.message.includes(control) && error.message.includes(`\\u${control.charCodeAt(0).toString(16).padStart(4, "0")}`),
    "non-JSON control and line separator diagnostics remain escaped");
  assert.equal(fs.existsSync(literalStore), false);
  assert.equal(fs.existsSync(literalMarker), false);
}
console.log("PASS: literal test inputs refuse missing, control, filter, option, directory and escaping paths before admission");
const literalAlias = path.join(packageScratch, "literal-alias");
fs.symlinkSync(literalPackage, literalAlias, process.platform === "win32" ? "junction" : "dir");
const additionalAlias = path.join(packageScratch, "additional-alias");
fs.symlinkSync(literalPackage, additionalAlias, process.platform === "win32" ? "junction" : "dir");
const validSpellings = ["valid.test.ts", path.join(literalPackage, "valid.test.ts"),
  path.join(literalAlias, "valid.test.ts"), path.join(additionalAlias, "valid.test.ts")];
fs.mkdirSync(path.join(literalPackage, "node_modules", "vitest"), { recursive: true });
fs.writeFileSync(path.join(literalPackage, "node_modules", "vitest", "package.json"), '{"version":"2.1.9"}');
if (process.platform === "win32") {
  const shortPackage = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
    "$f=New-Object -ComObject Scripting.FileSystemObject; $f.GetFolder($env:IMPOWER_LITERAL_PACKAGE).ShortPath"],
    { encoding: "utf8", windowsHide: true, env: { ...process.env, IMPOWER_LITERAL_PACKAGE: literalPackage } }).trim();
  validSpellings.push(path.join(shortPackage, "valid.test.ts"));
  if (shortPackage === literalPackage) console.log("SKIP: distinct Windows 8.3 spelling unavailable; additional junction alias is covered");
}
for (const requested of validSpellings) {
  await assert.rejects(packageMain(["run", literalAlias, requested], {
    ...coordinatorDependencies, enginePath: literalChild, root: literalStore,
    census: () => { throw new Error("valid alias reached queue admission"); },
  }), /valid alias reached queue admission/, "valid relative, physical and additional OS aliases reach admission");
}
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
const failedFinalizer=aggregate({files:[file],attempts:[{file,status:"passed",tests:1},
  {id:"finalizer",file:"aggregate-request.json",mode:"merge",status:"failed",problems:["Reporter failed"]}]});
assert.equal(failedFinalizer.status,"failed");assert.deepEqual(failedFinalizer.failed,[]);
assert.deepEqual(failedFinalizer.completed,[file]);assert.equal(failedFinalizer.unitFailures[0].mode,"merge");
console.log("PASS: non-file unit failure cannot label a completed aggregate passed");
const unknownDiagnostic=directTerminalSummary({exit:1,status:"unknown",directory:"fixture-run-evidence",
  observedAttempts:[{id:"unknown-unit",mode:"run-direct",status:"unknown",directory:"fixture-attempt-evidence",
    containmentError:"Owned helper proof is missing"}]},5000);
assert.equal(unknownDiagnostic.status,"unknown");assert.equal(unknownDiagnostic.evidence,"fixture-run-evidence");
assert.equal(unknownDiagnostic.attemptDiagnostics[0].containmentError,"Owned helper proof is missing");
assert.equal(unknownDiagnostic.attemptDiagnostics[0].evidence,"fixture-attempt-evidence");
console.log("PASS: terminal formatter retains unknown containment reason and both evidence paths (unit only)");

const { acquire, reservationState, read, atomic, windowsVitestProcesses, vitestProcesses } = await import("./test-suite-process.mjs");
const { execute, status } = await import("./test-suite.mjs");
const { fingerprinter, canonicalPath, childEnvironment, isWithinDirectory } = await import("./test-suite-identity.mjs");
assert.equal(isWithinDirectory("C:\\repo\\.git","D:\\journal",path.win32),false,"cross-volume journals are outside the Git directory");
assert.equal(isWithinDirectory("C:\\repo\\.git","C:\\repo\\.git",path.win32),false);
assert.equal(isWithinDirectory("C:\\repo\\.git","C:\\repo\\outside",path.win32),false);
assert.equal(isWithinDirectory("C:\\repo\\.git","C:\\repo\\.git\\..named-run",path.win32),true);
assert.deepEqual(childEnvironment({Path:"native spelling",NODE_OPTIONS:"--max-old-space-size=8192",FORCE_COLOR:"1"}),
  {Path:"native spelling",NODE_OPTIONS:"--max-old-space-size=1024",NO_COLOR:"1"});
assert.deepEqual(windowsVitestProcesses('{"ProcessId":123,"CommandLine":"node scripts/test-suite.mjs"}',123),[]);
assert.deepEqual(windowsVitestProcesses('{"ProcessId":123,"CommandLine":"node vitest.mjs"}',124),[123]);
assert.deepEqual(windowsVitestProcesses('[]'),[]);
assert.deepEqual(windowsVitestProcesses(''),[]);
assert.deepEqual(windowsVitestProcesses('[{"ProcessId":123,"CommandLine":null}]',124),[123]);
assert.throws(()=>windowsVitestProcesses('{"ProcessId":123}'),/Malformed/);
const mixedCensus='[{"ProcessId":1,"CommandLine":"node vitest C:\\\\Scratch\\\\run"},{"ProcessId":2,"CommandLine":"node vitest D:\\\\other"},{"ProcessId":3,"CommandLine":null}]';
assert.deepEqual(windowsVitestProcesses(mixedCensus,9,{within:"c:\\scratch"}),[1]);
assert.deepEqual(windowsVitestProcesses(mixedCensus,9),[1,2,3]);
const owner = { pid: 42, start: "first" }, child = { pid: 43, start: "second" };
assert.equal(reservationState({ owner, phase: "running", child }, pid => pid === 43 ? child : null), "running");
assert.equal(reservationState({ owner, phase: "launching" }, () => null), "unknown");
assert.equal(reservationState({ owner, phase: "running", child }, () => ({ pid: 43, start: "reused" })), "interrupted");
assert.throws(() => reservationState({ owner, phase: "running", child }, () => { throw new Error("denied"); }), /denied/);

const scratch = canonicalPath(fs.mkdtempSync(path.join(os.tmpdir(), "impower-suite-")));
console.log(`Scratch repository: ${scratch}`);
const git = (...args) => {
  const result = spawnSync("git", args, { cwd: scratch, windowsHide: true, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
};
git("init");
if(process.platform==="win32") {
  const target=path.join(scratch,".git","atomic.json");
  atomic(target,{value:"old"});
  const rename=fs.renameSync;
  let denied=0;
  fs.renameSync=function(...args) {
    if(args[1]===target && denied++<2) { const error=new Error("reader holds file"); error.code="EPERM"; throw error; }
    return rename.apply(this,args);
  };
  try { atomic(target,{value:"new"}); } finally { fs.renameSync=rename; }
  assert.deepEqual(read(target),{value:"new"});
  fs.renameSync=()=>{ const error=new Error("persistent denial"); error.code="EPERM"; throw error; };
  try { assert.throws(()=>atomic(target,{value:"lost"}),/persistent denial/); }
  finally { fs.renameSync=rename; }
  assert.deepEqual(read(target),{value:"new"},"persistent denial preserves previous evidence");
}
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
Object.assign(options, coordinatorDependencies);
fs.mkdirSync(path.join(scratch, "node_modules", "vitest"), { recursive: true });
fs.writeFileSync(path.join(scratch, "node_modules", "vitest", "package.json"), '{"version":"2.1.9"}');
const outsideDirectory=path.join(scratch,"outside-journal");
await assert.rejects(execute({...options,directory:outsideDirectory}),/below this worktree's Git directory/);
assert.equal(fs.existsSync(outsideDirectory),false,"reject journal destinations before creating them");
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
assert.equal(status(directory, { identify:coordinatorDependencies.identify,fingerprint: () => "changed" }).status, "stale");
await assert.rejects(execute({ ...options, directory, fingerprint: () => "changed" }), /identity changed/);

// Let a separate coordinator finish a retry at the precise ownership handoff.
// A finishing predecessor must never overwrite that successor's durable result.
const raceDirectory=path.join(scratch,".git","release-run");
const raceHelper=path.join(scratch,".git","retry.mjs");
fs.writeFileSync(raceHelper, `import {execute} from ${JSON.stringify(new URL("./test-suite.mjs",import.meta.url).href)};
const result=await execute({...${JSON.stringify({...options,directory:raceDirectory,retry:[path.join(scratch,"b.spec.tsx")]})},census:()=>[],fingerprint:()=>"unchanged"});
if(result.status!=="passed")throw Error(JSON.stringify(result));`);
fs.writeFileSync(path.join(scratch,".git","fail"),"");
const originalUnlink=fs.unlinkSync;
let releasedGuards=0;
fs.unlinkSync=function(target,...args) {
  const result=originalUnlink.call(this,target,...args);
  if(path.resolve(target)===path.join(lockRoot,"guard.json") && ++releasedGuards===2) {
    originalUnlink(path.join(scratch,".git","fail"));
    const helper=spawnSync(process.execPath,[raceHelper],{encoding:"utf8",windowsHide:true,timeout:30000});
    assert.equal(helper.status,0,helper.stdout+helper.stderr);
  }
  return result;
};
try { assert.equal((await execute({...options,directory:raceDirectory})).status,"failed"); }
finally { fs.unlinkSync=originalUnlink; }
const durableRetry=status(raceDirectory,{fingerprint:()=>"unchanged"});
assert.equal(durableRetry.status,"passed","successor retry evidence survives predecessor release");
assert.equal(durableRetry.attempts.length,4,"retain discovery, original files and successful retry");

fs.appendFileSync(path.join(scratch,".gitignore"),"vitest.config.ts\nlocal-options.ts\n");
fs.writeFileSync(path.join(scratch,"vitest.config.ts"),'import options from "./local-options"; export default options;');
fs.writeFileSync(path.join(scratch,"local-options.ts"),'export default {test:{include:["*.test.ts"]}};');
const ignoredDirectory=path.join(scratch,".git","ignored-config-run");
assert.equal((await execute({...options,directory:ignoredDirectory,fingerprint:fingerprinter()})).status,"passed");
fs.appendFileSync(path.join(scratch,"vitest.config.ts"),"\n// changed configuration\n");
assert.equal(status(ignoredDirectory,{identify:coordinatorDependencies.identify}).status,"stale","ignored configuration changes invalidate evidence");
await assert.rejects(execute({...options,directory:ignoredDirectory,fingerprint:fingerprinter()}),/identity changed/);
const ignoredHelperBefore=fingerprinter()(scratch,[]);
fs.appendFileSync(path.join(scratch,"local-options.ts"),"\n// changed imported configuration\n");
assert.notEqual(fingerprinter()(scratch,[]),ignoredHelperBefore,"ignored configuration helpers are inputs too");
fs.appendFileSync(path.join(scratch,".gitignore"),"fixture.txt\nlocal/\n");
fs.writeFileSync(path.join(scratch,"fixture.txt"),"expected");
const assetDirectory=path.join(scratch,".git","ignored-asset-run");
assert.equal((await execute({...options,directory:assetDirectory,fingerprint:fingerprinter()})).status,"passed");
fs.writeFileSync(path.join(scratch,"fixture.txt"),"unexpected");
assert.equal(status(assetDirectory,{identify:coordinatorDependencies.identify}).status,"stale","ignored assets invalidate reusable evidence regardless of extension");
await assert.rejects(execute({...options,directory:assetDirectory,fingerprint:fingerprinter()}),/identity changed/);
fs.mkdirSync(path.join(scratch,"local","node_modules","dep"),{recursive:true});
fs.writeFileSync(path.join(scratch,"local","package.json"),"{}");
const nestedDependency=path.join(scratch,"local","node_modules","dep","index.js");
fs.writeFileSync(nestedDependency,"first");
const nestedDirectory=path.join(scratch,".git","ignored-nested-dependency-run");
assert.equal((await execute({...options,directory:nestedDirectory,fingerprint:fingerprinter()})).status,"passed");
fs.writeFileSync(nestedDependency,"a deliberately longer dependency");
assert.equal(status(nestedDirectory,{identify:coordinatorDependencies.identify}).status,"stale","ignored nested package dependencies participate with native paths");
await assert.rejects(execute({...options,directory:nestedDirectory,fingerprint:fingerprinter()}),/identity changed/);
console.log("PASS: release-boundary retries retain evidence and ignored configuration invalidates reuse");

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

// A waiting run queues on a live reservation, then holds it while other
// Vitest processes finish, so a third run queues behind it rather than racing.
const { acquireWaiting } = await import("./test-suite-process.mjs");
const { runVitest, vitestArguments } = await import("./test-suite.mjs");
// Each wait signal advances the scenario one step, and a constant identity
// keeps every attempt cheap, so no step depends on timers or machine load.
const live = { root: lockRoot, identify: () => owner };
const holder = acquire("holder", { ...live, census: () => [] });
let present = [777];
const waits = [];
const waited = await acquireWaiting("queued", { ...live, waitMs: 60000, pollMs: 20, census: () => present,
  onWait: ({ waiting }) => {
    waits.push(waiting);
    if (waiting === "reservation") holder.release();
    if (waiting === "vitest processes") {
      assert.throws(() => acquire("racer", { ...live, census: () => [] }), /running/, "the reservation is held while waiting for other processes");
      present = [];
    }
  } });
assert.deepEqual(waits, ["reservation", "vitest processes"], "the run queued on the reservation, then on the census");
assert.throws(() => acquire("racer", { ...live, census: () => [] }), /running/, "the reservation stays held until released");
waited.release();
const blocker = acquire("blocker", { root: lockRoot, census: () => [] });
await assert.rejects(acquireWaiting("impatient", { root: lockRoot, waitMs: 60, pollMs: 20, census: () => [] }), /Existing suite running/);
blocker.release();
await assert.rejects(acquireWaiting("timeout", { root: lockRoot, waitMs: 60, pollMs: 20, census: () => [5] }), /still present: 5/);
acquire("released after timeout", { root: lockRoot, census: () => [] }).release();
const ambiguous = acquire("ambiguous", { root: lockRoot, census: () => [], identify: () => owner });
ambiguous.update({ phase: "launching" });
let ambiguousWaits = 0;
await assert.rejects(acquireWaiting("unknown", { root: lockRoot, waitMs: 5000, pollMs: 20, census: () => [], identify: () => null,
  onWait: () => { ambiguousWaits++; } }), /unknown/);
assert.equal(ambiguousWaits, 0, "an ambiguous reservation refuses without queue polling, independent of process-lookup latency");
ambiguous.update({ phase: "exited" }); ambiguous.release();
console.log("PASS: --wait queues on the reservation, holds it while other Vitest processes exit, and times out by releasing it");

assert.deepEqual(vitestArguments(["src/a.test.ts"]), ["run", "src/a.test.ts", "--pool=forks", "--poolOptions.forks.minForks=1", "--poolOptions.forks.maxForks=1", "--no-file-parallelism"]);
assert.ok(!vitestArguments([]).some(a => /singleFork/.test(a)), "singleFork shares one environment across files");
const fakeVitest = path.join(scratch, ".git", "fake-vitest.mjs");
const fakeRecord = path.join(scratch, ".git", "fake-vitest.json");
fs.writeFileSync(fakeVitest, `import fs from "node:fs";
if(process.argv[2]==="run-direct") {
const read = () => JSON.parse(fs.readFileSync(${JSON.stringify(path.join(lockRoot, "reservation.json"))}, "utf8"));
let reservation = read();
for (const deadline = Date.now() + 20000; !reservation.child && Date.now() < deadline; reservation = read()) await new Promise(r => setTimeout(r, 50));
fs.writeFileSync(${JSON.stringify(fakeRecord)}, JSON.stringify({ argv: process.argv.slice(2), execArgv: process.execArgv, nodeOptions: process.env.NODE_OPTIONS, cwd: process.cwd(), phase: reservation.phase, child: reservation.child?.pid === process.pid }));
}
await import(${JSON.stringify(new URL("./fixtures/test-suite-engine-control.mjs", import.meta.url).href)});
if(process.argv[2]==="run-direct")process.exitCode=3;`);
const ran = await runVitest({ ...options, files: ["a.test.ts"], enginePath: fakeVitest, stdio: "ignore" });
assert.equal(ran.exit, 1, "the public aggregate reports ordinary test failure");
assert.equal(ran.observedAttempts.find(attempt=>attempt.mode==="run-direct").exit, 3, "raw unit exit remains observed evidence");
const recorded = read(fakeRecord);
assert.equal(recorded.argv[0], "run-direct");
assert.equal(recorded.argv[3], path.join(scratch,"a.test.ts"));
assert.ok(recorded.execArgv.includes("--max-old-space-size=1024"));
assert.equal(recorded.nodeOptions, "--max-old-space-size=1024", "forked workers inherit the heap cap");
assert.equal(canonicalPath(recorded.cwd), canonicalPath(scratch));
assert.equal(recorded.phase, "running", "the run holds the machine reservation");
assert.equal(recorded.child, true, "the reservation names the Vitest process");
assert.equal(fs.existsSync(path.join(lockRoot, "reservation.json")), false, "the reservation is released after exit");

// Another session's transaction holds the guard as the child exits. The holder
// keeps it until a marker file appears, so the guard is certainly held when
// release first tries it; the marker is written from that first refused open.
const guardFile = path.join(lockRoot, "guard.json");
const freeGuard = path.join(scratch, ".git", "free-guard");
const guardHolder = path.join(scratch, ".git", "hold-guard.mjs");
fs.writeFileSync(guardHolder, `import fs from "node:fs";
import {processIdentity} from ${JSON.stringify(new URL("./test-suite-process.mjs",import.meta.url).href)};
const fd = fs.openSync(${JSON.stringify(guardFile)}, "wx");
fs.writeFileSync(fd, JSON.stringify({owner:processIdentity(process.pid)}));
const deadline=Date.now()+15000;
while (!fs.existsSync(${JSON.stringify(freeGuard)}) && Date.now()<deadline) await new Promise(r => setTimeout(r, 10));
fs.closeSync(fd); fs.unlinkSync(${JSON.stringify(guardFile)});`);
// This coordinator-owned fixture is outside the managed engine ancestry. A
// retained original handle, identity and actual close bound its guard lifetime.
const guardHolders = [];
const holdAfterFinalizer = async value => {
  const result = await coordinatorAdapter.ownedChild(value);
  if (value.prepared.args[2] === "merge") {
    const child = spawn(process.execPath, [guardHolder], { windowsHide: true, stdio: "ignore" });
    const close = new Promise(resolve => child.once("close", (exit, signal) => resolve({exit,signal})));
    let launchError;
    child.on("error", error => { launchError=error; });
    const timer = setTimeout(() => child.kill(), 17000);
    close.finally(() => clearTimeout(timer));
    const original = processIdentity(child.pid);
    guardHolders.push({child,close,original});
    const deadline = Date.now()+5000;
    while (Date.now()<deadline) {
      try { if(read(guardFile).owner?.start) break; } catch {}
      if(launchError) {await close;throw launchError;}
      assert.equal(child.exitCode,null); await new Promise(resolve=>setTimeout(resolve,20));
    }
    assert.deepEqual(read(guardFile).owner,original,"guard records the retained original process identity");
  }
  return result;
};
const heldOptions = {...options,files:["a.test.ts"],stdio:"ignore",ownedChild:holdAfterFinalizer,
  identify:processIdentity,
  enginePath:fileURLToPath(new URL("./fixtures/test-suite-engine-control.mjs",import.meta.url))};
const openFile = fs.openSync;
let refusedGuard = 0;
let freeOnFirstRefusal = false;
fs.openSync = function(target, ...args) {
  try { return openFile.call(this, target, ...args); }
  catch (error) {
    if (error.code === "EEXIST" && path.resolve(String(target)) === guardFile && ++refusedGuard === 1 && freeOnFirstRefusal) fs.writeFileSync(freeGuard, "");
    throw error;
  }
};
try {
  freeOnFirstRefusal = true;
  const briefly = await runVitest(heldOptions);
  assert.ok(refusedGuard >= 1, "release met the held guard");
  assert.equal(briefly.exit, 0, "a briefly held guard delays release instead of failing the run");
  assert.equal(briefly.releaseError, undefined);
  assert.equal(fs.existsSync(path.join(lockRoot, "reservation.json")), false, "the reservation is released once the guard frees");
  for (const deadline = Date.now() + 5000; fs.existsSync(guardFile) && Date.now() < deadline;) await new Promise(r => setTimeout(r, 20));
  assert.deepEqual(await guardHolders[0].close,{exit:0,signal:null});
  fs.unlinkSync(freeGuard);
  refusedGuard = 0;
  freeOnFirstRefusal = false;
  const stuck = await runVitest({...heldOptions,guardWaitMs:200});
  assert.ok(refusedGuard >= 1, "release met the held guard");
  assert.equal(stuck.exit, 0, "the test result survives a release that cannot complete");
  assert.match(stuck.releaseError, /Reservation transaction unavailable.*guard\.json/, "the unreleased reservation is reported separately");
} finally {
  fs.openSync = openFile; fs.writeFileSync(freeGuard, "");
  for(const holder of guardHolders)assert.deepEqual(await holder.close,{exit:0,signal:null});
}
for (const holder of guardHolders) assert.deepEqual(await holder.close,{exit:0,signal:null});
for (const deadline = Date.now() + 5000; fs.existsSync(guardFile) && Date.now() < deadline;) await new Promise(r => setTimeout(r, 20));
assert.equal(read(path.join(lockRoot, "reservation.json")).phase, "exited", "an unreleased reservation stays recoverable");
fs.unlinkSync(path.join(lockRoot, "reservation.json"));
const { releaseKeeping } = await import("./test-suite-process.mjs");
const unreleasable = { release() { throw new Error("guard still held"); } };
const cause = new Error("Vitest processes still present: 1234");
assert.throws(() => { releaseKeeping(unreleasable, cause); throw cause; }, /still present: 1234/, "an error-path release failure never replaces the error in hand");

// A store the process may not write is refused with its location, whether the
// denial comes from creating the directory or from opening the guard.
const deny = (name, code) => {
  const original = fs[name];
  fs[name] = () => { const error = new Error(`${code}: operation not permitted`); error.code = code; throw error; };
  try { assert.throws(() => acquire("sandboxed", { root: path.join(lockRoot, "denied"), census: () => [] }),
    /Reservation store not writable at .*denied \((EPERM|EACCES)\).*cannot run Vitest here/, `${name} ${code}`); }
  finally { fs[name] = original; }
};
deny("openSync", "EPERM");
deny("openSync", "EACCES");
deny("mkdirSync", "EACCES");
// File-specific Windows access failures are contention when a private probe
// demonstrates that the store remains writable. Never use the live store.
if (process.platform === "win32") {
  const store = fs.mkdtempSync(path.join(os.tmpdir(), "impower-store-contention-"));
  console.log(`Reservation contention scratch: ${store}`);
  for (const code of ["EPERM", "EACCES", "EBUSY"]) {
    for (const operation of ["guard", "create", "rename"]) {
      const method = operation === "rename" ? "renameSync" : "openSync";
      const original = fs[method];
      let failures = 0;
      fs[method] = (target, ...args) => {
        const affected = operation === "guard" ? target === path.join(store, "guard.json")
          : operation === "create" ? String(target).startsWith(path.join(store, "reservation.json."))
          : args[0] === path.join(store, "reservation.json");
        if (affected && failures++ < 2) throw Object.assign(new Error("scanner holds reservation file"), { code });
        return original(target, ...args);
      };
      const waits = [];
      let acquired;
      try { acquired = await acquireWaiting("transient file denial", { root: store, waitMs: 30000, pollMs: 5,
        census: () => [], onWait: value => waits.push(value.waiting) }); }
      finally { fs[method] = original; }
      assert.ok(waits.includes("reservation files"), `${operation} ${code} reports contention`);
      acquired.release();
      assert.deepEqual(fs.readdirSync(store), [], "successful retries leave no probe or abandoned temporary file");
    }
  }
  const original = fs.renameSync;
  let renameBegan;
  fs.renameSync = (source, target) => {
    if (target === path.join(store, "reservation.json")) {
      renameBegan ??= Date.now();
      throw Object.assign(new Error("persistent scanner contention"), { code: "EPERM" });
    }
    return original(source, target);
  };
  try { await assert.rejects(acquireWaiting("bounded file denial", { root: store, waitMs: 100, pollMs: 5, census: () => [] }),
    /Reservation files busy.*EPERM/); }
  finally { fs.renameSync = original; }
  assert.ok(Date.now() - renameBegan < 500, "atomic rename does not add its independent one-second retry after admission expires");
  assert.deepEqual(fs.readdirSync(store), [], "expired admission leaves no ownership or ambiguous temp evidence");
  for (const code of ["EPERM", "EACCES", "EBUSY"]) {
    fs.writeFileSync(path.join(store, "guard.json"), JSON.stringify({ owner: { pid: 42, start: "dead" } }));
    const open = fs.openSync;
    let probes = 0, claims = 0, waits = 0;
    fs.openSync = (target, ...args) => {
      if (String(target).startsWith(store + path.sep) && target !== path.join(store, "guard.json")) {
        if (path.basename(target).startsWith("write-probe-")) probes++;
        if (path.basename(target) === "guard-recovery.json") claims++;
        throw Object.assign(new Error("store-wide denial with existing guard"), { code });
      }
      return open(target, ...args);
    };
    try { await assert.rejects(acquireWaiting("existing guard denied store", { root: store, waitMs: 5000,
      guardWaitMs: 100, census: () => [], onWait: () => waits++ }),
      error => error.message.includes(`Reservation store not writable at ${store} (${code})`)); }
    finally { fs.openSync = open; }
    assert.equal(probes, 1);
    assert.equal(claims, 1, "existing guard store denial refuses on its first recovery claim");
    assert.equal(waits, 0);
    assert.deepEqual(fs.readdirSync(store), ["guard.json"]);
    fs.unlinkSync(path.join(store, "guard.json"));
  }
  for (const code of ["EPERM", "EACCES", "EBUSY"]) {
    const open = fs.openSync;
    let probes = 0, waits = 0;
    fs.openSync = (target, ...args) => {
      if (String(target).startsWith(store + path.sep)) {
        if (path.basename(target).startsWith("write-probe-")) probes++;
        throw Object.assign(new Error("store-wide denial"), { code });
      }
      return open(target, ...args);
    };
    try { await assert.rejects(acquireWaiting("denied store", { root: store, waitMs: 5000, census: () => [],
      onWait: () => waits++ }), error => error.message.includes(`Reservation store not writable at ${store} (${code})`)); }
    finally { fs.openSync = open; }
    assert.equal(probes, 1, "genuine denial probes once and refuses before retrying");
    assert.equal(waits, 0);
    assert.deepEqual(fs.readdirSync(store), []);
  }
  for (const operation of ["open", "write", "read", "rename"]) {
    const guard = path.join(store, "guard.json");
    fs.writeFileSync(guard, JSON.stringify({ owner: { pid: 42, start: "dead" } }));
    const method = { open: "openSync", write: "writeFileSync", read: "readFileSync", rename: "renameSync" }[operation];
    const originalMethod = fs[method], open = fs.openSync;
    let claimFd, guardReadFd, denied = 0;
    fs.openSync = (target, ...args) => {
      const fd = open(target, ...args);
      if (target === path.join(store, "guard-recovery.json")) claimFd = fd;
      if (target === guard && args[0] === "r") guardReadFd = fd;
      return fd;
    };
    const dispatch = fs[method];
    fs[method] = (target, ...args) => {
      const affected = operation === "open" ? target === path.join(store, "guard-recovery.json")
        : operation === "write" ? target === claimFd : operation === "read" ? target === guard || target === guardReadFd : target === guard;
      if (affected && denied++ < 1) throw Object.assign(new Error("recovery file contention"), { code: "EBUSY" });
      return dispatch(target, ...args);
    };
    const waits = [];
    let reservation;
    try { reservation = await acquireWaiting(`recovery ${operation}`, { root: store, waitMs: 30000, pollMs: 5,
      census: () => [], identify: pid => pid === 42 ? null : processIdentity(pid), onWait: value => waits.push(value.waiting) }); }
    finally { fs[method] = originalMethod; fs.openSync = open; }
    assert.ok(waits.includes("reservation files"), `recovery ${operation} waits using writable proof`);
    reservation.release();
    const archive = fs.readdirSync(store);
    assert.equal(archive.length, 1);
    assert.ok(archive[0].startsWith("recovered-guard-"));
    assert.equal(read(path.join(store, archive[0])).owner.start, "dead");
    fs.unlinkSync(path.join(store, archive[0]));
  }
  // A held peer survives file-specific denial, including the probe.
  const peer = JSON.stringify({ token: "peer", owner: { pid: 42, start: "peer" }, phase: "reserved" });
  fs.writeFileSync(path.join(store, "reservation.json"), peer);
  const open = fs.openSync;
  fs.openSync = (target, ...args) => {
    if (target === path.join(store, "guard.json")) throw Object.assign(new Error("held guard"), { code: "EBUSY" });
    return open(target, ...args);
  };
  try { await assert.rejects(acquireWaiting("peer preserved", { root: store, waitMs: 50, pollMs: 5, census: () => [] }), /Reservation files busy/); }
  finally { fs.openSync = open; }
  assert.equal(fs.readFileSync(path.join(store, "reservation.json"), "utf8"), peer);
  fs.unlinkSync(path.join(store, "reservation.json"));
  // Failure cleaning the private probe cannot claim writable proof or retry.
  const unlink = fs.unlinkSync;
  let cleanupProbe;
  fs.openSync = (target, ...args) => {
    if (target === path.join(store, "guard.json")) throw Object.assign(new Error("held guard"), { code: "EPERM" });
    return open(target, ...args);
  };
  fs.unlinkSync = target => {
    if (path.basename(target).startsWith("write-probe-")) {
      cleanupProbe = target;
      throw Object.assign(new Error("private probe cleanup denied"), { code: "EPERM" });
    }
    return unlink(target);
  };
  try { await assert.rejects(acquireWaiting("uncertain cleanup", { root: store, waitMs: 5000, census: () => [],
    onWait: () => assert.fail("uncertain probe cleanup retried") }), /private probe cleanup denied/); }
  finally { fs.openSync = open; fs.unlinkSync = unlink; }
  assert.equal(fs.existsSync(path.join(store, "reservation.json")), false);
  fs.unlinkSync(cleanupProbe);
  const fstat = fs.fstatSync;
  let unknownProbe, probeFd;
  fs.openSync = (target, ...args) => {
    if (target === path.join(store, "guard.json")) throw Object.assign(new Error("held guard"), { code: "EPERM" });
    const fd = open(target, ...args);
    if (path.basename(target).startsWith("write-probe-")) { unknownProbe = target; probeFd = fd; }
    return fd;
  };
  fs.fstatSync = (fd, ...args) => {
    if (fd === probeFd) throw new Error("probe identity unavailable");
    return fstat(fd, ...args);
  };
  try { await assert.rejects(acquireWaiting("unknown probe identity", { root: store, waitMs: 5000, census: () => [],
    onWait: () => assert.fail("unknown probe identity retried") }), /Private reservation probe identity unavailable/); }
  finally { fs.openSync = open; fs.fstatSync = fstat; }
  assert.equal(fs.existsSync(unknownProbe), true, "a probe with uncertain identity remains for inspection");
  fs.unlinkSync(unknownProbe);
  // A failed atomic replacement preserves old published ownership bytes.
  fs.writeFileSync(path.join(store, "reservation.json"), peer);
  fs.renameSync = (source, target) => {
    if (target === path.join(store, "reservation.json")) throw Object.assign(new Error("replacement denied"), { code: "EACCES" });
    return original(source, target);
  };
  try { await assert.rejects(acquireWaiting("preserve old record", { root: store, waitMs: 1, census: () => [],
    identify: pid => pid === 42 ? null : processIdentity(pid) }), /Reservation files busy/); }
  finally { fs.renameSync = original; }
  assert.equal(fs.readFileSync(path.join(store, "reservation.json"), "utf8"), peer);
  assert.equal(fs.readdirSync(store).some(name => name.endsWith(".tmp")), false);
  fs.unlinkSync(path.join(store, "reservation.json"));
  fs.unlinkSync(path.join(store, "recovered-peer.json"));
  // Once atomic publication succeeded, a guard cleanup failure must not replay
  // acquisition, even when its code would otherwise be eligible for contention.
  let publications = 0;
  fs.renameSync = (source, target) => {
    if (target === path.join(store, "reservation.json")) publications++;
    return original(source, target);
  };
  fs.unlinkSync = target => {
    if (target === path.join(store, "guard.json")) throw Object.assign(new Error("published guard cleanup denied"), { code: "EPERM" });
    return unlink(target);
  };
  try { await assert.rejects(acquireWaiting("already published", { root: store, waitMs: 5000, census: () => [],
    onWait: () => assert.fail("published acquisition replayed") }), /published guard cleanup denied/); }
  finally { fs.renameSync = original; fs.unlinkSync = unlink; }
  assert.equal(publications, 1);
  assert.equal(read(path.join(store, "reservation.json")).run, "already published");
  fs.unlinkSync(path.join(store, "guard.json"));
  fs.unlinkSync(path.join(store, "reservation.json"));
  console.log("PASS: Windows reservation file contention retries within its deadline using clean private probes");
} else console.log("SKIP: Windows reservation file contention controls require Windows");
console.log("PASS: a held reservation guard delays release and never replaces the Vitest result");
const busy = acquire("busy", { root: lockRoot, census: () => [] });
await assert.rejects(runVitest({ ...options,files:["a.test.ts"],enginePath:fakeVitest,stdio:"ignore" }), /Existing suite running/);
busy.release();
{
  // The reviewer execution service starts a delegated run's timeout from this line.
  const { reservationAcquiredLine } = await import("./test-suite.mjs");
  const lines = [], log = console.log;
  console.log = (...args) => { lines.push(args.join(" ")); };
  try { await runVitest({ ...options,files:["a.test.ts"],enginePath:fakeVitest,stdio:"ignore" }); }
  finally { console.log = log; }
  assert.ok(lines.includes(reservationAcquiredLine), "an acquired reservation is announced");
  assert.equal(reservationAcquiredLine, '{"status":"acquired"}');
}
console.log("PASS: run composes the one-worker flags, caps the heap and holds the reservation");

// The command line parses --wait and dispatches run, start and resume through
// the same waiting reservation. A long poll interval shows the sleep stops at
// the deadline rather than after a full interval.
const { main } = await import("./test-suite.mjs");
const seam = { ...options,enginePath:fakeVitest,stdio:"ignore" };
assert.equal(await main(["run", path.relative(process.cwd(), scratch), "a.test.ts"], seam), 1,
  "valid relative package directories still launch Vitest");
assert.equal(await main(["run", scratch, "a.test.ts", "--wait", "5"], seam), 1, "run reports aggregate failure while retaining raw unit exit");
assert.ok(!read(fakeRecord).argv.includes("--wait"),"--wait and its value are not passed to the engine");
const cliHolder = acquire("cli holder", { root: lockRoot, census: () => [] });
for (const argv of [["run", scratch, "a.test.ts", "--wait", "3"], ["start", scratch, "--wait", "3"], ["resume", directory, "--wait", "3"]]) {
  const began = Date.now();
  await assert.rejects(main(argv, { ...seam, pollMs: 10000, enginePath, fingerprint: () => "unchanged" }), /Existing suite running/, argv[0]);
  assert.ok(Date.now() - began < 8000, `${argv[0]} --wait 3 refuses near its bound, not after a 10 s poll`);
}
cliHolder.release();
const cliCensusStart = Date.now();
await assert.rejects(main(["start", scratch, "--wait", "3"], { ...seam, census: () => [5], pollMs: 10000 }), /still present: 5/);
assert.ok(Date.now() - cliCensusStart < 8000, "the census wait also stops at its bound");
assert.equal(fs.existsSync(path.join(lockRoot, "reservation.json")), false, "a timed-out start releases the reservation");
await assert.rejects(main(["run", scratch, "--wait", "soon"], seam), /--wait takes a number of seconds/);
await assert.rejects(main(["run", scratch, "--wait", "5"], seam), /Name the test files under work/, "run refuses a whole-package call");
const { MAX_RUN_FILES } = await import("./test-suite.mjs");
const manyFiles = Array.from({ length: MAX_RUN_FILES + 1 }, (_, i) => `f${i}.test.ts`);
for (const name of manyFiles) fs.writeFileSync(path.join(scratch, name), "fixture");
await assert.rejects(main(["run", scratch, ...manyFiles, "--wait", "5"], seam), new RegExp(`at most ${MAX_RUN_FILES} test files \\(${MAX_RUN_FILES + 1} named\\)`), "run refuses a list wider than the bound");
assert.equal(await main(["run", scratch, ...manyFiles.slice(1), "--wait", "5"], seam), 1, "run accepts a list at the bound");
const fixtureRunFiles=()=>fs.readFileSync(path.join(scratch,".git","engine-control-events.jsonl"),"utf8").trim().split("\n").map(JSON.parse).filter(value=>value.mode==="run-direct").map(value=>value.file);
assert.deepEqual(fixtureRunFiles().slice(-MAX_RUN_FILES),manyFiles.slice(1).map(file=>path.join(scratch,file)),"every named file at the bound reaches its exact engine unit");
const literalNames = ["a.test.ts", "b.spec.tsx", "bracket[1]{brace}(group)+@!.test.ts", "space name.test.ts"];
for (const name of literalNames.slice(2)) fs.writeFileSync(path.join(scratch, name), "fixture");
assert.equal(await main(["run", scratch, ...literalNames], seam), 1);
assert.deepEqual(fixtureRunFiles().slice(-literalNames.length),literalNames.map(file=>path.join(scratch,file)),"valid multiple literal files execute canonical identities in requested order");
const runAlias = path.join(path.dirname(scratch), path.basename(scratch) + "-literal-run-alias");
fs.symlinkSync(scratch, runAlias, process.platform === "win32" ? "junction" : "dir");
const aliasFile = path.join(runAlias, "a.test.ts");
assert.equal(await main(["run", runAlias, aliasFile], seam), 1);
assert.equal(read(fakeRecord).argv[3],path.join(scratch,"a.test.ts"),"valid absolute package alias resolves to its exact configured identity");
assert.equal(await main(["run", scratch, aliasFile], seam), 1);
assert.equal(read(fakeRecord).argv[3],path.join(scratch,"a.test.ts"),"an additional alias resolves to the same exact configured identity");
if (process.platform === "win32") {
  const shortRoot = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
    "$f=New-Object -ComObject Scripting.FileSystemObject; $f.GetFolder($env:IMPOWER_LITERAL_PACKAGE).ShortPath"],
    { encoding: "utf8", windowsHide: true, env: { ...process.env, IMPOWER_LITERAL_PACKAGE: scratch } }).trim();
  const shortFile = path.join(shortRoot, "a.test.ts");
  assert.equal(await main(["run", scratch, shortFile], seam), 1);
  assert.equal(read(fakeRecord).argv[3],path.join(scratch,"a.test.ts"),"Windows short spelling resolves to its canonical configured identity");
}
await assert.rejects(main(["bogus", scratch], seam), /Usage/);
console.log("PASS: the command line parses --wait for run, start and resume and refuses at its bound");

// A guard held past one transaction's bound is contention while --wait lasts,
// and a run that never started says so in a form the red/green driver reads.
const { notRunExit } = await import("./test-suite.mjs");
fs.writeFileSync(guardFile, "{}");
const guardWaits = [];
setTimeout(() => fs.unlinkSync(guardFile), 600);
const queued = await acquireWaiting("guard contention", { root: lockRoot, waitMs: 5000, pollMs: 50, guardWaitMs: 100, census: () => [], onWait: w => guardWaits.push(w.waiting) });
assert.ok(guardWaits.includes("guard"), "a held guard is reported as a wait");
queued.release();
fs.writeFileSync(guardFile, "{}");
const guardBegan = Date.now();
let unstarted;
await assert.rejects(main(["run", scratch, "a.test.ts", "--wait", "1"], { ...seam, guardWaitMs: 100, pollMs: 50 }),
  error => (unstarted = error, /Reservation transaction unavailable/.test(error.message) && error.notRun === true));
assert.ok(Date.now() - guardBegan >= 1000, "the guard is retried until --wait expires");
// The default five-second transaction bound never carries the wait past --wait.
const boundBegan = Date.now();
await assert.rejects(acquireWaiting("bounded", { root: lockRoot, waitMs: 1000, pollMs: 50, census: () => [] }), error => error.guardHeld === true);
const boundElapsed = Date.now() - boundBegan;
assert.ok(boundElapsed >= 1000 && boundElapsed < 2500, `a held guard refuses at --wait 1, not after the transaction bound (${boundElapsed} ms)`);
fs.unlinkSync(guardFile);
const printed = [];
assert.equal(notRunExit(unstarted, line => printed.push(line)), 75, "a run that never started exits 75");
assert.match(printed.join("\n"), /^test-suite: not run: Reservation transaction unavailable/m);
assert.equal(notRunExit(new Error("other"), line => printed.push(line)), 1, "other failures keep exit 1");
console.log("PASS: a held guard is retried within --wait and an unstarted run is reported as not run");

// A guard whose recorded owner is no longer running was abandoned inside its
// transaction. It is renamed aside, preserving the evidence, like an interrupted
// reservation. A live owner or an unreadable identity keeps it held.
const deadOwner = { pid: 2147483000, start: "1" };
const abandoned = JSON.stringify({ owner: deadOwner });
fs.writeFileSync(guardFile, abandoned);
const recoveredGuards = () => fs.readdirSync(lockRoot).filter(name => /^recovered-guard-.*\.json$/.test(name));
const recoveredBefore = recoveredGuards().length;
const afterAbandoned = acquire("abandoned guard", { root: lockRoot, census: () => [], identify: pid => pid === deadOwner.pid ? null : processIdentity(pid), guardWaitMs: 100 });
assert.equal(fs.existsSync(guardFile), false, "the abandoned guard is not left in place");
assert.equal(recoveredGuards().length, recoveredBefore + 1, "the abandoned guard is renamed to recovered-guard-<time>.json");
assert.equal(fs.readFileSync(path.join(lockRoot, recoveredGuards().at(-1)), "utf8"), abandoned, "the recovered guard keeps the recorded owner");
afterAbandoned.release();
for (const [label, identify, record] of [
  ["a live owner", () => deadOwner, abandoned],
  ["an unreadable process table", () => { throw new Error("process table unreadable"); }, abandoned],
  ["an unreadable record", () => null, ""],
  ["a record without an owner start", () => null, JSON.stringify({ owner: { pid: deadOwner.pid } })],
  ["malformed JSON", () => null, "{"],
]) {
  fs.writeFileSync(guardFile, record);
  assert.throws(() => acquire(label, { root: lockRoot, census: () => [], identify, guardWaitMs: 100 }), error => error.guardHeld === true && /Reservation transaction unavailable/.test(error.message), `${label} keeps the guard held`);
  assert.equal(fs.readFileSync(guardFile, "utf8"), record, `${label}: the guard is untouched`);
  fs.unlinkSync(guardFile);
}
assert.equal(recoveredGuards().length, recoveredBefore + 1, "no held guard was recovered");
// Two recoverers never judge the same abandoned guard. While the first is
// inside its identity check, a second acquirer finds the guard held and waits
// instead of recovering it, so the first's rename can only move the guard it read.
fs.writeFileSync(guardFile, abandoned);
let nestedFailure = null, nestedBegan = false, guardDuringNested = null, claimDuringRecovery = null;
const outer = acquire("first recoverer", { root: lockRoot, census: () => [], guardWaitMs: 2000, identify: pid => {
  if (pid !== deadOwner.pid) return processIdentity(pid);
  if (!nestedBegan) {
    nestedBegan = true;
    claimDuringRecovery = JSON.parse(fs.readFileSync(path.join(lockRoot, "guard-recovery.json"), "utf8"));
    try { acquire("second recoverer", { root: lockRoot, census: () => [], guardWaitMs: 100, identify: () => null }); }
    catch (error) { nestedFailure = error; }
    guardDuringNested = fs.readFileSync(guardFile, "utf8");
  }
  return null;
} });
assert.ok(nestedFailure?.guardHeld === true, "a second acquirer does not recover a guard another recoverer is judging");
assert.deepEqual(claimDuringRecovery, { owner: processIdentity(process.pid) }, "the recovery claim records its owner's identity for an inspector");
assert.equal(guardDuringNested, abandoned,"the guard stays in place until the first recoverer renames it");
assert.equal(recoveredGuards().length, recoveredBefore + 2, "exactly one recoverer renamed the guard");
assert.equal(fs.existsSync(path.join(lockRoot, "guard-recovery.json")), false, "the recovery claim is released");
outer.release();
// A claim left by a recoverer that died inside it blocks recovery until inspected.
const claimFile = path.join(lockRoot, "guard-recovery.json");
fs.writeFileSync(guardFile, abandoned);
fs.writeFileSync(claimFile, "{}");
assert.throws(() => acquire("claimed", { root: lockRoot, census: () => [], guardWaitMs: 100, identify: () => null }), error => error.guardHeld === true);
assert.equal(fs.readFileSync(guardFile, "utf8"), abandoned, "an unrecovered claim leaves the guard in place");
assert.equal(fs.existsSync(claimFile), true, "the claim is never removed on another process's behalf");
fs.unlinkSync(claimFile);
fs.unlinkSync(guardFile);
fs.writeFileSync(claimFile, "{}");
const normalWithClaim = acquire("normal transaction with abandoned recovery claim", { root: lockRoot, census: () => [] });
normalWithClaim.release();
assert.equal(fs.readFileSync(claimFile, "utf8"), "{}", "an abandoned recovery claim does not block or change normal transactions");
fs.unlinkSync(claimFile);
console.log("PASS: a guard whose owner is gone is recovered and a live or unreadable one is kept");

// A normal transaction can remove its guard and exit while recovery's process
// lookup is still in flight. Its successor's live guard is a different file,
// even if a delayed lookup then confirms the original coordinator is absent.
{
  const peerGuard = JSON.stringify({ owner: processIdentity(process.pid), token: "live-successor" });
  const oldGeneration = path.join(lockRoot, "released-generation.json");
  fs.writeFileSync(guardFile, abandoned);
  let crossed = false;
  const count = recoveredGuards().length;
  assert.throws(() => acquire("generation race", { root: lockRoot, census: () => [], guardWaitMs: 50,
    identify: pid => {
      if (pid !== deadOwner.pid) return processIdentity(pid);
      if (!crossed) {
        crossed = true;
        fs.renameSync(guardFile, oldGeneration);
        fs.writeFileSync(guardFile, peerGuard);
      }
      return null;
    } }), error => error.guardHeld === true);
  assert.equal(crossed, true, "the original guard was replaced during its owner's lookup");
  assert.equal(fs.readFileSync(guardFile, "utf8"), peerGuard, "the live successor guard survives recovery");
  assert.equal(recoveredGuards().length, count, "a recovery archive never holds the replacement guard");
  assert.equal(fs.existsSync(path.join(lockRoot, "reservation.json")), false, "no reservation is admitted through the live successor guard");
  fs.unlinkSync(guardFile);
  fs.unlinkSync(oldGeneration);
  for (const failAction of [false, true]) {
    assert.throws(() => acquire("cleanup replacement", { root: lockRoot, guardWaitMs: 50,
      census: () => {
        fs.renameSync(guardFile, oldGeneration);
        fs.writeFileSync(guardFile, peerGuard);
        if (failAction) throw new Error("original admission refusal");
        return [];
      } }), failAction ? /original admission refusal/ : /file ownership changed/);
    assert.equal(fs.readFileSync(guardFile, "utf8"), peerGuard, "cleanup never unlinks another generation");
    fs.unlinkSync(guardFile);
    fs.unlinkSync(oldGeneration);
    if (fs.existsSync(path.join(lockRoot, "reservation.json"))) fs.unlinkSync(path.join(lockRoot, "reservation.json"));
  }
  const missing = acquire("already removed guard", { root: lockRoot, census: () => {
    fs.unlinkSync(guardFile);
    return [];
  } });
  assert.equal(read(path.join(lockRoot, "reservation.json")).token, missing.record.token);
  missing.release();
}
console.log("PASS: recovery and cleanup preserve the observed guard generation, including replacement and absence");

{
  const marker = path.join(scratch, ".git", "ownership-child-started");
  const childFile = path.join(scratch, ".git", "ownership-child.mjs");
  const reservationFile = path.join(lockRoot, "reservation.json");
  fs.writeFileSync(childFile, `import fs from "node:fs"; fs.appendFileSync(${JSON.stringify(marker)}, "started\\n"); await new Promise(r=>setTimeout(r,50)); process.exitCode=Number(process.argv[2]);`);
  const refusal = await runVitest({ ...options,files:["a.test.ts"],enginePath:childFile,stdio:"ignore",
    census: () => { atomic(reservationFile, { ...read(reservationFile), token: "peer-before-child" }); return []; }
  });
  assert.equal(refusal.exit,75);
  assert.match(refusal.reservationError,/ownership changed/);
  assert.equal(fs.existsSync(marker), false, "pre-child ownership loss launches nothing");
  assert.equal(read(reservationFile).token, "peer-before-child");
  fs.unlinkSync(reservationFile);
  for (const timing of ["post-spawn", "terminal"]) for (const exit of [0, 7]) {
    // The fixture process has its own real observed close; a deterministic
    // identity seam avoids a fast child disappearing during Windows lookup.
    fs.writeFileSync(childFile, `import fs from "node:fs";
if(process.argv[2]==="run-direct")fs.appendFileSync(${JSON.stringify(marker)},"started\\n");
await import(${JSON.stringify(new URL("./fixtures/test-suite-engine-control.mjs",import.meta.url).href)});
if(process.argv[2]==="run-direct")process.exitCode=${exit};`);
    const rename = fs.renameSync;
    let replaced = false;
    fs.renameSync = (temp, target) => {
      const value=target===reservationFile?read(temp):null;
      if (value?.mode==="run-direct" && value.phase===(timing==="terminal"?"exited":"running") && !replaced) {
        replaced = true;
        fs.writeFileSync(temp, JSON.stringify({ ...read(temp), token: "peer-after-child" }));
      }
      return rename(temp, target);
    };
    let result;
    try { result = await runVitest({ ...options,files:["a.test.ts"],enginePath:childFile,stdio:"ignore" }); }
    finally { fs.renameSync = rename; }
    assert.equal(replaced, true, `${timing}: ownership was replaced at the intended boundary`);
    assert.equal(result.exit,1,`${timing}: blocked finalization makes the public result incomplete`);
    assert.equal(result.observedAttempts.find(value=>value.mode==="run-direct").exit,exit,`${timing}: retain the original child's actual exit`);
    assert.equal(result.signal, null);
    assert.match(result.reservationError, /Reservation ownership changed/);
    assert.match(result.releaseError, /Reservation ownership changed/);
    assert.equal(fs.readFileSync(marker, "utf8"), "started\n", "ownership loss never launches a second child");
    assert.equal(read(reservationFile).token, "peer-after-child", "never release another owner's token");
    fs.unlinkSync(marker);
    fs.unlinkSync(reservationFile);
  }
}
console.log("PASS: pre-child ownership loss is not run and post-spawn ownership loss preserves only the original child result");

// Coordinator decision controls: synthetic protocol identities deliberately
// provide no native containment credit. Actual ownership controls run below.
for(const boundary of ["refused","positive","abandoned"]) {
  const reservationFile=path.join(lockRoot,"reservation.json"),rename=fs.renameSync;
  let entered=0,injected=false,entryRecord;
  if(boundary==="refused")fs.renameSync=(temp,target)=>{
    const value=target===reservationFile?read(temp):null;
    if(value?.supervision?.helperLaunchPhase==="may-start"&&!injected){injected=true;throw new Error("controlled before helper entry");}
    return rename(temp,target);
  };
  let result;
  try {result=await runVitest({...options,files:["a.test.ts"],stdio:"ignore",
    enginePath:fileURLToPath(new URL("./fixtures/test-suite-engine-control.mjs",import.meta.url)),
    ownedChild:async value=>{
      entered++;entryRecord=read(reservationFile);
      assert.equal(entryRecord.phase,"launching");
      assert.equal(entryRecord.supervision.helperLaunchPhase,"may-start");
      assert.equal(entryRecord.supervision.reservationToken,entryRecord.token);
      assert.equal(entryRecord.supervision.launchNonce,value.prepared.launchNonce);
      assert.equal(entryRecord.supervision.attemptId,value.prepared.attemptId);
      if(boundary==="abandoned")throw new Error("controlled lost helper entry result");
      return coordinatorAdapter.ownedChild(value);
    }});}finally{fs.renameSync=rename;}
  if(boundary==="refused") {
    assert.equal(injected,true);assert.equal(entered,0);assert.equal(result.exit,75);
    assert.equal(fs.existsSync(reservationFile),false);
  } else if(boundary==="positive") {assert.equal(entered,3);assert.equal(result.exit,0);assert.equal(fs.existsSync(reservationFile),false);}
  else {
    assert.equal(entered,1);assert.equal(result.exit,1);
    assert.equal(result.observedAttempts[0].status,"unknown");
    const bytes=fs.readFileSync(reservationFile,"utf8");
    assert.equal(reservationState(read(reservationFile),()=>null),"unknown","Abandoned possible launch without identities/proof cannot reclaim");
    assert.throws(()=>acquire("after abandoned entry",{root:lockRoot,census:()=>[],identify:()=>null}),/unknown/);
    assert.equal(fs.readFileSync(reservationFile,"utf8"),bytes);
    // This unit callback never launches anything. Its own synthetic reservation
    // is removed only after asserting the production recovery refusal.
    fs.unlinkSync(reservationFile);
  }
}
console.log("PASS: possible helper entry is durably bound before invocation and abandoned entry remains unknown");

const setupOwner = processIdentity(process.pid);
const setupIdentify = pid => pid === process.pid ? setupOwner : { pid, start: "fixture-child" };
for (const mode of ["mkdir", "save", "open", "environment", "spawn", "launch-update"]) {
  const resultDirectory = path.join(scratch, ".git", `setup-${mode}`);
  const reservationFile = path.join(lockRoot, "reservation.json");
  const mkdir = fs.mkdirSync, rename = fs.renameSync, open = fs.openSync;
  let injected = false, launched = 0, failure;
  const fail = () => { injected = true; throw new Error(`controlled setup ${mode}`); };
  fs.mkdirSync = (target, ...args) => path.dirname(target) === resultDirectory && mode === "mkdir" ? fail() : mkdir(target, ...args);
  fs.renameSync = (temp, target) => {
    if (target === path.join(resultDirectory, "run.json") && mode === "save" && read(temp).attempts.length) return fail();
    const launching = mode === "launch-update" && target === reservationFile && read(temp).phase === "launching";
    const result = rename(temp, target);
    if (launching && !injected) return fail();
    return result;
  };
  fs.openSync = (target, ...args) => typeof target === "string" && path.basename(target) === "output.log" && mode === "open" ? fail() : open(target, ...args);
  try { await execute({ ...options, directory: resultDirectory, identify: setupIdentify,
    environment: mode === "environment" ? fail : undefined,
    prepareChild: mode === "spawn" ? () => { launched++; return fail(); } : coordinatorAdapter.prepareChild }); }
  catch (error) { failure = error; }
  finally { fs.mkdirSync = mkdir; fs.renameSync = rename; fs.openSync = open; }
  assert.equal(injected, true, `${mode}: intended setup step reached`);
  assert.equal(notRunExit(failure, () => {}), 75);
  assert.equal(launched, mode === "spawn" ? 1 : 0, "no engine launches during preparation failure");
  assert.equal(fs.existsSync(reservationFile), false, "no-child setup failure releases its own reservation");
  const next = acquire("after setup failure", { root: lockRoot, census: () => [], identify: setupIdentify });
  next.release();
}

for (const afterDiscovery of [false, true]) for (const peer of [false, true]) {
  const resultDirectory = path.join(scratch, ".git", `setup-prior-${afterDiscovery}-${peer}`);
  const marker = path.join(scratch, ".git", `setup-prior-${afterDiscovery}-${peer}.marker`);
  const fixture = path.join(scratch, ".git", `setup-prior-${afterDiscovery}-${peer}.mjs`);
  fs.writeFileSync(fixture, `import fs from "node:fs"; fs.appendFileSync(${JSON.stringify(marker)},process.argv[2]+String.fromCharCode(10)); await import(${JSON.stringify(new URL(`file:///${enginePath.replaceAll("\\", "/")}`).href)});`);
  const mkdir = fs.mkdirSync, reservationFile = path.join(lockRoot, "reservation.json"), runFile = path.join(resultDirectory, "run.json");
  const peerBytes = JSON.stringify({ token: "setup-peer-journal", preserved: true });
  let attempts = 0, injected = false, result, failure;
  fs.mkdirSync = (target, ...args) => {
    if (path.dirname(target) === resultDirectory && ++attempts === (afterDiscovery ? 2 : 1)) {
      injected = true;
      if (peer) { fs.writeFileSync(reservationFile, JSON.stringify({ ...read(reservationFile), token: "setup-peer" })); fs.writeFileSync(runFile, peerBytes); }
      throw new Error("controlled setup after ownership check");
    }
    return mkdir(target, ...args);
  };
  try { result = await execute({ ...options, directory: resultDirectory, enginePath: fixture,
    identify: setupIdentify }); }
  catch (error) { failure = error; }
  finally { fs.mkdirSync = mkdir; }
  assert.equal(injected, true);
  if (afterDiscovery) {
    assert.equal(failure, undefined, "completed discovery is never relabeled as wholly not-run");
    assert.equal(result.status, "incomplete");
    assert.equal(fs.readFileSync(marker, "utf8"), "discover\n");
    assert.equal(result.observedAttempts[0].exit, 0, "earlier discovery close remains returned even if a peer owns the journal");
    if (!peer) assert.equal(read(runFile).attempts[0].exit, 0, "prior observed child outcome remains durable");
  } else { assert.equal(notRunExit(failure, () => {}), 75); assert.equal(fs.existsSync(marker), false); }
  if (peer) {
    assert.equal(read(reservationFile).token, "setup-peer");
    assert.equal(fs.readFileSync(runFile, "utf8"), peerBytes, "failed setup never overwrites peer journals");
    fs.unlinkSync(reservationFile);
  } else assert.equal(fs.existsSync(reservationFile), false);
}

for (const afterDiscovery of [false, true]) for (const peer of [false, true]) {
  const resultDirectory = path.join(scratch, ".git", `launch-write-${afterDiscovery}-${peer}`);
  const marker = path.join(scratch, ".git", `launch-write-${afterDiscovery}-${peer}.marker`);
  const fixture = path.join(scratch, ".git", `launch-write-${afterDiscovery}-${peer}.mjs`);
  fs.writeFileSync(fixture, `import fs from "node:fs"; fs.appendFileSync(${JSON.stringify(marker)},process.argv[2]+String.fromCharCode(10)); await import(${JSON.stringify(new URL(`file:///${enginePath.replaceAll("\\", "/")}`).href)});`);
  const rename = fs.renameSync, reservationFile = path.join(lockRoot, "reservation.json"), runFile = path.join(resultDirectory, "run.json");
  const peerBytes = JSON.stringify({ token: "launch-peer-journal", preserved: true });
  let injected = false, result, failure;
  fs.renameSync = (temp, target) => {
    const valueBeingSaved=target===reservationFile?read(temp):null;
    const selected = !injected && valueBeingSaved?.phase === "launching"
      && valueBeingSaved.mode === (afterDiscovery ? "run" : "discover")
      && valueBeingSaved.supervision?.helperLaunchPhase === "may-start" && !valueBeingSaved.supervision.launcher;
    const value = rename(temp, target);
    if (selected && !injected) {
      injected = true;
      if (peer) { fs.writeFileSync(reservationFile, JSON.stringify({ ...read(reservationFile), token: "launch-peer" })); fs.writeFileSync(runFile, peerBytes); }
      throw new Error("controlled post-write launch update");
    }
    return value;
  };
  try { result = await execute({ ...options, directory: resultDirectory, enginePath: fixture, identify: setupIdentify }); }
  catch (error) { failure = error; }
  finally { fs.renameSync = rename; }
  assert.equal(injected, true);
  const attempt = afterDiscovery ? result.observedAttempt : failure.attempt;
  assert.match(attempt.reservationError, /controlled post-write/);
  if (afterDiscovery) { assert.equal(failure, undefined); assert.equal(result.status, "incomplete"); assert.equal(fs.readFileSync(marker, "utf8"), "discover\n"); assert.equal(result.observedAttempts[0].exit, 0); }
  else { assert.equal(notRunExit(failure, () => {}), 75); assert.equal(fs.existsSync(marker), false); }
  if (peer) {
    assert.match(attempt.reservationCleanupError, /ownership changed/);
    assert.equal(read(reservationFile).token, "launch-peer");
    assert.equal(fs.readFileSync(runFile, "utf8"), peerBytes);
    fs.unlinkSync(reservationFile);
  } else { assert.equal(fs.existsSync(reservationFile), false); const next = acquire("next launch", { root: lockRoot, census: () => [], identify: setupIdentify }); next.release(); }
}

// Parent log-close ownership moved into the native helper. Its reached real
// log-open refusal and actual helper exit live in test-suite-child.test.mjs;
// this coordinator unit retains the running-publication fault assertion.
for (const boundary of ["running-save"]) for (const exit of [0, 7]) {
  const resultDirectory = path.join(scratch, ".git", `post-launch-${boundary}-${exit}`);
  const marker = path.join(scratch, ".git", `post-launch-${boundary}-${exit}.marker`);
  const fixture = path.join(scratch, ".git", `post-launch-${boundary}-${exit}.mjs`);
  fs.writeFileSync(fixture, `import fs from "node:fs";
fs.appendFileSync(${JSON.stringify(marker)},process.argv[2]+String.fromCharCode(10));
await import(${JSON.stringify(new URL(`file:///${enginePath.replaceAll("\\", "/")}`).href)});
if(process.argv[2]==="run") { await new Promise(r=>setTimeout(r,80)); process.exitCode=${exit}; }`);
  const rename = fs.renameSync;
  let injected = false;
  fs.renameSync = (temp, target) => {
    if (boundary === "running-save" && target === path.join(resultDirectory, "run.json") && read(temp).attempts.at(-1)?.mode === "run" && read(temp).attempts.at(-1)?.pid && !injected) {
      injected = true; throw new Error("controlled running journal save");
    }
    return rename(temp, target);
  };
  let result;
  try { result = await execute({ ...options, directory: resultDirectory, enginePath: fixture,
    identify: setupIdentify }); }
  finally { fs.renameSync = rename; }
  assert.equal(injected, true);
  assert.equal(result.observedAttempt.exit, exit, "cleanup/publication failure still awaits original child close");
  assert.match(result.attemptError, /controlled/);
  assert.equal(fs.readFileSync(marker, "utf8"), "discover\nrun\n", "no later file is admitted");
  assert.equal(fs.existsSync(path.join(lockRoot, "reservation.json")), false);
}
console.log("PASS: setup failures release without launching and post-launch cleanup/publication failures await original results");

for (const boundary of ["initial-directory", "initial-journal", "manifest", "summary", "final-save"])
for (const peer of [false, true]) {
  const resultDirectory = path.join(scratch, ".git", `publication-${boundary}-${peer}`);
  const marker = path.join(scratch, ".git", `publication-${boundary}-${peer}.marker`);
  const fixture = path.join(scratch, ".git", `publication-${boundary}-${peer}.mjs`);
  fs.writeFileSync(fixture, `import fs from "node:fs";
fs.appendFileSync(${JSON.stringify(marker)},process.argv[2]+String.fromCharCode(10));
await import(${JSON.stringify(new URL(`file:///${enginePath.replaceAll("\\", "/")}`).href)});`);
  const runFile = path.join(resultDirectory, "run.json"), reservationFile = path.join(lockRoot, "reservation.json");
  const peerBytes = JSON.stringify({ token: "publication-peer-journal", preserved: true });
  const mkdir = fs.mkdirSync, rename = fs.renameSync;
  let injected = false, result, failure, attemptBytes = [];
  const fail = () => {
    injected = true;
    if (peer) {
      fs.writeFileSync(reservationFile, JSON.stringify({ ...read(reservationFile), token: "publication-peer" }));
      mkdir(resultDirectory, { recursive: true });
      for (const item of fs.readdirSync(resultDirectory, { withFileTypes: true }).filter(item => item.isDirectory())) {
        const file = path.join(resultDirectory, item.name, "attempt.json");
        if (fs.existsSync(file)) attemptBytes.push([file, fs.readFileSync(file, "utf8")]);
      }
      fs.writeFileSync(runFile, peerBytes);
    }
    throw Object.assign(new Error(`controlled coordinator ${boundary}`), { code: "EIO" });
  };
  fs.mkdirSync = (target, ...args) => boundary === "initial-directory" && target === resultDirectory && !injected ? fail() : mkdir(target, ...args);
  fs.renameSync = (temp, target) => {
    if (!injected && target === path.join(resultDirectory, "summary.json") && boundary === "summary") return fail();
    if (!injected && target === runFile) {
      const value = read(temp);
      if (boundary === "initial-journal" && !value.attempts.length
        || boundary === "manifest" && value.files.length && !value.identity
        || boundary === "final-save" && value.active === false) return fail();
    }
    return rename(temp, target);
  };
  try { result = await execute({ ...options, directory: resultDirectory, enginePath: fixture, identify: setupIdentify }); }
  catch (error) { failure = error; }
  finally { fs.mkdirSync = mkdir; fs.renameSync = rename; }
  assert.equal(injected, true, `${boundary}: intended coordinator boundary reached`);
  if (boundary.startsWith("initial-")) {
    assert.equal(fs.existsSync(marker), false, "initial publication failure launches no child");
    assert.equal(notRunExit(failure, () => {}), 75);
    assert.match(failure.message, /controlled coordinator/);
  } else {
    assert.equal(failure, undefined);
    assert.equal(result.status, boundary === "manifest" ? "incomplete" : "passed");
    assert.match(result.journalError, /controlled coordinator/);
    assert.equal(result.observedAttempts[0].exit, 0, "discovery result survives coordinator publication failure");
    assert.equal(fs.readFileSync(marker, "utf8"), boundary === "manifest" ? "discover\n" : "discover\nrun\nrun\n");
    if (boundary !== "manifest") assert.equal(result.observedAttempts.at(-1).exit, 0);
  }
  if (peer) {
    assert.equal(read(reservationFile).token, "publication-peer");
    assert.equal(fs.readFileSync(runFile, "utf8"), peerBytes);
    for (const [file, bytes] of attemptBytes) assert.equal(fs.readFileSync(file, "utf8"), bytes);
    fs.unlinkSync(reservationFile);
  } else {
    assert.equal(fs.existsSync(reservationFile), false);
    const next = acquire("after coordinator publication", { root: lockRoot, census: () => [], identify: setupIdentify });
    next.release();
  }
}
console.log("PASS: coordinator preparation/publication retains admission and observed results without peer writes");

for (const boundary of ["resume", "discovery", "between-files", "final-resume"])
for (const peer of [false, true]) {
  const resultDirectory = path.join(scratch, ".git", `stale-publication-${boundary}-${peer}`);
  const marker = path.join(scratch, ".git", `stale-publication-${boundary}-${peer}.marker`);
  const fixture = path.join(scratch, ".git", `stale-publication-${boundary}-${peer}.mjs`);
  fs.writeFileSync(fixture, `import fs from "node:fs";
fs.appendFileSync(${JSON.stringify(marker)},process.argv[2]+String.fromCharCode(10));
await import(${JSON.stringify(new URL(`file:///${enginePath.replaceAll("\\", "/")}`).href)});`);
  const staleOptions = { ...options, directory: resultDirectory, enginePath: fixture, identify: setupIdentify };
  if (boundary === "resume" || boundary === "final-resume") assert.equal((await execute(staleOptions)).status, "passed");
  const runFile = path.join(resultDirectory, "run.json"), reservationFile = path.join(lockRoot, "reservation.json");
  const peerBytes = JSON.stringify({ successor: "stale publication peer" });
  const rename = fs.renameSync;
  let injected = false, failure, result, calls = 0, attemptBytes = [];
  fs.renameSync = (temp, target) => {
    if (target === runFile && read(temp).stale) {
      injected = true;
      for (const item of fs.readdirSync(resultDirectory, { withFileTypes: true }).filter(item => item.isDirectory())) {
        const file = path.join(resultDirectory, item.name, "attempt.json");
        if (fs.existsSync(file)) attemptBytes.push([file, fs.readFileSync(file, "utf8")]);
      }
      if (peer) {
        fs.writeFileSync(reservationFile, JSON.stringify({ ...read(reservationFile), token: "stale-peer" }));
        fs.writeFileSync(runFile, peerBytes);
      }
      throw Object.assign(new Error("controlled stale publication EIO"), { code: "EIO" });
    }
    return rename(temp, target);
  };
  const fingerprint = () => ++calls < (boundary === "resume" ? 1 : boundary === "discovery" || boundary === "final-resume" ? 2 : 4) ? "unchanged" : "changed";
  try {
    if (boundary === "resume") await main(["resume", resultDirectory], { ...staleOptions, fingerprint });
    else result = await execute({ ...staleOptions, fingerprint });
  }
  catch (error) { failure = error; }
  finally { fs.renameSync = rename; }
  assert.equal(injected, true, `${boundary}: stale publication fault was reached`);
  if (boundary === "final-resume") {
    assert.equal(failure, undefined);
    assert.equal(result.status, "stale", "completed resume keeps its known stale summary on publication failure");
  } else {
    assert.equal(notRunExit(failure, () => {}), 1, "known stale inputs remain a failure, never retryable admission");
    assert.match(failure.message, boundary === "resume" ? /identity changed/ : boundary === "discovery" ? /changed during discovery/ : /changed during suite/);
  }
  const evidence = failure || result;
  assert.match(evidence.journalError, /controlled stale publication EIO/);
  assert.equal(fs.readFileSync(marker, "utf8"), boundary === "resume" || boundary === "final-resume" ? "discover\nrun\nrun\n" : boundary === "discovery" ? "discover\n" : "discover\nrun\n");
  assert.equal(evidence.observedAttempts.length, boundary === "resume" || boundary === "final-resume" ? 0 : boundary === "discovery" ? 1 : 2);
  for (const attempt of evidence.observedAttempts) assert.equal(attempt.exit, 0);
  for (const [file, bytes] of attemptBytes) assert.equal(fs.readFileSync(file, "utf8"), bytes);
  if (peer) {
    assert.equal(read(reservationFile).token, "stale-peer");
    assert.equal(fs.readFileSync(runFile, "utf8"), peerBytes);
    fs.unlinkSync(reservationFile);
  } else {
    assert.equal(fs.existsSync(reservationFile), false);
    const next = acquire("after stale publication failure", { root: lockRoot, census: () => [], identify: setupIdentify });
    next.release();
  }
}
console.log("PASS: known stale refusals survive publication failure, retain observed children and preserve peers");

for (const peer of [false, true]) {
  const resultDirectory = path.join(scratch, ".git", `saved-stale-${peer}`);
  const id = "00000000-0000-0000-0000-000000000001";
  const attemptDirectory = path.join(resultDirectory, id), attemptFile = path.join(attemptDirectory, "attempt.json");
  fs.mkdirSync(attemptDirectory, { recursive: true });
  const attempt = { id, directory: attemptDirectory, mode: "discover", file: null, status: "reserved" };
  const attemptBytes = JSON.stringify(attempt), peerBytes = JSON.stringify({ successor: "saved stale peer" });
  fs.writeFileSync(attemptFile, attemptBytes);
  const runFile = path.join(resultDirectory, "run.json"), reservationFile = path.join(lockRoot, "reservation.json");
  fs.writeFileSync(runFile, JSON.stringify({ version: 1, directory: resultDirectory, root: scratch,
    packageRoot: scratch, stale: true, files: [], attempts: [attempt] }));
  const rename = fs.renameSync;
  let reconciliation = false, injected = false, failure, launches = 0;
  fs.renameSync = (temp, target) => {
    if (target === attemptFile) { reconciliation = true; throw Object.assign(new Error("unexpected stale reconciliation EIO"), { code: "EIO" }); }
    if (target === runFile && read(temp).stale) {
      injected = true;
      if (peer) {
        fs.writeFileSync(reservationFile, JSON.stringify({ ...read(reservationFile), token: "saved-stale-peer" }));
        fs.writeFileSync(runFile, peerBytes);
      }
      throw Object.assign(new Error("controlled saved stale publication EIO"), { code: "EIO" });
    }
    return rename(temp, target);
  };
  const refuseLaunch = () => { launches++; throw Error("unexpected saved-stale child"); };
  try { await execute({ ...options, directory: resultDirectory, identify: setupIdentify,
    prepareChild: refuseLaunch }); }
  catch (error) { failure = error; }
  finally { fs.renameSync = rename; }
  assert.equal(notRunExit(failure, () => {}), 1);
  assert.match(failure.message, /identity changed/);
  assert.match(failure.journalError, /saved stale publication EIO/);
  assert.equal(reconciliation, false, "saved stale refusal precedes reconciliation writes");
  assert.equal(injected, true);
  assert.equal(launches, 0);
  assert.equal(fs.readFileSync(attemptFile, "utf8"), attemptBytes, "known stale refusal retains the old attempt");
  if (peer) {
    assert.equal(read(reservationFile).token, "saved-stale-peer");
    assert.equal(fs.readFileSync(runFile, "utf8"), peerBytes);
    fs.unlinkSync(reservationFile);
  } else {
    assert.equal(fs.existsSync(reservationFile), false);
    const next = acquire("after saved stale refusal", { root: lockRoot, census: () => [], identify: setupIdentify });
    next.release();
  }
  await assert.rejects(execute({ ...options, identify: setupIdentify, prepareChild: refuseLaunch,
    directory: path.join(scratch, ".git", `saved-stale-spawn-control-${peer}`) }), /unexpected saved-stale child/);
  assert.equal(launches, 1, "the same no-launch sentinel observes an ordinary discovery admission");
  assert.equal(fs.existsSync(reservationFile), false);
}
console.log("PASS: saved stale refusals preserve old attempts before reconciliation publication");

for (const peer of [false, true]) {
  const reservationFile = path.join(lockRoot, "reservation.json"), rename = fs.renameSync;
  const marker = path.join(scratch, ".git", `direct-launch-${peer}.marker`);
  const fixture = path.join(scratch, ".git", `direct-launch-${peer}.mjs`);
  fs.writeFileSync(fixture, `import fs from "node:fs"; fs.writeFileSync(${JSON.stringify(marker)},"started");`);
  let injected = false, result;
  fs.renameSync = (temp, target) => {
    const selected = target === reservationFile && read(temp).phase === "launching";
    const result = rename(temp, target);
    if (selected && !injected) {
      injected = true;
      if (peer) fs.writeFileSync(reservationFile, JSON.stringify({ ...read(reservationFile), token: "direct-launch-peer" }));
      throw new Error("controlled direct post-write failure");
    }
    return result;
  };
  try { result = await runVitest({ ...options, files:["a.test.ts"], enginePath: fixture, stdio: "ignore", identify: setupIdentify }); }
  finally { fs.renameSync = rename; }
  assert.equal(injected, true); assert.equal(result.exit,75); assert.equal(fs.existsSync(marker), false);
  assert.match(result.reservationError, /controlled direct/);
  if (peer) { assert.match(result.releaseError, /ownership changed/); assert.equal(read(reservationFile).token, "direct-launch-peer"); fs.unlinkSync(reservationFile); }
  else { assert.equal(fs.existsSync(reservationFile), false); const next = acquire("next direct", { root: lockRoot, census: () => [], identify: setupIdentify }); next.release(); }
}

for (const afterDiscovery of [false, true]) {
  const resultDirectory = path.join(scratch, ".git", `before-child-${afterDiscovery}`);
  const marker = path.join(scratch, ".git", `before-child-${afterDiscovery}.marker`);
  const fixture = path.join(scratch, ".git", `before-child-${afterDiscovery}.mjs`);
  fs.writeFileSync(fixture, `import fs from "node:fs";
fs.appendFileSync(${JSON.stringify(marker)}, process.argv[2]+"\\n");
await import(${JSON.stringify(new URL(`file:///${enginePath.replaceAll("\\", "/")}`).href)});`);
  const reservationFile = path.join(lockRoot, "reservation.json");
  let censusCalls = 0, failure, result, priorJournal;
  try { result = await execute({ ...options, directory: resultDirectory, enginePath: fixture,
    identify: pid => pid === process.pid ? processIdentity(pid) : { pid, start: "fixture-child" },
    census: () => {
      if (++censusCalls === (afterDiscovery ? 2 : 1)) {
        atomic(reservationFile, { ...read(reservationFile), token: "peer-before-durable-child" });
        if (afterDiscovery) priorJournal = fs.readFileSync(path.join(resultDirectory, "run.json"), "utf8");
      }
      return [];
    } }); }
  catch (error) { failure = error; }
  if (!afterDiscovery) {
    assert.equal(notRunExit(failure, () => {}), 75);
    assert.equal(fs.existsSync(marker), false);
    assert.equal(failure.unpersistedAttempts[0].status, "not-run");
  } else {
    assert.equal(failure, undefined, "a launched discovery is never relabeled wholly not-run");
    assert.equal(result.status, "incomplete");
    assert.match(result.reservationError, /ownership changed/);
    assert.equal(fs.readFileSync(marker, "utf8"), "discover\n");
    assert.equal(fs.readFileSync(path.join(resultDirectory, "run.json"), "utf8"), priorJournal, "completed discovery evidence survives pre-file refusal");
  }
  assert.equal(read(reservationFile).token, "peer-before-durable-child");
  fs.unlinkSync(reservationFile);
}

// Lose ownership at the terminal update, after the child's result is observed
// but before durable publication. A successor journal must remain byte-for-byte
// intact; returned evidence is explicitly unpersisted and no next file starts.
for (const boundary of ["discover", "first", "last"]) for (const exit of [0, 7]) {
  const resultDirectory = path.join(scratch, ".git", `lost-${boundary}-${exit}`);
  const marker = path.join(scratch, ".git", `lost-${boundary}-${exit}.marker`);
  const fixture = path.join(scratch, ".git", `lost-${boundary}-${exit}.mjs`);
  fs.writeFileSync(fixture, `import fs from "node:fs";
fs.appendFileSync(${JSON.stringify(marker)}, process.argv[2]+"\\n");
await import(${JSON.stringify(new URL(`file:///${enginePath.replaceAll("\\", "/")}`).href)});
if(process.argv[2]==="run" || ${JSON.stringify(boundary)}==="discover")process.exitCode=${exit};`);
  const reservationFile = path.join(lockRoot, "reservation.json");
  const runFile = path.join(resultDirectory, "run.json");
  const originalRead = fs.readFileSync;
  let replaced = false, peerJournal, priorAttempt, attemptFile;
  const terminalOwnedChild=async value=>{
    const result=await coordinatorAdapter.ownedChild(value);
    if (!replaced && fs.existsSync(runFile)) {
      const journal = JSON.parse(originalRead(runFile, "utf8"));
      const active = journal.attempts.at(-1);
      const selected = boundary === "discover" ? active?.mode === "discover"
        : active?.mode === "run" && active.file.endsWith(boundary === "first" ? "a.test.ts" : "b.spec.tsx");
      const candidate = active && path.join(active.directory, "attempt.json");
      if (selected && fs.existsSync(candidate)) {
        replaced = true;
        attemptFile = candidate;
        priorAttempt = originalRead(candidate, "utf8");
        peerJournal = JSON.stringify({ ...journal, token: "successor-journal", active: true });
        fs.writeFileSync(runFile, peerJournal);
        fs.writeFileSync(reservationFile, JSON.stringify({ ...JSON.parse(originalRead(reservationFile, "utf8")), token: "successor-reservation" }));
      }
    }
    return result;
  };
  let result;
  try { result = await execute({ ...options, directory: resultDirectory, enginePath: fixture, ownedChild:terminalOwnedChild,
    identify: pid => pid === process.pid ? processIdentity(pid) : { pid, start: "fixture-child" } }); }
  finally { /* The adapter returns only after its original fixture-child close. */ }
  assert.equal(replaced, true, `${boundary}: terminal update reached`);
  assert.match(result.reservationError, /ownership changed/);
  assert.equal(result.unpersistedAttempts.length, 1);
  assert.equal(result.unpersistedAttempts[0].exit, exit);
  assert.equal(result.unpersistedAttempts[0].status, exit === 0 ? "passed" : "failed");
  assert.equal(result.status, boundary === "last" ? exit === 0 ? "passed" : "failed" : "incomplete");
  assert.equal(originalRead(runFile, "utf8"), peerJournal, "never overwrite a successor's run journal");
  assert.equal(originalRead(attemptFile, "utf8"), priorAttempt, "uncertain ownership prevents attempt publication");
  assert.equal(fs.existsSync(path.join(resultDirectory, "summary.json")), false, "no shared summary after uncertainty");
  assert.equal(originalRead(marker, "utf8"), boundary === "discover" ? "discover\n" : boundary === "first" ? "discover\nrun\n" : "discover\nrun\nrun\n", "uncertainty stops all later admissions");
  assert.equal(read(reservationFile).token, "successor-reservation");
  fs.unlinkSync(reservationFile);
}
console.log("PASS: durable ownership loss returns observed results without overwriting peer journals or admitting later files");

for (const mode of ["malformed", "EACCES", "ENOENT", "readable"]) {
  const resultDirectory = path.join(scratch, ".git", `verification-${mode}`);
  const marker = path.join(scratch, ".git", `verification-${mode}.marker`);
  const fixture = path.join(scratch, ".git", `verification-${mode}.mjs`);
  fs.writeFileSync(fixture, `import fs from "node:fs";
fs.appendFileSync(${JSON.stringify(marker)}, process.argv[2]+"\\n");
await import(${JSON.stringify(new URL(`file:///${enginePath.replaceAll("\\", "/")}`).href)});
if(process.argv[2]==="run" && ${JSON.stringify(mode)}==="malformed") {
  const report=JSON.parse(fs.readFileSync(process.argv[4],"utf8"));
  report.testResults[0].assertionResults=[null];
  fs.writeFileSync(process.argv[4],JSON.stringify(report));
}`);
  const reservationFile = path.join(lockRoot, "reservation.json");
  const runFile = path.join(resultDirectory, "run.json");
  const peerJournal = JSON.stringify({ token: "peer-verification-journal", untouched: true });
  const originalRead = fs.readFileSync, rename = fs.renameSync;
  let running = 0, injected = false, attemptFile, priorAttempt;
  fs.renameSync = (temp, target) => {
    const value=target===reservationFile?read(temp):null;
    if (value?.mode === "run" && value.phase === "running" && running === 0) {
      running=2;
      fs.writeFileSync(temp, JSON.stringify({ ...read(temp), token: "peer-verification-reservation" }));
    }
    return rename(temp, target);
  };
  fs.readFileSync = (target, ...args) => {
    if (!injected && running === 2 && typeof target === "string" && path.basename(target) === "output.log") {
      injected = true;
      const journal = JSON.parse(originalRead(runFile, "utf8"));
      attemptFile = path.join(journal.attempts.at(-1).directory, "attempt.json");
      priorAttempt = originalRead(attemptFile, "utf8");
      fs.writeFileSync(runFile, peerJournal);
      if (["EACCES", "ENOENT"].includes(mode)) throw Object.assign(new Error(`Controlled output read ${mode}`), { code: mode });
    }
    return originalRead(target, ...args);
  };
  let result;
  try { result = await execute({ ...options, directory: resultDirectory, enginePath: fixture,
    identify: pid => pid === process.pid ? processIdentity(pid) : { pid, start: "fixture-child" } }); }
  finally { fs.readFileSync = originalRead; fs.renameSync = rename; }
  assert.equal(injected, true, `${mode}: post-exit verification reached`);
  assert.equal(result.unpersistedAttempts[0].exit, 0, "observed child close survives verification failure");
  assert.equal(result.unpersistedAttempts[0].status, mode === "readable" ? "passed" : "failed");
  if (mode !== "readable") assert.match(result.unpersistedAttempts[0].verificationError, /null|Controlled output read/);
  assert.equal(result.status, "incomplete", "later manifest files remain not run");
  assert.match(result.reservationError, /ownership changed/);
  assert.equal(originalRead(runFile, "utf8"), peerJournal, "no finally write after verification throws");
  assert.equal(originalRead(attemptFile, "utf8"), priorAttempt, "no attempt write after uncertainty");
  assert.equal(fs.existsSync(path.join(resultDirectory, "summary.json")), false);
  assert.equal(originalRead(marker, "utf8"), "discover\nrun\n", "no later child after verification error");
  assert.equal(read(reservationFile).token, "peer-verification-reservation");
  fs.unlinkSync(reservationFile);
}
console.log("PASS: malformed reports and denied/missing output retain observed exits without writing peer journals");

const coordinator = path.join(scratch, ".git", "coordinator.mjs");
fs.writeFileSync(coordinator, `import { execute } from ${JSON.stringify(new URL("./test-suite.mjs", import.meta.url).href)};
await execute({...${JSON.stringify({ ...options, directory: path.join(scratch, ".git", "interrupted") })}, census:()=>[], fingerprint:()=>"unchanged"});`);
fs.writeFileSync(path.join(scratch, ".git", "slow"), "");
const coordinatorLog=path.join(scratch,".git","coordinator.log");
const coordinatorOutput=fs.openSync(coordinatorLog,"wx");
let launched,exited,coordinatorIdentity,coordinatorOutputClosed=false,interruptionFailure;
const interrupted = path.join(scratch, ".git", "interrupted");
const until = async (check, message) => {
  const end = Date.now() + 30000;
  while (Date.now() < end) { if (check()) return; await new Promise(r => setTimeout(r, 100)); }
  assert.fail(message);
};
let active;
const {readTreeProof:readInterruptedProof}=await import("./test-suite-child.mjs");
let interruptionProof;
try {
launched = spawn(process.execPath, [coordinator], { stdio: ["ignore",coordinatorOutput,coordinatorOutput], windowsHide: true });
exited = new Promise(resolve => launched.once("close", (exit,signal)=>resolve({exit,signal})));
launched.on("error",error=>{interruptionFailure ||= error;});
fs.closeSync(coordinatorOutput);coordinatorOutputClosed=true;
coordinatorIdentity=processIdentity(launched.pid);
assert.ok(coordinatorIdentity?.start);
await until(() => {
  assert.equal(launched.exitCode,null,fs.readFileSync(coordinatorLog,"utf8"));
  try { active = read(path.join(interrupted, "run.json")).attempts.at(-1); return active.file?.endsWith("b.spec.tsx") && active.status === "running"; }
  catch { return false; }
}, "second file running");
assert.equal(status(interrupted, { fingerprint: () => "unchanged" }).unfinished[0].status, "running", "yield remains observable");
assert.equal(status(interrupted, { fingerprint: () => { throw Error("live status must not scan inputs"); } }).status, "running");
await assert.rejects(execute({packageRoot:scratch,enginePath,root:lockRoot,census:()=>[],fingerprint:()=>"unchanged",directory:interrupted}), /running/);
launched.kill();
await exited;
assert.notDeepEqual(processIdentity(coordinatorIdentity.pid),coordinatorIdentity);
// Pipe loss cancels native-owned ancestry. Coordinator close alone cannot
// establish that disposition; wait for independently bound fresh tree proof.
await until(()=>{try{interruptionProof=readInterruptedProof(active.supervision);return interruptionProof.tree.empty;}catch{return false;}},"owned helper published empty-tree proof after coordinator cancellation");
assert.equal(interruptionProof.interrupted,true);
assert.deepEqual(interruptionProof.root,active.child);
fs.unlinkSync(path.join(scratch, ".git", "slow"));
assert.notDeepEqual(processIdentity(active.child.pid),active.child,"Original root identity is absent");
} catch(error) {interruptionFailure ||= error;throw error;} finally {
  let cleanupError;
  if(!coordinatorOutputClosed)try{fs.closeSync(coordinatorOutput);}catch(error){cleanupError=error.message;}
  if(launched?.exitCode===null&&launched.signalCode===null)launched.kill();
  let cleanupClose,timer;
  if(exited)try {cleanupClose=await Promise.race([exited,new Promise(resolve=>{timer=setTimeout(()=>resolve(null),15000);})]);}
    finally{clearTimeout(timer);}
  if(launched&&!cleanupClose){cleanupError="Original coordinator close was not observed within15s";launched.unref();}
  if(!active)try{active=read(path.join(interrupted,"run.json")).attempts.at(-1);}catch{}
  if(active?.supervision) {
    const deadline=Date.now()+30000;
    let proofError;
    do {try{interruptionProof=readInterruptedProof(active.supervision);proofError=null;break;}catch(error){proofError=error.message;}
      await new Promise(resolve=>setTimeout(resolve,100));}while(Date.now()<deadline);
    cleanupError ||= proofError;
  } else cleanupError ||= "Attempt identity was not observed before fixture cancellation";
  cleanupError ??= null;
  fs.writeFileSync(path.join(scratch,".git","coordinator-cleanup.json"),JSON.stringify({coordinator:coordinatorIdentity,
    close:cleanupClose,proof:interruptionProof,unknown:cleanupError,originalFailure:interruptionFailure?.message}));
  if(!interruptionFailure)assert.equal(cleanupError,null,"Failed fixture must retain unknown rather than advance without owned disposition");
}
assert.equal(status(interrupted, { fingerprint: () => "unchanged" }).unfinished[0].status, "interrupted");
assert.equal((await execute({packageRoot:scratch,enginePath,root:lockRoot,census:()=>[],fingerprint:()=>"unchanged",directory:interrupted})).status,"passed");
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
assert.equal(status(identityOptions.directory,{identify:coordinatorDependencies.identify}).status,"stale");
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
  assert.equal(status(environmentDirectory,{identify:coordinatorDependencies.identify}).status,"stale");
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
  for(const file of ["one.test.ts","two.spec.tsx","bracket[1]{brace}(group)+@!.test.ts","excluded/ignored.spec.tsx"]) fs.writeFileSync(path.join(real,"src",file),testSource);
  realGit(["add","."]);
  fs.writeFileSync(path.join(real,"src","untracked.test.ts"),testSource);
  const realDirectory=path.join(real,".git","run");
  // Real children run under a scratch reservation, and the census sees only
  // processes naming this scratch repository, so other sessions' suites on the
  // same machine cannot fail the fixture. The expensive full-install identity
  // scan is replaced; dirty/dependency identity is tested above.
  // Model a package that provides Vitest but no unrelated hoisted glob library.
  // Vitest's own declared dependencies remain available through their importers.
  const isolatedEngine=path.join(real,".git","isolated-engine.mjs");
  fs.writeFileSync(isolatedEngine, `import Module from "node:module"; import path from "node:path";
const resolve=Module._resolveFilename;
Module._resolveFilename=function(request,parent,...rest) {
  if(parent?.filename===path.join(process.argv[3],"package.json") && request!=="vitest/node") {
    const error=new Error("Undeclared package dependency: "+request); error.code="MODULE_NOT_FOUND"; throw error;
  }
  return resolve.call(this,request,parent,...rest);
};
await import(${JSON.stringify(new URL("./suite-engine.mjs",import.meta.url).href)});`);
  const realOptions={directory:realDirectory,packageRoot:real,enginePath:isolatedEngine,root:path.join(real,".git","reservation"),census:()=>vitestProcesses({within:real}),fingerprint:()=>"fixed fixture inputs"};
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
  fs.rmSync(path.join(real,"vitest.workspace.ts"));
  fs.writeFileSync(path.join(real,"vitest.config.ts"),'import {defineConfig} from "vitest/config"; export default defineConfig({test:{environment:"jsdom",include:["shared/**/*.test.ts"]}});');
  fs.mkdirSync(path.join(real,"shared"));
  const leak=`import {it,expect} from "vitest"; it("fresh document",()=>{expect(document.body.dataset.seen).toBeUndefined();document.body.dataset.seen="1";expect(globalThis.leaked).toBeUndefined();globalThis.leaked=true;});`;
  for(const name of ["first.test.ts","second.test.ts"]) fs.writeFileSync(path.join(real,"shared",name),leak);
  const shared=await runVitest({packageRoot:real,files:["shared/first.test.ts","shared/second.test.ts"],root:path.join(real,".git","reservation"),census:()=>vitestProcesses({within:real}),stdio:"ignore"});
  assert.equal(shared.exit,0,"each file gets a fresh environment in the one worker");
  console.log("PASS: run gives each file a fresh jsdom environment in one worker");
}
// Required default inventory coverage, including sparse CI with no Vitest
// installation. These controls use the real native ownership mechanisms.
await ownedBoundaries();
}

async function ownedBoundaries() {
  const { runVitest, execute, notRunExit } = await import("./test-suite.mjs");
  const { runOwnedChild, readTreeProof } = await import("./test-suite-child.mjs");
  const { read, acquire, acquireWaiting } = await import("./test-suite-process.mjs");
  const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "impower-owned-boundaries-")));
  console.log("Owned boundary scratch repository: " + base);
  const holderRoot = path.join(base, "waiting-reservation"), rows = [];
  const holder = acquire("real waiting holder", { root: holderRoot, census: () => [] });
  const progressAt = new Date().toISOString();
  holder.update({ unitStartedAt: progressAt, progress: { at: progressAt, event: "collected" } });
  try {
    await assert.rejects(acquireWaiting("queued observer", { root: holderRoot, census: () => [],
      // Guard creation itself records a fresh OS identity. Five seconds allows
      // repeated real Windows CIM transactions without replacing that boundary.
      waitMs: 5000, pollMs: 100, onWait: value => rows.push(value) }), /Existing suite running/);
    console.log(JSON.stringify({ waitingRows: rows }));
    assert.ok(rows.length >= 2, "The actual waiting-row route was reached repeatedly");
    assert.ok(rows.at(-1).holder.heldAgeMs > rows[0].holder.heldAgeMs);
    assert.ok(rows.at(-1).holder.unitElapsedMs > rows[0].holder.unitElapsedMs);
    assert.ok(rows.at(-1).holder.lastProgressAgeMs > rows[0].holder.lastProgressAgeMs);
    assert.ok(rows.every(row => row.holder.progress.at === progressAt), "Waiting never advances genuine progress");
    assert.equal(read(path.join(holderRoot, "reservation.json")).progress.at, progressAt);
  } finally { holder.release(); }
  console.log("PASS: reached waiting rows advance holder/unit/progress age without inventing progress");
  if (process.argv.includes("--waiting-holder")) return;
  const enginePath = fileURLToPath(new URL("./fixtures/test-suite-engine-control.mjs", import.meta.url));
  const fixture = name => {
    const packageRoot = path.join(base, name); fs.mkdirSync(packageRoot);
    execFileSync("git", ["init", "--quiet", packageRoot], { windowsHide: true });
    fs.writeFileSync(path.join(packageRoot, "package.json"), '{}');
    fs.writeFileSync(path.join(packageRoot, "a.test.ts"), 'bounded tooling fixture');
    fs.mkdirSync(path.join(packageRoot, "node_modules", "vitest"), { recursive: true });
    fs.writeFileSync(path.join(packageRoot, "node_modules", "vitest", "package.json"), '{"version":"2.1.9"}');
    fs.writeFileSync(path.join(packageRoot, ".gitignore"), 'node_modules/');
    execFileSync("git", ["-C", packageRoot, "add", "package.json", "a.test.ts", ".gitignore"], { windowsHide: true });
    return { packageRoot, root: path.join(packageRoot, ".git", "reservation"), files: ["a.test.ts"],
      enginePath, stdio: "ignore", census: () => [], fingerprint: () => "unchanged" };
  };
  const events = options => {
    try { return fs.readFileSync(path.join(options.packageRoot, ".git", "engine-control-events.jsonl"), "utf8").trim().split("\n").map(JSON.parse); }
    catch (error) { if (error.code === "ENOENT") return []; throw error; }
  };
  const verifyProofs = result => {
    for (const attempt of result.observedAttempts || []) if (attempt.containment?.exitConfirmed)
      readTreeProof(attempt.supervision, { close: attempt.supervision.launcherClose });
  };
  for (const fault of [true, false]) {
    const options = fixture("initial-admission-" + fault), rename = fs.renameSync;
    let reached = 0, helpers = 0;
    fs.renameSync = (from, to) => {
      if (to === path.join(options.root, "reservation.json")) {
        const value = read(from);
        if (value.phase === "reserved" && value.attempt) {
          reached++;
          if (fault) throw Object.assign(new Error("initial admission publication refused"), { code: "EIO" });
        }
      }
      return rename(from, to);
    };
    let result;
    try { result = await runVitest({ ...options, ownedChild: value => { helpers++; return runOwnedChild(value); } }); }
    finally { fs.renameSync = rename; }
    assert.ok(reached > 0, "The same actual first-unit update injection reached the admission boundary");
    assert.equal(result.exit, fault ? 75 : 0);
    assert.equal(helpers, fault ? 0 : 3, "Positive sensitivity uses the same actual admission callback");
    if (fault) assert.deepEqual(events(options), []);
    verifyProofs(result);
    console.log("PASS: definite first-unit refusal/same-route sensitivity=" + fault);
  }
  for (const expected of [0, 1, 124]) {
    for (const fault of ["post-start", "final-publication", "release"]) {
      const options = fixture("known-" + expected + "-" + fault);
      if (expected === 1) fs.writeFileSync(path.join(options.packageRoot, ".git", "engine-control.json"), '{"exit":7}');
      if (expected === 124) fs.writeFileSync(path.join(options.packageRoot, ".git", "engine-control.json"), '{"delayMs":2500}');
      const rename = fs.renameSync, unlink = fs.unlinkSync;
      let reached = 0;
      fs.renameSync = (from, to) => {
        if (to === path.join(options.root, "reservation.json")) {
          const value = read(from);
          const target = expected === 124 ? "run-direct" : "merge";
          if (value.mode === target && (fault === "post-start" && value.phase === "running"
            || fault === "final-publication" && value.phase === "exited") && reached++ === 0) {
            rename(from, to); // retain the genuine post-rename publication fault
            throw Object.assign(new Error("confirmed unit publication refused"), { code: "EIO" });
          }
        }
        return rename(from, to);
      };
      fs.unlinkSync = file => {
        if (fault === "release" && file === path.join(options.root, "reservation.json") && reached++ === 0)
          throw Object.assign(new Error("confirmed release refused"), { code: "EIO" });
        return unlink(file);
      };
      let result;
      try { result = await runVitest({ ...options, fileTimeoutMs: expected === 124 ? 1000 : 1800000 }); }
      finally { fs.renameSync = rename; fs.unlinkSync = unlink; }
      assert.ok(reached > 0, "The named actual start/terminal/release boundary was reached");
      assert.equal(result.exit, expected, "Known aggregate survives final availability diagnostics");
      verifyProofs(result);
      const target = result.observedAttempts.findLast(value => value.mode === (expected === 124 ? "run-direct" : "merge"));
      assert.ok(target.containment.exitConfirmed);
      if (expected !== 124) assert.equal(target.exit, 0, "Post-start fault did not cancel the original successful finalizer");
      else assert.equal(target.timedOut, true);
      if (expected === 1) assert.equal(result.observedAttempts.find(value => value.mode === "run-direct").exit, 7,
        "Raw child failure remains evidence while public aggregate is1");
      assert.ok(result.reservationError || result.releaseError);
      console.log("PASS: known " + expected + " after " + fault);
    }
  }
  const options = fixture("discovery-timeout"), directory = path.join(options.packageRoot, ".git", "test-suites", "timeout");
  fs.writeFileSync(path.join(options.packageRoot, ".git", "engine-control.json"), '{"discoverDelayMs":2500}');
  let failure;
  try { await execute({ ...options, directory, fileTimeoutMs: 1000 }); }
  catch (error) { failure = error; }
  assert.ok(failure, "The intended discovery unit must time out");
  assert.equal(notRunExit(failure, () => {}), 124);
  const original = read(path.join(directory, "run.json")), attempt = original.attempts[0];
  assert.equal(attempt.status, "timed-out");
  readTreeProof(attempt.supervision, { close: attempt.supervision.launcherClose });
  const before = events(options).length;
  await assert.rejects(execute({ ...options, directory }), error => /new run/.test(error.message) && !error.notRun);
  assert.equal(events(options).length, before, "Incomplete discovery resume never relaunches an engine");
  assert.equal(read(path.join(directory, "run.json")).attempts[0].status, "timed-out");
  console.log("PASS: owned discovery timeout124 and explicit no-relaunch resume refusal");
  await ownedProgressBoundaries();
}

async function ownedProgressBoundaries() {
  const {runVitest}=await import("./test-suite.mjs");
  const {readTreeProof}=await import("./test-suite-child.mjs");
  const {read}=await import("./test-suite-process.mjs");
  const base=fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),"impower-owned-progress-")));
  console.log("Owned progress scratch repository: "+base);
  for(const outcome of [0,7,124])for(const boundary of ["reservation","journal"]) {
    const packageRoot=path.join(base,outcome+"-"+boundary);fs.mkdirSync(packageRoot);
    execFileSync("git",["init","--quiet",packageRoot],{windowsHide:true});
    fs.writeFileSync(path.join(packageRoot,"package.json"),'{}');
    fs.writeFileSync(path.join(packageRoot,"a.test.ts"),'bounded fixture');
    fs.writeFileSync(path.join(packageRoot,".gitignore"),'node_modules/');
    fs.mkdirSync(path.join(packageRoot,"node_modules","vitest"),{recursive:true});
    fs.writeFileSync(path.join(packageRoot,"node_modules","vitest","package.json"),'{"version":"2.1.9"}');
    execFileSync("git",["-C",packageRoot,"add","package.json","a.test.ts",".gitignore"],{windowsHide:true});
    fs.writeFileSync(path.join(packageRoot,".git","engine-control.json"),JSON.stringify({progress:true,
      delayMs:outcome===124?5000:4000,exit:outcome===7?7:0}));
    const root=path.join(packageRoot,".git","reservation"),rename=fs.renameSync;
    let reached=false;
    fs.renameSync=(from,to)=>{
      const value=read(from);
      if(!reached&&(boundary==="reservation"&&to===path.join(root,"reservation.json")&&value.mode==="run-direct"&&value.progress?.sequence===1
        ||boundary==="journal"&&path.basename(to)==="run.json"&&value.attempts?.at(-1)?.mode==="run-direct"&&value.progress?.sequence===1)) {
        reached=true;throw Object.assign(new Error("controlled mid-run progress publication refused"),{code:"EIO"});
      }
      return rename(from,to);
    };
    let result;
    try {result=await runVitest({packageRoot,files:["a.test.ts"],root,census:()=>[],stdio:"ignore",
      enginePath:fileURLToPath(new URL("./fixtures/test-suite-engine-control.mjs",import.meta.url)),
      fileTimeoutMs:outcome===124?2500:1800000});}
    finally {fs.renameSync=rename;}
    assert.equal(reached,true,"The genuine mid-run progress persistence boundary was reached");
    assert.equal(result.exit,outcome===124?124:1,"Incomplete finalization fails; confirmed timeout retains124");
    const attempt=result.observedAttempts.find(value=>value.mode==="run-direct");
    readTreeProof(attempt.supervision,{close:attempt.supervision.launcherClose});
    if(outcome===124)assert.equal(attempt.timedOut,true);
    else assert.equal(attempt.exit,outcome,"Availability failure must not cancel the original bounded root");
    assert.deepEqual(result.observedAttempts.map(value=>value.mode),["select","run-direct"],"No successor follows the progress fault");
    assert.ok(result.reservationError||result.journalError);
    console.log("PASS: original "+outcome+" after reached "+boundary+" progress publication fault");
    if(process.argv.includes("--progress-first"))return;
  }
}
