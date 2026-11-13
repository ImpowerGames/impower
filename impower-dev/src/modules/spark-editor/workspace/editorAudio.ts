import AudioSession, { MAX_SOUND_BYTES } from "./AudioSession";
import SoundLengths from "./SoundLengths";
import SoundPeaks, { PEAK_COUNT } from "./SoundPeaks";

const DECODE_RATE = 8000;

const PROBE_TIMEOUT_MS = 10_000;

const probeLength = (src: string) =>
  new Promise<number>((resolve, reject) => {
    const audio = new Audio();
    const done = () => {
      clearTimeout(timer);
      audio.onloadedmetadata = null;
      audio.onerror = null;
      audio.removeAttribute("src");
      audio.load();
    };
    const timer = setTimeout(() => {
      done();
      reject(new Error("timeout"));
    }, PROBE_TIMEOUT_MS);
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      const seconds = audio.duration;
      done();
      resolve(seconds);
    };
    audio.onerror = () => {
      done();
      reject(new Error("unreadable"));
    };
    audio.src = src;
  });

export const soundLengths = new SoundLengths({ probe: probeLength }, { limit: 2048, concurrency: 4 });

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
