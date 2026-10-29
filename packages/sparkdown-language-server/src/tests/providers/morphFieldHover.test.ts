import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { describe, expect, it } from "vitest";
import { getHover } from "../../utils/providers/getHover";

let version = 0;

// The hover's text and the text it marks, or null, with the cursor on the
// `n`th occurrence of `needle` in `text` (plus `within` characters).
const hoverAt = async (text: string, needle: string, within = 1, n = 0) => {
  const uri = `file:///morph${++version}.sd`;
  const documents = new SparkdownDocumentRegistry(["references"]);
  documents.set({ textDocument: { uri, text, version, languageId: "sparkdown" } });
  const document = documents.get(uri)!;
  let index = -1;
  for (let i = 0; i <= n; i++) index = text.indexOf(needle, index + 1);
  expect(index, `${needle} #${n}`).toBeGreaterThanOrEqual(0);
  const hover = await getHover(
    document,
    documents.tree(uri),
    documents.annotations(uri),
    undefined,
    undefined,
    document.positionAt(index + within),
  );
  if (!hover) {
    return null;
  }
  return { value: (hover.contents as { value: string }).value, marked: document.getText(hover.range) };
};

const MORPH = `morph blink with
  method = bend
  layers {
    fill { fallback = cut }
  }
  keyframes {
    from { eyes { state = open } }
    50% { eyes { state = closed } }
    to { eyes { state = open } }
  }
  timing {
    duration = 3
  }
  clips {
    { between { eyelash-left }; targets { pupil-left } }
  }
  paints {
    {
      targets { eyelash-left }
      state = eyes.closed
      when = mask.on
      fill = #c9c9c9
      stroke = red
      opacity = 0
      span = 40%
    }
  }
end

fill = 2
`;

describe("morph field hover", () => {
  it("documents `paints` and each field of an entry", async () => {
    expect(await hoverAt(MORPH, "paints {")).toEqual({ value: expect.stringContaining("Colours and opacities that layers take at one pose"), marked: "paints" });
    const fields: [string, string, string][] = [
      ["targets {", "targets", "this entry recolours"],
      ["state = eyes.closed", "state", "The pose the colour belongs to"],
      ["when =", "when", "does not drive"],
      ["fill = #", "fill", "fill colour"],
      ["stroke =", "stroke", "stroke colour"],
      ["opacity = 0", "opacity", "The opacity the drawings take at the pose"],
      ["span =", "span", "Default `100%`"],
    ];
    for (const [needle, marked, text] of fields) {
      const hover = await hoverAt(MORPH, needle, 1, needle === "targets {" ? 1 : 0);
      expect(hover, needle).toEqual({ value: expect.stringContaining(text), marked });
    }
  });

  it("documents the fields a `paints` entry shares with other places by where they are written", async () => {
    expect((await hoverAt(MORPH, "targets {"))?.value).toBe("The layers the aperture clips.");
    expect((await hoverAt(MORPH, "state = open"))?.value).toContain("The attribute state this group shows at this pose");
  });

  it("documents the morph's other fields", async () => {
    expect((await hoverAt(MORPH, "method ="))?.value).toContain("How matched shapes morph");
    expect((await hoverAt(MORPH, "duration ="))?.value).toContain("Seconds one play lasts");
    expect((await hoverAt(MORPH, "layers {"))?.value).toContain("Per-label overrides");
  });

  it("does not document values, labels or anything outside the morph", async () => {
    expect(await hoverAt(MORPH, "#c9c9c9")).toBeNull();
    expect(await hoverAt(MORPH, "eyelash-left }", 2, 1)).toBeNull();
    // A layer label that shares a field's name is a label.
    expect(await hoverAt(MORPH, "fill { fallback")).toBeNull();
    expect(await hoverAt(MORPH, "fill = 2")).toBeNull();
  });
});
