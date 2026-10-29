import { describe, expect, test } from "vitest";
import { printTree } from "@impower/textmate-grammar-tree/src/tree/utils/printTree";
import { testCompiler, testStory } from "../engineUnderTest";

const SRC = `-> main

scene main
  choose
  + [A]
    Body A.
  + [B]
    Body B.
  then
    ## FinalImage
    [[show backdrop bg]]
    Action after the choice.
    -> next
  end
end

scene next
  Done.
  done
end
`;

describe("choose…then…end tag body", () => {
  test("a `##` tag line in the then-body parses as a Tag and runs", () => {
    const compiler = testCompiler();
    compiler.configure({
      files: [
        {
          uri: "inmemory:///main.sd",
          type: "script",
          name: "main",
          ext: "sd",
          text: SRC,
          version: 1,
          languageId: "sparkdown",
        } as any,
      ],
    });
    const result = compiler.compile({
      textDocument: { uri: "inmemory:///main.sd" },
    });

    let errors = 0;
    for (const ds of Object.values(result.program.diagnostics ?? {})) {
      for (const d of ds as any[]) if (d?.severity === 1) errors++;
    }
    expect(errors).toBe(0);
    expect(result.program.chunks).toBeDefined();

    const docs: any = (compiler as any).documents;
    const tree = String(
      printTree(docs.tree("inmemory:///main.sd"), docs.get("inmemory:///main.sd")),
    );
    expect(tree).toContain("FinalImage");
    expect(tree).toContain("Tag");

    const story = testStory(result.program.chunks);
    const rtErrors: string[] = [];
    story.onError = (m: string) => rtErrors.push(m);
    story.ContinueMaximally();
    story.ChooseChoiceIndex(0);
    const out = story.ContinueMaximally();
    expect(rtErrors).toEqual([]);
    expect(out).toContain("Action after the choice.");
    expect(out).toContain("Done.");
  });
});
