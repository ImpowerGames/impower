import { ToneSequence } from "@impower/spark-engine/src/game/modules/audio/types/ToneSequence";

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
