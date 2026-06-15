// A `choose … then … end` gather body is ordinary scene content and can
// contain `#`/`##` section tags (and `[[…]]` annotations). The choose-block
// and then-clause grammar rules originally lacked `#Annotation`, so a
// standalone tag line in the body couldn't be consumed — the parser spun on
// empty matches ("[ScopedRule:LuauSparkdownChooseThenClause] Too many
// consecutive empty matches … Possible infinite loop!"), surfacing in the
// editor on the real R&B port (`## FinalImage`, `## BadGuysCloseIn`).
//
// This guards that a tag line in a then-body is recognized as a `Tag`
// (not swallowed/unparsed) and that the block still compiles + runs.

import { describe, expect, test } from "vitest";
import { printTree } from "@impower/textmate-grammar-tree/src/tree/utils/printTree";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { Story as RuntimeStory } from "../../inkjs/engine/Story";

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
    const compiler = new SparkdownCompiler();
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
    expect((result.program as any).compiled).toBeDefined();

    // The `##` line is recognized as a Tag (not left unparsed).
    const docs: any = (compiler as any).documents;
    const tree = String(
      printTree(docs.tree("inmemory:///main.sd"), docs.get("inmemory:///main.sd")),
    );
    expect(tree).toContain("FinalImage");
    expect(tree).toContain("Tag");

    // And picking a choice runs the then-body to the divert (no dead-end).
    const story = new RuntimeStory((result.program as any).compiled);
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
