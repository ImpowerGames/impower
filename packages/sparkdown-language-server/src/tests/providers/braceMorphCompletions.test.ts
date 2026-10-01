import { buildSVGAttributeVocabulary } from "@impower/sparkdown/src/attributes";
import { describe, expect, test } from "vitest";
import {
  accept,
  bracesBalanced,
  completeAt,
  insertedText,
  insideBraces,
} from "./braceCompletionHarness";

// The cases of `morphCompletions.test.ts`, written in brace bodies (#1228):
// the same items at each depth, with the cursor's path read from the blocks
// around it, and every container inserted as a balanced `name { }` block with
// the cursor inside.

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

/** Accepting `label` leaves balanced braces with the cursor inside a new
 *  block whose header is `label`. */
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
      expect.arrayContaining(["blend", "method", "fallback", "layers", "keyframes", "timing", "clips"]),
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
    ).toEqual(["blend", "method", "fallback"]);
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

  test("a block under an indented container keeps the container in its path", () => {
    expect(
      labelsAt(`morph blink with
  layers:
    eyelash-left {
      fall|
    }
end
`),
    ).toEqual(["blend", "method", "fallback"]);
    expect(
      labelsAt(`morph blink with
  keyframes:
    from {
      eyes { state = | }
    }
end
`),
    ).toEqual(expect.arrayContaining(["open", "closed", "squint"]));
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
    for (const value of ["don't", "'tis", "ease-'"]) {
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
    // Only raffles has `mouth`: the `state` in `mouth { … }` narrows the
    // candidates, so bunny's labels are not offered under `layers`.
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
});
