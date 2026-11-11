import fs from "node:fs";

const [inPath, storyPath, luauPath] = process.argv.slice(2);
if (!inPath || !storyPath || !luauPath) {
  console.error(
    "usage: node definitions/scripts/split-grammar-source.mjs <grammar.yaml> <story-out.yaml> <luau-out.yaml>",
  );
  process.exit(2);
}

const isLuauRule = (name) => name.startsWith("Luau");
const isLuauVariable = (name) => name.replace(/^_/, "").startsWith("LUAU_");

const SPLIT_SECTIONS = { variables: isLuauVariable, repository: isLuauRule };
const TOP_KEY = /^([A-Za-z_][A-Za-z0-9_]*):/;
const ENTRY_KEY = /^ {2}([A-Za-z_][A-Za-z0-9_]*):/;
const ENTRY_START = /^ {2}[#A-Za-z_]/;

const text = fs.readFileSync(inPath, "utf8");
if (text.includes("\r")) throw new Error(`${inPath} has CR line endings`);
const lines = text.endsWith("\n") ? text.slice(0, -1).split("\n") : text.split("\n");

const sections = [];
for (const line of lines) {
  const top = line.match(TOP_KEY);
  if (top || sections.length === 0) {
    sections.push({ key: top?.[1] ?? null, header: line, body: [] });
  } else {
    sections.at(-1).body.push(line);
  }
}

const splitBody = (key, body) => {
  const lead = [];
  const entries = [];
  let current = null;
  for (const line of body) {
    if (ENTRY_START.test(line) && (current === null || current.name !== null)) {
      current = { name: null, lines: [] };
      entries.push(current);
    }
    if (current === null) {
      lead.push(line);
      continue;
    }
    current.lines.push(line);
    const entryKey = line.match(ENTRY_KEY);
    if (entryKey && current.name === null) current.name = entryKey[1];
  }
  for (const entry of entries) {
    if (entry.name === null) {
      throw new Error(`${key}: a comment block names no entry: ${entry.lines[0]}`);
    }
  }
  return { lead, entries };
};

const trailingBlankCount = (block) => {
  let n = 0;
  while (n < block.length && block[block.length - 1 - n] === "") n++;
  return n;
};

const withTrailingBlanks = (block, count) => {
  const out = block.slice(0, block.length - trailingBlankCount(block));
  for (let i = 0; i < count; i++) out.push("");
  return out;
};

const story = [];
const luau = [];
const counts = [];
const seen = new Set();
for (const section of sections) {
  if (section.key !== null) {
    if (seen.has(section.key)) throw new Error(`top-level key ${section.key} appears twice`);
    seen.add(section.key);
  }
  const isLuau = SPLIT_SECTIONS[section.key];
  if (!isLuau) {
    story.push(section.header, ...section.body);
    continue;
  }
  const { lead, entries } = splitBody(section.key, section.body);
  const ending = trailingBlankCount(section.body);
  const storyEntries = entries.filter((entry) => !isLuau(entry.name));
  const luauEntries = entries.filter((entry) => isLuau(entry.name));
  const emit = (out, chosen, endBlanks) => {
    const block = [...lead, ...chosen.flatMap((entry) => entry.lines)];
    out.push(section.header, ...withTrailingBlanks(block, endBlanks));
  };
  emit(story, storyEntries, ending);
  emit(luau, luauEntries, section.key === "repository" ? 0 : 1);
  counts.push(
    `${section.key}: ${storyEntries.length} to the story file, ${luauEntries.length} to the Luau file`,
  );
}

for (const key of Object.keys(SPLIT_SECTIONS)) {
  if (!seen.has(key)) throw new Error(`${inPath} has no top-level ${key}`);
}

const comments = (block) => block.filter((line) => /^\s*#/.test(line)).length;
const before = comments(lines);
const after = comments(story) + comments(luau);
if (before !== after) {
  throw new Error(`comment lines: ${before} before the split, ${after} after`);
}

fs.writeFileSync(storyPath, `${story.join("\n")}\n`);
fs.writeFileSync(luauPath, `${luau.join("\n")}\n`);

console.log([...counts, `comment lines: ${before} before, ${after} after`].join("\n"));
