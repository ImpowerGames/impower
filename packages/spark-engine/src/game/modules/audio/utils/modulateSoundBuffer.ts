import { MIDI_CONTROLLER } from "../constants/MIDI_CONTROLLER";
import { SynthControllerEvent } from "../types/SynthControllerEvent";

export const modulateSoundBuffer = (
  soundBuffer: Float32Array,
  events: readonly SynthControllerEvent[],
  sampleRate: number
): void => {
  events.forEach((event) => {
    const time = event.time ?? 0;
    const duration = event.duration ?? 0;
    const startIndex = Math.floor(time * sampleRate);
    const endIndex = Math.floor((time + duration) * sampleRate);
    for (let i = startIndex; i < endIndex; i += 1) {
      let v = soundBuffer[i] ?? 0;
      if (event.type === MIDI_CONTROLLER.volume) {
        v *= event.value;
      }
      if (event.type === MIDI_CONTROLLER.expression) {
        v *= event.value;
      }
      soundBuffer[i] = v;
    }
  });
};
