import { serveOpusDecoding, type OpusServingScope } from "./opusFallback";

const WorkerScope = (globalThis as { WorkerGlobalScope?: abstract new () => unknown })
  .WorkerGlobalScope;

if (WorkerScope && globalThis instanceof WorkerScope) {
  serveOpusDecoding(globalThis as unknown as OpusServingScope);
}

export default "";
