import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { readDirectiveClauses } from "@impower/sparkdown/src/compiler/morph/morphClause";
import { beforeAll, describe, expect, test } from "vitest";
import { createHarness } from "../ui/harness/uiTestHarness";

type Kind = "image" | "audio";

const DIRECTIVES: readonly (readonly [string, Kind, string])[] = [
  ["plain", "image", "mia"],
  ["with", "image", "mia with fade"],
  ["after and over", "image", "mia after 0.5 over 1s"],
  ["ease", "image", "mia ease linear"],
  ["morph", "image", "mia morph talk"],
  ["to", "image", "mia to 0.5"],
  ["morph named like a flag", "image", "mia morph wait"],
  ["morph named like a clause word that takes a value", "image", "mia morph over"],
  ["with named like a flag", "image", "mia with wait"],
  ["ease named like itself", "image", "mia ease ease"],
  ["after named like a word that takes a value", "image", "mia after morph"],
  ["flags", "image", "mia wait loop once mute unmute now"],
  ["flag then clause", "image", "mia wait with fade"],
  ["tag after a clause", "image", "mia morph talk # note"],
  ["tag before any clause", "image", "mia # note morph none"],
  ["tag alone", "image", "mia # note"],
  ["word after a complete clause", "image", "mia morph talk gritted"],
  ["word after a flag", "image", "mia wait garbage"],
  ["number after a flag", "image", "mia wait 1s"],
  ["empty value", "image", "mia morph"],
  ["empty value after a value", "image", "mia with fade over"],
  ["value that is not a name", "image", "mia morph = talk"],
  ["clause word inside a hyphenated name", "image", "mia-morph"],
  ["clause after a hyphenated name", "image", "mia-morph with fade"],
  ["target and composition", "image", "show portrait mia + bunny morph talk with fade"],
  ["audio with", "audio", "play music theme with echo"],
  ["audio to and over", "audio", "fade music theme to 0.5 over 2s"],
  ["audio flags", "audio", "play music theme loop mute now"],
  ["audio word after a flag", "audio", "theme wait garbage"],
  ["audio word after a value", "audio", "theme with echo garbage"],
  ["audio with named like a clause word", "audio", "play music theme loop with over"],
  ["audio tag", "audio", "play music theme # note loop"],
];

const directive = (kind: Kind, text: string) => (kind === "image" ? `[[${text}]]` : `((${text}))`);

const source = `scene start
${DIRECTIVES.map(([, kind, text], i) => `  ${directive(kind, text)}\n  Line ${i + 1}.`).join("\n")}
end
`;

let groups: string[][][] = [];
let inputs: string[] = [];
let interpreter: any;

beforeAll(async () => {
  const documents = new SparkdownDocumentRegistry(["references"]);
  const uri = "file:///clauses.sd";
  documents.set({ textDocument: { uri, text: source, version: 1, languageId: "sparkdown" } });
  groups = readDirectiveClauses(documents.tree(uri)!, (from, to) => source.slice(from, to)).map((clauses) => clauses.groups);
  const harness = createHarness(source);
  await harness.ready;
  interpreter = (harness.game.module as any).interpreter;
  const seen: string[] = [];
  for (const name of ["createImageChunk", "createAudioChunk"]) {
    const original = interpreter[name].bind(interpreter);
    interpreter[name] = (content: string) => {
      seen.push(content);
      return original(content);
    };
  }
  const lines = source.split("\n");
  for (const [, kind, text] of DIRECTIVES) {
    const before = seen.length;
    await harness.preview(lines.indexOf(`  ${directive(kind, text)}`));
    inputs.push(seen[before] ?? "");
  }
});

describe("the compiler's reading of a directive's clauses equals the interpreter's (I-2112)", () => {
  test("every directive reaches both readings", () => {
    expect(groups).toHaveLength(DIRECTIVES.length);
    expect(inputs.filter(Boolean)).toHaveLength(DIRECTIVES.length);
  });

  test.each(DIRECTIVES.map(([label, kind, text], i) => [label, directive(kind, text), kind, i] as const))("%s: `%s`", (_label, _text, kind, i) => {
    const chunk = interpreter.createAssetChunk(inputs[i], kind, kind === "image" ? "show" : "play", undefined);
    const compiler = Object.assign({}, ...groups[i]!.map((group) => interpreter.parseAssetClauses(group)));
    expect(compiler).toEqual(chunk.clauses);
  });
});
