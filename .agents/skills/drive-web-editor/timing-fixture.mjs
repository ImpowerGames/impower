import fs from "node:fs";
import path from "node:path";

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

export function buildMetronomeFixture({ beats = 120 } = {}) {
  const lines = ["scene start", "  Ready.", ""];
  for (let i = 0; i < beats; i++) lines.push(`  [[show backdrop flash_${i % 2 ? "b" : "a"}]]`, "  ((play sound click))", "  >", "");
  lines.push("end", "");
  const files = new Map();
  files.set("main.sd", lines.join("\n"));
  files.set("assets/click.wav", clickWav());
  files.set("assets/flash_a.svg", square("#ffffff"));
  files.set("assets/flash_b.svg", square("#ffff00"));
  return { files, startLine: 2, beats };
}

export function buildInputFixture() {
  const lines = ["scene start", "  Ready.", "  -> PICK", "end", "", "scene PICK", "  choose", "    + [Left]", "    + [Right]", "  then", "  -> PICK", "  end", "end", ""];
  const files = new Map();
  files.set("main.sd", lines.join("\n"));
  return { files, startLine: 2, choices: ["Left", "Right"] };
}

export function writeTimingFixture(dir, { files }) {
  if (fs.existsSync(dir) && fs.readdirSync(dir).length > 0) throw new Error(`refusing to write the fixture into non-empty ${dir}`);
  for (const [rel, content] of files) {
    const full = path.join(dir, ...rel.split("/"));
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
}
