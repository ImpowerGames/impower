import { ToneSequence } from "@impower/spark-engine/src/game/modules/audio/types/ToneSequence";

export const synthesizeToneSequence = async (
  toneSequence: ToneSequence,
  onProgress?: (percentage: number) => void
): Promise<Float32Array> => {
  return new Promise((resolve) => {
    const worker = new Worker(
      new URL("./synthesizeToneSequenceWorker.ts", import.meta.url)
    );
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
    worker.postMessage(toneSequence);
  });
};
