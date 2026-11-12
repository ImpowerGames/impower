import AudioSession, { MAX_SOUND_BYTES } from "./AudioSession";
import SoundPeaks, { PEAK_COUNT } from "./SoundPeaks";

const DECODE_RATE = 8000;

export const audioSession = new AudioSession({
  audio: () => new Audio(),
  maxBytes: MAX_SOUND_BYTES,
});

export const soundPeaks = new SoundPeaks(
  {
    read: async (src) => {
      const response = await fetch(src);
      if (!response.ok) {
        throw new Error(response.statusText);
      }
      return response.arrayBuffer();
    },
    decode: async (bytes) => {
      const decoded = await new OfflineAudioContext(1, 1, DECODE_RATE).decodeAudioData(bytes);
      return {
        channels: Array.from({ length: decoded.numberOfChannels }, (_, channel) => decoded.getChannelData(channel)),
        duration: decoded.duration,
      };
    },
  },
  { limit: 64, maxBytes: MAX_SOUND_BYTES, count: PEAK_COUNT },
);
