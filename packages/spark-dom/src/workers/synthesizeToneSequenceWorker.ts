/* eslint-disable no-restricted-globals */
import { MIDI_MONOPHONIC_INSTRUMENTS } from "@impower/spark-engine/src/game/modules/audio/constants/MIDI_MONOPHONIC_INSTRUMENTS";
import { MIDI_POLYPHONIC_INSTRUMENTS } from "@impower/spark-engine/src/game/modules/audio/constants/MIDI_POLYPHONIC_INSTRUMENTS";
import { ToneSequence } from "@impower/spark-engine/src/game/modules/audio/types/ToneSequence";
import { fillArrayWithTone } from "@impower/spark-engine/src/game/modules/audio/utils/fillArrayWithTone";
import { getNumberOfSamples } from "@impower/spark-engine/src/game/modules/audio/utils/getNumberOfSamples";
import { modulateSoundBuffer } from "@impower/spark-engine/src/game/modules/audio/utils/modulateSoundBuffer";

self.onmessage = (event): void => {
  let progress = 0;
  self.postMessage({ progress });
  const toneSequence = event.data as ToneSequence;
  const sampleRate = 44100;
  const length = getNumberOfSamples(
    toneSequence.tones,
    toneSequence.sampleRate
  );
  const result = new Float32Array(length);
  progress += 0.1;
  self.postMessage({ progress });
  const tonePercentageDelta = 1 / (toneSequence?.tones?.length ?? 1);
  if (toneSequence?.tones?.length) {
    toneSequence.tones.forEach((tone) => {
      const instruments = tone.mono
        ? MIDI_MONOPHONIC_INSTRUMENTS
        : MIDI_POLYPHONIC_INSTRUMENTS;
      const synth = instruments[tone.instrument ?? 0];
      fillArrayWithTone(tone, synth, sampleRate, result);
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
