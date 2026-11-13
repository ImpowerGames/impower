import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { readDirectiveClauses } from "@impower/sparkdown/src/compiler/morph/morphClause";
import { beforeAll, describe, expect, test } from "vitest";
import { createHarness } from "../ui/harness/uiTestHarness";

type Bracket = "image" | "audio";
type Row = readonly [label: string, bracket: Bracket, text: string];

const PUNCTUATION = [..."!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~"];

const SEPARATOR_ROWS: Row[] = PUNCTUATION.flatMap((c): Row[] => [
  [`name with a clause word after ${JSON.stringify(c)}`, "image", `mia${c}morph`],
  [`name with a clause word before ${JSON.stringify(c)}`, "image", `morph${c}x`],
  [`value with a clause word after ${JSON.stringify(c)}`, "image", `mia with x${c}morph`],
  [`value with a clause word before ${JSON.stringify(c)}`, "image", `mia with morph${c}x`],
  [`audio name with a clause word after ${JSON.stringify(c)}`, "audio", `play music x${c}with`],
  [`audio value with a clause word after ${JSON.stringify(c)}`, "audio", `play music theme with x${c}over`],
]);

const KINDS: readonly (readonly [kind: string, bracket: Bracket, plain: string])[] = [
  ["image", "image", "mia"],
  ["image with a control", "image", "show portrait mia"],
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
  ["to", "image", "mia to 0.5"],
  ["morph named like a flag", "image", "mia morph wait"],
  ["morph named like a clause word that takes a value", "image", "mia morph over"],
  ["ease named like itself", "image", "mia ease ease"],
  ["after named like a word that takes a value", "image", "mia after morph"],
  ["flags", "image", "mia wait loop once mute unmute now"],
  ["tag before any clause", "image", "mia # note morph none"],
  ["number after a flag", "image", "mia wait 1s"],
  ["empty value", "image", "mia morph"],
  ["empty value after a value", "image", "mia with fade over"],
  ["value that is not a name", "image", "mia morph = talk"],
  ["clause word as a qualified state", "image", "mia:mouth.morph"],
  ["clause word as a filtered state", "image", "mia~mouth.morph"],
  ["clause after a qualified state", "image", "mia:mouth.morph with fade"],
  ["target and composition", "image", "show portrait mia + bunny morph talk with fade"],
  ["audio to and over", "audio", "fade music theme to 0.5 over 2s"],
  ["audio flags", "audio", "play music theme loop mute now"],
  ["audio with named like a clause word", "audio", "play music theme loop with over"],
  ["audio tag between words", "audio", "play music theme # note loop"],
];

const ROWS: Row[] = [...CLAUSE_ROWS, ...KIND_ROWS, ...OPENING_ROWS, ...SEPARATOR_ROWS];

const directive = (bracket: Bracket, text: string) => (bracket === "image" ? `[[${text}]]` : `((${text}))`);

const lines = ["scene start", ...ROWS.flatMap(([, bracket, text], i) => [`  ${directive(bracket, text)}`, `  Line ${i + 1}.`]), "end", ""];
const source = lines.join("\n");
const lineOf = (i: number) => 1 + i * 2;

interface Reading {
  clauses: Record<string, unknown>;
  destination?: unknown;
}

const compilerReadings = new Map<number, Reading>();
const interpreterReadings = new Map<number, Reading>();
let interpreter: any;

const lineAt = (offset: number) => source.slice(0, offset).split("\n").length - 1;

beforeAll(async () => {
  const documents = new SparkdownDocumentRegistry(["references"]);
  const uri = "file:///clauses.sd";
  documents.set({ textDocument: { uri, text: source, version: 1, languageId: "sparkdown" } });
  const harness = createHarness(source);
  await harness.ready;
  interpreter = (harness.game.module as any).interpreter;
  for (const read of readDirectiveClauses(documents.tree(uri)!, (from, to) => source.slice(from, to))) {
    const navigate = read.control === "navigate";
    const groups = navigate && read.groups[0]?.[0] === "to" ? read.groups.slice(1) : read.groups;
    const reading: Reading = { clauses: Object.assign({}, ...groups.map((group) => interpreter.parseAssetClauses(group))) };
    if (navigate) reading.destination = read.groups[0]?.[0] === "to" ? read.groups[0][1] : undefined;
    compilerReadings.set(lineAt(read.directive.from), reading);
  }
  const seen: { name: string; chunk: any }[] = [];
  for (const name of ["createImageChunk", "createAudioChunk", "createLoadChunk", "createLayoutChunk", "createCutsceneChunk"]) {
    const original = interpreter[name].bind(interpreter);
    interpreter[name] = (content: string) => {
      const chunk = original(content);
      seen.push({ name, chunk });
      return chunk;
    };
  }
  for (let i = 0; i < ROWS.length; i += 1) {
    const before = seen.length;
    await harness.preview(lineOf(i));
    const found = seen[before];
    if (!found) continue;
    const navigate = found.chunk.control === "navigate";
    interpreterReadings.set(lineOf(i), {
      clauses: { ...(found.chunk.clauses ?? {}) },
      ...(navigate ? { destination: found.chunk.assets?.[0] || undefined } : {}),
    });
  }
});

describe("the compiler's reading of a directive's clauses equals the interpreter's (I-2112)", () => {
  test("the table holds every row", () => {
    expect(ROWS.length).toBe(CLAUSE_ROWS.length + KIND_ROWS.length + OPENING_ROWS.length + PUNCTUATION.length * 6);
  });

  test.each(ROWS.map(([label, bracket, text], i) => [label, directive(bracket, text), i] as const))("%s: `%s`", (_label, _text, i) => {
    const compiler = compilerReadings.get(lineOf(i));
    const game = interpreterReadings.get(lineOf(i));
    expect(compiler === undefined, "both read a directive here, or neither does").toBe(game === undefined);
    if (compiler && game) expect(compiler).toStrictEqual(game);
  });
});
