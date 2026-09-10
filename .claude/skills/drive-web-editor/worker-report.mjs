import crypto from "node:crypto";

// A nested CDP session reads the installed worker's script, independent of
// the server's current bytes. Requests and listeners are bounded and closed
// with the browser run.
export async function workerSession(cdp, targetId, timeout = 15_000) {
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: false });
  let next = 0;
  const pending = new Map();
  const events = new Set();
  const received = (event) => {
    if (event.sessionId !== sessionId) return;
    const message = JSON.parse(event.message);
    const request = pending.get(message.id);
    if (request) {
      pending.delete(message.id);
      clearTimeout(request.timer);
      message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result);
    } else if (message.method) {
      for (const listener of events) listener(message);
    }
  };
  cdp.on("Target.receivedMessageFromTarget", received);
  return {
    events,
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = ++next;
        const fail = (err) => {
          const item = pending.get(id);
          if (!item) return;
          clearTimeout(item.timer);
          pending.delete(id);
          reject(err);
        };
        const timer = setTimeout(() => fail(new Error(`worker ${method} timed out; retry with the editor idle`)), timeout);
        pending.set(id, { resolve, reject, timer });
        cdp.send("Target.sendMessageToTarget", { sessionId, message: JSON.stringify({ id, method, params }) }).catch(fail);
      });
    },
    async close() {
      cdp.off("Target.receivedMessageFromTarget", received);
      for (const request of pending.values()) {
        clearTimeout(request.timer);
        request.reject(new Error("worker session closed"));
      }
      pending.clear();
      events.clear();
      await cdp.send("Target.detachFromTarget", { sessionId }).catch(() => {});
    },
  };
}

async function pingController(page, worker) {
  const token = `impower-driver-${crypto.randomUUID()}`;
  const key = JSON.stringify(token);
  const evaluate = async (expression) => {
    const result = await worker.send("Runtime.evaluate", { expression });
    if (result?.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  };
  try {
    await evaluate(`self[${key}] = e => { if (e.data === ${key}) e.ports[0]?.postMessage(${key}); }; self.addEventListener('message', self[${key}]);`);
    return await page.evaluate((token) => new Promise((resolve) => {
      const channel = new MessageChannel();
      const finish = (ok) => { clearTimeout(timer); channel.port1.close(); channel.port2.close(); resolve(ok); };
      const timer = setTimeout(() => finish(false), 5000);
      channel.port1.onmessage = (e) => finish(e.data === token);
      if (navigator.serviceWorker.controller) navigator.serviceWorker.controller.postMessage(token, [channel.port2]);
      else finish(false);
    }), token);
  } finally {
    await evaluate(`self.removeEventListener('message', self[${key}]); delete self[${key}];`);
  }
}

export async function reportFreshWorker(page, ctx, reload, { timeout = 30_000, connect = workerSession } = {}) {
  const report = { scope: "editor", origin: null, refreshed: false, controlled: false, verifiedAtEnd: false, scriptURL: null, sha256: null, warnings: [], errors: [], warningsDropped: 0, errorsDropped: 0 };
  let cdp, worker, closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    if (worker) await worker.close();
    if (cdp) await cdp.detach().catch(() => {});
  };
  try {
    cdp = await ctx.newCDPSession(page);
    const versions = new Map();
    cdp.on("ServiceWorker.workerVersionUpdated", ({ versions: updates }) => {
      for (const version of updates) versions.set(version.versionId, version);
    });
    await cdp.send("ServiceWorker.enable");
    report.unregistered = await page.evaluate(async () => {
      if (!navigator.serviceWorker) throw new Error("service workers are unavailable; use the localhost editor URL");
      const registrations = await navigator.serviceWorker.getRegistrations();
      const results = [];
      for (const registration of registrations) {
        const removed = await registration.unregister();
        if (!removed) throw new Error(`could not unregister ${registration.scope}; close other editor tabs and retry`);
        results.push(registration.scope);
      }
      return results;
    });
    await reload(page);
    await page.waitForFunction(() => navigator.serviceWorker.controller?.state === "activated", null, { timeout }).catch(() => {
      throw new Error(`the editor page did not acquire an activated service-worker controller within ${timeout / 1000}s; inspect consoleErrors for registration failures and fix the worker before retrying`);
    });
    const active = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      return Boolean(navigator.serviceWorker.controller && registration?.active === navigator.serviceWorker.controller);
    });
    if (!active) throw new Error("the page controller is not the registered active worker; close other editor tabs and retry");
    report.scriptURL = await page.evaluate(() => navigator.serviceWorker.controller.scriptURL);
    report.origin = new URL(report.scriptURL).origin;
    const end = Date.now() + timeout;
    let version;
    while (Date.now() < end) {
      const candidates = [...versions.values()].filter((v) => v.scriptURL === report.scriptURL && v.status === "activated" && v.runningStatus === "running" && v.targetId);
      if (candidates.length === 1) { version = candidates[0]; break; }
      await page.waitForTimeout(100);
    }
    if (!version) throw new Error("could not identify one active worker; close other editor tabs and retry");
    worker = await connect(cdp, version.targetId);
    const scripts = [];
    const capture = (kind, text) => {
      if (report[kind].length < 25) report[kind].push(text);
      else report[`${kind}Dropped`]++;
    };
    worker.events.add((message) => {
      if (message.method === "Debugger.scriptParsed") scripts.push(message.params);
      if (message.method === "Runtime.consoleAPICalled") {
        const entry = message.params;
        const kind = entry.type === "warning" ? "warnings" : entry.type === "error" ? "errors" : null;
        if (kind) capture(kind, entry.args.map((a) => a.value ?? a.description ?? a.type).join(" "));
      }
      if (message.method === "Runtime.exceptionThrown") {
        const details = message.params.exceptionDetails;
        capture("errors", details.exception?.description ?? details.text);
      }
    });
    await worker.send("Runtime.enable");
    await worker.send("Debugger.enable");
    const script = scripts.find((s) => s.url === report.scriptURL);
    if (!script) throw new Error("the active worker's script was not readable; retry with the editor idle");
    const { scriptSource } = await worker.send("Debugger.getScriptSource", { scriptId: script.scriptId });
    report.sha256 = crypto.createHash("sha256").update(scriptSource).digest("hex");
    await worker.send("Debugger.disable");
    report.controlled = await pingController(page, worker);
    if (!report.controlled) throw new Error("the hashed worker did not answer through the page controller; retry after the worker activates");
    report.refreshed = true;
    const finish = async () => {
      report.verifiedAtEnd = false;
      try {
        if (versions.get(version.versionId)?.status !== "activated") throw new Error("the identified worker version was replaced");
        if (!(await pingController(page, worker))) throw new Error("another worker or no worker answers through the page controller");
        report.verifiedAtEnd = true;
      } catch (err) {
        report.controlled = false;
        report.reason = `could not confirm that the worker identified at --fresh-sw still controls the page (${err.message}); retry with the worker build held stable for the whole run`;
      }
      return report;
    };
    return { report, close, finish };
  } catch (err) {
    report.reason = `fresh service worker verification failed: ${err.message.replace(/[.\s]+$/, "")}. Inspect the worker and page errors before using this run as evidence`;
    await close();
    return { report, close: async () => {}, finish: async () => report };
  }
}
