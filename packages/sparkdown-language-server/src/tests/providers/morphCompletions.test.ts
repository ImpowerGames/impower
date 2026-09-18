import { buildSVGAttributeVocabulary } from "@impower/sparkdown/src/attributes";
import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { describe, expect, test } from "vitest";
import { getCompletions } from "../../utils/providers/getCompletions";

const URI = "file:///complete.sd";

const BUNNY = `<svg xmlns="http://www.w3.org/2000/svg">
<g data-name="eyelash-left:eyes.open:default" id="la"/>
<g data-name="eyelash-left:eyes.closed" id="lc"/>
<g data-name="pupil-left:eyes.open" id="pl"/>
<g data-name="creases" id="cr"/>
</svg>`;

const RAFFLES = `<svg xmlns="http://www.w3.org/2000/svg">
<g data-name="lids:eyes.open:default" id="open"/>
<g data-name="lids:eyes.squint" id="squint"/>
<g data-name="lips:mouth.open:default" id="mouth"/>
</svg>`;

const TREE = `<svg xmlns="http://www.w3.org/2000/svg"><g data-name="leaves:season.summer:default" id="leaves"/></svg>`;

const image = (name: string, svg: string) => ({
  $type: "image",
  $name: name,
  uri: `file:///${name}.svg`,
  attribute_vocabulary: buildSVGAttributeVocabulary(svg),
});

const program = {
  context: {
    morph: { $default: {} },
    image: {
      bunny: image("bunny", BUNNY),
      raffles: image("raffles", RAFFLES),
      tree: image("tree", TREE),
    },
  },
} as any;

function completeAt(source: string, triggerCharacter?: string) {
  const idx = source.indexOf("|");
  const text = source.replace("|", "");
  const before = source.slice(0, idx);
  const position = {
    line: before.split("\n").length - 1,
    character: idx - (before.lastIndexOf("\n") + 1),
  };
  const documents = new SparkdownDocumentRegistry(["characters", "declarations", "references"]);
  documents.set({ textDocument: { uri: URI, text, version: 1, languageId: "sparkdown" } });
  const scriptAnnotations = new Map([[URI, documents.annotations(URI)]]);
  return (
    getCompletions(
      documents.get(URI),
      documents.tree(URI),
      scriptAnnotations,
      program,
      undefined,
      position,
      triggerCharacter ? { triggerKind: 2, triggerCharacter } : undefined,
    ) ?? []
  );
}

const labelsAt = (source: string, trigger?: string) =>
  completeAt(source, trigger).map((item) => String(item.label));

const KEYFRAMES = (body: string) => `morph blink with
  method = bend
  keyframes:
${body}
end
`;

describe("morph completion", () => {
  test("root fields", () => {
    const labels = labelsAt(`morph blink with
  |
end
`);
    expect(labels).toEqual(
      expect.arrayContaining(["blend", "method", "fallback", "layers", "keyframes", "timing", "clips"]),
    );
    expect(labels).not.toContain("duration");
  });

  test("timing fields and values", () => {
    expect(
      labelsAt(`morph blink with
  timing:
    |
end
`),
    ).toEqual([...[
      "duration",
      "delay",
      "easing",
      "iterations",
      "direction",
      "iteration_delay_min",
      "iteration_delay_max",
    ]]);
    expect(
      labelsAt(`morph blink with
  timing:
    easing = |
end
`),
    ).toEqual(expect.arrayContaining(["ease-out", "linear", "steps()", "cubic-bezier()"]));
    expect(
      labelsAt(`morph blink with
  timing:
    iterations = |
end
`),
    ).toEqual(["infinite"]);
  });

  test("policy values at the root and under a hyphenated label", () => {
    expect(
      labelsAt(`morph blink with
  method = |
end
`),
    ).toEqual(["match", "bend", "trace"]);
    expect(
      labelsAt(`morph blink with
  layers:
    eyelash-left:
      fallback = |
end
`),
    ).toEqual(["fade", "cut", "scale"]);
    expect(
      labelsAt(`morph blink with
  layers:
    eyelash-left:
      |
end
`),
    ).toEqual(["blend", "method", "fallback"]);
  });

  test("a `=` typed without a space gets one before the value", () => {
    const [item] = completeAt(
      `morph blink with
  method =|
end
`,
      "=",
    );
    expect((item!.textEdit as any).newText).toBe(" match");
  });

  test("layer labels under `layers:` come from the candidate artwork", () => {
    const labels = labelsAt(`morph blink with
  layers:
    eye|
  keyframes:
    from:
      eyes:
        state = open
end
`);
    expect(labels).toEqual(expect.arrayContaining(["eyelash-left", "pupil-left", "creases", "lids"]));
    // The tree has no `eyes` group, so its labels are not offered.
    expect(labels).not.toContain("leaves");
  });

  test("states after `state =`, with partial coverage", () => {
    const items = completeAt(
      KEYFRAMES(`    from:
      eyes:
        state = |`),
    );
    const byLabel = Object.fromEntries(items.map((item) => [item.label, item.detail]));
    expect(Object.keys(byLabel).sort()).toEqual(["closed", "open", "squint"]);
    expect(byLabel["open"]).toBe("eyes state in every candidate image");
    expect(byLabel["closed"]).toBe("eyes state in 1 of 2 candidate images: bunny");
    expect(byLabel["squint"]).toBe("eyes state in 1 of 2 candidate images: raffles");
    const shortForm = Object.fromEntries(
      items.map((item) => [item.label, item.labelDetails?.description]),
    );
    expect(shortForm).toEqual({ open: "all images", closed: "1 of 2 images", squint: "1 of 2 images" });
  });

  test("states after a group prefix replace only the text after the dot", () => {
    const items = completeAt(
      KEYFRAMES(`    - eyes:
        state = eyes.cl|`),
    );
    const closed = items.find((item) => item.label === "closed")!;
    expect((closed.textEdit as any).newText).toBe("closed");
    expect((closed.textEdit as any).range.start.character).toBe(
      "        state = eyes.".length,
    );
  });

  test("keyframe positions, containers and container fields", () => {
    expect(labelsAt(KEYFRAMES("    |"))).toEqual(["from", "to"]);
    const containers = labelsAt(
      KEYFRAMES(`    from:
      eyes:
        state = open
    to:
      |`),
    );
    expect(containers).toEqual(expect.arrayContaining(["eyes", "mouth", "eyelash-left", "creases"]));
    expect(containers).not.toContain("season");
    expect(containers).not.toContain("offset");
    expect(labelsAt(KEYFRAMES("    -\n      |"))).toContain("offset");
    expect(
      labelsAt(
        KEYFRAMES(`    from:
      creases:
        |`),
      ),
    ).toEqual(["state", "translate", "rotate", "scale", "transform", "transform_origin", "opacity"]);
  });

  test("clip fields and labels in nested lists", () => {
    expect(
      labelsAt(`morph blink with
  clips:
    -
      |
end
`),
    ).toEqual(["between", "targets"]);
    const labels = labelsAt(`morph blink with
  keyframes:
    from:
      eyes:
        state = open
  clips:
    - between:
        - eyelash-left
      targets:
        - pup|
end
`);
    expect(labels).toEqual(expect.arrayContaining(["pupil-left", "eyelash-left"]));
  });

  test("image directive completion is unaffected", () => {
    const labels = labelsAt(`[[bunny~|]]
`);
    expect(labels).toEqual(expect.arrayContaining(["eyes.open", "eyes.closed"]));
  });
});
