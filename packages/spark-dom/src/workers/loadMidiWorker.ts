/* eslint-disable no-restricted-globals */

// This module is a dedicated worker; the project also loads the DOM lib, so
// `self` would otherwise be typed as Window.
declare const self: DedicatedWorkerGlobalScope;
import { convertMidiToToneSequences } from "../../../spark-engine/src/game/modules/audio/utils/convertMidiToToneSequences";
import { parseMidi } from "../../../spark-engine/src/game/modules/audio/utils/parseMidi";

self.onmessage = (event): void => {
  self.postMessage({ progress: 0 });
  const { arrayBuffer, sampleRate } = event.data;
  const midi = parseMidi(arrayBuffer);
  self.postMessage({ progress: 0.5 });
  const result = convertMidiToToneSequences(midi, sampleRate);
  self.postMessage({ progress: 1, result });
};

export {};
