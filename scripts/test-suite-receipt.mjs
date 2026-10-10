// A caller chooses these paths before launching a coordinator. Neither test
// output nor a delegated reviewer operation can nominate recovery evidence.
import fs from "node:fs";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { atomic, processIdentity, same } from "./test-suite-process.mjs";
import { readTreeProof, assertAttemptBinding } from "./test-suite-child.mjs";

const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const canonical = file => fs.realpathSync.native(file);
const ordinary = file => {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Receipt artifact is not an ordinary file: " + file);
};
const binding = file => { ordinary(file); return { file: canonical(file), sha256: digest(fs.readFileSync(file)) }; };
const checkBinding = expected => {
  const actual = binding(expected.file);
  if (actual.file !== expected.file || actual.sha256 !== expected.sha256) throw new Error("Caller-authored receipt binding changed");
};
const headAt = root => execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", windowsHide: true }).trim();

export function createReceiptDescriptor({ directory, operation, head, runnerRoot, packageRoot, files,
  waitMs, fileTimeoutMs = 1800000, outerTimeoutMs }) {
  directory = canonical(directory); runnerRoot = canonical(runnerRoot); packageRoot = canonical(packageRoot);
  const value = { version: 1, directory, operation, head, runnerRoot, packageRoot,
    files: [...new Set(files.map(file => canonical(path.resolve(packageRoot, file))))], waitMs, fileTimeoutMs, outerTimeoutMs,
    nonce: randomUUID(), receiptFile: path.join(directory, "receipt.json"),
    runner: binding(path.join(runnerRoot, "scripts", "test-suite.mjs")) };
  const file = path.join(directory, "descriptor.json");
  fs.writeFileSync(file, JSON.stringify(value), { flag: "wx" });
  return { file, descriptor: value, binding: binding(file) };
}

function descriptorAt(file) {
  ordinary(file);
  const bytes = fs.readFileSync(file), value = JSON.parse(bytes);
  if (value.version !== 1 || canonical(value.directory) !== value.directory
    || canonical(file) !== path.join(value.directory, "descriptor.json")
    || value.receiptFile !== path.join(value.directory, "receipt.json")
    || !/^[a-f0-9-]{36}$/.test(value.nonce ?? "") || !Array.isArray(value.files) || !value.files.length
    || value.files.some(file => typeof file !== "string" || !path.isAbsolute(file))
    || !Number.isFinite(value.waitMs) || value.waitMs < 0
    || !Number.isSafeInteger(value.fileTimeoutMs) || value.fileTimeoutMs < 1000 || value.fileTimeoutMs > 7200000
    || !Number.isFinite(value.outerTimeoutMs) || value.outerTimeoutMs <= 0)
    throw new Error("Invalid caller-authored supervision descriptor");
  checkBinding(value.runner);
  if (headAt(value.runnerRoot) !== value.head) throw new Error("Authored execution head changed");
  return { value, sha256: digest(bytes) };
}

export function openReceipt(file, { packageRoot, files, waitMs, fileTimeoutMs }) {
  const { value: descriptor, sha256 } = descriptorAt(file);
  const requested = [...new Set(files.map(file => canonical(path.resolve(packageRoot, file))))];
  if (canonical(packageRoot) !== descriptor.packageRoot || waitMs !== descriptor.waitMs
    || fileTimeoutMs !== descriptor.fileTimeoutMs || JSON.stringify(requested) !== JSON.stringify(descriptor.files))
    throw new Error("Supervision descriptor does not match the actual invocation");
  const record = { version: 1, descriptorHash: sha256, nonce: descriptor.nonce, phase: "preparing",
    coordinator: processIdentity(process.pid), preparation: [], attempts: [], createdAt: new Date().toISOString() };
  // Exclusive admission: no replay into an existing authored receipt.
  fs.writeFileSync(descriptor.receiptFile, JSON.stringify(record), { flag: "wx" });
  const save = () => atomic(descriptor.receiptFile, record);
  return { descriptor, record, save,
    preflightRefused(reason) {
      if (record.phase !== "preparing" || record.preparation.length || record.attempts.length
        || Object.hasOwn(record,"runtime") || Object.hasOwn(record,"reservationToken") || typeof reason !== "string" || !reason)
        throw new Error("Preflight refusal cannot erase a possible launch");
      record.phase = "preflight-refused";
      record.preflight = { launchPossible: false, reason };
      record.outcome = { exit: 75, status: "not-run", complete: false };
      save();
    },
    preparation(value) {
      const previous = record.preparation.findLast(row => row.kind === value.kind);
      if (value.phase === "launch-may-start") record.preparation.push({ ...value });
      else if (previous) Object.assign(previous, value);
      else throw new Error("Preparation receipt has no authored launch phase");
      save();
    },
    runtime(value) { record.runtime = value; record.phase = value.status === "prepared" ? "waiting" : "preparation-refused"; save(); },
    reserved(value) { record.reservationToken = value.token; record.phase = "reserved"; save(); },
    attempt(value) {
      const previous = record.attempts.find(row => row.id === value.id);
      if (previous) Object.assign(previous, value); else record.attempts.push({ ...value });
      record.phase = "attempt"; save();
    },
    finished(value) { record.outcome = value; record.phase = "complete"; save(); },
  };
}

export function readReceiptDisposition(authored, { identify = processIdentity, coordinator } = {}) {
  try {
    checkBinding(authored.binding);
    const { value: descriptor, sha256 } = descriptorAt(authored.file);
    if (JSON.stringify(descriptor) !== JSON.stringify(authored.descriptor)) throw new Error("Authored descriptor content changed");
    ordinary(descriptor.receiptFile);
    if (canonical(descriptor.receiptFile) !== descriptor.receiptFile) throw new Error("Receipt physical root changed");
    const record = JSON.parse(fs.readFileSync(descriptor.receiptFile, "utf8"));
    if (record.version !== 1 || record.descriptorHash !== sha256 || record.nonce !== descriptor.nonce
      || !record.coordinator?.pid || !record.coordinator.start || !Array.isArray(record.preparation) || !Array.isArray(record.attempts))
      throw new Error("Receipt binding or lifecycle is incomplete");
    if (!same(record.coordinator, coordinator)) throw new Error("Receipt coordinator does not match the caller's original identity");
    const absent = expected => {
      if (!expected?.pid || !expected.start) throw new Error("Receipt process identity is missing");
      const actual = identify(expected.pid);
      if (actual !== null && (!actual?.pid || !actual.start)) throw new Error("Receipt process identity is unknown");
      if (same(expected, actual)) throw new Error("An original owned process remains live");
    };
    absent(record.coordinator);
    if (record.phase === "preflight-refused") {
      if (record.preparation.length || record.attempts.length || Object.hasOwn(record,"runtime") || Object.hasOwn(record,"reservationToken")
        || record.preflight?.launchPossible !== false || typeof record.preflight.reason !== "string" || !record.preflight.reason
        || record.outcome?.exit !== 75 || record.outcome.status !== "not-run" || record.outcome.complete !== false)
        throw new Error("Preflight refusal contains partial or possible-launch state");
      return { confirmed: true, record };
    }
    for (const row of record.preparation) {
      if (row.phase !== "closed" || !row.close || !Number.isInteger(row.close.exit) || row.close.signal)
        throw new Error("Preparation launch/exit interval is unresolved");
      absent(row.process);
    }
    if (record.phase === "preparation-refused") {
      const runtime = record.runtime, row = record.preparation[0];
      if (record.preparation.length !== 1 || record.attempts.length || Object.hasOwn(record,"reservationToken")
        || Object.hasOwn(record,"outcome") || runtime?.version !== 1 || runtime.platform !== "linux"
        || runtime.status !== "not-run" || runtime.exitConfirmed !== true || runtime.launchAuthorized !== false
        || runtime.exit !== null || runtime.signal !== null || runtime.preparationTimedOut !== false
        || Object.hasOwn(runtime,"preparationPublicationError") || Object.hasOwn(runtime,"preparationDisposalErrors")
        || row.kind !== "linux-capability" || row.directory !== runtime.directory || row.invocationId !== runtime.invocationId
        || row.timedOut !== false || !same(row.process,runtime.preparationProcess)
        || JSON.stringify(row.close) !== JSON.stringify(runtime.preparationClose) || row.close.exit <= 0)
        throw new Error("Preparation refusal lacks confirmed Linux no-engine evidence");
      if (canonical(runtime.directory) !== runtime.directory) throw new Error("Refused runtime root changed");
      try {
        fs.lstatSync(path.join(runtime.directory,"runtime.json"));
        throw new Error("Preparation refusal contains admitted runtime state");
      } catch (error) { if (error.code !== "ENOENT") throw error; }
      const readArtifact = name => {
        const file = path.join(runtime.directory,name); ordinary(file);
        if (canonical(file) !== file) throw new Error("Preparation refusal artifact root changed");
        return JSON.parse(fs.readFileSync(file,"utf8"));
      };
      const request = readArtifact("preparation-request.json"), result = readArtifact("preparation-result.json");
      const requestKeys = ["version","status","directory","invocationId","platform","startupMs","cleanupMs","environmentDigest","executable","helper","bindings"];
      const resultKeys = ["preparationProcess","preparationClose","preparationTimedOut","launchError","diagnostics","output"];
      const runtimeKeys = new Set([...requestKeys,...resultKeys,"exit","signal","exitConfirmed","launchAuthorized"]);
      if (Object.keys(runtime).some(key => !runtimeKeys.has(key))
        || Object.keys(request).length !== requestKeys.length || requestKeys.some(key => !Object.hasOwn(request,key))
        || Object.keys(result).length !== resultKeys.length || resultKeys.some(key => !Object.hasOwn(result,key))
        || request.status !== "prepared" || request.executable !== "python3" || request.platform !== "linux"
        || Object.keys(request).some(key => JSON.stringify(key === "status" ? "prepared" : runtime[key]) !== JSON.stringify(request[key]))
        || !Array.isArray(request.bindings) || !request.bindings.length
        || !request.bindings.some(expected => expected.file === runtime.helper)
        || Object.keys(result).some(key => JSON.stringify(runtime[key]) !== JSON.stringify(result[key]))
        || !same(result.preparationProcess,row.process) || JSON.stringify(result.preparationClose) !== JSON.stringify(row.close)
        || result.preparationTimedOut !== false || typeof result.diagnostics !== "string"
        || typeof result.output !== "string" || typeof result.launchError !== "string")
        throw new Error("Preparation refusal metadata changed or is incomplete");
      const events = result.output.trim().split("\n").map(line => JSON.parse(line));
      if (events.length !== 1 || events[0].event !== "unknown" || typeof events[0].reason !== "string" || !events[0].reason)
        throw new Error("Linux capability refusal was not observed before acknowledgement");
      for (const expected of request.bindings) checkBinding(expected);
      // Linux --check cannot fork an engine. This accepts only its authenticated
      // nonzero close, not status alone, interrupted preparation or compilation.
      return { confirmed: true, record };
    }
    if (!record.runtime || record.runtime.status !== "prepared") throw new Error("Preparation admission remains unresolved");
    if (canonical(record.runtime.directory) !== record.runtime.directory) throw new Error("Prepared runtime root changed");
    const runtimeFile = path.join(record.runtime.directory, "runtime.json");
    ordinary(runtimeFile);
    if (JSON.stringify(JSON.parse(fs.readFileSync(runtimeFile, "utf8"))) !== JSON.stringify(record.runtime)) throw new Error("Prepared runtime metadata changed");
    for (const expected of record.runtime.bindings) checkBinding(expected);
    for (const attempt of record.attempts) {
      const expected = attempt.supervision;
      if(typeof attempt.directory!=="string"||!path.isAbsolute(attempt.directory))throw new Error("Receipt attempt directory is missing");
      if(expected?.attemptId!==undefined||expected?.directory!==undefined)assertAttemptBinding(expected,attempt);
      if (attempt.terminal === true && expected?.helperLaunched === false && expected.launchAuthorized === false
        && expected.exitConfirmed === true && expected.status === "not-run") continue;
      if (!expected || expected.reservationToken !== record.reservationToken) throw new Error("Attempt authorization is unresolved");
      assertAttemptBinding(expected,attempt);
      readTreeProof(expected, { identify, close: expected.launcherClose });
    }
    if (!record.attempts.length && !["waiting", "reserved", "complete"].includes(record.phase))
      throw new Error("No confirmed admission or terminal refusal exists");
    return { confirmed: true, record };
  } catch (error) { return { confirmed: false, error: error.message }; }
}

export async function awaitReceiptDisposition(authored, { timeoutMs = 12000, ...options } = {}) {
  const deadline = performance.now() + timeoutMs;
  for (;;) {
    const result = readReceiptDisposition(authored, options);
    if (result.confirmed || performance.now() >= deadline) return result;
    await new Promise(resolve => setTimeout(resolve, Math.min(1000, Math.max(0, deadline - performance.now()))));
  }
}

// Durable CI fixtures already author a fresh Git state directory. Validate its
// retained attempt proofs directly; direct-journal status is not a public API.
export function readDurableDisposition(directory, { packageRoot, coordinator, identify = processIdentity, priorAttempts = [] }) {
  try {
    directory = canonical(directory); packageRoot = canonical(packageRoot);
    const run = JSON.parse(fs.readFileSync(path.join(directory, "run.json"), "utf8"));
    if (run.version !== 2 || run.directory !== directory || run.packageRoot !== packageRoot
      || !same(run.owner, coordinator) || !Array.isArray(run.attempts) || !run.attempts.length)
      throw new Error("Durable fixture ownership does not match the authored invocation");
    const actual = identify(coordinator.pid);
    if (actual !== null && (!actual?.pid || !actual.start) || same(actual, coordinator)) throw new Error("Durable coordinator exit is unconfirmed");
    for (const attempt of run.attempts) {
      if (attempt.directory !== path.join(directory, attempt.id) || canonical(attempt.directory) !== attempt.directory
        || !attempt.supervision) throw new Error("Durable attempt binding changed");
      assertAttemptBinding(attempt.supervision,attempt);
      if(same(attempt.owner,coordinator)) {
        if(attempt.supervision.reservationToken!==run.token)throw new Error("Current durable authorization token changed");
      } else {
        const prior=priorAttempts.find(row=>row.id===attempt.id);
        if(!prior||["directory","mode","file"].some(key=>prior[key]!==attempt[key])
          ||!same(prior.owner,attempt.owner)||JSON.stringify(prior.supervision)!==JSON.stringify(attempt.supervision))
          throw new Error("Previous durable attempt lacks independently retained binding");
      }
      readTreeProof(attempt.supervision, { identify, close: attempt.supervision.launcherClose });
    }
    return { confirmed: true, run };
  } catch (error) { return { confirmed: false, error: error.message }; }
}
