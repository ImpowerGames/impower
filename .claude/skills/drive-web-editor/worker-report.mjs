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

export async function reportFreshWorker(page, ctx, reload, { timeout = 30_000, connect = workerSession } = {}) {
  const report = { refreshed: false, controlled: false, scriptURL: null, sha256: null, warnings: [], errors: [] };
  let cdp, worker;
  const close = async () => {
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
    await page.waitForFunction(() => navigator.serviceWorker.controller?.state === "activated", null, { timeout });
    const active = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      return Boolean(navigator.serviceWorker.controller && registration?.active === navigator.serviceWorker.controller);
    });
    if (!active) throw new Error("the page controller is not the registered active worker; close other editor tabs and retry");
    report.scriptURL = await page.evaluate(() => navigator.serviceWorker.controller.scriptURL);
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
    worker.events.add((message) => {
      if (message.method === "Debugger.scriptParsed") scripts.push(message.params);
      if (message.method === "Runtime.consoleAPICalled") {
        const entry = message.params;
        const list = entry.type === "warning" ? report.warnings : entry.type === "error" ? report.errors : null;
        if (list && list.length < 25) list.push(entry.args.map((a) => a.value ?? a.description ?? a.type).join(" "));
      }
    });
    await worker.send("Runtime.enable");
    await worker.send("Debugger.enable");
    const script = scripts.find((s) => s.url === report.scriptURL);
    if (!script) throw new Error("the active worker's script was not readable; retry with the editor idle");
    const { scriptSource } = await worker.send("Debugger.getScriptSource", { scriptId: script.scriptId });
    report.sha256 = crypto.createHash("sha256").update(scriptSource).digest("hex");
    // A one-shot message proves that the worker whose script was hashed is
    // the page's controller. The listener is removed even if the ping fails.
    const token = `impower-driver-${crypto.randomUUID()}`;
    const key = JSON.stringify(token);
    await worker.send("Runtime.evaluate", { expression: `self[${key}] = e => { if (e.data === ${key}) e.ports[0]?.postMessage(${key}); }; self.addEventListener('message', self[${key}]);` });
    try {
      report.controlled = await page.evaluate((token) => new Promise((resolve) => {
        const channel = new MessageChannel();
        const finish = (ok) => { clearTimeout(timer); channel.port1.close(); channel.port2.close(); resolve(ok); };
        const timer = setTimeout(() => finish(false), 5000);
        channel.port1.onmessage = (e) => finish(e.data === token);
        navigator.serviceWorker.controller.postMessage(token, [channel.port2]);
      }), token);
    } finally {
      await worker.send("Runtime.evaluate", { expression: `self.removeEventListener('message', self[${key}]); delete self[${key}];` });
    }
    if (!report.controlled) throw new Error("the hashed worker did not answer through the page controller; retry after the worker activates");
    report.refreshed = true;
    return { report, close };
  } catch (err) {
    report.reason = `fresh service worker verification failed: ${err.message}. Run status and retry before using this run as evidence`;
    await close();
    return { report, close: async () => {} };
  }
}
