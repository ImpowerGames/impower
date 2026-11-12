import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { describe, expect, it } from "vitest";
import { getHover } from "../../utils/providers/getHover";

let version = 0;

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

const MORPH = `morph blink {
  method = bend
  layers {
    fill { fallback = cut }
    eyeball-shadow-left { partner = { eyeball-shadow-left; eyelash-left } }
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
    { between { eyelash-left }; targets { pupil-left }; spread = 1px }
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
}

fill = 2
`;

describe("morph field hover", () => {
  it("documents `paints` and each field of an entry", async () => {
    expect(await hoverAt(MORPH, "paints {")).toEqual({ value: expect.stringContaining("Colours and opacities that layers take at one pose"), marked: "paints" });
    const fields: [string, string, string][] = [
      ["targets {", "targets", "whose drawings this entry paints"],
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

  it("documents a clip entry's `spread` with the clip text", async () => {
    expect(await hoverAt(MORPH, "spread =")).toEqual({ value: expect.stringContaining("How far this clip's opening reaches past its outline"), marked: "spread" });
  });

  it("documents the morph's other fields", async () => {
    expect((await hoverAt(MORPH, "method ="))?.value).toContain("How matched shapes morph");
    expect((await hoverAt(MORPH, "duration ="))?.value).toContain("Seconds one play lasts");
    expect((await hoverAt(MORPH, "layers {"))?.value).toContain("Per-label overrides");
    expect(await hoverAt(MORPH, "partner =")).toEqual({ value: expect.stringContaining("priority order"), marked: "partner" });
  });

  it("documents `trigger` with what `appear` and `speech` do", async () => {
    const TALK = `morph talk {
  blend = cut
  keyframes {
    from { mouth { state = closed } }
    to { mouth { state = open } }
  }
  timing {
    trigger = speech
    delay = 1
  }
}
`;
    const hover = await hoverAt(TALK, "trigger =");
    expect(hover).toEqual({ value: expect.stringContaining("What starts the morph"), marked: "trigger" });
    expect(hover!.value).toContain("`appear` (default) plays it on its own schedule from the moment its portrait appears");
    expect(hover!.value).toContain("`speech` plays it only while its portrait's character is speaking");
    expect((await hoverAt(TALK, "delay ="))?.value).toContain("Not allowed with `trigger = speech`");
  });

  it("does not document values, labels or anything outside the morph", async () => {
    expect(await hoverAt(MORPH, "#c9c9c9")).toBeNull();
    expect(await hoverAt(MORPH, "eyelash-left }", 2, 1)).toBeNull();
    expect(await hoverAt(MORPH, "fill { fallback")).toBeNull();
    expect(await hoverAt(MORPH, "fill = 2")).toBeNull();
  });
});

describe("a drawing's `spread` hover", () => {
  const SPREAD = `morph blink {
  method = bend
  spread = 0.5px
  layers {
    eyeball-shadow-left { partner = eyelash-left; spread = -1px }
  }
  keyframes {
    from { eyes { state = open } }
    50% { eyes { state = closed } }
    to { eyes { state = open } }
  }
  clips {
    { between { eyelash-left }; targets { pupil-left }; spread = 1px }
  }
}
`;

  it("documents `spread` at the root and under a label with the drawing text, and in a clip entry with the clip text", async () => {
    const drawing = "Grows (positive) or shrinks (negative) the outline of drawings";
    expect(await hoverAt(SPREAD, "spread = 0.5px")).toEqual({ value: expect.stringContaining(drawing), marked: "spread" });
    expect(await hoverAt(SPREAD, "spread = -1px")).toEqual({ value: expect.stringContaining(drawing), marked: "spread" });
    expect((await hoverAt(SPREAD, "spread = -1px"))?.value).toContain("shrinks only when it is a single contour that does not overlap itself; split a drawing of several contours into one layer per contour. The overlap check is exact to a ten-thousandth of the drawing's size: an overlap narrower than that counts as touching");
    expect(await hoverAt(SPREAD, "spread = 1px")).toEqual({ value: expect.stringContaining("How far this clip's opening reaches past its outline"), marked: "spread" });
  });
});
