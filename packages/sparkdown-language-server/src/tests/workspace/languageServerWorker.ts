// The language server's own workspace with its compiler's worker
// (`installSparkdownWorker`) in this process behind a connection that
// delivers every message as a structured clone, one task later, in order,
// as a worker's port does. A test that imports it mocks the worker bundle
// first: `vi.mock("@impower/sparkdown/src/worker/sparkdown.worker", ...)`.
import { MessageConnection } from "@impower/jsonrpc/src/browser/classes/MessageConnection";
import { installSparkdownWorker } from "@impower/sparkdown/src/worker/installSparkdownWorker";
import { SparkdownLanguageServerWorkspace } from "../../classes/SparkdownLanguageServerWorkspace";

/** One end of a port: what it posts arrives at its peer as a structured
 *  clone, one task later, in the order it was posted. */
export class LoopbackConnection extends MessageConnection {
  peer?: LoopbackConnection;
  protected _listeners = new Set<(e: MessageEvent) => void>();

  constructor() {
    super((message) => {
      const copy = structuredClone(message);
      const peer = this.peer;
      setTimeout(() => {
        for (const listener of [...(peer?._listeners ?? [])]) {
          listener({ data: copy } as MessageEvent);
        }
      }, 0);
    });
  }

  override addEventListener(_event: "message", listener: (e: MessageEvent) => void) {
    this._listeners.add(listener);
  }

  override removeEventListener(_event: "message", listener: (e: MessageEvent) => void) {
    this._listeners.delete(listener);
  }

  close() {}
}

/** A connection to the editor that answers nothing. */
export const silentConnection = new Proxy(
  {},
  { get: () => () => ({ dispose() {} }) },
) as never;

/** The language server's workspace, with its compiler's worker in this process. */
export class TestWorkspace extends SparkdownLanguageServerWorkspace {
  // Set by `startCompilerWorker`, which the constructor calls before this
  // class's own fields are initialized, so neither has an initializer.
  declare worker: ReturnType<typeof installSparkdownWorker>;
  declare page: LoopbackConnection;

  protected override startCompilerWorker() {
    const page = new LoopbackConnection();
    const worker = new LoopbackConnection();
    page.peer = worker;
    worker.peer = page;
    this.page = page;
    this._compilerChannelConnection = page as never;
    this.worker = installSparkdownWorker(worker);
    this._initializedCompiler = true;
  }
}

/** Runs `run` with the console silenced. */
export const quietly = async <T>(run: () => Promise<T>): Promise<T> => {
  const { warn, error, log } = console;
  console.warn = console.error = console.log = () => {};
  try {
    return await run();
  } finally {
    console.warn = warn;
    console.error = error;
    console.log = log;
  }
};
