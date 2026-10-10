import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID, createHash } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { acquireWaiting, releaseKeeping, waitForCensus, atomic, read, processIdentity, reservationState, vitestProcesses, same } from "./test-suite-process.mjs";
import { git, tracked, fingerprinter, canonicalPath, childEnvironment, isWithinDirectory } from "./test-suite-identity.mjs";
import { prepareOwnedRuntime, prepareOwnedChild, runOwnedChild, readTreeProof, assertAttemptBinding } from "./test-suite-child.mjs";
import { openReceipt } from "./test-suite-receipt.mjs";

const engine = path.join(path.dirname(fileURLToPath(import.meta.url)), "suite-engine.mjs");
const now = () => new Date().toISOString();
const manifestHash = files => createHash("sha256").update(JSON.stringify(files)).digest("hex");
const clean = text => text.replace(/\x1b\[[0-9;]*m/g, "");

export function verifyResult(file, exit, signal, report, output, expectedFiles = 1) {
  const problems = [], failures = [], skips = [];
  const log = clean(output);
  if (exit !== 0 || signal) problems.push(`Child exit=${exit ?? "unconfirmed"}; signal=${signal ?? "none"}`);
  const fileSummary = log.match(/^\s*Test Files\s+(.+)\((\d+)\)\s*$/m);
  const testSummary = log.match(/^\s*Tests\s+(.+)\((\d+)\)\s*$/m);
  if (!fileSummary || Number(fileSummary[2]) !== expectedFiles || !testSummary) problems.push("Missing complete single-file summaries");
  if (fileSummary?.[1]?.trim().replace(/\s+/g, " ") !== `${expectedFiles} passed`) problems.push("Text file summary must report exactly the selected passed specifications");
  if (/Worker exited unexpectedly|heap out of memory|Unhandled (?:Error|Rejection)|Some tests are still running/i.test(log)) problems.push("Worker, unhandled error or partial-result diagnostic");
  const results = report?.testResults;
  if (!Array.isArray(results) || results.length !== expectedFiles || results.some(result => typeof result?.name !== "string"
    || path.resolve(result.name) !== path.resolve(file) || !Array.isArray(result.assertionResults))) {
    return { status: "failed", tests: 0, failures, skips, problems: [...problems, "Missing or mismatched structured result"] };
  }
  const assertions = results.flatMap(result => result.assertionResults);
  const counts = { passed: 0, failed: 0, pending: 0, skipped: 0, todo: 0 };
  for (const assertion of assertions) {
    if (!Object.hasOwn(counts, assertion.status) || typeof assertion.fullName !== "string" || !Array.isArray(assertion.failureMessages)) { problems.push("Malformed assertion result"); continue; }
    counts[assertion.status]++;
    if (assertion.status === "failed") failures.push({ name: assertion.fullName, messages: assertion.failureMessages });
    if (["pending", "skipped", "todo"].includes(assertion.status)) skips.push({ name: assertion.fullName, status: assertion.status });
  }
  for (const result of results) if (result.message) failures.push({ name: file, messages: [result.message] });
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
  if (report.success !== true || results.some(result => result.status !== "passed") || report.numFailedTestSuites !== 0 || report.numPendingTestSuites !== 0 || counts.failed || failures.length) problems.push("Failed or unfinished tests/suites");
  return { status: problems.length ? "failed" : "passed", tests: assertions.length, failures, skips, problems };
}

export function aggregate(run) {
  const latest = new Map(run.attempts.map(attempt => [attempt.file, attempt]));
  const unitFailures = [...latest.values()].filter(attempt => attempt.status === "failed" && !run.files.includes(attempt.file))
    .map(attempt => ({ id: attempt.id, mode: attempt.mode, file: attempt.file, problems: attempt.problems ?? [] }));
  const unitTimeouts = [...latest.values()].filter(attempt => attempt.status === "timed-out").map(attempt => ({ id: attempt.id, mode: attempt.mode, file: attempt.file }));
  const completed = [], unfinished = [], failed = [], timedOut = [], notRun = [], failures = [], skips = [], problems = [];
  let tests = 0;
  for (const file of run.files) {
    const attempt = latest.get(file);
    if (attempt?.status === "not-run") notRun.push(file);
    if (!attempt || !["passed", "failed", "timed-out"].includes(attempt.status)) unfinished.push({ file, status: attempt?.status ?? "not-run" });
    else {
      completed.push(file);
      tests += attempt.tests || 0;
      if (attempt.status === "failed") failed.push(file);
      if (attempt.status === "timed-out") timedOut.push(file);
      for (const problem of attempt.problems || []) problems.push({ file, problem });
      for (const failure of attempt.failures || []) failures.push({ file, ...failure });
      for (const skip of attempt.skips || []) skips.push({ file, ...skip });
    }
  }
  return { status: run.stale ? "stale" : [...latest.values()].some(attempt => attempt.status === "unknown") ? "unknown"
    : unitTimeouts.length ? "timed-out" : unfinished.length ? "incomplete" : failed.length || unitFailures.length || !run.files.length ? "failed" : "passed",
    expected: run.files.length, completed, unfinished, failed, timedOut, unitTimeouts, unitFailures, notRun, tests, failures, skips, problems };
}

function validateRun(run, directory) {
  if (run.directory !== directory || ![1, 2].includes(run.version) || !Array.isArray(run.files) || !Array.isArray(run.attempts)
    || !run.files.every(file => typeof file === "string" && path.isAbsolute(file)) || new Set(run.files).size !== run.files.length
    || ![run.root, run.packageRoot].every(value => typeof value === "string" && path.isAbsolute(value))) throw new Error("Invalid run journal");
  for (const attempt of run.attempts) {
    if (!/^[a-f0-9-]{36}$/.test(attempt.id) || attempt.directory !== path.join(directory, attempt.id)
      || !["discover", "run"].includes(attempt.mode) || (attempt.mode === "run" && !run.files.includes(attempt.file))) throw new Error("Invalid attempt journal");
  }
}

function loadEvidence(run, identify = processIdentity) {
  for (const attempt of run.attempts) {
    if(run.version===2&&attempt.supervision) {
      try {assertAttemptBinding(attempt.supervision,attempt);}
      catch(error){attempt.status="unknown";attempt.containmentError=error.message;continue;}
    }
    // A coordinator may exit after persisting the per-file result but before
    // updating the aggregate journal. Recover only matching, terminal evidence.
    let saved;
    try { saved = read(path.join(attempt.directory, "attempt.json")); } catch { /* missing evidence remains incomplete */ }
    const terminal = ["passed", "failed", "timed-out", "not-run", "interrupted"];
    if (saved?.id === attempt.id && saved.file === attempt.file && saved.directory === attempt.directory && saved.mode === attempt.mode
      && saved.endedAt && terminal.includes(saved.status)) {
      if (run.version === 2) {
        try {
          const expected = attempt.supervision;
          if (!expected || saved.supervision?.launchNonce !== expected.launchNonce
            || saved.supervision?.reservationToken !== expected.reservationToken) throw new Error("Attempt authorization binding changed");
          assertAttemptBinding(saved.supervision,attempt);
          readTreeProof(saved.supervision, { identify, close: saved.supervision.launcherClose });
          Object.assign(attempt, saved);
        } catch (error) { attempt.status = "unknown"; attempt.containmentError = error.message; }
      } else Object.assign(attempt, saved);
    }
    if (run.version === 2 && attempt.supervision) {
      try {
        const proof = readTreeProof(attempt.supervision, { identify, close: attempt.supervision.launcherClose });
        Object.assign(attempt, { containment: proof, exit: proof.exit, signal: proof.signal,
          timedOut: proof.timedOut === true, endedAt: proof.finishedAt });
        if (proof.status !== "exited") attempt.status = proof.status;
        else if (attempt.mode === "discover") {
          let report;
          try { report = read(path.join(attempt.directory, "vitest.json")); }
          catch (error) { attempt.reportError = error.message; }
          attempt.status = proof.exit === 0 && Array.isArray(report) && report.every(value => typeof value === "string") ? "passed" : "failed";
        } else if (proof.exit === 75) {
          const selection = read(path.join(attempt.directory, "selection.json"));
          if (selection.version !== 1 || selection.requested !== attempt.file || selection.status !== "not-run"
            || !Array.isArray(selection.specifications) || selection.specifications.length) throw new Error("Unverified configured empty selection");
          attempt.status = "not-run"; attempt.configuredSelection = selection;
        } else attempt.status = "passed"; // structured verification below decides the actual test result
      }
      catch (error) { attempt.status = "unknown"; attempt.containmentError = error.message; }
    }
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
function settleNoChild(reservation, evidence) {
  if (reservation.record.phase !== "launching") return;
  // Spawn has definitely not returned a child. This is a token-checked cleanup
  // transition, never an admission retry or a claim about any running child.
  try { reservation.update({ phase: "exited", child: null }); }
  catch (error) { evidence.reservationCleanupError = error.message; }
}

async function childRun(run, mode, file, reservation, save, { enginePath = engine, identify = processIdentity,
  onReservationError = () => {}, onJournalError = () => {}, invocationRuntime, invocationEnvironment,
  fileTimeoutMs = 1800000, ownedChild = runOwnedChild, prepareChild = prepareOwnedChild,
  engineArguments = [], expectedFiles = 1, receipt } = {}) {
  const id = randomUUID(), directory = path.join(run.directory, id);
  const attempt = { id, file, mode, directory, status: "unknown", startedAt: now(), owner: reservation.record.owner,
    timeoutMs: fileTimeoutMs };
  run.attempts.push(attempt);
  const update = value => {
    if (attempt.reservationError) return false;
    try { reservation.update(value); return true; }
    catch (error) {
      attempt.reservationError = error.message;
      onReservationError(error.message);
      console.error("Reservation update failed; retaining only unpersisted attempt evidence: " + error.message);
      return false;
    }
  };
  const publish = action => {
    if (attempt.reservationError || attempt.journalError) return;
    try { action(); }
    catch (error) { attempt.journalError = error.message; onJournalError(error.message); }
  };
  const jsonFile = path.join(directory, "vitest.json"), logFile = path.join(directory, "output.log");
  let progressSequence = 0;
  const progress = () => {
    if (attempt.reservationError || attempt.journalError) return;
    let value;
    try { value = read(path.join(directory, "progress.json")); }
    catch (error) { if (error.code === "ENOENT") return; throw error; }
    if (value.version !== 1 || value.mode !== mode || value.file !== (file ?? null)
      || !Number.isSafeInteger(value.sequence) || value.sequence < 1 || !Number.isFinite(Date.parse(value.at)))
      throw new Error("Invalid execution-unit progress evidence");
    if (value.sequence <= progressSequence) return;
    progressSequence = value.sequence;
    attempt.progress = value; attempt.progressPublications = (attempt.progressPublications || 0) + 1;
    run.progress = { attempt: id, ...value };
    if (!update({ progress: run.progress })) throw new Error(attempt.reservationError);
    publish(() => { save(); atomic(path.join(directory, "attempt.json"), attempt); });
    if (attempt.journalError) throw new Error(attempt.journalError);
  };
  let prepared, result, helperInvoked=false;
  if (!update({ phase: "reserved", attempt: id, child: null, supervision: null,
    progress: null, file, mode, timeoutMs: fileTimeoutMs, unitStartedAt: null })) {
    Object.assign(attempt, { status: "not-run", endedAt: now(), engineAdmissionRefused: true });
    return { attempt, report: null };
  }
  try {
    fs.mkdirSync(directory);
    save();
    receipt?.attempt({ id, mode, file, directory, phase: "no-helper-yet" });
    prepared = await prepareChild({ runtime: invocationRuntime, directory, attemptId: id,
      command: process.execPath, args: ["--max-old-space-size=1024", enginePath, mode, run.packageRoot, jsonFile, ...(file ? [file] : []), ...engineArguments],
      cwd: run.packageRoot, env: invocationEnvironment, timeoutMs: fileTimeoutMs });
    if (prepared.status !== "prepared") throw new Error("Invocation supervisor runtime was not admitted");
    const persist = (metadata, authorizationPhase) => {
      const earlier = attempt.supervision?.authorizationPhase;
      if (["may-launch", "root-started"].includes(earlier) && authorizationPhase === "no-launch") authorizationPhase = earlier;
      attempt.supervision = { ...attempt.supervision, ...metadata, authorizationPhase };
      if (!update({ phase: authorizationPhase === "root-started" ? "running" : "launching",
        supervision: attempt.supervision, child: metadata.root ?? null,
        ...(metadata.startedAt ? { unitStartedAt: metadata.startedAt } : {}) })) throw new Error(attempt.reservationError);
      if (attempt.journalError) throw new Error(attempt.journalError);
      publish(() => { save(); atomic(path.join(directory, "attempt.json"), attempt); });
      if (attempt.journalError) throw new Error(attempt.journalError);
      try { receipt?.attempt({ id, mode, file, directory, supervision: attempt.supervision }); }
      catch (error) { attempt.journalError = error.message; onJournalError(error.message); throw error; }
    };
    // Persist possible helper launch before calling a function that can spawn.
    // Missing identities after a crash remain unknown, never reserved/no-child.
    persist({version:1,directory,attemptId:id,reservationToken:reservation.record.token,
      launchNonce:prepared.launchNonce,proofFile:prepared.proofFile,platform:prepared.platform,
      helperLaunchPhase:"may-start"},"no-launch");
    helperInvoked=true;
    result = await ownedChild({ prepared, reservationToken: reservation.record.token, env: invocationEnvironment, identify,
      onPreparing: value => persist(value, "no-launch"),
      onReady: value => persist(value, "no-launch"),
      onAuthorize: value => persist(value, "may-launch"),
      onStarted: value => {
        attempt.child = value.root; attempt.pid = value.root.pid; attempt.engineStartedAt = value.startedAt;
        attempt.status = "running";
        try { persist(value, "root-started"); }
        catch (error) {
          // Authorization already happened after validated identity/bindings.
          // A shared-write availability fault latches admission, but cannot
          // replace the original bounded child result by causing cancellation.
          if (!attempt.reservationError && !attempt.journalError) throw error;
        }
      }, onPoll: () => {
        try { progress(); }
        catch (error) {
          // As at root-start, a latched shared-write fault stops admission and
          // further writes while the original authorized unit completes.
          if (!attempt.reservationError && !attempt.journalError) throw error;
        }
      } });
  } catch (error) {
    attempt.setupError = error.message;
    if (helperInvoked && error.helperLaunched !== false) {
      attempt.status = "unknown"; attempt.containmentError = error.message;
      onReservationError(error.message);
      return { attempt, report: null };
    }
    // Only explicit pre-helper failure can settle the launching phase. This
    // live observation is not a recovery shortcut for abandoned partial state.
    update({ phase: reservation.record.phase, child: null });
    settleNoChild(reservation, attempt);
    Object.assign(attempt, { status: "not-run", endedAt: now() });
    if (!helperInvoked || error.helperLaunched === false) {
      attempt.supervision = { ...attempt.supervision, helperLaunched: false, launchAuthorized: false,
        exitConfirmed: true, status: "not-run" };
      try { receipt?.attempt({ id, terminal: true, supervision: attempt.supervision }); }
      catch (failure) { attempt.journalError = failure.message; onJournalError(failure.message); }
    }
    return { attempt, report: null };
  }
  Object.assign(attempt, { containment: result, exit: result.exit, signal: result.signal,
    timedOut: result.timedOut === true, endedAt: now() });
  attempt.supervision = { ...attempt.supervision, ...result,
    authorizationPhase: ["may-launch", "root-started"].includes(attempt.supervision?.authorizationPhase) ? "may-launch" : "no-launch" };
  if (!result.exitConfirmed) {
    attempt.status = "unknown";
    attempt.containmentError = result.protocolError || result.coordinationError || "Owned tree exit is unconfirmed";
    onReservationError(attempt.containmentError);
    // Never clear supervision or make an exited transition on helper PID death.
    return { attempt, report: null };
  }
  try { receipt?.attempt({ id, terminal: true, supervision: attempt.supervision }); }
  catch (error) { attempt.journalError = error.message; onJournalError(error.message); }
  update({ phase: "exited", supervision: attempt.supervision, exit: result.exit, signal: result.signal });
  if (!attempt.reservationError && !attempt.journalError) {
    try { progress(); } catch (error) { attempt.journalError = error.message; onJournalError(error.message); }
  }
  let report = null;
  try { report = read(jsonFile); } catch (error) { attempt.reportError = error.message; }
  if (result.status === "timed-out") attempt.status = "timed-out";
  else if (result.status === "interrupted") attempt.status = "interrupted";
  else if (result.status === "not-run") attempt.status = "not-run";
  else {
    try {
      if (mode === "discover") attempt.status = result.exit === 0 && Array.isArray(report) && report.every(f => typeof f === "string") ? "passed" : "failed";
      else if (mode === "select") attempt.status = result.exit === 0 && report?.version === 1 && Array.isArray(report.specifications) ? "passed" : "failed";
      else if (mode === "merge") attempt.status = result.exit === 0 && report?.version === 1 && report.status === "passed" ? "passed" : "failed";
      else {
        if (result.exit === 75) {
          const selection = read(path.join(directory, "selection.json"));
          if (selection.version !== 1 || selection.requested !== file || selection.status !== "not-run"
            || !Array.isArray(selection.specifications) || selection.specifications.length) throw new Error("Unverified configured empty selection");
          attempt.status = "not-run"; attempt.configuredSelection = selection;
        } else Object.assign(attempt, verifyResult(file, result.exit, result.signal, report, fs.readFileSync(logFile, "utf8"), expectedFiles));
      }
    } catch (error) {
      Object.assign(attempt, { status: "failed", tests: 0, failures: [], skips: [],
        verificationError: error.message, problems: ["Result verification failed: " + error.message] });
    }
  }
  // Actual proof/outcome is still verified when its publication failed; known
  // complete results survive final availability faults just as #797 requires.
  publish(() => { atomic(path.join(directory, "attempt.json"), attempt); save(); });
  return { attempt, report };
}

const reportWait = value => console.log(JSON.stringify({ status: "waiting", ...value }));

// Nothing has run when the reservation cannot be taken; the error says so, so
// callers never read a refusal as a test result.
// Once taken, the run says so on its own line: the reviewer execution service
// starts a delegated run's timeout from it, not from the launch.
export const reservationAcquiredLine = JSON.stringify({ status: "acquired" });
const queue = async (run, options) => {
  const reservation = await acquireWaiting(run, { ...options, onWait: reportWait })
    .catch(error => { throw Object.assign(error, { notRun: true }); });
  console.log(reservationAcquiredLine);
  return reservation;
};

// The exit status and marker line for a failed command. 75 (EX_TEMPFAIL) and
// the marker say no test ran and the same command can be run again; the
// red/green driver reads the marker.
export function notRunExit(error, write = console.error) {
  if (!error?.notRun) { write(error?.stack ?? String(error)); return error?.exitCode === 124 ? 124 : 1; }
  write(`test-suite: not run: ${error.message}`);
  return 75;
}

export async function execute({ directory, packageRoot, retry = [], waitMs = 0, ...dependencies }) {
  directory = canonicalPath(directory);
  retry = retry.map(canonicalPath);
  packageRoot = canonicalPath(packageRoot ?? read(path.join(directory, "run.json")).packageRoot);
  let invocationEnvironment;
  try { invocationEnvironment = (dependencies.environment ?? childEnvironment)(); }
  catch(error) { throw Object.assign(error,{notRun:true}); } // no preparation or engine could launch
  const runtimeDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "impower-suite-runtime-"));
  const invocationRuntime = await (dependencies.prepareRuntime ?? prepareOwnedRuntime)({
    directory: runtimeDirectory, env: invocationEnvironment });
  if (invocationRuntime.status !== "prepared") throw Object.assign(new Error("Supervisor preparation refused; inspect " + runtimeDirectory),
    { notRun: true, preparation: invocationRuntime });
  const census = dependencies.census || vitestProcesses;
  const reservation = await queue(directory, { ...dependencies, census, waitMs, supervised: true });
  let run;
  let lastProgress = 0;
  const fingerprint = dependencies.fingerprint || fingerprinter(value => {
    if (Date.now() - lastProgress > 10000) { console.log(JSON.stringify({ run: directory, ...value })); lastProgress = Date.now(); }
  });
  let summary;
  let reservationError;
  let journalError, attemptError, failureInFlight;
  const publish = action => {
    try { return action(); }
    catch (error) { journalError ||= error.message; throw error; }
  };
  const save = () => { if (!reservationError && !journalError) publish(() => atomic(path.join(directory, "run.json"), run)); };
  const childDependencies = { ...dependencies, invocationRuntime, invocationEnvironment,
    onReservationError: error => { reservationError = error; }, onJournalError: error => { journalError = error; } };
  let childAttempted = false;
  const unpersistedAttempts = [];
  const observedAttempts = [];
  const retain = attempt => {
    childAttempted ||= attempt.status !== "not-run";
    if (attempt.status !== "not-run") observedAttempts.push({ ...attempt });
    const error = attempt.setupError || attempt.logCleanupError || attempt.journalError || attempt.reservationError || attempt.containmentError;
    if (!error) return false;
    attemptError = error;
    reservationError ||= attempt.reservationError;
    // These observed results are for this invocation only, never reusable
    // durable evidence. After uncertainty, a token read followed by rename
    // would not establish ownership of any shared journal.
    if (attempt.reservationError || attempt.journalError || attempt.containmentError) unpersistedAttempts.push({ ...attempt });
    console.error(JSON.stringify({ attemptError: attempt }));
    if (!childAttempted) throw Object.assign(new Error(error), { notRun: true, attempt, unpersistedAttempts });
    return true;
  };
  let semanticRefusal;
  const refuseStale = message => {
    // The inputs are already known to be unusable, even if publishing that
    // fact fails. A journal error cannot turn this refusal into an admission retry.
    semanticRefusal = new Error(message);
    run.stale = true;
    try { save(); }
    catch (error) {
      semanticRefusal.journalError = error.message;
      semanticRefusal.message += `; Journal publication failed: ${error.message}`;
    }
    throw semanticRefusal;
  };
  const finish = () => {
    summary = aggregate(run);
    if (!reservationError && !journalError && !attemptError) {
      try { publish(() => atomic(path.join(directory, "summary.json"), summary)); }
      catch { /* The original outcome remains returned beside journalError. */ }
    }
    if (reservationError || journalError || attemptError) {
      if (!run.identity && summary.status !== "timed-out" && summary.status !== "unknown") summary.status = "incomplete";
      Object.assign(summary, { reservationError, journalError, attemptError, unpersistedAttempts,
        observedAttempt: run.attempts.at(-1), observedAttempts });
    }
    return summary;
  };
  try {
    if (fs.existsSync(path.join(directory, "run.json"))) {
      run = read(path.join(directory, "run.json"));
      validateRun(run, directory);
      loadEvidence(run, dependencies.identify);
      if (run.stale) refuseStale("Source/configuration/dependency identity changed; start a new run (old attempts preserved)");
      if (!run.identity || !run.manifestHash) refuseStale("Discovery did not establish a reusable manifest/identity; start a new run (old discovery proof preserved)");
      if (run.version === 2 && run.attempts.some(attempt => attempt.status === "unknown")) {
        semanticRefusal = new Error("Owned attempt proof/outcome is unknown; preserve this run and inspect its attempt evidence");
        throw semanticRefusal;
      }
      if (run.stale || run.manifestHash !== manifestHash(run.files) || run.identity !== fingerprint(run.root, [])) {
        refuseStale("Source/configuration/dependency identity changed; start a new run (old attempts preserved)");
      }
      // Acquisition reconciled both the previous coordinator and its child.
      for (const attempt of run.attempts) if (!["passed", "failed", "timed-out", "not-run", "interrupted"].includes(attempt.status)) {
        attempt.status = "interrupted";
        attempt.reconciledAt = now();
        publish(() => atomic(path.join(attempt.directory, "attempt.json"), attempt));
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
      run = { version: 2, directory, root, packageRoot, owner: reservation.record.owner, token: reservation.record.token, active: true, createdAt: now(), files: [], attempts: [] };
      save();
      const beforeDiscovery = fingerprint(root, []);
      const { attempt, report } = await childRun(run, "discover", null, reservation, save, childDependencies);
      if (retain(attempt)) return finish();
      if (attempt.status !== "passed") throw Object.assign(new Error(`Discovery ${attempt.status}; start a new run and inspect ${attempt.directory}`),
        { exitCode: attempt.status === "timed-out" ? 124 : 1, attempt });
      const trackedFiles = new Set(tracked(root).map(f => canonicalPath(path.resolve(root, f))));
      run.files = [...new Set(report.map(canonicalPath).filter(f => trackedFiles.has(f)))].sort();
      if (!run.files.length) throw new Error("Empty tracked test manifest; stage test files first");
      if (run.files.some(f => !/\.(test|spec)\.(ts|tsx)$/.test(f))) throw new Error("This runner supports tracked test/spec TS and TSX files");
      save();
      run.manifestHash = manifestHash(run.files);
      run.identity = fingerprint(root, []);
      if (run.identity !== beforeDiscovery) refuseStale("Inputs changed during discovery; start a new run");
      save();
    }
    for (const file of retry) {
      if (!run.files.includes(file) || !["failed", "timed-out"].includes(run.attempts.filter(a => a.file === file).at(-1)?.status)) throw new Error(`Retry must select a failed or timed-out manifest file: ${file}`);
    }
    for (const file of run.files) {
      const previous = run.attempts.filter(a => a.file === file).at(-1);
      if (previous && (previous.status === "passed" || ["failed", "timed-out"].includes(previous.status) && !retry.includes(file))) continue;
      if (fingerprint(run.root, []) !== run.identity) refuseStale("Inputs changed during suite; start a new run");
      await waitForCensus({ deadline: Date.now() + waitMs, pollMs: dependencies.pollMs, census, onWait: reportWait });
      const { attempt } = await childRun(run, "run", file, reservation, save, childDependencies);
      if (retain(attempt)) return finish();
      if (["unknown", "timed-out", "interrupted"].includes(attempt.status)) return finish();
    }
    if (fingerprint(run.root, []) !== run.identity) {
      run.stale = true;
      try { save(); }
      catch { /* finish retains the known stale summary beside journalError. */ }
    }
    return finish();
  } catch (error) {
    // Coordinator publication can fail between children or after aggregation.
    // Stop admission and retain every result this invocation already observed.
    if (journalError && childAttempted && !semanticRefusal) return finish();
    failureInFlight = error;
    Object.assign(error, { observedAttempts, unpersistedAttempts });
    if (!semanticRefusal && !childAttempted && (journalError || error.code)) error.notRun = true;
    throw error;
  } finally {
    // Persist while still owning the reservation: a successor may acquire it
    // immediately after release and must never be overwritten by this owner.
    try {
      if (!reservationError && !journalError && run?.token === reservation.record.token) { run.active = false; save(); }
    } catch (error) {
      if (summary) Object.assign(summary, { journalError: error.message, observedAttempts,
        observedAttempt: run.attempts.at(-1), unpersistedAttempts });
      if (failureInFlight) failureInFlight.journalError = error.message;
      console.error(`Final journal save failed before release: ${error.message}`);
    }
    // A failed release never replaces the summary or the error already in
    // flight. summary.json is already written, and after the release attempt
    // this owner writes nothing more, so the failure goes on the returned summary only.
    try { reservation.release(); }
    catch (error) {
      if (summary) summary.releaseError = error.message;
      if (failureInFlight) failureInFlight.releaseError = error.message;
      console.error(`Reservation not released; the next acquirer recovers it: ${error.message}`);
    }
  }
}

// A direct Vitest run under the machine-wide reservation, so single-file runs
// and suites queue behind each other instead of racing.
export async function runVitest({ packageRoot, files = [], waitMs = 0, stdio = "inherit", ...dependencies }) {
  packageRoot = canonicalPath(packageRoot);
  files = [...new Set(files.map(file => canonicalPath(path.resolve(packageRoot, file))))];
  const vitestVersion = JSON.parse(fs.readFileSync(createRequire(path.join(packageRoot, "package.json"))
    .resolve("vitest/package.json"), "utf8")).version;
  if (vitestVersion !== "2.1.9") throw new Error("Exact specification aggregation requires Vitest 2.1.9");
  const invocationEnvironment = (dependencies.environment ?? childEnvironment)();
  const receipt = dependencies.receiptPath ? openReceipt(dependencies.receiptPath,
    { packageRoot, files, waitMs, fileTimeoutMs: dependencies.fileTimeoutMs ?? 1800000 }) : undefined;
  const directory = canonicalPath(fs.mkdtempSync(path.join(os.tmpdir(), "impower-suite-direct-")));
  const runtimeDirectory = path.join(directory, "runtime");
  fs.mkdirSync(runtimeDirectory);
  const invocationRuntime = await (dependencies.prepareRuntime ?? prepareOwnedRuntime)({ directory: runtimeDirectory, env: invocationEnvironment,
    onLifecycle: value => receipt?.preparation(value) });
  receipt?.runtime(invocationRuntime);
  if (invocationRuntime.status !== "prepared") throw Object.assign(new Error("Supervisor preparation refused; inspect " + runtimeDirectory),
    { notRun: true, preparation: invocationRuntime });
  const census = dependencies.census || vitestProcesses;
  const reservation = await queue(directory, { ...dependencies, census, waitMs, supervised: true });
  try { receipt?.reserved(reservation.record); }
  catch (error) { releaseKeeping(reservation, error); throw Object.assign(error, { notRun: true }); }
  const run = { version: 2, directory, root: packageRoot, packageRoot, files, attempts: [],
    token: reservation.record.token, owner: reservation.record.owner, createdAt: now(), active: true };
  let reservationError, journalError, result;
  const save = () => {
    if (reservationError || journalError) return;
    try { atomic(path.join(directory, "run.json"), run); }
    catch (error) { journalError = error.message; throw error; }
  };
  const childDependencies = { ...dependencies, invocationRuntime, invocationEnvironment, receipt,
    onReservationError: error => { reservationError ||= error; }, onJournalError: error => { journalError ||= error; } };
  const stopped = attempt => !!(reservationError || journalError || attempt.setupError
    || ["unknown", "timed-out", "interrupted"].includes(attempt.status));
  const attempt = async (mode, file, extra = {}) => {
    const value = await childRun(run, mode, file, reservation, save, { ...childDependencies, ...extra });
    if (stdio === "inherit") {
      try { process.stdout.write(fs.readFileSync(path.join(value.attempt.directory, "output.log"), "utf8")); }
      catch (error) { value.attempt.outputError = error.message; }
    }
    return value;
  };
  const finish = (complete = false) => {
    const summary = aggregate(run);
    const unknown = run.attempts.some(value => value.status === "unknown");
    const timedOut = run.attempts.some(value => value.status === "timed-out");
    const failed = run.attempts.some(value => value.status === "failed");
    const whollyNotRun = run.selection && !run.selection.specifications.some(spec => files.includes(spec.file));
    const definiteNoEngine = run.attempts.length > 0 && run.attempts.every(value => value.status === "not-run"
      && (value.engineAdmissionRefused === true || value.containment?.exitConfirmed === true && value.containment.root === null
        || value.supervision?.helperLaunched===false && value.supervision.launchAuthorized===false
          && value.supervision.exitConfirmed===true && value.supervision.status==="not-run"));
    result = { exit: unknown ? 1 : timedOut ? 124 : whollyNotRun || definiteNoEngine ? 75 : !complete || failed || summary.status !== "passed" ? 1 : 0,
      signal: null, directory, ...summary, reservationError, journalError, observedAttempts: run.attempts };
    // A terminal timeout stops later execution by design. Preserve it when
    // every requested file already has a confirmed outcome; a publication
    // fault that prevents still-requested files remains an incomplete failure.
    if ((reservationError || journalError) && !complete && !timedOut && !definiteNoEngine) result.exit = 1;
    try { receipt?.finished({ exit: result.exit, status: result.status, complete }); }
    catch (error) { result.receiptError = error.message; }
    return result;
  };
  try {
    save();
    const selected = await attempt("select", null);
    if (selected.attempt.status !== "passed" || stopped(selected.attempt)) return finish();
    run.selection = selected.report;
    save();
    const blobs = [];
    for (const file of files) {
      const specifications = selected.report.specifications.filter(spec => spec.file === file);
      if (!specifications.length) {
        run.attempts.push({ id: randomUUID(), file, mode: "configured-selection", status: "not-run",
          endedAt: now(), selectionAttempt: selected.attempt.id, specifications: [] });
        save();
        continue;
      }
      await waitForCensus({ deadline: Date.now() + waitMs, pollMs: dependencies.pollMs, census, onWait: reportWait });
      const value = await attempt("run-direct", file, { expectedFiles: specifications.length });
      if (stopped(value.attempt)) return finish();
      const actualSelection = read(path.join(value.attempt.directory, "selection.json"));
      if (JSON.stringify(actualSelection.specifications) !== JSON.stringify(specifications))
        throw new Error("Configured specification identity changed during invocation");
      const blob = fs.readFileSync(path.join(value.attempt.directory, "blob.json"));
      blobs.push({ name: value.attempt.id + ".json", sha256: createHash("sha256").update(blob).digest("hex"),
        specifications, bytes: blob });
    }
    if (!blobs.length) return finish(true);
    const blobDirectory = path.join(directory, "blobs");
    fs.mkdirSync(blobDirectory);
    for (const blob of blobs) fs.writeFileSync(path.join(blobDirectory, blob.name), blob.bytes, { flag: "wx" });
    const request = { version: 1, invocation: reservation.record.token, packageRoot, vitestVersion,
      directory: canonicalPath(blobDirectory), failed: run.attempts.some(value => value.status === "failed"),
      blobs: blobs.map(({ bytes, ...binding }) => binding) };
    const requestFile = path.join(directory, "aggregate-request.json"), bytes = JSON.stringify(request);
    fs.writeFileSync(requestFile, bytes, { flag: "wx" });
    const final = await attempt("merge", requestFile, { engineArguments: [createHash("sha256").update(bytes).digest("hex")] });
    // Admission latches and terminal evidence answer different questions. No
    // successor is permitted after a fault, but this is the final unit already.
    return finish(final.attempt.containment?.exitConfirmed === true
      && ["passed", "failed"].includes(final.attempt.status));
  } catch (error) {
    if (!run.attempts.length) throw Object.assign(error, { notRun: true });
    console.error(error.stack ?? String(error));
    result = finish(); result.coordinationError = error.message;
    return result;
  } finally {
    // A publication fault never erases independently verified complete results.
    // It also never authorizes further attempts or writes into a peer's journal.
    try { if (!reservationError && !journalError) { run.active = false; save(); } }
    catch (error) { if (result) result.journalError = error.message; }
    try { reservation.release(); }
    catch (error) { if (result) result.releaseError = error.message; console.error("Reservation not released: " + error.message); }
  }
}

const waitOption = args => {
  const index = args.indexOf("--wait");
  if (index < 0) return { args, waitMs: 0 };
  const seconds = Number(args[index + 1]);
  if (!Number.isFinite(seconds) || seconds < 0) throw new Error("--wait takes a number of seconds");
  return { args: [...args.slice(0, index), ...args.slice(index + 2)], waitMs: seconds * 1000 };
};

const fileTimeoutOption = args => {
  const index = args.indexOf("--file-timeout");
  if (index < 0) return { args, fileTimeoutMs: 1800000 };
  const value = args[index + 1], seconds = Number(value);
  if (!/^\d+$/.test(value ?? "") || !Number.isSafeInteger(seconds) || seconds < 1 || seconds > 7200
    || args.indexOf("--file-timeout", index + 1) >= 0) throw new Error("--file-timeout takes an integer from 1 to 7200 seconds");
  return { args: [...args.slice(0, index), ...args.slice(index + 2)], fileTimeoutMs: seconds * 1000 };
};
const receiptOption = args => {
  const index = args.indexOf("--internal-receipt");
  if (index < 0) return { args };
  const receiptPath = args[index + 1];
  if (!receiptPath || !path.isAbsolute(receiptPath) || args.indexOf("--internal-receipt", index + 1) >= 0)
    throw new Error("Invalid caller-authored supervision descriptor option");
  return { args: [...args.slice(0, index), ...args.slice(index + 2)], receiptPath };
};

export function status(directory, { identify = processIdentity, fingerprint = fingerprinter() } = {}) {
  directory = canonicalPath(directory);
  const run = read(path.join(directory, "run.json"));
  validateRun(run, directory);
  loadEvidence(run, identify);
  for (const attempt of run.attempts) {
    if (!["passed", "failed", "timed-out", "not-run", "interrupted"].includes(attempt.status)) {
      try { if(run.version===2&&attempt.supervision)assertAttemptBinding(attempt.supervision,attempt);
        attempt.status = reservationState({ version: run.version, run:run.directory, attempt:attempt.id, token: attempt.supervision?.reservationToken,
        supervision: attempt.supervision, owner: attempt.owner, child: attempt.child, phase: attempt.child ? "running" : "launching" }, identify); }
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
  else if (!run.identity && !["timed-out", "stale"].includes(summary.status) && !summary.unitFailures.length) summary.status = "interrupted";
  return { run: run.directory, ...summary, identityChecked: !live && !unknown && !!run.identity, attempts: run.attempts };
}

// The most test files one local `run` may name. A change under work touches
// a handful of test files; a longer list is a package run spelled out, which
// the Test Suite workflow already runs for the pushed head while this machine
// is shared with other sessions. There is no override; a wrapper script or a
// `--test` string handed to the redgreen driver reaches this check even when
// the local-test hook, which reads only literal command text, does not see
// it. The hook's copy of this bound (.agents/hooks/local-test-hook.mjs) must
// match so direct Vitest calls are refused at the same width.
export const MAX_RUN_FILES = 8;

export function directTerminalSummary(direct, fileTimeoutMs) {
  return { status: direct.exit === 75 ? "not-run" : direct.status, exit: direct.exit, fileTimeoutMs,
    expected: direct.expected, completed: direct.completed, unfinished: direct.unfinished, notRun: direct.notRun,
    timedOut: direct.unitTimeouts, unitFailures: direct.unitFailures, evidence: direct.directory,
    attemptDiagnostics: (direct.observedAttempts ?? []).flatMap(attempt => {
      const diagnostics = Object.fromEntries(["containmentError", "setupError", "verificationError", "reportError", "outputError"]
        .filter(key => attempt[key]).map(key => [key, attempt[key]]));
      return Object.keys(diagnostics).length ? [{ id: attempt.id, mode: attempt.mode, file: attempt.file,
        status: attempt.status, evidence: attempt.directory, ...diagnostics }] : [];
    }),
    diagnostics: Object.fromEntries(["reservationError", "journalError", "releaseError", "receiptError", "coordinationError"]
      .filter(key => direct[key]).map(key => [key, direct[key]])) };
}

// Validate the whole request before dependency lookup or queue admission.
function validateTestFiles(packageRoot, files) {
  for (const requested of files) {
    const escaped = JSON.stringify(requested)?.replace(/[\u007f-\u009f\u2028\u2029]/g, value => `\\u${value.charCodeAt(0).toString(16).padStart(4, "0")}`);
    const refusal = () => new Error(`Invalid test file ${escaped}: name an existing literal test/spec TS or TSX file within ${JSON.stringify(packageRoot)}`);
    if (process.platform === "win32" && typeof requested === "string"
      && requested.startsWith(path.toNamespacedPath("C:/").slice(0, 4))) {
      throw new Error(`Invalid test file ${escaped}: unsupported Windows namespace syntax for Vitest file filters; use an ordinary relative or absolute path`);
    }
    if (typeof requested !== "string" || /[\x00-\x1f\u007f-\u009f\u2028\u2029*?]/.test(requested)
      || requested.startsWith("-") || !/\.(test|spec)\.(ts|tsx)$/.test(requested)) throw refusal();
    const resolved = path.resolve(packageRoot, requested);
    try {
      if (!fs.statSync(resolved).isFile() || !isWithinDirectory(packageRoot, canonicalPath(resolved))) throw refusal();
    } catch { throw refusal(); }
  }
}

// Refuse mistaken workspace names before dependency lookup or queue admission.
function packageDirectory(target) {
  const directory = path.resolve(target);
  try {
    if (fs.statSync(directory).isDirectory() && fs.statSync(path.join(directory, "package.json")).isFile()) {
      return canonicalPath(directory);
    }
  } catch (error) {
    if (!["ENOENT", "ENOTDIR"].includes(error.code)) {
      throw new Error(`Cannot inspect package directory ${directory}: ${error.message}`);
    }
  }
  throw new Error(`Expected a package directory containing a package.json file: ${directory}. Use the package's directory, such as packages/sparkdown, rather than its workspace name.`);
}

// The command line. `dependencies` is the test seam for the reservation store,
// census and child programs; the entry point below passes none.
export async function main(argv, dependencies = {}) {
  const [command, target, ...rest] = argv;
  const waited = waitOption(rest);
  const budget = fileTimeoutOption(waited.args), { args, receiptPath } = receiptOption(budget.args);
  const { fileTimeoutMs } = budget, { waitMs } = waited;
  if (receiptPath && command !== "run") throw new Error("Caller-authored receipt requires an exact named-file run");
  let result;
  if (command === "run" && target) {
    // Local runs name the files under work; the Test Suite workflow gives the
    // package result. `start` remains for resumable runs, but the local-test
    // hook refuses it.
    if (!args.length) throw new Error("Name the test files under work; the package result comes from the Test Suite workflow on the pushed head");
    if (args.length > MAX_RUN_FILES) throw new Error(`run takes at most ${MAX_RUN_FILES} test files (${args.length} named): a longer list is a package run, which the Test Suite workflow runs for the pushed head; run only the test files under work locally`);
    const packageRoot = packageDirectory(target);
    validateTestFiles(packageRoot, args);
    const direct = await runVitest({ ...dependencies, packageRoot, files: args, waitMs, fileTimeoutMs, receiptPath });
    const { exit, signal, launchError } = direct;
    console.log(JSON.stringify(directTerminalSummary(direct, fileTimeoutMs)));
    if (launchError) throw new Error(launchError);
    if (signal) console.error(`Vitest ended by signal ${signal}`);
    return exit ?? 1;
  } else if (command === "start" && target && !args.length) {
    const packageRoot = packageDirectory(target);
    const gitDir = canonicalPath(path.resolve(packageRoot, git(packageRoot, ["rev-parse", "--git-dir"]).trim()));
    const directory = path.join(gitDir, "test-suites", randomUUID());
    console.log(JSON.stringify({ run: directory, status: "starting", coordinator: processIdentity(process.pid) }));
    result = await execute({ ...dependencies, directory, packageRoot, waitMs, fileTimeoutMs });
  } else if (command === "resume" && target) {
    if (args.length && args[0] !== "--retry") throw new Error("Use --retry followed by explicit failed paths");
    const run = read(path.join(target, "run.json"));
    result = await execute({ ...dependencies, directory: target, waitMs, fileTimeoutMs, retry: args.slice(1).map(f => path.resolve(run.packageRoot, f)) });
  } else if (command === "status" && target && !args.length) result = status(target);
  else throw new Error("Usage: node scripts/test-suite.mjs run <package-dir> <test-file> [<test-file> ...] [--wait <seconds>] [--file-timeout <seconds>] | start <package-dir> [--wait <seconds>] [--file-timeout <seconds>] | status <run-directory> | resume <run-directory> [--retry <failed-file> ...] [--wait <seconds>] [--file-timeout <seconds>]; <package-dir> is a directory such as packages/sparkdown");
  console.log(JSON.stringify(result, null, 2));
  if (result.status === "unknown" || result.status === "stale") return 1;
  if (result.unitTimeouts?.length) return 124;
  if ((result.reservationError || result.journalError) && result.unfinished?.length) return 1;
  return result.status === "passed" ? 0 : 1;
}

if (process.argv[1] && canonicalPath(process.argv[1]) === canonicalPath(fileURLToPath(import.meta.url))) {
  try { process.exitCode = await main(process.argv.slice(2)); }
  catch (error) { process.exitCode = notRunExit(error); }
}
