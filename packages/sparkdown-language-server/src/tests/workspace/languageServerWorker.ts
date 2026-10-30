import { MessageConnection } from "@impower/jsonrpc/src/browser/classes/MessageConnection";
import { installSparkdownWorker } from "@impower/sparkdown/src/worker/installSparkdownWorker";
import { SparkdownLanguageServerWorkspace } from "../../classes/SparkdownLanguageServerWorkspace";

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

export const silentConnection = new Proxy(
  {},
  { get: () => () => ({ dispose() {} }) },
) as never;

export class TestWorkspace extends SparkdownLanguageServerWorkspace {
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
