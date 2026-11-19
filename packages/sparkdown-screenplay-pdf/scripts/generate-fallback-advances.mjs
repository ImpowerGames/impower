import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as fontkit from "fontkit";
import { FALLBACK_FONT_SOURCES, fallbackScriptOf } from "../src/utils/fallbackFontSources.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const COURIER_DIR = resolve(ROOT, "impower-dev/src/public/fonts");
const CONSTANTS = resolve(ROOT, "packages/sparkdown-screenplay/src/constants");
const FIXTURES = resolve(ROOT, "packages/sparkdown-document-views/test/fixtures/fallback-fonts");

const COURIER = {
  normal: "courier-prime.ttf",
  bold: "courier-prime-bold.ttf",
  italic: "courier-prime-italic.ttf",
  bolditalic: "courier-prime-bold-italic.ttf",
};

const WEIGHT_OF = { normal: "normal", bold: "bold", italic: "normal", bolditalic: "bold" };

const FIXTURE_TEXT = readFileSync(resolve(FIXTURES, "characters.txt"), "utf8").trim();

const KEPT_IN_PRIMARY = /[\s\p{Cc}]/u;

const fetchFont = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return Buffer.from(await response.arrayBuffer());
};

const toRanges = (entries) => {
  const ranges = [];
  for (const [codePoint, advance] of entries) {
    const last = ranges.at(-1);
    if (last && last[1] === codePoint - 1 && last[2] === advance) last[1] = codePoint;
    else ranges.push([codePoint, codePoint, advance]);
  }
  return ranges;
};

const checksum = (bytes) => {
  const padded = Buffer.alloc(Math.ceil(bytes.length / 4) * 4);
  bytes.copy(padded);
  let sum = 0;
  for (let offset = 0; offset < padded.length; offset += 4) sum = (sum + padded.readUInt32BE(offset)) >>> 0;
  return sum;
};

const sfnt = (tables) => {
  const tags = Object.keys(tables).sort();
  const header = Buffer.alloc(12 + tags.length * 16);
  const searchRange = 2 ** Math.floor(Math.log2(tags.length)) * 16;
  header.writeUInt32BE(0x00010000, 0);
  header.writeUInt16BE(tags.length, 4);
  header.writeUInt16BE(searchRange, 6);
  header.writeUInt16BE(Math.floor(Math.log2(tags.length)), 8);
  header.writeUInt16BE(tags.length * 16 - searchRange, 10);
  const bodies = [];
  let offset = header.length;
  tags.forEach((tag, index) => {
    const table = tables[tag];
    header.write(tag.padEnd(4, " "), 12 + index * 16, "latin1");
    header.writeUInt32BE(checksum(table), 16 + index * 16);
    header.writeUInt32BE(offset, 20 + index * 16);
    header.writeUInt32BE(table.length, 24 + index * 16);
    const padded = Buffer.alloc(Math.ceil(table.length / 4) * 4);
    table.copy(padded);
    bodies.push(padded);
    offset += padded.length;
  });
  return Buffer.concat([header, ...bodies]);
};

const cmapTable = (mapping) => {
  const groups = toRanges([...mapping].sort((a, b) => a[0] - b[0]).map(([codePoint, glyph]) => [codePoint, glyph - codePoint]));
  const table = Buffer.alloc(12 + 16 + groups.length * 12);
  table.writeUInt16BE(0, 0);
  table.writeUInt16BE(1, 2);
  table.writeUInt16BE(3, 4);
  table.writeUInt16BE(10, 6);
  table.writeUInt32BE(12, 8);
  table.writeUInt16BE(12, 12);
  table.writeUInt32BE(16 + groups.length * 12, 16);
  table.writeUInt32BE(0, 20);
  table.writeUInt32BE(groups.length, 24);
  groups.forEach(([first, last, delta], index) => {
    table.writeUInt32BE(first, 28 + index * 12);
    table.writeUInt32BE(last, 32 + index * 12);
    table.writeUInt32BE(first + delta, 36 + index * 12);
  });
  return table;
};

const rawTable = (bytes, tag) => {
  const count = bytes.readUInt16BE(4);
  for (let index = 0; index < count; index++) {
    const entry = 12 + index * 16;
    if (bytes.toString("latin1", entry, entry + 4) === tag) {
      const offset = bytes.readUInt32BE(entry + 8);
      return Buffer.from(bytes.subarray(offset, offset + bytes.readUInt32BE(entry + 12)));
    }
  }
  return undefined;
};

const subsetFixture = (bytes, characters) => {
  const font = fontkit.create(bytes);
  const subset = font.createSubset();
  const mapping = new Map();
  for (const character of characters) {
    const codePoint = character.codePointAt(0);
    if (!font.hasGlyphForCodePoint(codePoint)) continue;
    mapping.set(codePoint, subset.includeGlyph(font.glyphForCodePoint(codePoint)));
  }
  const glyphOnly = Buffer.from(subset.encode());
  const tables = {};
  const count = glyphOnly.readUInt16BE(4);
  for (let index = 0; index < count; index++) {
    const entry = 12 + index * 16;
    const tag = glyphOnly.toString("latin1", entry, entry + 4);
    tables[tag] = rawTable(glyphOnly, tag);
  }
  const post = Buffer.alloc(32);
  rawTable(bytes, "post").copy(post, 0, 0, 32);
  post.writeUInt32BE(0x00030000, 0);
  tables.post = post;
  tables["OS/2"] = rawTable(bytes, "OS/2");
  tables.name = rawTable(bytes, "name");
  tables.cmap = cmapTable(mapping);
  return sfnt(tables);
};

const courierFaces = Object.fromEntries(
  Object.entries(COURIER).map(([face, file]) => [face, fontkit.create(readFileSync(resolve(COURIER_DIR, file)))]),
);

const fallbackFonts = { normal: [], bold: [] };
for (const source of FALLBACK_FONT_SOURCES) {
  for (const weight of ["normal", "bold"]) {
    const bytes = await fetchFont(source[weight]);
    fallbackFonts[weight].push({ source, bytes, font: fontkit.create(bytes) });
  }
}

const lackedByAny = (weight, codePoint) =>
  Object.entries(WEIGHT_OF).some(([face, faceWeight]) => faceWeight === weight && !courierFaces[face].hasGlyphForCodePoint(codePoint));

const fallbackAdvances = {};
for (const weight of ["normal", "bold"]) {
  const unitsPerEm = new Set(fallbackFonts[weight].map(({ font }) => font.unitsPerEm));
  if (unitsPerEm.size !== 1) throw new Error(`fallback fonts disagree on unitsPerEm: ${[...unitsPerEm]}`);
  const candidates = new Set();
  for (const { font } of fallbackFonts[weight]) for (const codePoint of font.characterSet) candidates.add(codePoint);
  const entries = [];
  for (const codePoint of [...candidates].sort((a, b) => a - b)) {
    const character = String.fromCodePoint(codePoint);
    if (KEPT_IN_PRIMARY.test(character) || !lackedByAny(weight, codePoint)) continue;
    const script = fallbackScriptOf(character);
    const advances = fallbackFonts[weight]
      .filter(({ source, font }) => source.script === script && font.hasGlyphForCodePoint(codePoint))
      .map(({ font }) => font.glyphForCodePoint(codePoint).advanceWidth);
    if (advances.length === 0) continue;
    if (advances.some((advance) => advance !== advances[0])) {
      throw new Error(`fonts for ${script} disagree on U+${codePoint.toString(16)}: ${advances}`);
    }
    entries.push([codePoint, advances[0]]);
  }
  fallbackAdvances[weight] = { unitsPerEm: [...unitsPerEm][0], ranges: toRanges(entries) };
}

const inFallback = (weight, codePoint) =>
  fallbackAdvances[weight].ranges.some(([first, last]) => codePoint >= first && codePoint <= last);

const courierAdvances = {};
for (const [face, font] of Object.entries(courierFaces)) {
  const missing = font.getGlyph(0).advanceWidth;
  const entries = [];
  for (const codePoint of [...font.characterSet].sort((a, b) => a - b)) {
    const advance = font.glyphForCodePoint(codePoint).advanceWidth;
    if (advance !== missing || inFallback(WEIGHT_OF[face], codePoint)) entries.push([codePoint, advance]);
  }
  courierAdvances[face] = { unitsPerEm: font.unitsPerEm, missing, ranges: toRanges(entries) };
}

const rangesSource = (ranges) => `[${ranges.map((range) => `[${range.join(",")}]`).join(",")}]`;

const packedSource = (ranges) => {
  const values = [];
  let previous = -1;
  for (const [first, last, advance] of ranges) {
    values.push(first - previous - 1, last - first, advance);
    previous = last;
  }
  return `[${values.join(",")}]`;
};

writeFileSync(
  resolve(CONSTANTS, "FALLBACK_FONT_ADVANCES.ts"),
  `export const FALLBACK_FONT_ADVANCES: Record<"normal" | "bold", { unitsPerEm: number; packed: number[] }> = {
${["normal", "bold"].map((weight) => `  ${weight}: {
    unitsPerEm: ${fallbackAdvances[weight].unitsPerEm},
    packed: ${packedSource(fallbackAdvances[weight].ranges)},
  },`).join("\n")}
};
`,
);

writeFileSync(
  resolve(CONSTANTS, "SCRIPT_FONT_ADVANCES.ts"),
  `import { FALLBACK_FONT_ADVANCES } from "./FALLBACK_FONT_ADVANCES";

export type FontAdvanceRange = [first: number, last: number, advance: number];

export interface FontAdvances {
  unitsPerEm: number;
  ranges: FontAdvanceRange[];
}

export interface ScriptFontAdvances extends FontAdvances {
  missing: number;
  fallback: FontAdvances;
}

export type ScriptFace = "normal" | "bold" | "italic" | "bolditalic";

const unpack = ({ unitsPerEm, packed }: { unitsPerEm: number; packed: number[] }): FontAdvances => {
  const ranges: FontAdvanceRange[] = [];
  let previous = -1;
  for (let index = 0; index < packed.length; index += 3) {
    const first = previous + 1 + packed[index]!;
    previous = first + packed[index + 1]!;
    ranges.push([first, previous, packed[index + 2]!]);
  }
  return { unitsPerEm, ranges };
};

const FALLBACK = { normal: unpack(FALLBACK_FONT_ADVANCES.normal), bold: unpack(FALLBACK_FONT_ADVANCES.bold) };

export const SCRIPT_FONT_ADVANCES: Record<ScriptFace, ScriptFontAdvances> = {
${Object.entries(courierAdvances).map(([face, { unitsPerEm, missing, ranges }]) => `  ${face}: {
    unitsPerEm: ${unitsPerEm},
    missing: ${missing},
    ranges: ${rangesSource(ranges)},
    fallback: FALLBACK.${WEIGHT_OF[face]},
  },`).join("\n")}
};
`,
);

mkdirSync(FIXTURES, { recursive: true });
for (const weight of ["normal", "bold"]) {
  for (const { source, bytes, font } of fallbackFonts[weight]) {
    const ownCharacters = [...FIXTURE_TEXT].filter((character) => fallbackScriptOf(character) === source.script);
    if (!ownCharacters.some((character) => font.hasGlyphForCodePoint(character.codePointAt(0)))) continue;
    const file = `${source.name.toLowerCase().replace(/ /g, "-")}-${weight}.ttf`;
    writeFileSync(resolve(FIXTURES, file), subsetFixture(bytes, FIXTURE_TEXT));
  }
}

for (const weight of ["normal", "bold"]) {
  console.log(`${weight}: ${fallbackAdvances[weight].ranges.length} fallback ranges`);
}
