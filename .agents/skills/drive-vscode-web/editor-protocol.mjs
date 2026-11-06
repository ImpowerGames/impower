import { randomUUID } from "node:crypto";

const ENDPOINT = "/static/devextensions/out/.drive-vscode-editor-protocol";
const HOST_FRAME = "/static/build/out/vs/workbench/services/extensions/worker/webWorkerExtensionHostIframe.html";
const MAX_BYTES = 8 * 1024 * 1024;
const POLL_MS = 750;
const HEARTBEAT_MS = 15_000;

function fromWorker(origin, workbench, frames) {
  try {
    const url = new URL(origin);
    return url.origin === origin && url.protocol === workbench.protocol && url.port === workbench.port &&
      /^v--[a-z0-9]+\.localhost$/.test(url.hostname) && workbench.hostname === "localhost" &&
      frames.some((frame) => frame.url().startsWith(url.origin + HOST_FRAME + "?"));
  } catch {
    return false;
  }
}

export function createEditorProtocol(trace = []) {
  let current = null;
  let generation = 0;
  let sequence = 0;
  let closed = false;
  const notifications = new Map();
  const disconnects = new Set();

  function disconnect(reason) {
    const session = current;
    current = null;
    if (session) {
      clearTimeout(session.heartbeat);
      session.wake?.();
      for (const pending of session.pending.values()) pending.finish(new Error(reason));
      trace.push({ event: "disconnect", generation: session.generation, reason });
    }
    for (const listener of disconnects) listener(new Error(reason));
  }

  function connect(origin) {
    if (closed || current) return null;
    const session = {
      generation: ++generation, token: randomUUID(), origin,
      pending: new Map(), queue: [], load: null, wake: null, heartbeat: null,
    };
    current = session;
    beat(session);
    trace.push({ event: "connect", generation: session.generation, origin });
    return { generation: session.generation, token: session.token };
  }

  function beat(session) {
    clearTimeout(session.heartbeat);
    session.heartbeat = setTimeout(() => {
      if (current === session) disconnect("editor protocol worker disconnected");
    }, HEARTBEAT_MS);
  }

  function accept(session, messages) {
    for (const message of messages) {
      if (!message || typeof message !== "object") continue;
      if (message.method === "editor/didLoad" || message.method === "textDocument/didSettleDiagnostics") {
        const { method, params } = message;
        if (method === "editor/didLoad") session.load = params;
        const document = params?.textDocument ?? params;
        trace.push({ event: "notification", generation: session.generation, method, uri: document?.uri, version: document?.version });
        for (const listener of notifications.get(method) ?? []) listener(params);
        continue;
      }
      const pending = session.pending.get(message.id);
      if (!pending) continue;
      trace.push({
        event: "response", generation: session.generation, id: message.id, method: pending.method,
        uri: message.result?.uri ?? message.result?.textDocument?.uri,
        version: message.result?.version ?? message.result?.textDocument?.version,
        error: typeof message.error === "string" ? message.error : undefined,
      });
      const error = typeof message.error === "string" ? new Error(message.error) :
        !Object.hasOwn(message, "result") ? new Error("malformed editor protocol response") : null;
      pending.finish(error, message.result);
    }
  }

  async function poll(origin, { token, generation: hostGeneration, messages }) {
    const session = current;
    if (!session || session.origin !== origin || session.token !== token || session.generation !== hostGeneration) return null;
    if (session.wake || !Array.isArray(messages) || messages.length > 256) return null;
    beat(session);
    accept(session, messages);
    if (!session.queue.length) {
      await new Promise((resolve) => {
        const timer = setTimeout(() => session.wake?.(), POLL_MS);
        session.wake = () => {
          clearTimeout(timer);
          session.wake = null;
          resolve();
        };
      });
    }
    return current === session ? { messages: session.queue.splice(0, 256) } : null;
  }

  function send(method, params, { signal, version, notification = false } = {}) {
    const session = current;
    if (!session) return Promise.reject(new Error("editor protocol is disconnected"));
    const deadline = signal ?? AbortSignal.timeout(60_000);
    if (deadline.aborted) return Promise.reject(new Error(`editor protocol timed out waiting for ${method}`));
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      const abort = () => {
        session.queue = session.queue.filter((message) => message.id !== id);
        if (current === session) {
          session.queue.push({ cancel: id });
          session.wake?.();
        }
        finish(new Error(`editor protocol timed out waiting for ${method}`));
      };
      const finish = (error, result) => {
        session.pending.delete(id);
        deadline.removeEventListener("abort", abort);
        if (error) reject(error);
        else resolve(result);
      };
      session.pending.set(id, { method, finish });
      deadline.addEventListener("abort", abort, { once: true });
      session.queue.push({ id, method, params, version, notification });
      trace.push({ event: "request", generation: session.generation, id, method, uri: params?.textDocument?.uri, version });
      session.wake?.();
    });
  }

  return {
    trace,
    connect,
    poll,
    disconnect,
    close(reason = "editor protocol closed") {
      closed = true;
      disconnect(reason);
    },
    request: send,
    notify: (method, params, options) => send(method, params, { ...options, notification: true }),
    onDisconnect(listener) {
      disconnects.add(listener);
      return () => disconnects.delete(listener);
    },
    onNotification(method, listener) {
      const listeners = notifications.get(method) ?? new Set();
      notifications.set(method, listeners);
      listeners.add(listener);
      if (method === "editor/didLoad" && current?.load) listener(current.load);
      return () => listeners.delete(listener);
    },
  };
}

export async function installEditorProtocol(page, url) {
  const workbench = new URL(url);
  const endpoint = new URL(ENDPOINT, workbench).href;
  const protocol = createEditorProtocol();
  let loaded = false;
  page.on("framenavigated", (frame) => {
    if (frame !== page.mainFrame()) return;
    if (loaded) protocol.disconnect("workbench reloaded");
    loaded = true;
  });
  page.on("close", () => protocol.close("workbench closed"));
  page.on("crash", () => protocol.close("workbench crashed"));
  await page.context().route(endpoint, async (route) => {
    const request = route.request();
    const origin = (await request.allHeaders()).origin;
    if (request.method() !== "POST" || !fromWorker(origin, workbench, page.frames())) {
      await route.fulfill({ status: 403 });
      return;
    }
    const headers = { "access-control-allow-origin": origin, "cache-control": "no-store" };
    const body = request.postDataBuffer();
    if (!body || body.length > MAX_BYTES) {
      await route.fulfill({ status: 400, headers });
      return;
    }
    let message;
    try {
      message = JSON.parse(body.toString("utf8"));
    } catch {
      await route.fulfill({ status: 400, headers });
      return;
    }
    const response = message?.hello === true ? protocol.connect(origin) :
      message && typeof message === "object" ? await protocol.poll(origin, message) : null;
    if (response) await route.fulfill({ json: response, headers });
    else await route.fulfill({ status: 410, headers });
  });
  return protocol;
}

export function watchNotification(protocol, method, matches) {
  let value;
  let failure;
  let wake;
  const unsubscribe = protocol.onNotification(method, (params) => {
    if (matches(params)) {
      value = params;
      wake?.();
    }
  });
  const off = protocol.onDisconnect?.((error) => {
    failure = error;
    wake?.();
  });
  return {
    async wait(signal) {
      if (!value && !failure && !signal.aborted) {
        await new Promise((resolve) => {
          wake = resolve;
          signal.addEventListener("abort", resolve, { once: true });
        }).finally(() => signal.removeEventListener("abort", wake));
      }
      if (failure) throw failure;
      if (!value || signal.aborted) {
        throw new Error(`editor protocol timed out waiting for ${method}; check the opted-in build and active document`);
      }
      return value;
    },
    dispose() {
      unsubscribe();
      off?.();
    },
  };
}
