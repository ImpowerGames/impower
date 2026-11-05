import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { describe, expect, test } from "vitest";
import { SymbolKind, type DocumentSymbol } from "vscode-languageserver";
import { getDocumentSymbols } from "../../utils/providers/getDocumentSymbols";

const URI = "file:///menus.sd";

function symbolsOf(source: string) {
  const documents = new SparkdownDocumentRegistry(["declarations"]);
  documents.set({
    textDocument: {
      uri: URI,
      text: source,
      version: 1,
      languageId: "sparkdown",
    },
  });
  return getDocumentSymbols(
    documents.get(URI)!,
    documents.annotations(URI),
    documents.tree(URI),
  );
}

const kindName = (kind: SymbolKind) =>
  Object.entries(SymbolKind).find(([, value]) => value === kind)?.[0];

const shape = (symbols: DocumentSymbol[] | undefined): unknown[] =>
  (symbols ?? []).map((s) =>
    s.children?.length
      ? [kindName(s.kind), s.name, shape(s.children)]
      : [kindName(s.kind), s.name],
  );

const lines = (s: DocumentSymbol | undefined) => [
  s?.range.start.line,
  s?.range.end.line,
  s?.selectionRange.start.line,
];

const MENU_IN_SCENE = `scene Harbor
  The boat rocks.
  choose
    Where now?
    * Go ashore
      You step off.
    * [Stay] Stay aboard
      You stay.
  then (after)
    Later.
  end
  branch storm
    choose
      * Hold on
        You hold on.
    end
  end
end
choose
  * Begin
    Begun.
end
`;

describe("provider · choice menus in the document symbols", () => {
  test("a menu is an Enum under its scene or branch, named by its prompt, with its options as EnumMember children", () => {
    expect(shape(symbolsOf(MENU_IN_SCENE))).toEqual([
      [
        "Class",
        "Harbor",
        [
          [
            "Enum",
            "Where now?",
            [
              ["EnumMember", "Go ashore"],
              ["EnumMember", "[Stay] Stay aboard"],
            ],
          ],
          ["EnumMember", "after"],
          [
            "Interface",
            "storm",
            [["Enum", "Hold on", [["EnumMember", "Hold on"]]]],
          ],
        ],
      ],
      ["Enum", "Begin", [["EnumMember", "Begin"]]],
    ]);
  });

  test("a menu's range runs from its choose line to its end, and each option's from its mark to the line before the next", () => {
    const [scene, top] = symbolsOf(MENU_IN_SCENE);
    const menu = scene?.children?.[0];
    expect(lines(menu)).toEqual([2, 10, 2]);
    expect(menu?.selectionRange.start.character).toBe(2);
    expect(menu?.children?.map(lines)).toEqual([
      [4, 5, 4],
      [6, 7, 6],
    ]);
    expect(lines(top)).toEqual([18, 21, 18]);
  });

  test("only the last display line before the options is the prompt, as the menu's caption, and a command line is not one", () => {
    const [scene] = symbolsOf(`scene A
  choose
    @ GUIDE
    Which
    way?
    * Left
  end
end
`);
    expect(scene?.children?.map((s) => s.name)).toEqual(["way?"]);
  });

  test("a menu with no prompt and no options keeps its place under a fallback name", () => {
    const [scene] = symbolsOf("scene A\n  choose\n  end\nend\n");
    expect(shape(scene?.children)).toEqual([["Enum", "choose"]]);
  });

  test("an explicit action, a line of dialogue or an action block before the options is the prompt", () => {
    const [scene] = symbolsOf(`scene A
  choose
    : Where now?
    * Go
  end
  choose
    GUIDE: Which way?
    * Left
  end
  choose
    :
      Up the stairs
      or down?
    * Up
  end
end
`);
    expect(scene?.children?.map((s) => s.name)).toEqual([
      "Where now?",
      "Which way?",
      "Up the stairs or down?",
    ]);
  });

  test("the last paragraph before the options is the prompt, as the menu's caption", () => {
    const [scene] = symbolsOf(`scene A
  choose
    The hall is dark.

    Which door?
    * Left
  end
end
`);
    expect(scene?.children?.map((s) => s.name)).toEqual(["Which door?"]);
  });

  test("of adjacent dialogue or explicit action lines, only the last before the options is the prompt", () => {
    const [scene] = symbolsOf(`scene A
  choose
    GUIDE: The hall is dark.
    GUIDE: Which door?
    * Left
      You go left.
  end
  choose
    : The stairs creak.
    : Up or down?
    * Up
  end
end
`);
    expect(scene?.children?.map((s) => s.name)).toEqual([
      "Which door?",
      "Up or down?",
    ]);
  });
});
