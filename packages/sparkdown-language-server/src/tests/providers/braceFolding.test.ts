import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { describe, expect, test } from "vitest";
import { getFoldingRanges } from "../../utils/providers/getFoldingRanges";

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

describe("provider · folding struct keyword brace bodies", () => {
  test("each keyword's brace body folds from its header to its `}`", () => {
    const folds = foldsOf(`style card as base {
  > text {
    text-color = white
  }
}
layout hud in menu as base {
  column.panel {
    text "a"
  }
}
component chip(label) {
  text label
}
screen menu {
}
animation fade {
  timing { duration = 1 }
}
theme dusk {
  color = red
}
morph blink {
  method = bend
}
`);
    expect(folds).toEqual(
      expect.arrayContaining([
        [0, 4],
        [1, 3],
        [5, 9],
        [6, 8],
        [10, 12],
        [13, 14],
        [15, 17],
        [18, 20],
        [21, 23],
      ]),
    );
    for (const start of [0, 5, 10, 15, 18, 21]) {
      expect(folds.filter(([s]) => s === start)).toHaveLength(1);
    }
  });

  test("a body on one line does not fold", () => {
    const folds = foldsOf(`style blue { text-color = white }
screen menu {}
`);
    expect(folds).toEqual([]);
  });
});
