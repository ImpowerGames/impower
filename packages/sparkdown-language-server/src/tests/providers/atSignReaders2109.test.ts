import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { describe, expect, it } from "vitest";
import { compileFindPattern } from "../../utils/providers/findWorkspaceText";
import { getDocumentColors } from "../../utils/providers/getDocumentColors";
import { compileProject } from "./completionHarness";

const URI = "file:///proj/main.sd";

describe("readers of @ names in the language server (#2109)", { timeout: 60000 }, () => {
  it("finds a whole word without matching inside an @ name", () => {
    const pattern = compileFindPattern({ query: "night", wholeWord: true, matchCase: false, regex: false } as never);
    expect(pattern).toBeInstanceOf(RegExp);
    const text = "mia@night night night@mia";
    expect([...text.matchAll(pattern as RegExp)].map((match) => match.index)).toEqual([10]);
    const whole = compileFindPattern({ query: "mia@night", wholeWord: true, matchCase: false, regex: false } as never);
    expect([...text.matchAll(whole as RegExp)].map((match) => match.index)).toEqual([0]);
  });

  it("shows the color of a named color whose name holds an @", () => {
    const script = `define red@night as color with
  value = "#ff0000"
end

style card {
  background-color = red@night
}

scene start
end
`;
    const program = compileProject(script);
    const documents = new SparkdownDocumentRegistry(["colors"]);
    documents.set({ textDocument: { uri: URI, text: script, version: 1, languageId: "sparkdown" } });
    const colors = getDocumentColors(documents.get(URI), documents.annotations(URI), program);
    const named = colors.find((info) => info.range.start.line === 5);
    expect(named?.color).toEqual({ red: 1, green: 0, blue: 0, alpha: 1 });
  });
});
