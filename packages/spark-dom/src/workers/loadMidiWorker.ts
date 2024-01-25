/* eslint-disable no-restricted-globals */
import { convertMidiToToneSequences } from "../../../spark-engine/src/game/modules/audio/utils/convertMidiToToneSequences";
import { parseMidi } from "../../../spark-engine/src/game/modules/audio/utils/parseMidi";

self.onmessage = (event): void => {
  self.postMessage({ progress: 0 });
  const arrayBuffer = event.data;
  const midi = parseMidi(arrayBuffer);
  self.postMessage({ progress: 0.5 });
  const result = convertMidiToToneSequences(midi);
  self.postMessage({ progress: 1, result });
};

export {};
