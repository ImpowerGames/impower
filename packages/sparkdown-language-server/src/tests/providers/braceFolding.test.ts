import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { describe, expect, test } from "vitest";
import { getFoldingRanges } from "../../utils/providers/getFoldingRanges";

// Folding of brace blocks (#1228): a block that spans lines folds from its
// header line to the line of its `}`, whatever its indentation.

const URI = "file:///fold.sd";

function foldsOf(source: string) {
  const documents = new SparkdownDocumentRegistry([
    "characters",
    "declarations",
    "references",
  ]);
  documents.set({
    textDocument: { uri: URI, text: source, version: 1, languageId: "sparkdown" },
  });
  return getFoldingRanges(
    documents.get(URI),
    documents.annotations(URI),
    undefined,
    documents.tree(URI),
  ).map((r) => [r.startLine, r.endLine]);
}

describe("provider · folding brace blocks", () => {
  test("a block in a body that is not indented at all folds from its header to its `}`", () => {
    const folds = foldsOf(`style card with
> text {
text-color = white
}
@hovered {
> text {
text-color = red
}
}
end
`);
    expect(folds).toEqual(expect.arrayContaining([[1, 3], [4, 8], [5, 7]]));
  });

  test("layout element blocks fold the same way", () => {
    const folds = foldsOf(`layout hud with
column.panel {
row.item {
text "a"
}
button "b"
}
end
`);
    expect(folds).toEqual(expect.arrayContaining([[1, 6], [2, 4]]));
  });

  test("a list entry's braces fold too", () => {
    const folds = foldsOf(`animation fade with
keyframes {
{
opacity = 0
}
}
end
`);
    expect(folds).toEqual(expect.arrayContaining([[1, 5], [2, 4]]));
  });

  test("one fold per header line: the outermost block, ending at its `}`", () => {
    const folds = foldsOf(`animation fade with
  keyframes { from {
    opacity = 0
  } }
  timing {
    duration = 1
  }
end
`);
    expect(folds.filter(([start]) => start === 1)).toEqual([[1, 3]]);
    expect(folds.filter(([start]) => start === 4)).toEqual([[4, 6]]);
  });

  test("a block on one line does not fold", () => {
    const folds = foldsOf(`style card with
> text { text-color = white }
end
`);
    expect(folds.filter(([start]) => start === 1)).toEqual([]);
  });

  test("an unclosed block folds to its last line", () => {
    const folds = foldsOf(`style card with
> text {
text-color = white
end
`);
    expect(folds).toEqual(expect.arrayContaining([[1, 2]]));
  });
});
