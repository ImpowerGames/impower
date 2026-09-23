import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { spawnDetached } from "./detached-launch.mjs";
import { acquireWaiting, releaseKeeping, waitForCensus, atomic, read, processIdentity, reservationState, vitestProcesses, same } from "./test-suite-process.mjs";
import { git, tracked, fingerprinter, canonicalPath, childEnvironment, isWithinDirectory } from "./test-suite-identity.mjs";

const engine = path.join(path.dirname(fileURLToPath(import.meta.url)), "suite-engine.mjs");
const now = () => new Date().toISOString();
const manifestHash = files => createHash("sha256").update(JSON.stringify(files)).digest("hex");
const clean = text => text.replace(/\x1b\[[0-9;]*m/g, "");

export function verifyResult(file, exit, signal, report, output) {
  const problems = [], failures = [], skips = [];
  const log = clean(output);
  if (exit !== 0 || signal) problems.push(`Child exit=${exit ?? "unconfirmed"}; signal=${signal ?? "none"}`);
  const fileSummary = log.match(/^\s*Test Files\s+(.+)\((\d+)\)\s*$/m);
  const testSummary = log.match(/^\s*Tests\s+(.+)\((\d+)\)\s*$/m);
  if (!fileSummary || Number(fileSummary[2]) !== 1 || !testSummary) problems.push("Missing complete single-file summaries");
  if (!/^1\s+passed$/.test(fileSummary?.[1]?.trim() || "")) problems.push("Text file summary must report exactly one passed file");
  if (/Worker exited unexpectedly|heap out of memory|Unhandled (?:Error|Rejection)|Some tests are still running/i.test(log)) problems.push("Worker, unhandled error or partial-result diagnostic");
  const result = report?.testResults?.[0];
  const assertions = result?.assertionResults;
  if (!Array.isArray(report?.testResults) || report.testResults.length !== 1 || typeof result?.name !== "string" || path.resolve(result.name) !== path.resolve(file) || !Array.isArray(assertions)) {
    return { status: "failed", tests: 0, failures, skips, problems: [...problems, "Missing or mismatched structured result"] };
  }
  const counts = { passed: 0, failed: 0, pending: 0, skipped: 0, todo: 0 };
  for (const assertion of assertions) {
    if (!Object.hasOwn(counts, assertion.status) || typeof assertion.fullName !== "string" || !Array.isArray(assertion.failureMessages)) { problems.push("Malformed assertion result"); continue; }
    counts[assertion.status]++;
    if (assertion.status === "failed") failures.push({ name: assertion.fullName, messages: assertion.failureMessages });
    if (["pending", "skipped", "todo"].includes(assertion.status)) skips.push({ name: assertion.fullName, status: assertion.status });
  }
  if (result.message) failures.push({ name: file, messages: [result.message] });
  for (const [key, expected] of Object.entries({ numTotalTests: assertions.length, numPassedTests: counts.passed,
    numFailedTests: counts.failed, numPendingTests: counts.pending + counts.skipped, numTodoTests: counts.todo })) {
    if (report[key] !== expected) problems.push(`Inconsistent ${key}`);
  }
  if (Number(testSummary?.[2]) !== assertions.length) problems.push("Text and structured test counts disagree");
  const textCounts = Object.fromEntries([...(testSummary?.[1] || "").matchAll(/(\d+)\s+(passed|failed|skipped|todo)/g)].map(m => [m[2], Number(m[1])]));
  for (const [name, count] of Object.entries({ passed: counts.passed, failed: counts.failed, skipped: counts.skipped + counts.pending, todo: counts.todo })) {
    if ((textCounts[name] || 0) !== count) problems.push(`Text and structured ${name} counts disagree`);
  }
  if (!Number.isInteger(report.numTotalTestSuites) || report.numTotalTestSuites < 1 || !Number.isInteger(report.numPassedTestSuites)
    || report.numTotalTestSuites !== report.numPassedTestSuites + report.numFailedTestSuites + report.numPendingTestSuites) problems.push("Incomplete suite counts");
  if (counts.passed + counts.failed === 0) problems.push("No tests executed");
  if (report.success !== true || result.status !== "passed" || report.numFailedTestSuites !== 0 || report.numPendingTestSuites !== 0 || counts.failed || failures.length) problems.push("Failed or unfinished tests/suites");
  return { status: problems.length ? "failed" : "passed", tests: assertions.length, failures, skips, problems };
}

export function aggregate(run) {
  const latest = new Map(run.attempts.map(attempt => [attempt.file, attempt]));
  const completed = [], unfinished = [], failed = [], failures = [], skips = [], problems = [];
  let tests = 0;
  for (const file of run.files) {
    const attempt = latest.get(file);
    if (!attempt || !["passed", "failed"].includes(attempt.status)) unfinished.push({ file, status: attempt?.status ?? "not-run" });
    else {
      completed.push(file);
      tests += attempt.tests || 0;
      if (attempt.status === "failed") failed.push(file);
      for (const problem of attempt.problems || []) problems.push({ file, problem });
      for (const failure of attempt.failures || []) failures.push({ file, ...failure });
      for (const skip of attempt.skips || []) skips.push({ file, ...skip });
    }
  }
  return { status: run.stale ? "stale" : unfinished.length ? "incomplete" : failed.length || !run.files.length ? "failed" : "passed",
    expected: run.files.length, completed, unfinished, failed, tests, failures, skips, problems };
}

function validateRun(run, directory) {
  if (run.directory !== directory || run.version !== 1 || !Array.isArray(run.files) || !Array.isArray(run.attempts)
    || !run.files.every(file => typeof file === "string" && path.isAbsolute(file)) || new Set(run.files).size !== run.files.length
    || ![run.root, run.packageRoot].every(value => typeof value === "string" && path.isAbsolute(value))) throw new Error("Invalid run journal");
  for (const attempt of run.attempts) {
    if (!/^[a-f0-9-]{36}$/.test(attempt.id) || attempt.directory !== path.join(directory, attempt.id)
      || !["discover", "run"].includes(attempt.mode) || (attempt.mode === "run" && !run.files.includes(attempt.file))) throw new Error("Invalid attempt journal");
  }
}

function loadEvidence(run) {
  for (const attempt of run.attempts) {
    // A coordinator may exit after persisting the per-file result but before
    // updating the aggregate journal. Recover only matching, terminal evidence.
    let saved;
    try { saved = read(path.join(attempt.directory, "attempt.json")); } catch { /* missing evidence remains incomplete */ }
    if (saved?.id === attempt.id && saved.file === attempt.file && saved.endedAt && ["passed", "failed"].includes(saved.status)) Object.assign(attempt, saved);
    if (attempt.mode !== "run" || !["passed", "failed"].includes(attempt.status)) continue;
    try {
      if (!attempt.endedAt || !Number.isInteger(attempt.exit)) throw new Error("Missing child exit evidence");
      Object.assign(attempt, verifyResult(attempt.file, attempt.exit, attempt.signal,
        read(path.join(attempt.directory, "vitest.json")), fs.readFileSync(path.join(attempt.directory, "output.log"), "utf8")));
    } catch (error) { Object.assign(attempt, { status: "failed", problems: [error.message] }); }
  }
}

// Both output streams go directly to one UTF-8 file: surviving children retain
// their handles after coordinator interruption, with no shell encoding conversion.
async function childRun(run, mode, file, reservation, save, { enginePath = engine, identify = processIdentity } = {}) {
  const id = randomUUID();
  const directory = path.join(run.directory, id);
  fs.mkdirSync(directory);
  const attempt = { id, file, mode, directory, status: "unknown", startedAt: now(), owner: reservation.record.owner };
  run.attempts.push(attempt);
  reservation.update({ phase: "launching", attempt: id });
  save();
  const logFile = path.join(directory, "output.log"), jsonFile = path.join(directory, "vitest.json");
  const fd = fs.openSync(logFile, "wx");
  const env = childEnvironment();
  let child;
  try { child = spawnDetached(process.execPath, ["--max-old-space-size=1024", enginePath, mode, run.packageRoot, jsonFile, ...(file ? [file] : [])],
    { cwd: run.packageRoot, env, stdio: ["ignore", fd, fd] }); }
  finally { fs.closeSync(fd); }
  // Install exit listeners before synchronous identity probes: fast children
  // can disappear before inspection but their actual exit event is still required.
  const completion = new Promise(resolve => {
    child.once("error", error => resolve({ exit: null, signal: null, launchError: error.message }));
    child.once("close", (exit, signal) => resolve({ exit, signal }));
  });
  attempt.pid = child.pid;
  try {
    attempt.child = child.pid ? identify(child.pid) : null;
    attempt.status = attempt.child ? "running" : "unknown";
    reservation.update({ phase: attempt.child ? "running" : "launching", child: attempt.child });
  } catch (error) { attempt.identityError = error.message; }
  save();
  atomic(path.join(directory, "attempt.json"), attempt);
  const progress = setInterval(() => console.log(JSON.stringify({ run: run.directory, file, status: attempt.status, pid: child.pid, waitingForExit: true })), 30000);
  let result;
  try { result = await completion; } finally { clearInterval(progress); }
  Object.assign(attempt, result, { endedAt: now() });
  // Record actual exit before trying to parse any result. Parsing failures cannot
  // erase evidence that permits safe reconciliation.
  reservation.update({ phase: "exited", exit: result.exit, signal: result.signal });
  atomic(path.join(directory, "attempt.json"), attempt);
  let report = null;
  try { report = read(jsonFile); } catch (error) { attempt.reportError = error.message; }
  if (mode === "discover") {
    attempt.status = result.exit === 0 && Array.isArray(report) && report.every(f => typeof f === "string") ? "passed" : "failed";
  } else Object.assign(attempt, verifyResult(file, result.exit, result.signal, report, fs.readFileSync(logFile, "utf8")));
  atomic(path.join(directory, "attempt.json"), attempt);
  save();
  return { attempt, report };
}

const reportWait = value => console.log(JSON.stringify({ status: "waiting", ...value }));

// Nothing has run when the reservation cannot be taken; the error says so, so
// callers never read a refusal as a test result.
const queue = (run, options) => acquireWaiting(run, { ...options, onWait: reportWait })
  .catch(error => { throw Object.assign(error, { notRun: true }); });

// The exit status and marker line for a failed command. 75 (EX_TEMPFAIL) and
// the marker say no test ran and the same command can be run again; the
// red/green driver reads the marker.
export function notRunExit(error, write = console.error) {
  if (!error?.notRun) { write(error?.stack ?? String(error)); return 1; }
  write(`test-suite: not run: ${error.message}`);
  return 75;
}

export async function execute({ directory, packageRoot, retry = [], waitMs = 0, ...dependencies }) {
  directory = canonicalPath(directory);
  retry = retry.map(canonicalPath);
  const census = dependencies.census || vitestProcesses;
  const reservation = await queue(directory, { ...dependencies, census, waitMs });
  let run;
  let lastProgress = 0;
  const fingerprint = dependencies.fingerprint || fingerprinter(value => {
    if (Date.now() - lastProgress > 10000) { console.log(JSON.stringify({ run: directory, ...value })); lastProgress = Date.now(); }
  });
  const save = () => atomic(path.join(directory, "run.json"), run);
  let summary;
  try {
    if (fs.existsSync(path.join(directory, "run.json"))) {
      run = read(path.join(directory, "run.json"));
      validateRun(run, directory);
      loadEvidence(run);
      // Acquisition reconciled both the previous coordinator and its child.
      for (const attempt of run.attempts) if (!["passed", "failed", "interrupted"].includes(attempt.status)) {
        attempt.status = "interrupted";
        attempt.reconciledAt = now();
        atomic(path.join(attempt.directory, "attempt.json"), attempt);
      }
      if (run.stale || run.manifestHash !== manifestHash(run.files) || run.identity !== fingerprint(run.root, [])) {
        run.stale = true; save();
        throw new Error("Source/configuration/dependency identity changed; start a new run (old attempts preserved)");
      }
      run.owner = reservation.record.owner;
      run.token = reservation.record.token;
      run.active = true;
      save();
    } else {
      packageRoot = canonicalPath(packageRoot);
      const root = canonicalPath(git(packageRoot, ["rev-parse", "--show-toplevel"]).trim());
      // Journals must live outside the source inventory, even with custom paths.
      const gitDir = canonicalPath(path.resolve(packageRoot, git(packageRoot, ["rev-parse", "--git-dir"]).trim()));
      if (!isWithinDirectory(gitDir, directory)) throw new Error("Place run directories below this worktree's Git directory");
      fs.mkdirSync(directory, { recursive: true });
      run = { version: 1, directory, root, packageRoot, owner: reservation.record.owner, token: reservation.record.token, active: true, createdAt: now(), files: [], attempts: [] };
      save();
      const beforeDiscovery = fingerprint(root, []);
      const { attempt, report } = await childRun(run, "discover", null, reservation, save, dependencies);
      if (attempt.status !== "passed") throw new Error(`Discovery failed; inspect ${attempt.directory}`);
      const trackedFiles = new Set(tracked(root).map(f => canonicalPath(path.resolve(root, f))));
      run.files = [...new Set(report.map(canonicalPath).filter(f => trackedFiles.has(f)))].sort();
      if (!run.files.length) throw new Error("Empty tracked test manifest; stage test files first");
      if (run.files.some(f => !/\.(test|spec)\.(ts|tsx)$/.test(f))) throw new Error("This runner supports tracked test/spec TS and TSX files");
      save();
      run.manifestHash = manifestHash(run.files);
      run.identity = fingerprint(root, []);
      if (run.identity !== beforeDiscovery) { run.stale = true; save(); throw new Error("Inputs changed during discovery; start a new run"); }
      save();
    }
    for (const file of retry) {
      if (!run.files.includes(file) || run.attempts.filter(a => a.file === file).at(-1)?.status !== "failed") throw new Error(`Retry must select a failed manifest file: ${file}`);
    }
    for (const file of run.files) {
      const previous = run.attempts.filter(a => a.file === file).at(-1);
      if (previous && (previous.status === "passed" || previous.status === "failed" && !retry.includes(file))) continue;
      if (fingerprint(run.root, []) !== run.identity) { run.stale = true; save(); throw new Error("Inputs changed during suite; start a new run"); }
      await waitForCensus({ deadline: Date.now() + waitMs, pollMs: dependencies.pollMs, census, onWait: reportWait });
      await childRun(run, "run", file, reservation, save, dependencies);
    }
    if (fingerprint(run.root, []) !== run.identity) { run.stale = true; save(); }
    summary = aggregate(run);
    atomic(path.join(directory, "summary.json"), summary);
    return summary;
  } finally {
    // Persist while still owning the reservation: a successor may acquire it
    // immediately after release and must never be overwritten by this owner.
    if (run?.token === reservation.record.token) { run.active = false; save(); }
    // A failed release never replaces the summary or the error already in
    // flight. summary.json is already written, and after the release attempt
    // this owner writes nothing more, so the failure goes on the returned summary only.
    try { reservation.release(); }
    catch (error) {
      if (summary) summary.releaseError = error.message;
      console.error(`Reservation not released; the next acquirer recovers it: ${error.message}`);
    }
  }
}

// One worker process with a fresh environment per file. `singleFork` would
// share one environment across a package's files, which fails jsdom suites
// for reasons unrelated to the change under test.
export const vitestArguments = files => ["run", ...files, "--pool=forks",
  "--poolOptions.forks.minForks=1", "--poolOptions.forks.maxForks=1", "--no-file-parallelism"];

// A direct Vitest run under the machine-wide reservation, so single-file runs
// and suites queue behind each other instead of racing.
export async function runVitest({ packageRoot, files = [], waitMs = 0, vitestPath, stdio = "inherit", ...dependencies }) {
  packageRoot = canonicalPath(packageRoot);
  vitestPath ??= path.join(path.dirname(createRequire(path.join(packageRoot, "package.json")).resolve("vitest/package.json")), "vitest.mjs");
  const census = dependencies.census || vitestProcesses;
  const identify = dependencies.identify || processIdentity;
  const reservation = await queue(`vitest run in ${packageRoot}`, { ...dependencies, census, waitMs });
  let child;
  reservation.update({ phase: "launching" });
  // Release only while no child can be running; an unconfirmed exit keeps the
  // reservation, as the suite coordinator does.
  try {
    child = spawn(process.execPath, ["--max-old-space-size=1024", vitestPath, ...vitestArguments(files)],
      { cwd: packageRoot, env: childEnvironment(), stdio, windowsHide: true });
  } catch (error) { reservation.update({ phase: "exited" }); releaseKeeping(reservation, error); throw error; }
  const completion = new Promise(resolve => {
    child.once("error", error => resolve({ exit: null, signal: null, launchError: error.message }));
    child.once("close", (exit, signal) => resolve({ exit, signal }));
  });
  let identity = null;
  try { identity = child.pid ? identify(child.pid) : null; }
  catch (error) { console.error(`Child identity unavailable: ${error.message}`); }
  reservation.update({ phase: identity ? "running" : "launching", child: identity });
  const result = await completion;
  reservation.update({ phase: "exited", exit: result.exit, signal: result.signal });
  // The result is known; a failed release is reported beside it, never instead of it.
  try { reservation.release(); }
  catch (error) {
    result.releaseError = error.message;
    console.error(`Reservation not released; the next acquirer recovers it: ${error.message}`);
  }
  return result;
}

const waitOption = args => {
  const index = args.indexOf("--wait");
  if (index < 0) return { args, waitMs: 0 };
  const seconds = Number(args[index + 1]);
  if (!Number.isFinite(seconds) || seconds < 0) throw new Error("--wait takes a number of seconds");
  return { args: [...args.slice(0, index), ...args.slice(index + 2)], waitMs: seconds * 1000 };
};

export function status(directory, { identify = processIdentity, fingerprint = fingerprinter() } = {}) {
  directory = canonicalPath(directory);
  const run = read(path.join(directory, "run.json"));
  validateRun(run, directory);
  loadEvidence(run);
  for (const attempt of run.attempts) {
    if (!["passed", "failed", "interrupted"].includes(attempt.status)) {
      try { attempt.status = reservationState({ owner: attempt.owner, child: attempt.child, phase: attempt.child ? "running" : "launching" }, identify); }
      catch { attempt.status = "unknown"; }
    }
  }
  let live = run.attempts.some(attempt => attempt.status === "running"), unknown = run.attempts.some(attempt => attempt.status === "unknown");
  try {
    live ||= !!(run.active && run.owner && same(run.owner, identify(run.owner.pid)));
  } catch { unknown = true; }
  // Observing an active process must stay cheap. Reusable evidence is checked
  // once it is terminal; a live/unknown run cannot be reported as passed.
  run.stale = !!run.stale || !live && !unknown && !!run.identity && (run.manifestHash !== manifestHash(run.files) || run.identity !== fingerprint(run.root, []));
  const summary = aggregate(run);
  if (live) summary.status = "running";
  else if (unknown) summary.status = "unknown";
  else if (!run.identity) summary.status = "interrupted";
  return { run: run.directory, ...summary, identityChecked: !live && !unknown && !!run.identity, attempts: run.attempts };
}

// The command line. `dependencies` is the test seam for the reservation store,
// census and child programs; the entry point below passes none.
export async function main(argv, dependencies = {}) {
  const [command, target, ...rest] = argv;
  const { args, waitMs } = waitOption(rest);
  let result;
  if (command === "run" && target) {
    // Local runs name the files under work; the Test Suite workflow gives the
    // package result, and `start` gives a durable local one.
    if (!args.length) throw new Error("Name the test files under work; use start for a whole package");
    const { exit, signal, launchError } = await runVitest({ ...dependencies, packageRoot: target, files: args, waitMs });
    if (launchError) throw new Error(launchError);
    if (signal) console.error(`Vitest ended by signal ${signal}`);
    return exit ?? 1;
  } else if (command === "start" && target && !args.length) {
    const packageRoot = canonicalPath(target);
    const gitDir = canonicalPath(path.resolve(packageRoot, git(packageRoot, ["rev-parse", "--git-dir"]).trim()));
    const directory = path.join(gitDir, "test-suites", randomUUID());
    console.log(JSON.stringify({ run: directory, status: "starting", coordinator: processIdentity(process.pid) }));
    result = await execute({ ...dependencies, directory, packageRoot, waitMs });
  } else if (command === "resume" && target) {
    if (args.length && args[0] !== "--retry") throw new Error("Use --retry followed by explicit failed paths");
    const run = read(path.join(target, "run.json"));
    result = await execute({ ...dependencies, directory: target, waitMs, retry: args.slice(1).map(f => path.resolve(run.packageRoot, f)) });
  } else if (command === "status" && target && !args.length) result = status(target);
  else throw new Error("Usage: node scripts/test-suite.mjs run <package> <test-file> [<test-file> ...] [--wait <seconds>] | start <package> [--wait <seconds>] | status <run-directory> | resume <run-directory> [--retry <failed-file> ...] [--wait <seconds>]");
  console.log(JSON.stringify(result, null, 2));
  return result.status === "passed" ? 0 : 1;
}

if (process.argv[1] && canonicalPath(process.argv[1]) === canonicalPath(fileURLToPath(import.meta.url))) {
  try { process.exitCode = await main(process.argv.slice(2)); }
  catch (error) { process.exitCode = notRunExit(error); }
}
