import GRAMMAR_DEFINITION from "@impower/sparkdown/language/sparkdown.language-grammar.json";
import { LAYOUT_VERBS } from "@impower/sparkdown/language/sparkdown.layout-verbs";
import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { createSparkdownParser } from "@impower/sparkdown/src/compiler/utils/createSparkdownParser";
import {
  DIRECTIVE_CLAUSE_WORDS,
  DIRECTIVE_CONTROL_WORDS,
  DIRECTIVE_FLAG_WORDS,
  directiveValueKind,
  readSourceDirectives,
  type SourceDirective,
} from "@impower/sparkdown/src/compiler/utils/readDirective";
import { compareEngines } from "@impower/sparkdown/src/tests/compiler/scopeEquality";
import { beforeAll, describe, expect, test } from "vitest";
import { MAIN_URI, compileUI, createHarness } from "../ui/harness/uiTestHarness";

type Bracket = "image" | "audio";
type Row = readonly [label: string, bracket: Bracket, text: string];

const PUNCTUATION = [..."!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~"];

const SEPARATOR_CONTEXTS: readonly (readonly [context: string, bracket: Bracket, before: string, after: string])[] = [
  ["name with a clause word after", "image", "mia", "morph"],
  ["name with a clause word before", "image", "morph", "x"],
  ["value with a clause word after", "image", "mia with x", "morph"],
  ["value with a clause word before", "image", "mia with morph", "x"],
  ["word after a flag with a clause word after", "image", "mia wait x", "morph"],
  ["word after a flag with a clause word before", "image", "mia wait morph", "x"],
  ["word after a complete clause with a clause word after", "image", "mia with fade x", "morph"],
  ["word after a complete clause with a clause word before", "image", "mia with fade morph", "x"],
  ["audio name with a clause word after", "audio", "play music x", "with"],
  ["audio value with a clause word after", "audio", "play music theme with x", "over"],
  ["audio word after a flag with a clause word after", "audio", "play music theme loop x", "with"],
];

const SEPARATOR_ROWS: Row[] = PUNCTUATION.flatMap((c): Row[] =>
  SEPARATOR_CONTEXTS.map(([context, bracket, before, after]): Row => [
    `${context} ${JSON.stringify(c)}`,
    bracket,
    `${before}${c}${after}${after === "morph" ? " talk" : ""}`,
  ]),
);

const KINDS: readonly (readonly [kind: string, bracket: Bracket, plain: string])[] = [
  ["image", "image", "mia"],
  ["image with a control", "image", "show backdrop mia"],
  ["audio", "audio", "play music theme"],
  ["open (screen)", "image", "open menu"],
  ["close (screen)", "image", "close menu"],
  ["clear (screen)", "image", "clear menu"],
  ["navigate", "image", "navigate main to menu"],
  ["load", "image", "load mia"],
  ["cutscene", "image", "play intro"],
];

const KIND_ROWS: Row[] = KINDS.flatMap(([kind, bracket, plain]): Row[] => {
  const verb = plain.split(" ")[0]!;
  const rest = plain.split(" ").slice(1).join(" ");
  return [
    [`${kind}: plain`, bracket, plain],
    [`${kind}: a value spelled like a clause word`, bracket, `${plain} with wait`],
    [`${kind}: a tag`, bracket, `${plain} # note`],
    [`${kind}: a word after a complete clause`, bracket, `${plain} with fade garbage`],
    [`${kind}: a flag, then a value spelled like a clause word`, bracket, `${plain} wait with over`],
    [`${kind}: opens with a clause word`, bracket, rest ? `${verb} with ${rest}` : `with ${plain}`],
    [`${kind}: opens with a flag`, bracket, rest ? `${verb} wait ${rest}` : `wait ${plain}`],
  ];
});

const CONTROL_ROWS: Row[] = [...DIRECTIVE_CONTROL_WORDS, ...LAYOUT_VERBS].flatMap((control): Row[] => [
  [`control \`${control}\` in an image directive`, "image", `${control} pane mia with fade`],
  [`control \`${control}\` in an audio directive`, "audio", `${control} music theme with echo`],
  [`control \`${control}\` before a clause word`, "image", `${control} with mia`],
  [`control \`${control}\` before a clause word in an audio directive`, "audio", `${control} with theme`],
]);

const CLAUSE_WORD_ROWS: Row[] = DIRECTIVE_CLAUSE_WORDS.flatMap((word): Row[] => [
  [`clause word \`${word}\` in an image directive`, "image", `mia ${word} x`],
  [`clause word \`${word}\` in an audio directive`, "audio", `play music theme ${word} x`],
]);

const DELIMITER_ROWS: Row[] = [
  ["doubled image opener inside a name", "image", "mia[[morph talk"],
  ["doubled audio opener inside a name", "image", "mia((morph talk"],
  ["doubled image opener inside an audio name", "audio", "play music x[[loop"],
  ["doubled audio opener inside an audio name", "audio", "play music x((loop"],
  ["backslash before the image closer", "image", "mia with x\\]] morph talk"],
  ["backslash before the audio closer", "audio", "play music x\\)) loop"],
  ["escaped closer characters", "image", "mia with x\\]\\] morph talk"],
  ["single closer character in a name", "image", "mia]x morph talk"],
  ["single closer character in an audio name", "audio", "play music x)y loop"],
  ["hash attached on the left of a word", "image", "mia# note morph none"],
  ["hash attached on the right of a word", "image", "mia #note morph none"],
  ["hash after a clause value", "image", "mia morph talk#"],
  ["hash attached in an audio directive", "audio", "play music theme# loop"],
  ["two hashes", "image", "mia ## note morph none"],
  ["no-break space inside a clause", "image", "mia morph talk"],
  ["no-break space after a clause value", "image", "mia morph talk wait"],
  ["vertical tab after a clause value", "image", "mia morph talk\u000bwait"],
  ["form feed after a clause value", "image", "mia morph talk\u000cwait"],
  ["em space after a clause value", "image", "mia morph talk wait"],
  ["ideographic space after a clause value", "image", "mia morph talk　wait"],
  ["no-break space in an audio directive", "audio", "play music theme loop"],
  ["tab between words", "image", "mia\tmorph\ttalk"],
  ["several spaces between words", "image", "mia  morph   talk "],
];

const OPENING_ROWS: Row[] = [
  ["image opens with `with`", "image", "with fade"],
  ["image opens with `wait`", "image", "wait"],
  ["image opens with `morph`", "image", "morph talk"],
  ["image opens with `over`", "image", "over 1s"],
  ["audio opens with `with`", "audio", "with echo"],
  ["audio opens with `loop`", "audio", "loop"],
  ["audio opens with `to`", "audio", "to 0.5"],
];

const CLAUSE_ROWS: Row[] = [
  ["with", "image", "mia with fade"],
  ["after and over", "image", "mia after 0.5 over 1s"],
  ["ease", "image", "mia ease linear"],
  ["morph", "image", "mia morph talk"],
  ["morph none", "image", "mia morph none"],
  ["two morph clauses", "image", "mia morph talk morph shout"],
  ["to", "image", "mia to 0.5"],
  ["morph named like a flag", "image", "mia morph wait"],
  ["morph named like a clause word that takes a value", "image", "mia morph over"],
  ["ease named like itself", "image", "mia ease ease"],
  ["after named like a word that takes a value", "image", "mia after morph"],
  ["flags", "image", "mia wait loop once mute unmute now"],
  ["tag before any clause", "image", "mia # note morph none"],
  ["number after a flag", "image", "mia wait 1s"],
  ["empty value", "image", "mia morph"],
  ["empty `with`", "image", "mia with"],
  ["empty `ease`", "image", "mia ease"],
  ["empty audio `with`", "audio", "play music theme with"],
  ["empty value after a value", "image", "mia with fade over"],
  ["value that is not a name", "image", "mia morph = talk"],
  ["clause word as a qualified state", "image", "mia:mouth.morph"],
  ["clause word as a filtered state", "image", "mia~mouth.morph"],
  ["clause after a qualified state", "image", "mia:mouth.morph with fade"],
  ["target and composition", "image", "show backdrop mia + bunny morph talk with fade"],
  ["composition without a control", "image", "mia+bunny morph talk"],
  ["navigate with a clause before `to`", "image", "navigate with main to menu"],
  ["navigate without a destination", "image", "navigate main"],
  ["navigate with `to` and no destination", "image", "navigate main to"],
  ["navigate with a stray word", "image", "navigate main to menu extra"],
  ["clear the textstream", "image", "clear textstream"],
  ["play without a video", "image", "play"],
  ["play two videos", "image", "play intro+outro"],
  ["play with a second name", "image", "play intro outro"],
  ["play with a name after a flag", "image", "play intro loop extra"],
  ["a time that is not a time", "image", "mia after soon"],
  ["a negative volume", "image", "mia to -1"],
  ["a transition that is not a name", "image", "mia with 3"],
  ["a flag with a number", "image", "mia now 2"],
  ["filtered names in a composition", "image", "mia + bunny:mouth.open~eyes.closed"],
  ["audio volume that is not a number", "audio", "fade music theme to loud"],
  ["audio to and over", "audio", "fade music theme to 0.5 over 2s"],
  ["audio flags", "audio", "play music theme loop mute now"],
  ["audio with named like a clause word", "audio", "play music theme loop with over"],
  ["audio tag between words", "audio", "play music theme # note loop"],
];

const ROWS: Row[] = [
  ...CLAUSE_ROWS,
  ...KIND_ROWS,
  ...CONTROL_ROWS,
  ...CLAUSE_WORD_ROWS,
  ...DELIMITER_ROWS,
  ...OPENING_ROWS,
  ...SEPARATOR_ROWS,
];

const directive = (bracket: Bracket, text: string) => (bracket === "image" ? `[[${text}]]` : `((${text}))`);

const lines = ["scene start", ...ROWS.flatMap(([, bracket, text], i) => [`  ${directive(bracket, text)}`, `  Line ${i + 1}.`]), "end", ""];
const source = lines.join("\n");
const lineOf = (i: number) => 1 + i * 2;

const variables = GRAMMAR_DEFINITION.variables as unknown as Record<string, string[]>;
const BRACKET_CONTROLS = [
  ...variables["IMAGE_CONTROL_KEYWORDS"]!,
  ...LAYOUT_VERBS,
  ...variables["LOAD_CONTROL_KEYWORDS"]!,
  ...variables["MOVIE_CONTROL_KEYWORDS"]!,
];
const AUDIO_CONTROLS = variables["AUDIO_CONTROL_KEYWORDS"]!;
interface Reading {
  links: string[];
  pick?: string;
  strays: string[];
  valueErrors: string[];
  flagArguments: string[];
  incompleteNavigate: boolean;
  clearWarning: boolean;
  playArity: boolean;
  unrecognizedControl?: string;
  implicitNames: string[];
}

const empty = (): Reading => ({
  links: [],
  strays: [],
  valueErrors: [],
  flagArguments: [],
  incompleteNavigate: false,
  clearWarning: false,
  playArity: false,
  implicitNames: [],
});

const isName = (text: string) => directiveValueKind(text) === "name";
const isAmount = (text: string) => {
  const kind = directiveValueKind(text);
  return kind === "time" || kind === "number";
};

interface Chunk {
  tag: string;
  control: string;
  target?: string;
  assets: string[];
  clauses: Record<string, unknown>;
}

interface Parsed {
  word: { text: string };
  takesValue: boolean;
  value?: { text: string };
}

function expected(bracket: Bracket, content: string, chunk: Chunk, parsed: readonly Parsed[]): Reading {
  const reading = empty();
  const words = content.split(/[ \t]+/);
  const written = (word: string | undefined) => !!word && words.includes(word);
  const controlWritten = words.filter(Boolean)[0] === chunk.control;
  const target = written(chunk.target) && controlWritten ? chunk.target : undefined;
  const clauses = chunk.clauses;
  const value = (key: string) => (Object.hasOwn(clauses, key) && typeof clauses[key] === "string" ? (clauses[key] as string) : undefined);
  const link = (role: string, text: string) => reading.links.push(`${role}:${text}`);
  const navigate = chunk.tag === "layout" && chunk.control === "navigate";
  const imageNames = () => {
    for (const asset of chunk.assets) {
      const base = asset.split(/[:~]/)[0]!;
      if (!isName(base) || base === "none") continue;
      if (/[:~]/.test(asset) && /^[^:~]+(?:[:~][^:~\s]+)+$/u.test(asset)) link("filtered_image", asset);
      link("filtered_image", base);
    }
  };
  if (chunk.tag === "audio") {
    if (target) link("channel", target);
    for (const asset of chunk.assets) if (isName(asset) && asset !== "none") link("layered_audio", asset);
    const modulation = value("with");
    if (modulation && isName(modulation)) link("modulation", modulation);
  } else {
    if (navigate) {
      if (target) link("screen", target);
      const destination = chunk.assets[0];
      if (destination && isName(destination)) link("layout", destination);
      reading.incompleteNavigate = !destination;
    } else if (chunk.tag === "layout") {
      if (target) link("layout", target);
      imageNames();
    } else if (chunk.tag === "load") {
      if (target) link("load", target);
      for (const asset of chunk.assets) {
        const base = asset.split(/[:~]/)[0]!;
        if (isName(base) && base !== "none") link("load", base);
      }
    } else if (chunk.tag === "cutscene") {
      if (target && !target.includes("+")) link("video", target);
    } else {
      if (target) link("layer", target);
      imageNames();
    }
    const transition = value("with");
    if (transition && isName(transition)) link("transition", transition);
    const ease = value("ease");
    if (ease && isName(ease)) link("ease", ease);
    if (!navigate) reading.implicitNames = chunk.assets.filter((asset) => /[:~]/.test(asset));
  }
  if (chunk.tag === "image" && Object.hasOwn(clauses, "morph")) {
    const pick = clauses["morph"];
    if (pick === undefined) reading.pick = "(missing)";
    else if (pick !== "none") reading.pick = String(pick);
  }
  let last: Parsed | undefined;
  parsed.forEach((clause, index) => {
    const keyword = clause.word.text;
    if (DIRECTIVE_CLAUSE_WORDS.includes(keyword)) {
      last = clause;
      if (DIRECTIVE_FLAG_WORDS.includes(keyword)) {
        const next = parsed[index + 1];
        if (next && !next.takesValue && !DIRECTIVE_CLAUSE_WORDS.includes(next.word.text) && isAmount(next.word.text)) {
          reading.flagArguments.push(`${keyword} ${next.word.text}`);
        }
      }
      if (!clause.takesValue || keyword === "morph" || (navigate && keyword === "to") || (bracket === "audio" && keyword === "ease")) return;
      const given = clause.value?.text;
      if (given === undefined) {
        reading.valueErrors.push(`${keyword}:missing`);
        return;
      }
      const kind = directiveValueKind(given);
      const invalid =
        keyword === "after" || keyword === "over"
          ? kind !== "time" && kind !== "number"
          : keyword === "to"
            ? kind !== "number" || Number(given) < 0
            : kind !== "name";
      if (invalid) reading.valueErrors.push(`${keyword}:invalid`);
      return;
    }
    if (chunk.tag === "cutscene") return;
    if (last && !last.takesValue && isAmount(keyword)) return;
    reading.strays.push(keyword);
  });
  if (chunk.tag === "layout" && controlWritten && chunk.control === "clear") {
    reading.clearWarning = chunk.target !== "textstream";
  }
  if (chunk.tag === "cutscene") {
    const strayName = parsed.some((clause) =>
      clause.takesValue
        ? !["with", "ease"].includes(clause.word.text) && !!clause.value && isName(clause.value.text)
        : !DIRECTIVE_CLAUSE_WORDS.includes(clause.word.text) && isName(clause.word.text),
    );
    reading.playArity = !target || target.includes("+") || chunk.assets.length > 0 || strayName;
  }
  if (controlWritten && !(bracket === "image" ? BRACKET_CONTROLS : AUDIO_CONTROLS).includes(chunk.control)) {
    reading.unrecognizedControl = chunk.control;
  }
  return normalize(reading);
}

const sorted = (list: string[]) => [...new Set(list)].sort();

function normalize(reading: Reading): Reading {
  return {
    ...reading,
    links: sorted(reading.links),
    strays: sorted(reading.strays),
    valueErrors: sorted(reading.valueErrors),
    flagArguments: sorted(reading.flagArguments),
    implicitNames: sorted(reading.implicitNames),
  };
}

const CHOICE_DIRECTIVES: readonly (readonly [label: string, text: string])[] = [
  ["choice brackets", "Go ((a [x] b)) now"],
  ["choice brackets inside braces", "Go ((a {[x]} b)) now"],
  ["a long-string bracket", "Go ((a {[[a]]} b)) now"],
  ["a levelled long-string bracket", "Go ((a {[=[a]=]} b)) now"],
  ["a long comment bracket", "Go ((a {1 --[[c]] + 1} b)) now"],
  ["an indexing bracket", "Go ((a {t[1]} b)) now"],
  ["a comment after the choice brackets", "Go ((a [x] /* c */ b)) now"],
  ["clauses after the choice brackets", "Go ((play music theme [x] loop)) now"],
  ["an image directive after the choice brackets", "Go [x] [[mia {t[1]} morph talk]] now"],
  ["a directive closed before the choice brackets", "Go ((a b)) [x] now"],
  ["a directive closed inside the choice brackets", "Go ((a [b)) c] d"],
  ["a directive closed both inside and after the choice brackets", "Go ((a [x)) y] z)) now"],
  ["a closer inside a tag after the choice brackets", "Go ((a [x] # note)) now"],
];

const UNREAD_CHOICE_DIRECTIVES = ["a closer inside a tag after the choice brackets"];

const CHOICE_ROWS: (readonly [label: string, text: string])[] = CHOICE_DIRECTIVES.flatMap(([label, text]) => [
  [label, text] as const,
  [`${label}, with a divert`, `${text} -> next`] as const,
]);

const CHOICE_LINE = 2;

const choiceSource = (text: string) =>
  ["scene start", "  choose", `    + ${text}`, "      Body.", "      done", "  end", "end", "scene next", "  Next.", "  done", "end", ""].join("\n");

function compilerReadingsOf(text: string, keep: (line: number, from: number) => boolean): Map<number, Reading> {
  const readings = new Map<number, Reading>();
  const documents = new SparkdownDocumentRegistry(["references", "implicits"]);
  documents.set({ textDocument: { uri: MAIN_URI, text, version: 1, languageId: "sparkdown" } });
  const doc = documents.get(MAIN_URI)!;
  const reading = (line: number) => {
    let found = readings.get(line);
    if (!found) readings.set(line, (found = empty()));
    return found;
  };
  const annotations = documents.annotations(MAIN_URI);
  const references = annotations.references.iter();
  while (references.value) {
    const ref = references.value.type as any;
    const types: string[] = ref.selectors?.[0]?.types ?? [];
    const role = ref.usage === "divert" ? "load" : types[0];
    const line = doc.positionAt(references.from).line;
    if (role && keep(line, references.from)) reading(line).links.push(`${role}:${doc.read(references.from, references.to)}`);
    references.next();
  }
  const implicits = annotations.implicits.iter();
  while (implicits.value) {
    const line = doc.positionAt(implicits.from).line;
    if (implicits.value.type === "filtered_image" && keep(line, implicits.from)) reading(line).implicitNames.push(doc.read(implicits.from, implicits.to));
    implicits.next();
  }
  const { program } = compileUI(text);
  for (const diagnostic of (program.diagnostics?.[MAIN_URI] ?? []) as any[]) {
    const line = diagnostic.range.start.line;
    if (!keep(line, doc.offsetAt(diagnostic.range.start))) continue;
    const message: string = typeof diagnostic.message === "string" ? diagnostic.message : diagnostic.message.value;
    const at = doc.read(doc.offsetAt(diagnostic.range.start), doc.offsetAt(diagnostic.range.end));
    const zeroWidth = diagnostic.range.start.line === diagnostic.range.end.line && diagnostic.range.start.character === diagnostic.range.end.character;
    if (message.startsWith("No morph named")) reading(line).pick = at;
    else if (message.startsWith("`morph` needs the name")) reading(line).pick = "(missing)";
    else if (message.startsWith("Write the morph's name")) reading(line).pick = at;
    else if (/ is not (?:a clause|part of a clause)/.test(message)) reading(line).strays.push(at);
    else if (/should be followed by/.test(message)) {
      reading(line).valueErrors.push(`${message.match(/^`([^`]+)`/)?.[1] ?? "?"}:${zeroWidth ? "missing" : "invalid"}`);
    } else if (/is a flag and cannot take an argument/.test(message)) reading(line).flagArguments.push(at.split(/[ \t]+/).join(" "));
    else if (message.startsWith("Incomplete `navigate`")) reading(line).incompleteNavigate = true;
    else if (message.startsWith("Only textstream has a page to clear")) reading(line).clearWarning = true;
    else if (message.startsWith("`play` takes one video name")) reading(line).playArity = true;
    else if (message.startsWith("Unrecognized")) reading(line).unrecognizedControl = at;
  }
  for (const [line, found] of readings) readings.set(line, normalize(found));
  return readings;
}

interface Seen {
  bracket: Bracket;
  content: string;
  chunk: Chunk;
  parsed: Parsed[];
}

function spyOnChunks(harness: ReturnType<typeof createHarness>): Seen[] {
  const interpreter = (harness.game.module as any).interpreter;
  let parsed: Parsed[] = [];
  const clauseValues = interpreter.assetClauseValues.bind(interpreter);
  interpreter.assetClauseValues = (clauses: Parsed[]) => {
    parsed = [...clauses];
    return clauseValues(clauses);
  };
  const seen: Seen[] = [];
  for (const name of ["createImageChunk", "createAudioChunk", "createLoadChunk", "createLayoutChunk", "createCutsceneChunk"]) {
    const original = interpreter[name].bind(interpreter);
    interpreter[name] = (content: string) => {
      parsed = [];
      const chunk = original(content);
      seen.push({ bracket: name === "createAudioChunk" ? "audio" : "image", content, chunk, parsed });
      return chunk;
    };
  }
  return seen;
}

const readingOf = (found: Seen) => expected(found.bracket, found.content, found.chunk, found.parsed);

const compilerReadings = new Map<number, Reading>();
const interpreterReadings = new Map<number, Reading>();
const choiceCompilerReadings = new Map<string, Reading>();
const choiceInterpreterReadings = new Map<string, Reading>();

beforeAll(async () => {
  for (const [line, found] of compilerReadingsOf(source, (line) => line % 2 === 1)) compilerReadings.set(line, found);
  const harness = createHarness(source);
  await harness.ready;
  const seen = spyOnChunks(harness);
  for (let i = 0; i < ROWS.length; i += 1) {
    const before = seen.length;
    await harness.preview(lineOf(i));
    const found = seen[before];
    if (found) interpreterReadings.set(lineOf(i), readingOf(found));
  }

  for (const [label, text] of CHOICE_ROWS) {
    const rowSource = choiceSource(text);
    const divertAt = rowSource.indexOf(" -> ");
    const found = compilerReadingsOf(rowSource, (line, from) => line === CHOICE_LINE && (divertAt < 0 || from < divertAt)).get(CHOICE_LINE);
    if (found) choiceCompilerReadings.set(label, found);
    const rowHarness = createHarness(rowSource);
    await rowHarness.ready;
    const rowSeen = spyOnChunks(rowHarness);
    await rowHarness.preview(0);
    if (rowHarness.game.story.currentChoices.length !== 1) continue;
    rowHarness.game.story.ChooseChoiceIndex(0);
    rowHarness.nextBeat();
    if (rowSeen.length > 0) choiceInterpreterReadings.set(label, merged(rowSeen.map(readingOf)));
  }
});

function merged(readings: readonly Reading[]): Reading {
  const all = empty();
  for (const reading of readings) {
    all.links.push(...reading.links);
    all.strays.push(...reading.strays);
    all.valueErrors.push(...reading.valueErrors);
    all.flagArguments.push(...reading.flagArguments);
    all.implicitNames.push(...reading.implicitNames);
    all.incompleteNavigate ||= reading.incompleteNavigate;
    all.clearWarning ||= reading.clearWarning;
    all.playArity ||= reading.playArity;
    if (all.pick === undefined && reading.pick !== undefined) all.pick = reading.pick;
    if (all.unrecognizedControl === undefined && reading.unrecognizedControl !== undefined) all.unrecognizedControl = reading.unrecognizedControl;
  }
  return normalize(all);
}

describe("every editor reader of a directive agrees with the interpreter's chunk (I-2112)", () => {
  test("the table holds every row", () => {
    expect(ROWS.length).toBe(
      CLAUSE_ROWS.length +
        KIND_ROWS.length +
        CONTROL_ROWS.length +
        CLAUSE_WORD_ROWS.length +
        DELIMITER_ROWS.length +
        OPENING_ROWS.length +
        PUNCTUATION.length * SEPARATOR_CONTEXTS.length,
    );
  });

  test.each(ROWS.map(([label, bracket, text], i) => [label, directive(bracket, text), i] as const))("%s: `%s`", (_label, _text, i) => {
    const line = lineOf(i);
    expect(compilerReadings.get(line) ?? empty()).toStrictEqual(interpreterReadings.get(line) ?? empty());
  });
});

describe("every editor reader of a directive in a choice line agrees with the chunk the story hands the interpreter (I-2225)", () => {
  test("the interpreter reads a directive on every row but those whose closer the story sends as a tag", () => {
    const unread = CHOICE_ROWS.filter(([label]) => !choiceInterpreterReadings.has(label)).map(([label]) => label);
    expect(unread).toEqual(UNREAD_CHOICE_DIRECTIVES.flatMap((label) => [label, `${label}, with a divert`]));
  });

  test.each(CHOICE_ROWS.map(([label, text]) => [label, text] as const))("%s: `+ %s`", (label) => {
    expect(choiceCompilerReadings.get(label) ?? empty()).toStrictEqual(choiceInterpreterReadings.get(label) ?? empty());
  });
});

const CROSS_BRACKET_CHOICE_DIRECTIVES = [
  "choice brackets",
  "choice brackets inside braces",
  "a long-string bracket",
  "a levelled long-string bracket",
  "a long comment bracket",
  "an indexing bracket",
  "a comment after the choice brackets",
  "clauses after the choice brackets",
  "a directive closed inside the choice brackets",
  "a directive closed both inside and after the choice brackets",
  "a closer inside a tag after the choice brackets",
];

const COLOURED_ROLES: Readonly<Record<string, string>> = {
  AssetCommandControl: "control",
  AssetCommandTarget: "target",
  AssetCommandName: "name",
  AssetCommandClauseKeyword: "clause",
  AssetCommandClauseValue: "value",
};

type Coloured = readonly [from: number, word: string];

const inOrder = (words: Coloured[]) => words.sort((a, b) => a[0] - b[0]).map(([, word]) => word);

function gameColouring(directive: SourceDirective): string[] {
  const words: Coloured[] = [];
  const colour = (role: string, word: { from: number; text: string }) => words.push([word.from, `${role} ${word.text}`]);
  if (directive.control) colour("control", directive.control);
  if (directive.target) colour("target", directive.target);
  if (directive.kind === "layout" && directive.control?.text === "navigate") {
    const to = directive.words[directive.target ? 2 : 1];
    if (to?.text === "to") colour("clause", to);
  }
  if (directive.destination) colour("value", directive.destination);
  for (const name of directive.names) colour("name", name);
  for (const clause of directive.clauses) {
    colour(DIRECTIVE_CLAUSE_WORDS.includes(clause.word.text) ? "clause" : "value", clause.word);
    if (clause.value) colour("value", clause.value);
  }
  return inOrder(words);
}

const parser = createSparkdownParser();

function colouringOf(text: string, from: number, to: number) {
  const tree = parser.parse(text);
  const words: Coloured[] = [];
  tree.iterate({
    from,
    to,
    enter: (node) => {
      if (node.to <= from || node.from >= to) return false;
      const role = Object.hasOwn(COLOURED_ROLES, node.name) ? COLOURED_ROLES[node.name] : undefined;
      if (!role) return undefined;
      words.push([node.from, `${role} ${text.slice(node.from, node.to)}`]);
      return false;
    },
  });
  const games = readSourceDirectives(tree, (a, b) => text.slice(a, b))
    .filter((directive) => directive.from >= from && directive.from < to)
    .map(gameColouring);
  return { grammar: inOrder(words), games };
}

const lineStarts = lines.map((_, i) => lines.slice(0, i).reduce((at, line) => at + line.length + 1, 0));

describe("the grammar colours every directive word as the game reads it (I-2224)", () => {
  test.each(ROWS.map(([label, bracket, text], i) => [label, directive(bracket, text), i] as const))("%s: `%s`", (_label, _text, i) => {
    const line = lineOf(i);
    const { grammar, games } = colouringOf(source, lineStarts[line]!, lineStarts[line]! + lines[line]!.length);
    expect(grammar).toEqual(games.flat());
  });

  test("the VS Code grammar colours the table as the editor's tree does", async () => {
    expect(await compareEngines(source)).toEqual([]);
  });

  test.each(CHOICE_ROWS.map(([label, text]) => [label, text] as const))("%s: `+ %s`", async (label, text) => {
    const rowSource = choiceSource(text);
    const lineFrom = rowSource.indexOf("    + ");
    const divertAt = rowSource.indexOf(" -> ");
    const lineTo = divertAt >= 0 ? divertAt : rowSource.indexOf("\n", lineFrom);
    const { grammar, games } = colouringOf(rowSource, lineFrom, lineTo);
    const agrees = games.length === 0 ? grammar.length === 0 : games.some((game) => JSON.stringify(game) === JSON.stringify(grammar));
    const crossesBracket = CROSS_BRACKET_CHOICE_DIRECTIVES.some((shape) => label === shape || label === `${shape}, with a divert`);
    expect({ grammar, games, agrees }).toEqual({ grammar, games, agrees: !crossesBracket });
    expect(await compareEngines(rowSource)).toEqual([]);
  });
});
