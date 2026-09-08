import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { describe, expect, it } from "vitest";
import { getHover } from "../../utils/providers/getHover";

describe("attribute directive hover", () => {
  it.each([3, 7])("previews the full attribute selection at column %i", async (character) => {
    const uri = "file:///hover.sd";
    const documents = new SparkdownDocumentRegistry(["references"]);
    documents.set({ textDocument: { uri, text: "[[mia:hat]]", version: 1, languageId: "sparkdown" } });
    const program = { context: {
      image: { mia: { $type: "image", $name: "mia", ext: "svg", data: '<svg xmlns="http://www.w3.org/2000/svg"><g data-name="hat.on" id="hat-layer"/></svg>' } },
      filtered_image: {
        mia: { $type: "filtered_image", $name: "mia", image: { $type: "image", $name: "mia" }, attributes: [] },
        "mia~hat": { $type: "filtered_image", $name: "mia~hat", image: { $name: "mia" }, attributes: ["hat"] },
      },
    } } as any;
    const hover = await getHover(documents.get(uri), documents.annotations(uri), program, undefined, { line: 0, character });
    expect(JSON.stringify(hover)).toContain("hat-layer");
  });
});
