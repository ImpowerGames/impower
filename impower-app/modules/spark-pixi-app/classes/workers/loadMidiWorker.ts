/* eslint-disable no-restricted-globals */
import {
    convertMidiToToneSequences,
    parseMidi,
} from "../../../../../spark-engine";

self.onmessage = (event): void => {
  self.postMessage({ progress: 0 });
  const arrayBuffer = event.data;
  const midi = parseMidi(arrayBuffer);
  self.postMessage({ progress: 0.5 });
  const result = convertMidiToToneSequences(midi);
  self.postMessage({ progress: 1, result });
};

export { };

