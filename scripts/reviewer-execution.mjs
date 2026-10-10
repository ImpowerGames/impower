// Coordinator-owned execution of a finite, caller-authored operation list.
// Tests/benchmarks accept IDs only; editor IDs accept bounded UI data, never
// coordinator code, paths, flags or environment supplied by the reviewer.
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { processIdentity } from "./reviewer-slots.mjs";
import { createEditorSession, editorImages, editorRequestBytes, validateEditorRequest, executionPassed } from "./reviewer-editor.mjs";
import { createReceiptDescriptor, awaitReceiptDisposition } from "./test-suite-receipt.mjs";

const git = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true }).trim();
const inside = (root, file) => { const relative = path.relative(root, file); return relative && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative); };
const integer = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;

export function executionClientCommand(root, { platform = process.platform, node = process.execPath } = {}) {
  if (platform === "win32") {
    const script = path.join(root, "scripts/reviewer-execution-client.ps1");
    return `powershell.exe -NoProfile -NonInteractive -File '${script.replaceAll("'", "''")}'`;
  }
  const quote = value => "'" + value.replaceAll("'", "'\"'\"'") + "'";
  return `${quote(fs.realpathSync.native(node))} ${quote(path.join(root, "scripts/reviewer-execution-client.mjs"))}`;
}

export function validateExecutionShape(step) {
  if (step.execution === undefined) return;
  if (step.role !== "review") throw new Error("execution is only supported on review steps");
  if (!Array.isArray(step.execution) || !step.execution.length || step.execution.length > 20) throw new Error("execution needs 1..20 named operations");
  const ids = new Set();
  for (const op of step.execution) {
    if (!op || !/^[a-z][a-z0-9-]{0,63}$/.test(op.id ?? "") || ids.has(op.id)) throw new Error("execution IDs must be unique simple names");
    ids.add(op.id);
    const keys = op.kind === "editor" ? ["id", "kind", "maxRequests", "timeoutSeconds"] : op.kind === "vitest" ? ["id", "kind", "package", "files", "timeoutSeconds", "waitSeconds"] : ["id", "kind", "mode", "samples", "warmup", "timeoutSeconds"];
    if (Object.keys(op).some(key => !keys.includes(key))) throw new Error("Unknown execution operation field");
    if (op.timeoutSeconds !== undefined && !integer(op.timeoutSeconds, 1, 1800)) throw new Error("execution timeoutSeconds must be 1..1800");
    if (op.waitSeconds !== undefined && !integer(op.waitSeconds, 1, 1800)) throw new Error("execution waitSeconds must be 1..1800");
    if (op.kind === "editor") {
      if (!integer(op.maxRequests, 1, 100)) throw new Error("editor maxRequests must be 1..100");
    } else if (op.kind === "vitest") {
      if (typeof op.package !== "string" || !Array.isArray(op.files) || !op.files.length || op.files.length > 30 || !op.files.every(file => typeof file === "string")) throw new Error("vitest needs a package and 1..30 test files");
    } else {
      const modes = op.kind === "engine-bench" ? ["program", "symbols", "order", "images", "search", "all"] : op.kind === "preview-bench" ? ["preview", "edit", "both"] : [];
      if (!modes.includes(op.mode)) throw new Error("Unknown execution benchmark kind or mode");
      if (!integer(op.samples, 1, 100) || !integer(op.warmup, 0, 100)) throw new Error("benchmark needs samples 1..100 and warmup 0..100");
    }
  }
}

export function executionCommands(operations, root) {
  validateExecutionShape({ role: "review", execution: operations });
  root = fs.realpathSync.native(root);
  const tracked = new Set(git(root, ["ls-files", "-z"]).split("\0"));
  const trackedFile = file => {
    const target = fs.realpathSync.native(file);
    if (!inside(root, target) || !tracked.has(path.relative(root, target).split(path.sep).join("/")) || !fs.statSync(target).isFile()) throw new Error(`Execution input must be a tracked file inside the reviewed checkout: ${file}`);
    return target;
  };
  return operations.map(op => {
    let args, waitSeconds;
    if (op.kind === "editor") {
      args = [trackedFile(path.join(root, ".agents/skills/drive-web-editor/driver.mjs"))];
    } else if (op.kind === "vitest") {
      if (path.isAbsolute(op.package) || op.package.startsWith("-")) throw new Error("Execution package must be repository-relative");
      const packageRoot = fs.realpathSync.native(path.resolve(root, op.package));
      if (!inside(root, packageRoot)) throw new Error("Execution package escapes checkout");
      trackedFile(path.join(packageRoot, "package.json"));
      const files = op.files.map(file => {
        if (path.isAbsolute(file) || file.startsWith("-") || !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file)) throw new Error("Execution requires literal test file paths");
        const target = trackedFile(path.resolve(packageRoot, file));
        if (!inside(packageRoot, target)) throw new Error("Execution test escapes package");
        return path.relative(packageRoot, target);
      });
      // The reservation wait is its own budget, so queueing behind another
      // worktree's suite never consumes the run's timeoutSeconds.
      waitSeconds = op.waitSeconds ?? op.timeoutSeconds ?? 600;
      args = [trackedFile(path.join(root, "scripts/test-suite.mjs")), "run", packageRoot, ...files, "--wait", String(waitSeconds)];
    } else {
      args = [trackedFile(path.join(root, `scripts/bench/${op.kind}.mjs`)), "--fixture", "--mode", op.mode, "--samples", String(op.samples), "--warmup", String(op.warmup)];
    }
    return { id: op.id, kind: op.kind, args, ...(op.kind === "editor" ? { maxRequests: op.maxRequests } : {}), ...(waitSeconds ? { waitSeconds } : {}), timeoutSeconds: op.timeoutSeconds ?? 600 };
  });
}

// Do not give repository commands the coordinator's report tokens, CLI account
// credentials, Node preload options, Git overrides or reviewer service token.
export function executionEnvironment(source = process.env) {
  const allowed = /^(?:path|pathext|systemroot|windir|comspec|programdata|programfiles|programfiles\(x86\)|temp|tmp|home|userprofile|appdata|localappdata|psmodulepath|lang|lc_all)$/i;
  return { ...Object.fromEntries(Object.entries(source).filter(([key]) => allowed.test(key))), NODE_OPTIONS: "--max-old-space-size=1024" };
}

// test-suite.mjs exits 75 and prints this line when it could not take the
// reservation, so no test ran. Either signal alone makes the run a not-run.
export function vitestNotRun(result) {
  if (result.exit === 75) return true;
  if (!result.log) return false;
  try { return /^test-suite: not run:/m.test(fs.readFileSync(result.log, "utf8")); } catch { return false; }
}

// The line test-suite.mjs prints once it holds the reservation.
const reservationAcquired = /^\{"status":"acquired"\}$/m;
const queueStartupGraceSeconds = 30;

function execute(command, root, directory) {
  const log = path.join(directory, `${command.id}.log`);
  const started = path.join(directory, `${command.id}.started.json`);
  fs.writeFileSync(started, JSON.stringify({ command, root, phase: "launching", coordinator: processIdentity(process.pid) }), { flag: "wx" });
  const fd = fs.openSync(log, "wx");
  const child = spawn(fs.realpathSync.native(process.execPath), command.args, { cwd: root, env: { ...executionEnvironment(), ...command.environment }, windowsHide: true, detached: process.platform !== "win32", stdio: ["ignore", fd, fd] });
  return new Promise(resolve => {
    let timedOut = false, launchError, stopError, originalIdentity;
    const stop = () => {
      timedOut = true;
      try {
        if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
        if (command.kind === "vitest") child.kill();
        else if (process.platform === "win32") execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "pipe", timeout: 10000 });
        else process.kill(-child.pid, "SIGKILL");
      } catch (error) { stopError = error.message; }
      // Keep awaiting actual close. Unconfirmed exit cannot release the review
      // freeze or start another operation, even if termination was requested.
    };
    // A command that queues for the machine-wide reservation has two budgets:
    // the wait, which the runner enforces itself with exit 75 (the grace only
    // covers its startup), and the run, which starts when the runner reports
    // that it holds the reservation. Unused wait never extends the run.
    let timer, poll;
    if (command.waitSeconds === undefined) timer = setTimeout(stop, command.timeoutSeconds * 1000);
    else {
      timer = setTimeout(stop, (command.waitSeconds + queueStartupGraceSeconds) * 1000);
      poll = setInterval(() => {
        let text = "";
        try { text = fs.readFileSync(log, "utf8"); } catch { return; }
        if (!reservationAcquired.test(text)) return;
        clearInterval(poll);
        clearTimeout(timer);
        timer = setTimeout(stop, command.timeoutSeconds * 1000);
      }, 100);
    }
    child.once("error", error => { launchError = error.message; });
    child.once("close", async (exit, signal) => {
      clearTimeout(timer);
      clearInterval(poll);
      const result = { id: command.id, exit, signal, timedOut, launchError, stopError, log, coordinator: originalIdentity };
      if (command.kind === "vitest") {
        const disposition = command.receipt ? await awaitReceiptDisposition(command.receipt, { coordinator: originalIdentity })
          : { confirmed: false, error: "Caller-authored receipt is absent" };
        result.containmentConfirmed = disposition.confirmed;
        result.receipt = command.receipt?.file;
        if (!disposition.confirmed) result.containmentError = disposition.error;
      }
      resolve(result);
    });
    try { fs.closeSync(fd); } catch (error) { stopError = "Owned execution log descriptor cleanup failed: " + error.message; }
    try {
      originalIdentity = child.pid ? processIdentity(child.pid) : null;
      fs.writeFileSync(started, JSON.stringify({ command, root, phase: "running", pid: child.pid, identity: originalIdentity }));
    }
    catch (error) { stopError = `Execution ownership record unavailable: ${error.message}`; }
  });
}

export async function startExecutionService({ operations, root, directory, head }, { run = execute } = {}) {
  const commands = executionCommands(operations, root);
  const token = randomBytes(32).toString("hex");
  const results = new Map();
  const requests = new Map(), editors = new Map();
  let pending, accepting = true, failure;
  const frozen = () => {
    if (git(root, ["rev-parse", "HEAD"]) !== head || git(root, ["status", "--porcelain"])) throw new Error("Execution refused: reviewed head or worktree changed");
  };
  frozen();
  // Process-identity probes can block the event loop on a busy Windows host.
  // Do not let polling reuse a socket whose idle timeout elapsed meanwhile.
  const reply = (res, status, value) => { res.writeHead(status, { "content-type": "application/json", connection: "close" }); res.end(JSON.stringify(value)); };
  const handle = async (req, res) => {
    const supplied = Buffer.from(req.headers.authorization ?? "");
    const expected = Buffer.from(`Bearer ${token}`);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return reply(res, 403, { error: "Unauthorized" });
    if (!accepting) return reply(res, 410, { error: "Reviewer has exited" });
    const match = /^\/operations\/([a-z][a-z0-9-]{0,63})(?:\/requests\/([a-z][a-z0-9-]{0,63}))?$/.exec(req.url ?? "");
    const command = match && commands.find(op => op.id === match[1]);
    const editorRequest = command?.kind === "editor" && match[2];
    const length = Number(req.headers["content-length"] || 0);
    if (req.headers["transfer-encoding"] || !Number.isSafeInteger(length) || length < 0 || (editorRequest && req.method === "POST" ? length > editorRequestBytes : length !== 0)) return reply(res, 400, { error: "Request body forbidden or exceeds editor limit" });
    if (req.method === "GET" && req.url === "/operations") return reply(res, 200, commands);
    if (!command || !["GET", "POST"].includes(req.method)) return reply(res, 404, { error: "Unknown operation" });
    if (Boolean(match[2]) !== Boolean(editorRequest) || (command.kind === "editor" && !editorRequest)) return reply(res, 400, { error: "Editor operations require a named request; other operations accept IDs only" });
    const key = editorRequest ? `${command.id}/${editorRequest}` : command.id;
    let request;
    if (editorRequest && req.method === "POST") {
      try {
        const chunks = []; let received = 0;
        for await (const chunk of req) {
          received += chunk.length;
          if (received > editorRequestBytes) throw new Error("Editor request exceeds body limit");
          chunks.push(chunk);
        }
        request = validateEditorRequest(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        if (request.requestId !== editorRequest) throw new Error("Editor requestId differs from URL");
        if (requests.has(key) && requests.get(key) !== JSON.stringify(request)) throw new Error("Editor requestId already used with different content");
      } catch (error) { return reply(res, 400, { error: error.message }); }
    }
    // Admission is checked again after reading an asynchronous request body.
    if (!accepting) return reply(res, 410, { error: "Reviewer has exited" });
    if (req.method === "POST" && !results.has(key)) {
      if (failure) return reply(res, 409, { error: failure });
      if (pending) return reply(res, 409, { error: "Another operation is running" });
      if (editorRequest && [...requests.keys()].filter(id => id.startsWith(`${command.id}/`)).length >= command.maxRequests) return reply(res, 409, { error: "Editor request budget exhausted" });
      try { frozen(); } catch (error) { failure = error.message; return reply(res, 409, { error: failure }); }
      if (editorRequest) requests.set(key, JSON.stringify(request));
      results.set(key, { id: command.id, requestId: editorRequest || undefined, state: "running", head });
      pending = Promise.resolve().then(() => {
        if (!editorRequest) {
          if (command.kind === "vitest") {
            const receiptDirectory = fs.mkdtempSync(path.join(directory, command.id + "-supervision-"));
            const waitIndex = command.args.indexOf("--wait");
            const receipt = createReceiptDescriptor({ directory: receiptDirectory, operation: command.id, head,
              runnerRoot: root, packageRoot: command.args[2], files: command.args.slice(3, waitIndex),
              waitMs: command.waitSeconds * 1000, outerTimeoutMs: command.timeoutSeconds * 1000 });
            return run({ ...command, receipt, args: [...command.args, "--internal-receipt", receipt.file] }, root, directory);
          }
          return run(command, root, directory);
        }
        if (!editors.has(command.id)) editors.set(command.id, createEditorSession(command, root, directory, run));
        return editors.get(command.id).run(request);
      }).then(result => {
        frozen();
        if (command.kind === "vitest" && result.containmentConfirmed !== true)
          failure = result.containmentError || "Vitest owned cleanup remains unconfirmed; preserve execution evidence";
        const notRun = command.kind === "vitest" && vitestNotRun(result);
        const terminal = { ...result, id: command.id, head, state: "complete",
          passed: !failure && !notRun && executionPassed(result), ...(notRun ? { notRun: true } : {}) };
        const resultFile = editorRequest ? path.join(path.dirname(result.log), "result.json") : path.join(directory, `${command.id}.json`);
        fs.writeFileSync(resultFile, JSON.stringify(terminal, null, 2));
        results.set(key, terminal);
      }).catch(error => {
        failure = error.message;
        results.set(key, { id: command.id, head, state: "failed", error: failure, passed: false });
      }).finally(() => { pending = undefined; });
    }
    const result = results.get(key) ?? { id: command.id, state: "not-started" };
    let output, outputBytes, outputTruncated;
    if (result.log) {
      const fd = fs.openSync(result.log, "r");
      try {
        outputBytes = fs.fstatSync(fd).size;
        const bytes = Buffer.alloc(Math.min(outputBytes, 4 * 1024 * 1024));
        fs.readSync(fd, bytes, 0, bytes.length, 0);
        output = bytes.toString("utf8");
        outputTruncated = outputBytes > bytes.length;
      }
      finally { fs.closeSync(fd); }
    }
    return reply(res, 200, { ...result, images: undefined, screenshots: result.images ? editorImages(result.images) : undefined, output, outputBytes, outputTruncated });
  };
  const server = http.createServer((req, res) => {
    handle(req, res).catch(error => { if (!res.headersSent && !res.destroyed) reply(res, 500, { error: error.message }); });
  });
  server.headersTimeout = 10000;
  server.requestTimeout = 10000;
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  let closing;
  return {
    environment: { IMPOWER_REVIEW_EXECUTION_URL: `http://127.0.0.1:${server.address().port}`, IMPOWER_REVIEW_EXECUTION_TOKEN: token },
    close() {
      return closing ??= (async () => {
      accepting = false;
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
      await pending;
      const cleanup = await Promise.allSettled([...editors.values()].map(editor => editor.close()));
      for (const result of cleanup) if (result.status === "rejected") failure = [failure, result.reason.message].filter(Boolean).join("; ");
      try { frozen(); } catch (error) { failure = [failure, error.message].filter(Boolean).join("; "); }
      if (failure) throw new Error(failure);
      })();
    },
  };
}
