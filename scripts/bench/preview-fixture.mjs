#!/usr/bin/env node
// A generated project that is slow to preview for the same reasons the real
// projects the preview latency work targets are (#646, #647), so the browser
// measurement (`driver.mjs measure --fixture`) and the worker benchmark
// (`preview-bench.mjs --fixture`) run anywhere, with no private project.
//
// What makes a real project slow, and what this reproduces:
// - one flat scene of more than 2,000 lines, so the route search from the top
//   of the scene to the cursor walks thousands of story steps;
// - a `choose ... then ... end` whose `then` clause holds the last 1,000+
//   lines, so an edit near the end re-lowers one huge block;
// - portraits written with attributes (`[[hero_calm:gloves]]`) over SVG files
//   whose layers carry a condition vocabulary (`hair-top:hat.off`,
//   `torso:clothes.jacket:default`), so every directive filters layers.
//
// Everything is deterministic: the same call produces the same bytes, so a
// before and after measured on two checkouts measure the same project.
//
//   node scripts/bench/preview-fixture.mjs <empty-or-missing-dir>
//
// prints the target line and word as JSON.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CHARACTERS = [
  { id: "hero", name: "HERO" },
  { id: "rival", name: "RIVAL" },
];
const EXPRESSIONS = ["calm", "concerned", "confident", "confused", "shy", "unsure", "frustrated", "smug", "sad", "happy", "angry", "tired"];
// Attributes a directive may ask for; each is a condition some layer names.
const ATTRIBUTES = ["gloves", "hat", "bandage", "young", "cushion", "coat", "robe", "school", "mouth.closed", "mouth.teeth", "eyes.closed", "look.left", "look.right"];

// Park-Miller, so the output never depends on Math.random.
function generator(seed) {
  let state = seed;
  const next = () => (state = (state * 48271) % 2147483647) / 2147483647;
  return { next, pick: (list) => list[Math.floor(next() * list.length)], int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)) };
}

function pathData(rand, points) {
  let d = `M${rand.int(0, 800)} ${rand.int(0, 1200)}`;
  for (let i = 0; i < points; i++) d += ` C${rand.int(0, 800)} ${rand.int(0, 1200)} ${rand.int(0, 800)} ${rand.int(0, 1200)} ${rand.int(0, 800)} ${rand.int(0, 1200)}`;
  return d + "Z";
}

// One portrait: every layer name that the real portraits use a form of, with
// shapes inside, so the file is both a realistic vocabulary and a realistic
// size (tens of kilobytes).
function portraitSvg(character, expression, seed) {
  const rand = generator(seed);
  const shape = () => `<path fill="#${rand.int(0, 0xffffff).toString(16).padStart(6, "0")}" d="${pathData(rand, 12)}"/>`;
  const layer = (name, inner = "") => `<g data-name="${name}">${shape()}${shape()}${inner}</g>`;
  const clothes = ["jacket", "coat", "robe", "school"];
  const layers = [
    layer("hair-bottom-short:young.on"),
    layer("hair-bottom-long:young.off"),
    layer("hair-bottom-long:bandage.on:young.off"),
    layer("hair-long:hat.on:young.off"),
    layer("hair-bottom-long-back-tuft:bandage.off:hat.off:young.off"),
    ...clothes.map((c, i) => layer(`back:clothes.${c}${i === 0 ? ":default" : ""}`)),
    layer("body"),
    layer("body-neck"),
    layer("body-hand-left:cushion.off"),
    layer("hand-left-inner:cushion.off:gloves.on"),
    layer("tight-hand-left:cushion.off:gloves.on"),
    layer("loose-hand-left:cushion.off:gloves.on:clothes.jacket.robe.school"),
    ...clothes.map((c, i) => layer(`torso:clothes.${c}${i === 0 ? ":default" : ""}`)),
    ...clothes.map((c) => layer(`sleeve-right:clothes.${c}`)),
    layer("body-hand-right:cushion.off"),
    layer("hand-right-inner:cushion.off:gloves.on"),
    layer("cushion.on"),
    layer("head"),
    layer("hair-top:hat.off"),
    layer("hair-top-long-front-tuft:bandage.off:hat.off:young.off"),
    layer("hair-top-short-front-tuft:bandage.off:hat.off:young.on"),
    layer("bandage.on"),
    layer("hat.on"),
    layer(
      `face.${expression}:default`,
      [
        layer("lids:eyes.closed"),
        layer("pupils:eyes.open:look.left"),
        layer("pupils:eyes.open:look.right"),
        layer("pupils:eyes.open:look.camera:default"),
        layer("whites:eyes.open:default"),
        layer("mouth.closed:default"),
        layer("mouth.open"),
        layer("mouth.teeth"),
        layer("skin"),
      ].join(""),
    ),
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1200" data-name="${character}_${expression}">${layers.join("")}</svg>\n`;
}

const SENTENCES = [
  "The rain has not let up since noon.",
  "A clock somewhere in the house strikes the quarter hour.",
  "Footsteps pass in the corridor and fade.",
  "The lamp gutters, then steadies.",
  "Somebody downstairs laughs at something nobody else heard.",
  "The window rattles in its frame.",
];
const LINES = [
  "You were not supposed to be here tonight.",
  "Neither were you, if we are keeping score.",
  "I only came for the letters.",
  "Then we want the same thing, and that is a problem.",
  "Keep your voice down.",
  "Do you understand what they will do if they find us?",
  "I understand perfectly.",
  "Then stop smiling like that.",
];
const PARENTHETICALS = ["(quietly)", "(searching his face)", "(without looking up)", "(a beat)", "(too quickly)"];

// A run of beats at one indentation: an action line, then a dialogue block
// with a portrait directive, repeated until `count` lines are written.
function beats(rand, indent, count, directives) {
  const out = [];
  const pad = " ".repeat(indent);
  while (out.length < count) {
    out.push(pad + rand.pick(SENTENCES), "");
    const character = rand.pick(CHARACTERS);
    const expression = rand.pick(EXPRESSIONS);
    const attributes = [];
    for (let n = rand.int(0, 2); n > 0; n--) attributes.push(rand.pick(ATTRIBUTES));
    out.push(pad + `${character.name}:`);
    directives.push({ at: out.length, character: character.id, expression });
    out.push(pad + `  [[${[`${character.id}_${expression}`, ...new Set(attributes)].join(":")}]]`);
    if (rand.next() < 0.4) out.push(pad + "  " + rand.pick(PARENTHETICALS));
    out.push(pad + "  " + rand.pick(LINES), "");
  }
  return out;
}

// The project as relative path -> text, and the line the measurement targets:
// the last portrait directive of the `then` clause, whose expression word
// (`concerned`) is the one the measurement deletes.
export function buildPreviewFixture({ beforeLines = 1300, thenLines = 1100 } = {}) {
  const rand = generator(647);
  const header = ["include scripts/characters", "include scripts/portraits", "", "scene MAIN"];
  const before = beats(rand, 2, beforeLines, []);
  const choose = ["  choose", "    + [Success!]", "      The bag lands safely on the pile.", "", "    + [Fail...]", "      Everything clatters to the floor.", "  then", ""];
  // The clause ends on a fixed exchange whose directive is the target, shaped
  // like the real one: an expression file plus an attribute.
  const then = [...beats(rand, 4, thenLines, []), "    HERO turns to face him.", "", "    HERO:", "      [[hero_concerned:gloves]]", "      (searching his face)", "      _Do you understand_?", "", "    A CRASH of thunder.", ""];
  const lines = [...header, ...before, ...choose, ...then, "  end", "end", ""];
  const line = lines.indexOf("      [[hero_concerned:gloves]]") + 1;
  const lineText = lines[line - 1];
  const files = new Map();
  files.set("main.sd", lines.join("\n"));
  files.set("scripts/characters.sd", CHARACTERS.map((c) => `define ${c.id} as character with\n  name = "${c.name}"\nend\n`).join("\n"));
  // Named looks over the layered files, as a real project writes them.
  files.set(
    "scripts/portraits.sd",
    CHARACTERS.flatMap((c) => EXPRESSIONS.slice(0, 4).map((e) => `define ${c.id}_${e}_gloved as filtered_image with\n  image = image.${c.id}_${e}\n  attributes = { "gloves" }\nend\n`)).join("\n"),
  );
  let seed = 1;
  for (const c of CHARACTERS) for (const e of EXPRESSIONS) files.set(`assets/${c.id}_${e}.svg`, portraitSvg(c.id, e, seed++));
  return {
    files,
    target: { line, word: "concerned", lineText, sceneLines: lines.length - header.length, thenLines: then.length },
  };
}

// The fixture's scene reduced to its beats, with no `choose`: one scene of
// action and dialogue lines and nothing else, so that a stepping loop covering
// only the content kinds a beat compiles to can run it from top to bottom
// (engine-bench.mjs, #664). The target is its last line of dialogue.
export function buildBeatsFixture({ lines = 2400 } = {}) {
  const rand = generator(664);
  const scene = ["include scripts/characters", "", "scene MAIN", ...beats(rand, 2, lines, []), "end", ""];
  const files = new Map();
  files.set("main.sd", scene.join("\n"));
  files.set("scripts/characters.sd", CHARACTERS.map((c) => `define ${c.id} as character with\n  name = "${c.name}"\nend\n`).join("\n"));
  return { files, target: { line: scene.length - 3, sceneLines: scene.length - 2 } };
}

// The comparison scene of #693: the beats of the fixture with the other kinds a
// statement can be mixed in at the rate a real route meets them, so that the
// chunk prototype (chunkStepper.ts) and the story engine can run the same
// script from top to bottom. It holds stored variables and reassignments,
// `if ... else ... end` blocks, a line that interpolates a variable, scenes
// reached by `-> NAME` so that every scene change is a divert through a symbol,
// and one `choose` whose `then` clause holds the rest of its scene, as the real
// projects write it. Nothing here needs a function call, a loop, glue or a tag.
export function buildChunksFixture({ scenes = 8, linesPerScene = 150, thenLines = 1100 } = {}) {
  const rand = generator(693);
  const out = ["include scripts/characters", "", "store trust = 0", "store heat = 0", ""];
  // A run of beats broken up by the other statement kinds.
  const mixed = (indent, count) => {
    const pad = " ".repeat(indent);
    const lines = [];
    while (lines.length < count) {
      lines.push(...beats(rand, indent, rand.int(24, 40), []));
      const roll = rand.next();
      if (roll < 0.4) lines.push(pad + `& trust = trust + ${rand.int(1, 3)}`, "");
      else if (roll < 0.6) lines.push(pad + `& heat = heat + trust`, pad + "The count stands at {trust}, and the heat at {heat}.", "");
      else {
        lines.push(pad + `if trust > ${rand.int(2, 40)} then`, ...beats(rand, indent + 2, 4, []));
        if (rand.next() < 0.7) lines.push(pad + "else", ...beats(rand, indent + 2, 4, []));
        lines.push(pad + "end", "");
      }
    }
    return lines;
  };
  const name = (n) => (n === 0 ? "MAIN" : `PART_${n}`);
  for (let n = 0; n < scenes; n++) {
    out.push(`scene ${name(n)}`, ...mixed(2, linesPerScene));
    if (n < scenes - 1) out.push(`  -> ${name(n + 1)}`);
    else out.push("  choose", "    + [Success!]", "      The bag lands safely on the pile.", "      & trust = trust + 2", "", "    + [Fail...]", "      Everything clatters to the floor.", "  then", "", ...mixed(4, thenLines), "  end");
    out.push("end", "");
  }
  const files = new Map();
  files.set("main.sd", out.join("\n"));
  files.set("scripts/characters.sd", CHARACTERS.map((c) => `define ${c.id} as character with\n  name = "${c.name}"\nend\n`).join("\n"));
  return { files, target: { line: out.length - 3, scenes, sceneLines: out.length } };
}

// Writes the fixture into `dir`, which must be missing or empty, so it can
// never overwrite a real project.
export function writePreviewFixture(dir, { files, target } = buildPreviewFixture()) {
  if (fs.existsSync(dir) && fs.readdirSync(dir).length > 0) throw new Error(`refusing to write the fixture into non-empty ${dir}`);
  for (const [rel, text] of files) {
    const full = path.join(dir, ...rel.split("/"));
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, text);
  }
  return target;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  const dir = process.argv[2];
  if (!dir) {
    console.error("usage: node scripts/bench/preview-fixture.mjs <empty-or-missing-dir>");
    process.exit(2);
  }
  console.log(JSON.stringify({ dir: path.resolve(dir), ...writePreviewFixture(path.resolve(dir)) }, null, 2));
}
