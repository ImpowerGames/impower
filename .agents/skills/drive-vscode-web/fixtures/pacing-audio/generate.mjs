import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const assets = join(here, "project", "assets");
const RATE = 48000;

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

function fadeAndNormalize(channels, fadeIn, fadeOut) {
  const n = channels[0].length;
  let peak = 0;
  for (const ch of channels) {
    for (let i = 0; i < n; i++) {
      const t = i / RATE;
      const end = (n - i) / RATE;
      let g = 1;
      if (fadeIn > 0 && t < fadeIn) g *= t / fadeIn;
      if (fadeOut > 0 && end < fadeOut) g *= end / fadeOut;
      ch[i] *= g;
      peak = Math.max(peak, Math.abs(ch[i]));
    }
  }
  const scale = peak > 0 ? 0.8 / peak : 1;
  return channels.map((ch) => {
    const pcm = new Int16Array(n);
    for (let i = 0; i < n; i++) pcm[i] = Math.max(-32767, Math.min(32767, Math.round(ch[i] * scale * 32767)));
    return pcm;
  });
}

const oggCrcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = i << 24;
    for (let k = 0; k < 8; k++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1;
    table[i] = r >>> 0;
  }
  return table;
})();

const oggCrc = (bytes) => {
  let crc = 0;
  for (const b of bytes) crc = ((crc << 8) ^ oggCrcTable[((crc >>> 24) ^ b) & 0xff]) >>> 0;
  return crc >>> 0;
};

const oggPage = ({ flags, granule, serial, sequence, packets }) => {
  const lacing = [];
  for (const p of packets) {
    let left = p.length;
    while (left >= 255) {
      lacing.push(255);
      left -= 255;
    }
    lacing.push(left);
  }
  if (lacing.length > 255) throw new Error("ogg page holds too many segments");
  const body = Buffer.concat(packets);
  const page = Buffer.alloc(27 + lacing.length + body.length);
  page.write("OggS", 0, "ascii");
  page[5] = flags;
  page.writeBigInt64LE(BigInt(granule), 6);
  page.writeUInt32LE(serial, 14);
  page.writeUInt32LE(sequence, 18);
  page[26] = lacing.length;
  Buffer.from(lacing).copy(page, 27);
  body.copy(page, 27 + lacing.length);
  page.writeUInt32LE(oggCrc(page), 22);
  return page;
};

const muxOggOpus = ({ packets, channels, preSkip, samples, serial }) => {
  const head = Buffer.alloc(19);
  head.write("OpusHead", 0, "ascii");
  head[8] = 1;
  head[9] = channels;
  head.writeUInt16LE(preSkip, 10);
  head.writeUInt32LE(RATE, 12);
  const vendor = Buffer.from("impower pacing-audio fixture generate.mjs", "ascii");
  const tags = Buffer.alloc(8 + 4 + vendor.length + 4);
  tags.write("OpusTags", 0, "ascii");
  tags.writeUInt32LE(vendor.length, 8);
  vendor.copy(tags, 12);
  const pages = [];
  let sequence = 0;
  pages.push(oggPage({ flags: 2, granule: 0, serial, sequence: sequence++, packets: [head] }));
  pages.push(oggPage({ flags: 0, granule: 0, serial, sequence: sequence++, packets: [tags] }));
  const finalGranule = preSkip + samples;
  let granule = 0;
  let pending = [];
  let segments = 0;
  const flush = (last) => {
    pages.push(
      oggPage({
        flags: last ? 4 : 0,
        granule: last ? finalGranule : granule,
        serial,
        sequence: sequence++,
        packets: pending,
      }),
    );
    pending = [];
    segments = 0;
  };
  packets.forEach((p, i) => {
    const need = Math.floor(p.data.length / 255) + 1;
    if (pending.length > 0 && (segments + need > 255 || pending.length >= 50)) flush(false);
    pending.push(p.data);
    segments += need;
    granule += p.samples;
    if (i === packets.length - 1) flush(true);
  });
  if (granule < finalGranule) throw new Error(`encoded ${granule} samples, fewer than ${finalGranule}`);
  return Buffer.concat(pages);
};

const SOUNDS = [
  { file: "voyage.ogg", make: voyagePcm, bitrate: 24000, serial: 0x49505341 },
  { file: "bell.ogg", make: bellPcm, bitrate: 32000, serial: 0x49505342 },
];

const encodeInPage = (page, pcm, bitrate) => {
  const channels = pcm.length;
  const frames = pcm[0].length;
  const padded = frames + 2 * 960;
  const interleaved = new Int16Array(padded * channels);
  for (let i = 0; i < frames; i++) for (let c = 0; c < channels; c++) interleaved[i * channels + c] = pcm[c][i];
  const b64 = Buffer.from(interleaved.buffer).toString("base64");
  return page.evaluate(
    async ({ b64, channels, padded, bitrate, rate }) => {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const pcm = new Int16Array(bytes.buffer);
      const packets = [];
      let description = null;
      let failure = null;
      const encoder = new AudioEncoder({
        output: (chunk, meta) => {
          const data = new Uint8Array(chunk.byteLength);
          chunk.copyTo(data);
          let s = "";
          for (const b of data) s += String.fromCharCode(b);
          packets.push({ data: btoa(s), duration: chunk.duration });
          if (!description && meta?.decoderConfig?.description) {
            description = Array.from(new Uint8Array(meta.decoderConfig.description));
          }
        },
        error: (e) => {
          failure = String(e);
        },
      });
      encoder.configure({
        codec: "opus",
        sampleRate: rate,
        numberOfChannels: channels,
        bitrate,
        opus: { frameDuration: 20000, complexity: 10, application: "audio" },
      });
      const block = 4800;
      for (let start = 0; start < padded; start += block) {
        const count = Math.min(block, padded - start);
        const planar = new Float32Array(count * channels);
        for (let c = 0; c < channels; c++) {
          for (let i = 0; i < count; i++) planar[c * count + i] = pcm[(start + i) * channels + c] / 32768;
        }
        const data = new AudioData({
          format: "f32-planar",
          sampleRate: rate,
          numberOfFrames: count,
          numberOfChannels: channels,
          timestamp: Math.round((start / rate) * 1e6),
          data: planar,
        });
        encoder.encode(data);
        data.close();
      }
      await encoder.flush();
      encoder.close();
      return { packets, description, failure };
    },
    { b64, channels, padded, bitrate, rate: RATE },
  );
};

const decodeInPage = (page, bytes) =>
  page.evaluate(
    async ({ b64 }) => {
      const bin = atob(b64);
      const data = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
      const buffer = await new OfflineAudioContext(1, 1, 48000).decodeAudioData(data.buffer);
      let sum = 0;
      let count = 0;
      for (let c = 0; c < buffer.numberOfChannels; c++) {
        const ch = buffer.getChannelData(c);
        for (let i = 0; i < ch.length; i++) {
          sum += ch[i] * ch[i];
          count++;
        }
      }
      return { duration: buffer.duration, channels: buffer.numberOfChannels, rms: Math.sqrt(sum / count) };
    },
    { b64: Buffer.from(bytes).toString("base64") },
  );

const main = async () => {
  const { chromium } = createRequire(import.meta.url)("playwright");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.route("https://pacing-fixture.invalid/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>encoder</title>" }),
    );
    await page.goto("https://pacing-fixture.invalid/");
    const supported = await page.evaluate(async (rate) => {
      if (typeof AudioEncoder === "undefined") return false;
      const s = await AudioEncoder.isConfigSupported({ codec: "opus", sampleRate: rate, numberOfChannels: 2, bitrate: 24000 });
      return s.supported === true;
    }, RATE);
    if (!supported) throw new Error("this Chromium has no WebCodecs Opus encoder; no sound files were written");
    for (const sound of SOUNDS) {
      const pcm = sound.make();
      const encoded = await encodeInPage(page, pcm, sound.bitrate);
      if (encoded.failure) throw new Error(`${sound.file}: ${encoded.failure}`);
      const head = encoded.description ? Buffer.from(encoded.description) : null;
      const preSkip = head && head.length >= 12 && head.toString("ascii", 0, 8) === "OpusHead" ? head.readUInt16LE(10) : 312;
      const packets = encoded.packets.map((p) => ({ data: Buffer.from(p.data, "base64"), samples: Math.round((p.duration * RATE) / 1e6) }));
      const bytes = muxOggOpus({ packets, channels: pcm.length, preSkip, samples: pcm[0].length, serial: sound.serial });
      const file = write(sound.file, bytes);
      const check = await decodeInPage(page, bytes);
      const expected = pcm[0].length / RATE;
      if (Math.abs(check.duration - expected) > 0.03) throw new Error(`${sound.file}: decoded ${check.duration}s, expected ${expected}s`);
      if (check.rms < 0.01) throw new Error(`${sound.file}: decoded audio is silent (rms ${check.rms})`);
      console.log(`wrote ${file} (${bytes.length} bytes, ${packets.length} packets, pre-skip ${preSkip}); decoded ${check.duration.toFixed(3)}s, ${check.channels} ch, rms ${check.rms.toFixed(3)}`);
    }
  } finally {
    await browser.close();
  }
};

await main();
