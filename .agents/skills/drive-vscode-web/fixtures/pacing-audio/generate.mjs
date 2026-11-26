import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { encodeSounds, fadeAndNormalize, RATE } from "../ogg-sounds.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const assets = join(here, "project", "assets");

const write = (relative, data) => {
  const file = join(assets, relative);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, data);
  return file;
};

const freq = (m) => 440 * 2 ** ((m - 69) / 12);

const voyagePcm = () => {
  const seconds = 180;
  const n = seconds * RATE;
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  const beat = 60 / 84;
  const bar = beat * 4;
  const chords = [
    [50, 57, 62, 65],
    [46, 53, 58, 62],
    [48, 55, 60, 64],
    [45, 52, 57, 61],
  ];
  const addNote = (start, length, f, gain, pan, kind) => {
    const s0 = Math.floor(start * RATE);
    const len = Math.floor(length * RATE);
    for (let i = 0; i < len && s0 + i < n; i++) {
      const t = i / RATE;
      let v;
      if (kind === "pluck") {
        const env = Math.exp(-t / 0.35) * Math.min(1, t / 0.004);
        v = env * (Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(4 * Math.PI * f * t));
      } else if (kind === "pad") {
        const env = Math.min(1, t / 0.8) * Math.min(1, (length - t) / 0.8);
        v = env * (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(2 * Math.PI * f * 1.004 * t));
      } else {
        const env = Math.exp(-t / 0.6) * Math.min(1, t / 0.01);
        v = env * Math.sin(2 * Math.PI * f * t);
      }
      left[s0 + i] += v * gain * (1 - pan);
      right[s0 + i] += v * gain * (1 + pan);
    }
  };
  const bars = Math.ceil(seconds / bar);
  for (let b = 0; b < bars; b++) {
    const chord = chords[b % chords.length];
    const t0 = b * bar;
    for (const m of chord.slice(1)) addNote(t0, bar, freq(m), 0.05, 0, "pad");
    addNote(t0, beat * 3, freq(chord[0] - 12), 0.26, 0, "bass");
    const pattern = [1, 2, 3, 2, 1, 3, 2, 1];
    for (let k = 0; k < 8; k++) {
      addNote(t0 + (k * beat) / 2, beat * 1.5, freq(chord[pattern[k]] + 12), 0.12, k % 2 ? 0.4 : -0.4, "pluck");
    }
  }
  return fadeAndNormalize([left, right], 1, 3);
};

const bellPcm = () => {
  const n = Math.floor(1.8 * RATE);
  const out = new Float32Array(n);
  const ratios = [1, 2.4, 4.1, 6.8];
  const decays = [1.1, 0.6, 0.3, 0.15];
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    let v = 0;
    ratios.forEach((r, k) => {
      v += (Math.exp(-t / decays[k]) * Math.sin(2 * Math.PI * 660 * r * t)) / (k + 1);
    });
    out[i] = v * Math.min(1, t / 0.002);
  }
  return fadeAndNormalize([out], 0, 0.2);
};

const SOUNDS = [
  { file: "voyage.ogg", make: voyagePcm, bitrate: 24000, serial: 0x49505341 },
  { file: "bell.ogg", make: bellPcm, bitrate: 32000, serial: 0x49505342 },
];

const sounds = await encodeSounds({ sounds: SOUNDS, write, vendor: "impower pacing-audio fixture generate.mjs" });
for (const s of sounds) {
  console.log(
    `wrote ${s.file} (${s.bytes} bytes, ${s.packets} packets, pre-skip ${s.preSkip}); decoded ${s.decoded.duration.toFixed(3)}s of ${s.expected.toFixed(3)}s, ${s.decoded.channels} ch, rms ${s.decoded.rms.toFixed(3)}`,
  );
}
