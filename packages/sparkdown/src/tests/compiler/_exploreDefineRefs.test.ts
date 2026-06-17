import { describe, test } from "vitest";
import { SparkdownDocumentRegistry } from "../../compiler/classes/SparkdownDocumentRegistry";

function dump(label: string, source: string) {
  const reg = new SparkdownDocumentRegistry(["references"]);
  const uri = `file:///${label}.sd`;
  reg.set({
    textDocument: { uri, text: source, version: 1, languageId: "sparkdown" },
  });
  // eslint-disable-next-line no-console
  console.log(`\n===== TREE: ${label} =====`);
  reg.print(uri);
  const annotations = reg.annotations(uri);
  // eslint-disable-next-line no-console
  console.log(`----- REFERENCES: ${label} -----`);
  const cur = annotations.references.iter();
  while (cur.value) {
    const v = (cur.value as any).type ?? {};
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        text: source.slice(cur.from, cur.to),
        declaration: v.declaration,
        kind: v.kind,
        symbolIds: v.symbolIds,
        interdependentIds: v.interdependentIds,
        selectors: v.selectors,
        linkable: v.linkable,
        prop: v.prop,
        assigned: v.assigned,
        stylingStringIdentifier: v.stylingStringIdentifier,
      }),
    );
    cur.next();
  }
}

describe("explore define references", () => {
  test("oop define as character", () => {
    dump(
      "char",
      `define raffles as character with
  name = "RAFFLES"
  color = "teal"
end
raffles: Hello there.
`,
    );
  });

  test("root define", () => {
    dump(
      "root",
      `define animation with
  duration = 1
end
`,
    );
  });

  test("style", () => {
    dump(
      "style",
      `style my_button with
  background-color = blue
  hovered:
    background-color = red
end
`,
    );
  });

  test("screen", () => {
    dump(
      "screen",
      `screen title_screen with
  stage:
    backdrop:
      image = "bg"
end
`,
    );
  });

  test("animation typed", () => {
    dump(
      "anim",
      `animation pan_right as animation with
  target = layer.self
  keyframes:
    -
      background_position = "right"
end
`,
    );
  });
});
