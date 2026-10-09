// A CDP observer for Electron's worker and webview targets. Playwright owns
// the workbench UI; this connection only reaches targets in that owned host.
export async function connectCDP(endpoint) {
  const response = await fetch(`${endpoint}/json/version`, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`CDP discovery failed: ${response.status}`);
  const { webSocketDebuggerUrl } = await response.json();
  const socket = new WebSocket(webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    const fail = () => { clearTimeout(timer); socket.close(); reject(new Error("CDP connection failed")); };
    const timer = setTimeout(fail, 10000);
    socket.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
    socket.addEventListener("error", fail, { once: true });
    socket.addEventListener("close", fail, { once: true });
  });
  let serial = 0;
  const pending = new Map();
  const listeners = new Set();
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(String(data));
    const request = pending.get(message.id);
    if (request) {
      pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
    } else {
      for (const listener of listeners) listener(message);
    }
  });
  socket.addEventListener("close", () => {
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(new Error("The desktop host disconnected"));
    }
    pending.clear();
  });
  return {
    on(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    send(method, params = {}, sessionId, timeout = 15000) {
      return new Promise((resolve, reject) => {
        if (socket.readyState !== WebSocket.OPEN) return reject(new Error("The desktop host disconnected"));
        const id = ++serial;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`CDP ${method} timed out`));
        }, timeout);
        pending.set(id, { resolve, reject, timer });
        socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      });
    },
    close() { socket.close(); },
  };
}
