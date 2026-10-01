import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { describe, expect, test } from "vitest";
import { getReferences } from "../../utils/providers/getReferences";
import { getRenameEdits } from "../../utils/providers/getRenameEdits";

// Rename and find references inside brace bodies (#1228), in the manner of
// `defineReferences.test.ts`: a key's symbol id comes from the blocks around
// it, and a dotted class links to the style of its name as a bare-word class
// does.

const URI = "file:///provider.sd";

function makeWorkspace(source: string) {
  const documents = new SparkdownDocumentRegistry([
    "characters",
    "declarations",
    "references",
  ]);
  documents.set({
    textDocument: { uri: URI, text: source, version: 1, languageId: "sparkdown" },
  });
  const workspace = {
    annotations: (uri: string) => documents.annotations(uri),
    document: (uri: string) => documents.get(uri),
    uris: () => [...documents.keys()],
    compilerConfig: undefined,
    findFiles: () => [],
  } as any;
  return { documents, workspace };
}

// The Nth (1-based) occurrence of `needle`, nudged inside the token.
function posAt(source: string, needle: string, occurrence = 1) {
  let idx = -1;
  for (let i = 0; i < occurrence; i++) {
    idx = source.indexOf(needle, idx + 1);
  }
  expect(idx, `${needle} #${occurrence}`).toBeGreaterThanOrEqual(0);
  const offset = idx + 1;
  const before = source.slice(0, offset);
  return {
    line: before.split("\n").length - 1,
    character: offset - (before.lastIndexOf("\n") + 1),
  };
}

// Where each occurrence of `needle` starts, as `line:character`.
function spotsOf(source: string, needle: string): string[] {
  const spots: string[] = [];
  for (let idx = source.indexOf(needle); idx >= 0; idx = source.indexOf(needle, idx + 1)) {
    const before = source.slice(0, idx);
    spots.push(`${before.split("\n").length - 1}:${idx - (before.lastIndexOf("\n") + 1)}`);
  }
  return spots;
}

function referencesAt(
  source: string,
  needle: string,
  occurrence: number,
  includeInterdependent: boolean,
) {
  const { documents, workspace } = makeWorkspace(source);
  const { references } = getReferences(
    documents.get(URI),
    documents.tree(URI),
    undefined,
    workspace,
    posAt(source, needle, occurrence),
    {
      searchOtherFiles: false,
      includeDeclaration: true,
      includeInterdependent,
      includeLinks: false,
    },
  );
  return (references ?? [])
    .map((r) => `${r.range.start.line}:${r.range.start.character}`)
    .sort();
}

function renameAt(source: string, needle: string, occurrence: number, newName: string) {
  const { documents, workspace } = makeWorkspace(source);
  const edits = getRenameEdits(
    undefined,
    documents.get(URI),
    documents.tree(URI),
    undefined,
    workspace,
    newName,
    posAt(source, needle, occurrence),
  );
  return (edits?.changes?.[URI] ?? []).map((e) => ({
    at: `${e.range.start.line}:${e.range.start.character}`,
    newText: e.newText,
  }));
}

// The struct-path symbol ids the annotator records, in source order.
function structIds(source: string, type: string): string[] {
  const { documents } = makeWorkspace(source);
  const ids: string[] = [];
  const r = documents.annotations(URI).references.iter();
  while (r.value) {
    for (const id of r.value.type.symbolIds ?? []) {
      if (id.startsWith(`${type}.`) && id.split(".").length > 2) ids.push(id);
    }
    r.next();
  }
  return ids;
}

describe("provider · references to a nested key in a brace body", () => {
  const source = `animation fade with
  timing {
    duration = 1
  }
  keyframes {
    from { opacity = 0 }
    to { opacity = 1 }
  }
end
`;

  test("a key's symbol id is its path through the blocks", () => {
    expect(structIds(source, "animation")).toEqual([
      "animation.fade.timing",
      "animation.fade.timing.duration",
      "animation.fade.keyframes",
      "animation.fade.keyframes.from",
      "animation.fade.keyframes.from.opacity",
      "animation.fade.keyframes.to",
      "animation.fade.keyframes.to.opacity",
    ]);
  });

  test("the brace and indented forms of a body record the same paths", () => {
    const braced = `animation fade with
  timing { duration = 1 }
  keyframes {
    { opacity = 0 }
    { opacity = 1; offset = 0.5 }
  }
end
style card with
  > text { text-color = white }
  @hovered { > text { text-color = red } }
end
`;
    const indented = `animation fade with
  timing:
    duration = 1
  keyframes:
    -
      opacity = 0
    -
      opacity = 1
      offset = 0.5
end
style card with
  > text:
    text-color = white
  @hovered:
    > text:
      text-color = red
end
`;
    expect(structIds(braced, "animation")).toEqual(structIds(indented, "animation"));
    expect(structIds(braced, "style")).toEqual(structIds(indented, "style"));
    expect(structIds(braced, "animation")).toContain("animation.fade.keyframes.1.offset");
    // A selector header is keyed by its first name, as the indented form
    // keys `> text:`.
    expect(structIds(braced, "style")).toContain("style.card.@hovered.text.text-color");
  });

  // `text-color` stands at the same path in the first and last blocks, and
  // at another path under `@hovered`.
  const style = `style card with
  > text {
    text-color = white
  }
  @hovered {
    > text { text-color = red }
  }
  > text { text-color = black }
end
`;

  test("find references on a nested key finds the key at the same path and not its namesake at another", () => {
    expect(referencesAt(style, "text-color", 1, false)).toEqual(["2:4", "7:11"]);
    expect(referencesAt(style, "text-color", 3, false)).toEqual(["2:4", "7:11"]);
    expect(referencesAt(style, "text-color", 2, false)).toEqual(["5:13"]);
    expect(referencesAt(source, "opacity", 1, false)).toEqual(["5:11"]);
    expect(referencesAt(source, "opacity", 2, false)).toEqual(["6:9"]);
  });

  test("rename on a nested key rewrites the key at the same path only", () => {
    expect(renameAt(style, "text-color", 1, "color")).toEqual([
      { at: "2:4", newText: "color" },
      { at: "7:11", newText: "color" },
    ]);
    expect(renameAt(style, "text-color", 2, "color")).toEqual([
      { at: "5:13", newText: "color" },
    ]);
  });

  test("a nested layout element's path comes from its blocks, keyed as the static struct keys it", () => {
    const layout = `layout hud with
  column.panel {
    row item.x { text "a" }
    card(1) { b }
  }
end
`;
    expect(structIds(layout, "layout")).toEqual([
      "layout.hud.column panel",
      "layout.hud.column panel.row item x",
      "layout.hud.column panel.row item x.text",
      // A component call adds no key, as its indented line adds none.
      "layout.hud.column panel.b",
    ]);
  });
});

describe("provider · a dotted class and its style", () => {
  const source = `layout hud with
  column.panel {
    text.panel "a"
  }
end
layout menu with
  row.panel { text "b" }
end
style panel with
  background-color = black
end
`;
  const classes = spotsOf(source, ".panel").map((spot) => {
    const [line, character] = spot.split(":").map(Number);
    return `${line}:${character! + 1}`;
  });
  const styleName = "8:6";

  test("find references on a dotted class reaches every use of the class and the style", () => {
    expect(referencesAt(source, "panel", 1, true)).toEqual(
      [...classes, styleName].sort(),
    );
    expect(referencesAt(source, "panel", 3, true)).toEqual(
      [...classes, styleName].sort(),
    );
  });

  test("find references on the style reaches every dotted class of its name", () => {
    expect(referencesAt(source, "panel", 4, true)).toEqual(
      [...classes, styleName].sort(),
    );
  });

  test("rename on a dotted class or its style rewrites every use of the class and the style", () => {
    for (const occurrence of [2, 4]) {
      const edits = renameAt(source, "panel", occurrence, "card");
      expect(edits.map((e) => e.at).sort()).toEqual([...classes, styleName].sort());
      expect(edits.every((e) => e.newText === "card")).toBe(true);
    }
  });

  test("rename keeps the indented form's class uses with their style", () => {
    const mixed = `layout braced with
  column.panel { text "a" }
end
layout indented with
  column panel:
    text panel "b"
  row.panel:
    text "c"
end
style panel with
  background-color = black
end
`;
    const uses = ["1:9", "4:9", "5:9", "6:6", "9:6"];
    for (const occurrence of [1, 2, 3, 4, 5]) {
      const edits = renameAt(mixed, "panel", occurrence, "card");
      expect(edits.map((e) => e.at).sort(), `occurrence ${occurrence}`).toEqual(
        uses,
      );
    }
  });

  test("go to definition on a dotted class reaches the style", () => {
    // The options the server's definition handler passes.
    const { documents, workspace } = makeWorkspace(source);
    for (const occurrence of [1, 3]) {
      const { references } = getReferences(
        documents.get(URI),
        documents.tree(URI),
        undefined,
        workspace,
        posAt(source, "panel", occurrence),
        {
          searchOtherFiles: true,
          includeDeclaration: true,
          excludeUses: true,
          includeInterdependent: false,
          includeLinks: false,
        },
      );
      expect(
        (references ?? []).map(
          (r) => `${r.range.start.line}:${r.range.start.character}`,
        ),
      ).toEqual([styleName]);
    }
  });

  test("a dotted class on a component call links to its style too", () => {
    const called = `component card(n) with
  text "{n}"
end
layout hud with
  column {
    card(1).panel
  }
end
style panel with
  background-color = black
end
`;
    expect(referencesAt(called, "panel", 1, true)).toEqual(["5:12", "8:6"]);
    expect(referencesAt(called, "panel", 2, true)).toEqual(["5:12", "8:6"]);
  });

  test("an element's name links to the style of its name too", () => {
    const named = `layout hud with
  backdrop { text "a" }
end
style backdrop with
  background-color = black
end
`;
    expect(referencesAt(named, "backdrop", 1, true)).toEqual(["1:2", "3:6"]);
    expect(referencesAt(named, "backdrop", 2, true)).toEqual(["1:2", "3:6"]);
  });
});
