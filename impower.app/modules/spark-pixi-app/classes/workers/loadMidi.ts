import { ToneSequence } from "../../../../../spark-engine/src/game/sound/types/ToneSequence";

export const loadMidi = async (
  arrayBuffer: ArrayBuffer,
  onProgress?: (percentage: number) => void
): Promise<ToneSequence[]> => {
  return new Promise((resolve) => {
    const worker = new Worker(new URL("./loadMidiWorker.ts", import.meta.url));
    worker.addEventListener("message", (event) => {
      const { progress, result } = event.data;
      if (progress) {
        onProgress?.(progress);
      }
      if (result) {
        worker.terminate();
        resolve(result);
      }
    });
    worker.postMessage(arrayBuffer);
  });
};
