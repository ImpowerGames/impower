import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { describe, expect, it } from "vitest";
import { getHover } from "../../utils/providers/getHover";
import { formatSource } from "../formatter/formatSource";

let version = 0;

const hoverAt = async (text: string, index: number) => {
  const uri = `file:///conditional-set${++version}.sd`;
  const documents = new SparkdownDocumentRegistry(["references"]);
  documents.set({ textDocument: { uri, text, version, languageId: "sparkdown" } });
  const document = documents.get(uri)!;
  const hover = await getHover(document, documents.tree(uri), documents.annotations(uri), undefined, undefined, document.positionAt(index));
  return hover ? (hover.contents as { value: string }).value : null;
};

describe("a story match or plural read after its value", () => {
  it.each([
    ["a bare name", "match mood | happy = cycle | A. | B. end | other = C. end"],
    ["a string", 'match "very happy" | happy = cycle | A. | B. end | other = C. end'],
  ])("explains option-start nesting in an arm of a one-line set whose value is %s", async (_, text) => {
    const inner = await hoverAt(text, text.indexOf("cycle") + 1);
    expect(inner).toContain("starts an option of the `match` around it");
    expect(await hoverAt(text, 1)).not.toContain("starts an option of");
  });

  it("explains option-start nesting in an arm of a multi-line set", async () => {
    const text = 'match "very happy"\n| happy = cycle | A. | B. end\n| other = C.\nend';
    expect(await hoverAt(text, text.indexOf("cycle") + 1)).toContain("starts an option of the `match` around it");
  });

  it.each([
    "scene start\n  match mood | happy = A. | other = B. end\nend\n",
    'scene start\n  match "very happy" | other = B. end\nend\n',
    "scene start\n  plural .5 | one = A. | other = B. end\nend\n",
    "scene start\n  match [[a | b]]\n    | other = B.\n  end\nend\n",
    "scene start\n  match mood -- a | b\n    | happy = A.\n  end\nend\n",
  ])("formats %j as written", (source) => {
    expect(formatSource(source)).toBe(source);
  });
});
