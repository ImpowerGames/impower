import { buildSVGAttributeVocabulary } from "@impower/sparkdown/src/attributes";
import { describe, expect, test } from "vitest";
import {
  accept,
  bracesBalanced,
  completeAt,
  insertedText,
  insideBraces,
} from "./braceCompletionHarness";
import { compileProject } from "./completionHarness";

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

const labelsAt = (source: string, trigger?: string) =>
  completeAt(source, program, trigger).map((item) => String(item.label));

const itemAt = (source: string, label: string) => {
  const item = completeAt(source, program).find((i) => i.label === label);
  expect(item, `${label} offered`).toBeDefined();
  return item!;
};

const expectBlockInserted = (source: string, label: string) => {
  const item = itemAt(source, label);
  expect(insertedText(item)).toBe(`${label} {  }`);
  const { text, cursor } = accept(source, item);
  expect(bracesBalanced(text), text).toBe(true);
  expect(insideBraces(text, cursor), text).toBe(true);
  expect(text.slice(0, cursor).endsWith(`${label} { `), text).toBe(true);
};

const KEYFRAMES = (body: string) => `morph blink with
  method = bend
  keyframes {
${body}
  }
end
`;

describe("morph completion in brace bodies", () => {
  test("root fields in a body written with blocks insert blocks", () => {
    const source = `morph blink with
  layers { creases { fallback = scale } }
  |
end
`;
    const labels = labelsAt(source);
    expect(labels).toEqual(
      expect.arrayContaining(["blend", "method", "fallback", "depth", "layers", "keyframes", "timing", "clips"]),
    );
    expect(labels).not.toContain("duration");
    for (const container of ["layers", "keyframes", "timing", "clips"]) {
      expectBlockInserted(source, container);
    }
    expect(insertedText(itemAt(source, "method"))).toBe("method = ");
  });

  test("timing fields and values", () => {
    const fields = [
      "duration",
      "delay",
      "easing",
      "iterations",
      "direction",
      "iteration_delay_min",
      "iteration_delay_max",
    ];
    expect(
      labelsAt(`morph blink with
  timing {
    |
  }
end
`),
    ).toEqual(fields);
    expect(
      labelsAt(`morph blink with
  timing { | }
end
`),
    ).toEqual(fields);
    expect(
      labelsAt(`morph blink with
  timing { duration = 1; | }
end
`),
    ).toEqual(fields);
    expect(
      labelsAt(`morph blink with
  timing { duration = 1, | }
end
`),
    ).toEqual(fields);
    expect(
      labelsAt(`morph blink with
  timing {
    easing = |
  }
end
`),
    ).toEqual(expect.arrayContaining(["ease-out", "linear", "steps()", "cubic-bezier()"]));
    expect(
      labelsAt(`morph blink with
  timing { iterations = | }
end
`),
    ).toEqual(["infinite"]);
  });

  test("policy values and fields under a hyphenated label", () => {
    expect(
      labelsAt(`morph blink with
  layers {
    eyelash-left {
      fallback = |
    }
  }
end
`),
    ).toEqual(["fade", "cut", "scale"]);
    expect(
      labelsAt(`morph blink with
  layers { eyelash-left { fallback = | } }
end
`),
    ).toEqual(["fade", "cut", "scale"]);
    expect(
      labelsAt(`morph blink with
  layers {
    eyelash-left {
      |
    }
  }
end
`),
    ).toEqual(["blend", "method", "fallback", "depth"]);
  });

  test("a `=` typed without a space gets one before the value", () => {
    const [item] = completeAt(
      `morph blink with
  layers { eyelash-left { method =| } }
end
`,
      program,
      "=",
    );
    expect((item!.textEdit as any).newText).toBe(" match");
  });

  test("layer labels under `layers` come from the candidate artwork and insert blocks", () => {
    const source = `morph blink with
  layers {
    eye|
  }
  keyframes {
    from {
      eyes { state = open }
    }
  }
end
`;
    const labels = labelsAt(source);
    expect(labels).toEqual(expect.arrayContaining(["eyelash-left", "pupil-left", "creases", "lids"]));
    expect(labels).not.toContain("leaves");
    expectBlockInserted(source, "eyelash-left");
  });

  test("states after `state =`, with partial coverage", () => {
    const items = completeAt(
      KEYFRAMES(`    from {
      eyes { state = | }
    }`),
      program,
    );
    const byLabel = Object.fromEntries(items.map((item) => [item.label, item.detail]));
    expect(Object.keys(byLabel).sort()).toEqual(["closed", "open", "squint"]);
    expect(byLabel["open"]).toBe("eyes state in every candidate image");
    expect(byLabel["closed"]).toBe("eyes state in 1 of 2 candidate images: bunny");
    expect(byLabel["squint"]).toBe("eyes state in 1 of 2 candidate images: raffles");
  });

  test("states after a group prefix replace only the text after the dot", () => {
    const line = "      eyes { state = eyes.cl";
    const items = completeAt(
      KEYFRAMES(`    {
${line}| }
    }`),
      program,
    );
    const closed = items.find((item) => item.label === "closed")!;
    expect((closed.textEdit as any).newText).toBe("closed");
    expect((closed.textEdit as any).range.start.character).toBe(
      line.length - "cl".length,
    );
  });

  test("keyframe positions, containers and container fields", () => {
    const positions = KEYFRAMES("    |");
    expect(labelsAt(positions)).toEqual(["from", "to"]);
    expectBlockInserted(positions, "from");
    expectBlockInserted(positions, "to");
    const containersSource = KEYFRAMES(`    from {
      eyes { state = open }
    }
    to {
      |
    }`);
    const containers = labelsAt(containersSource);
    expect(containers).toEqual(expect.arrayContaining(["eyes", "mouth", "eyelash-left", "creases"]));
    expect(containers).not.toContain("season");
    expect(containers).not.toContain("offset");
    expectBlockInserted(containersSource, "eyes");
    expectBlockInserted(containersSource, "creases");
    expect(labelsAt(KEYFRAMES("    {\n      |\n    }"))).toContain("offset");
    expect(labelsAt(KEYFRAMES("    { | }"))).toContain("offset");
    expect(
      labelsAt(
        KEYFRAMES(`    from {
      creases {
        |
      }
    }`),
      ),
    ).toEqual(["state", "translate", "rotate", "scale", "transform", "transform_origin", "opacity"]);
  });

  test("clip fields and labels in nested lists", () => {
    const fieldsSource = `morph blink with
  clips {
    {
      |
    }
  }
end
`;
    expect(labelsAt(fieldsSource)).toEqual(["between", "targets"]);
    expectBlockInserted(fieldsSource, "between");
    const labels = labelsAt(`morph blink with
  keyframes {
    from {
      eyes { state = open }
    }
  }
  clips {
    { between { eyelash-left }; targets { pup| } }
  }
end
`);
    expect(labels).toEqual(expect.arrayContaining(["pupil-left", "eyelash-left"]));
  });

  test("a child that inherits its keyframes completes from its parent's candidate images", () => {
    const inherited = {
      context: {
        ...program.context,
        morph: {
          $default: {},
          base: {
            $type: "morph",
            $name: "base",
            keyframes: [{ eyes: { state: "open" } }, { eyes: { state: "closed" } }],
          },
          child: { $type: "morph", $name: "child", $extends: "base" },
        },
      },
    };
    const labels = completeAt(
      `morph child as base with
  layers {
    |
  }
end
`,
      inherited,
    ).map((item) => String(item.label));
    expect(labels).toEqual(expect.arrayContaining(["eyelash-left", "lids"]));
    expect(labels).not.toContain("leaves");
  });

  test("a `;` or brace inside a quoted value starts no new entry", () => {
    expect(
      labelsAt(`morph blink with
  timing { easing = "custom; dur|" }
end
`),
    ).not.toContain("duration");
  });

  test("a single quote in a value is text, so the entry after its `;` completes", () => {
    for (const value of ["don't", "'tis", "ease-'", "ease[", "[data[a]"]) {
      expect(
        labelsAt(`morph blink with
  timing { easing = ${value}; dur| }
end
`),
        value,
      ).toContain("duration");
    }
  });

  test("a `=` typed without a space after a `;` still gets one", () => {
    const [item] = completeAt(
      `morph blink with
  layers { eyelash-left { blend = morph; method =| } }
end
`,
      program,
      "=",
    );
    expect((item!.textEdit as any).newText).toBe(" match");
  });

  test("a state written in a block drives its group's candidates", () => {
    const labels = labelsAt(`morph blink with
  layers {
    |
  }
  keyframes {
    from { mouth { state = open } }
  }
end
`);
    expect(labels).toEqual(expect.arrayContaining(["lids", "lips"]));
    expect(labels).not.toContain("creases");
  });

  test("`depth` after `=` offers `rest` and each `group.state` the keyframes name", () => {
    const raise = (layer: string, root = "") => `morph blink with
  method = bend
${root}  layers { eyelash-left { ${layer} } }
  keyframes {
    from { eyes { state = open } }
    50% { eyes { state = eyes.closed } }
    to { eyes { state = open } }
  }
end
`;
    expect(labelsAt(raise("depth = |"))).toEqual(["rest", "eyes.open", "eyes.closed"]);
    expect(labelsAt(raise("", "  depth = |\n"))).toEqual(["rest", "eyes.open", "eyes.closed"]);
    const items = completeAt(raise("depth = eyes.cl|"), program);
    expect(items.map((i) => i.label)).toEqual(["open", "closed"]);
    expect(insertedText(items[1]!)).toBe("closed");
    const item = itemAt(raise("depth = |"), "eyes.closed");
    expect(item.documentation).toMatchObject({ value: expect.stringContaining("stacking") });
  });

  test("`depth` values come from the keyframes that apply: the block's own, else the nearest ancestor's", () => {
    const morph = (name: string, states: string[] | null, parent?: string) => ({
      $type: "morph",
      $name: name,
      ...(parent ? { $extends: parent } : {}),
      ...(states ? { keyframes: states.map((state) => ({ eyes: { state } })) } : {}),
    });
    const chain = {
      context: {
        ...program.context,
        morph: {
          $default: {},
          base: morph("base", ["open", "closed"]),
          middle: morph("middle", ["open", "squint"], "base"),
          child: morph("child", null, "middle"),
        },
      },
    };
    const depthAt = (source: string) => completeAt(source, chain).map((item) => String(item.label));
    expect(
      depthAt(`morph child as middle with
  depth = |
  keyframes {
    from { eyes { state = open } }
    to { eyes { state = half } }
  }
end
`),
    ).toEqual(["rest", "eyes.open", "eyes.half"]);
    const defines = `define base as morph with
  keyframes = { { offset = 0, eyes = { state = "open" } }, { offset = 1, eyes = { state = "closed" } } }
end
define middle as base with
  keyframes = { { offset = 0, arm = { state = "down" } }, { offset = 1, arm = { state = "raised" } } }
end
morph child as middle with
  method = match
  depth = |
end
`;
    const compiled = compileProject(defines.replace("|", "rest"));
    expect(compiled.context?.["base"]?.["middle"]).toBeDefined();
    expect(completeAt(defines, compiled).map((item) => String(item.label))).toEqual([
      "rest",
      "arm.down",
      "arm.raised",
    ]);
    expect(
      depthAt(`morph child as middle with
  depth = |
  keyframes {
    from { brow { translate = 0 0 } }
    to { brow { translate = 0 1 } }
  }
end
`),
    ).toEqual(["rest"]);
    expect(
      depthAt(`morph child as middle with
  layers { eyelash-left { depth = | } }
end
`),
    ).toEqual(["rest", "eyes.open", "eyes.squint"]);
  }, 60_000);
});

describe("`paints` completion", () => {
  const MASKED = `<svg xmlns="http://www.w3.org/2000/svg">
<g data-name="eyelash-left:eyes.open:default" id="la"/>
<g data-name="eyelash-left:eyes.closed" id="lc"/>
<g data-name="darkness:mask.on" id="dk"/>
<g data-name="face.plain:default" id="fp"/>
<g data-name="face.masked" id="fm"/>
</svg>`;
  const masked = {
    context: { morph: { $default: {} }, image: { masked: image("masked", MASKED), tree: image("tree", TREE) } },
  } as any;
  const PAINTED = (entry: string, root = "") => `morph blink with
  method = bend
  keyframes {
    from { eyes { state = open } }
    50% { eyes { state = closed } }
    to { eyes { state = open } }
  }
${root}  paints {
    { ${entry} }
  }
end
`;
  const at = (source: string) => completeAt(source, masked);
  const labels = (source: string) => at(source).map((item) => String(item.label));

  test("`paints` is offered at the root and inserts a block", () => {
    const source = `morph blink with
  |
end
`;
    expect(labelsAt(source)).toContain("paints");
    expectBlockInserted(source, "paints");
  });

  test("an entry offers its fields, and `targets` inserts a block", () => {
    expect(labels(PAINTED("|"))).toEqual(["targets", "state", "when", "fill", "stroke", "span"]);
    expect(labels(PAINTED("fill = red; |"))).toEqual(["targets", "state", "when", "fill", "stroke", "span"]);
    const item = at(PAINTED("|")).find((i) => i.label === "targets")!;
    expect(insertedText(item)).toBe("targets {  }");
    expect(insertedText(at(PAINTED("|")).find((i) => i.label === "fill")!)).toBe("fill = ");
  });

  test("`targets` offers the candidate artwork's labels", () => {
    const found = labels(PAINTED("targets { | }"));
    expect(found).toEqual(expect.arrayContaining(["eyelash-left", "darkness"]));
    expect(found).not.toContain("leaves");
  });

  test("`state =` offers the keyframes' `group.state` poses other than the one the first keyframe starts each group from", () => {
    const compiled = compileProject(PAINTED("targets { eyelash-left }; state = eyes.closed; fill = red"));
    const stateAt = (source: string) => completeAt(source, compiled);
    expect(stateAt(PAINTED("state = |")).map((i) => String(i.label))).toEqual(["eyes.closed"]);
    const items = stateAt(PAINTED("state = eyes.cl|"));
    expect(items.map((i) => i.label)).toEqual(["closed"]);
    expect(insertedText(items[0]!)).toBe("closed");
    const omitted = (entry: string) => `morph blink with
  method = bend
  keyframes {
    from { mouth { state = open } }
    50% { eyes { state = closed } }
    to { eyes { state = open }; mouth { state = closed } }
  }
  paints {
    { ${entry} }
  }
end
`;
    const late = compileProject(omitted("targets { eyelash-left }; state = eyes.closed; fill = red"));
    expect(completeAt(omitted("state = |"), late).map((i) => String(i.label))).toEqual(["mouth.closed", "eyes.closed", "eyes.open"]);
  }, 60_000);

  test("`when =` offers the states of groups the morph does not drive, from the candidate artwork", () => {
    expect(labels(PAINTED("when = |"))).toEqual(["mask.on", "mask.off", "face.plain", "face.masked"]);
    const items = at(PAINTED("when = mask.|"));
    expect(items.map((i) => i.label)).toEqual(["on", "off"]);
    expect(insertedText(items[0]!)).toBe("on");
  });

  test("each field's documentation comes with it", () => {
    const docOf = (source: string, label: string) => (at(source).find((i) => i.label === label)?.documentation as any)?.value as string;
    expect(docOf(`morph blink with
  |
end
`, "paints")).toContain("Colours that layers take at one pose");
    expect(docOf(PAINTED("|"), "targets")).toContain("this entry recolours");
    expect(docOf(PAINTED("|"), "state")).toContain("The pose the colour belongs to");
    expect(docOf(PAINTED("|"), "when")).toContain("does not drive");
    expect(docOf(PAINTED("|"), "fill")).toContain("fill colour");
    expect(docOf(PAINTED("|"), "stroke")).toContain("stroke colour");
    expect(docOf(PAINTED("|"), "span")).toContain("Default `100%`");
    expect(docOf(PAINTED("state = |"), "eyes.closed")).toContain("The pose the colour belongs to");
    expect(docOf(PAINTED("when = |"), "mask.on")).toContain("does not drive");
  });
});
