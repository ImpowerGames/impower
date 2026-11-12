import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { readImageClauses } from "@impower/sparkdown/src/compiler/morph/morphClause";
import { beforeAll, describe, expect, test } from "vitest";
import { createHarness } from "../ui/harness/uiTestHarness";

const DIRECTIVES = [
  ["plain", "mia"],
  ["with", "mia with fade"],
  ["after and over", "mia after 0.5 over 1s"],
  ["ease", "mia ease linear"],
  ["morph", "mia morph talk"],
  ["to", "mia to 0.5"],
  ["morph named like a flag", "mia morph wait"],
  ["morph named like a clause word that takes a value", "mia morph over"],
  ["with named like a flag", "mia with wait"],
  ["ease named like itself", "mia ease ease"],
  ["after named like a word that takes a value", "mia after morph"],
  ["flags", "mia wait loop once mute unmute now"],
  ["flag then clause", "mia wait with fade"],
  ["tag after a clause", "mia morph talk # note"],
  ["word after a complete clause", "mia morph talk gritted"],
  ["word after a flag", "mia wait garbage"],
  ["number after a flag", "mia wait 1s"],
  ["empty value", "mia morph"],
  ["empty value after a value", "mia with fade over"],
  ["value that is not a name", "mia morph = talk"],
  ["target and composition", "show portrait mia + bunny morph talk with fade"],
] as const;

const source = `scene start
${DIRECTIVES.map(([, directive], i) => `  [[${directive}]]\n  Line ${i + 1}.`).join("\n")}
end
`;

let groups: string[][][] = [];
let inputs: string[] = [];
let interpreter: any;

beforeAll(async () => {
  const documents = new SparkdownDocumentRegistry(["references"]);
  const uri = "file:///clauses.sd";
  documents.set({ textDocument: { uri, text: source, version: 1, languageId: "sparkdown" } });
  groups = readImageClauses(documents.tree(uri)!, (from, to) => source.slice(from, to)).map((clauses) => clauses.groups);
  const harness = createHarness(source);
  await harness.ready;
  interpreter = (harness.game.module as any).interpreter;
  const seen: string[] = [];
  const original = interpreter.createImageChunk.bind(interpreter);
  interpreter.createImageChunk = (content: string) => {
    seen.push(content);
    return original(content);
  };
  const lines = source.split("\n");
  for (const [, directive] of DIRECTIVES) {
    const before = seen.length;
    await harness.preview(lines.indexOf(`  [[${directive}]]`));
    inputs.push(seen[before] ?? "");
  }
});

describe("the compiler's reading of a directive's clauses equals the interpreter's (I-2112)", () => {
  test("every directive reaches both readings", () => {
    expect(groups).toHaveLength(DIRECTIVES.length);
    expect(inputs).toHaveLength(DIRECTIVES.length);
  });

  test.each(DIRECTIVES.map(([label, directive], i) => [label, directive, i] as const))("%s: `[[%s]]`", (_label, _directive, i) => {
    const chunk = interpreter.createAssetChunk(inputs[i], "image", "show", undefined);
    const compiler = Object.assign({}, ...groups[i]!.map((group) => interpreter.parseAssetClauses(group)));
    expect(compiler).toEqual(chunk.clauses);
  });
});
