import { describe, expect, it } from "vitest";
import { SparkdownDocumentRegistry } from "../../compiler/classes/SparkdownDocumentRegistry";
import { endsDialogueBlock } from "../../compiler/utils/endsDialogueBlock";

const URI = "file:///cue.sd";

const parsedCueClaims = (cueIndent: string, line: string): boolean => {
  const script = `scene start\n${cueIndent}IMANI:\n${cueIndent}  Hello.\n${line}\nend\n`;
  const documents = new SparkdownDocumentRegistry(["declarations"]);
  documents.set({
    textDocument: { uri: URI, text: script, version: 1, languageId: "sparkdown" },
  });
  const tree = documents.tree(URI)!;
  const lineStart = script.indexOf(`\n${line}\n`) + 1;
  const content = lineStart + (line.length - line.trimStart().length);
  let claimed = false;
  tree.iterate({
    enter: (node) => {
      if (node.name === "BlockDialogue" && node.from < content && content < node.to) {
        claimed = true;
      }
    },
  });
  return claimed;
};

const CASES: [cueIndent: string, line: string, ends: boolean][] = [
  ["  ", "    Deeper narration.", false],
  ["  ", "    end", false],
  ["  ", "    (whispering)", false],
  ["  ", "  Same indent.", true],
  ["  ", "Less indent.", true],
  ["  ", "    & x = 1", true],
  ["  ", "    % y = 2", true],
  ["  ", "    $ z = 3", true],
  ["  ", "    ^ jump", true],
  ["  ", "    -> elsewhere", true],
  ["  ", "    * Option", true],
  ["  ", "    + Option", true],
  ["  ", "    *bold* line", false],
  ["  ", "    scene other", true],
  ["  ", "    branch other", true],
  ["  ", "    function f()", true],
  ["  ", "    define x as character", true],
  ["  ", "    const x = 1", true],
  ["  ", "    store x = 1", true],
  ["  ", "    local x = 1", true],
  ["  ", "    scenery is lovely", false],
  ["  ", "// a note", false],
  ["\t", "\t\tDeeper narration.", false],
  ["\t", "\t\t& x = 1", true],
];

describe("endsDialogueBlock, built from the generated grammar's BlockDialogue end rule", () => {
  it.each(CASES)(
    "with a cue at %j, %j ends the cue: %s",
    (cueIndent, line, ends) => {
      expect(endsDialogueBlock(line, cueIndent)).toBe(ends);
    },
  );

  it.each(CASES)(
    "agrees with the parser on whether a cue at %j claims %j",
    (cueIndent, line) => {
      expect(parsedCueClaims(cueIndent, line)).toBe(!endsDialogueBlock(line, cueIndent));
    },
  );

  it("refuses an indent that is not whitespace", () => {
    expect(() => endsDialogueBlock("x", "a")).toThrow();
  });
});
