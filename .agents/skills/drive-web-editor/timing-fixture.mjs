// The projects `driver.mjs timing` plays (#683). Development-only fixtures:
// nothing ships them, and each is generated the same way on every run, so two
// checkouts measure the same thing.
//
// - `input`: a scene that offers the same two choices for ever. Clicking a
//   choice is input the running game answers as soon as it arrives, by taking
//   the choices off the page, so the time from the click to the page handling
//   that answer is the hop through the game and back.
// - `metronome`: a run of beats that each play one click and show one flash,
//   through the engine's ordinary `((play sound ...))` and `[[show ...]]`, so
//   each click carries the beat's stamp as a real beat does. A beat with a
//   sound waits for input to advance, so the command advances each one on a
//   timer at the tempo; the flashes alternate between two images because a
//   write of the image already showing changes nothing on the page.

import fs from "node:fs";
import path from "node:path";

/** A mono 16-bit WAV: a decaying 1 kHz tone whose first sample is already at
 *  full level, so the click's first audible frame is the file's first frame. */
export function clickWav({ sampleRate = 48_000, ms = 40 } = {}) {
  const frames = Math.round((sampleRate * ms) / 1000);
  const data = Buffer.alloc(frames * 2);
  for (let i = 0; i < frames; i++) {
    const envelope = Math.exp(-i / (sampleRate * 0.004));
    const value = i === 0 ? 0.9 : Math.sin((2 * Math.PI * 1000 * i) / sampleRate) * 0.9 * envelope;
    data.writeInt16LE(Math.round(value * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

const square = (fill) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="${fill}"/></svg>\n`;

/** `beats` beats of one click and one flash each. `startLine` is the line
 *  PLAY starts from, counting from one. */
export function buildMetronomeFixture({ beats = 120 } = {}) {
  const lines = ["-> MAIN", "", "scene MAIN", "  Ready.", ""];
  for (let i = 0; i < beats; i++) lines.push(`  [[show backdrop flash_${i % 2 ? "b" : "a"}]]`, "  ((play sound click))", "  >", "");
  lines.push("end", "");
  const files = new Map();
  files.set("main.sd", lines.join("\n"));
  files.set("assets/click.wav", clickWav());
  files.set("assets/flash_a.svg", square("#ffffff"));
  files.set("assets/flash_b.svg", square("#ffff00"));
  return { files, startLine: 4, beats };
}

/** A scene that offers `Left` and `Right` for ever. */
export function buildInputFixture() {
  const lines = ["-> MAIN", "", "scene MAIN", "  Ready.", "  -> PICK", "end", "", "scene PICK", "  choose", "    + [Left]", "    + [Right]", "  then", "  -> PICK", "  end", "end", ""];
  const files = new Map();
  files.set("main.sd", lines.join("\n"));
  return { files, startLine: 4, choices: ["Left", "Right"] };
}

/** Writes a fixture into `dir`, which must be missing or empty. */
export function writeTimingFixture(dir, { files }) {
  if (fs.existsSync(dir) && fs.readdirSync(dir).length > 0) throw new Error(`refusing to write the fixture into non-empty ${dir}`);
  for (const [rel, content] of files) {
    const full = path.join(dir, ...rel.split("/"));
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
}
