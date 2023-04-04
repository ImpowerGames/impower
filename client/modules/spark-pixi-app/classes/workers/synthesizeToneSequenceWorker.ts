/* eslint-disable no-restricted-globals */
import {
  fillArrayWithTone,
  getNumberOfSamples,
  modulateSoundBuffer,
} from "../../../../../spark-engine";
import { ToneSequence } from "../../../../../spark-engine/src/game/sound/types/ToneSequence";

self.onmessage = (event): void => {
  let progress = 0;
  self.postMessage({ progress });
  const toneSequence = event.data as ToneSequence;
  const sampleRate = 44100;
  const length = getNumberOfSamples(toneSequence.tones, sampleRate);
  const result = new Float32Array(length);
  progress += 0.1;
  self.postMessage({ progress });
  const tonePercentageDelta = 1 / (toneSequence?.tones?.length ?? 1);
  if (toneSequence?.tones?.length) {
    toneSequence.tones.forEach((tone) => {
      fillArrayWithTone(tone, sampleRate, result);
      progress += tonePercentageDelta;
      self.postMessage({ progress });
    });
    modulateSoundBuffer(result, toneSequence.events, sampleRate);
  } else {
    progress += tonePercentageDelta;
    self.postMessage({ progress });
  }
  self.postMessage({ progress: 1, result });
};

export {};
