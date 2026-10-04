import { expect, test } from "vitest";
import { createWasmAnalysisBackend, type AnalysisTransport } from "../../analysis-backend/wasm-adapter";

test("deadline result, reset and dispose await actual worker termination", async () => {
  let allowTermination: (() => void) | undefined;
  let created = 0;
  let initialized = false;
  const backend = createWasmAnalysisBackend((): AnalysisTransport => {
    created++;
    let receive: (r: any) => void;
    return {
      listen(callback) { receive = callback; },
      send(message: any) {
        if (message.operation === "initialize" || message.operation === "update") {
          initialized = true;
          queueMicrotask(() => receive({ id: message.id, body: '{"status":"ok"}', initializationMs: 1, checkingMs: 0, encodingMs: 0, workerMs: 1, inputBytes: 1, outputBytes: 1, linearMemoryBytes: 1 }));
        }
      },
      async terminate() { await new Promise<void>(r => { allowTermination = r; }); },
    };
  });
  const p = await backend.createProject({ mode: "strict" });
  expect(initialized).toBe(true);
  await p.update({ projectVersion: 1, documents: [{ module: "main", version: 1, source: "return 1" }] });
  let deadlineResolved = false;
  const checking = p.check("main", { deadlineMs: 5 }).then(r => { deadlineResolved = true; return r; });
  await new Promise(r => setTimeout(r, 30));
  expect(allowTermination).toBeTypeOf("function");
  expect(deadlineResolved).toBe(false);
  const reset = p.reset();
  expect(created).toBe(1);
  allowTermination!();
  expect((await checking).status).toBe("deadline");
  expect((await reset).status).toBe("ok");
  expect(created).toBe(2);
  let disposed = false;
  const disposal = p.dispose().then(() => { disposed = true; });
  await new Promise(r => setTimeout(r, 10));
  expect(disposed).toBe(false);
  allowTermination!();
  await disposal;
  expect(disposed).toBe(true);
});

test("aborted or invalid hydrate request cannot expose an empty usable session", async () => {
  for (const invalidDeadline of [false, true]) {
    const controller = new AbortController();
    const options = { signal: controller.signal, deadlineMs: 1000 };
    let created = 0;
    let terminated = 0;
    let hydratedModules: string[] = [];
    const backend = createWasmAnalysisBackend((): AnalysisTransport => {
      const instance = ++created;
      let receive: (r: any) => void;
      return {
        listen(callback) { receive = callback; },
        send(message: any) {
          if (message.operation === "update") hydratedModules = (message.payload.documents ?? []).map((d: any) => d.module);
          queueMicrotask(() => {
            receive({ id: message.id, body: '{"status":"ok"}', initializationMs: 1, checkingMs: 0, encodingMs: 0, workerMs: 1, inputBytes: 1, outputBytes: 1, linearMemoryBytes: 1 });
            if (instance === 2 && message.operation === "initialize") {
              if (invalidDeadline) options.deadlineMs = 0;
              else controller.abort();
            }
          });
        },
        async terminate() { terminated++; },
      };
    });
    const p = await backend.createProject({ mode: "strict" });
    try {
      await p.update({ projectVersion: 1, documents: [{ module: "retained", version: 1, source: "return 1" }] });
      if (invalidDeadline) await expect(p.reset(options)).rejects.toThrow("Deadline");
      else expect((await p.reset(options)).status).toBe("cancelled");
      expect((await p.check("retained")).status).toBe("requires-reset");
      if (invalidDeadline) expect(terminated).toBe(2);
      expect((await p.reset()).status).toBe("ok");
      expect(hydratedModules).toEqual(["retained"]);
    } finally { await p.dispose(); }
  }
});
