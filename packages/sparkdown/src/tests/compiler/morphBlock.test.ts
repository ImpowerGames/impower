import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { bindMorph } from "../../compiler/morph/bindMorph";
import { normalizeMorphKeyframes } from "../../compiler/morph/normalizeMorphKeyframes";
import { compileSource } from "./compileSnapshot";

const URI = "file:///main.sd";

/** A portrait with folder-scoped eye defaults, lashes, eyeballs and posed layers. */
const PORTRAIT = `<svg xmlns="http://www.w3.org/2000/svg">
<g data-name="face.happy:default" id="happy">
  <g data-name="eyelash-left:eyes.open:default" id="la"/>
  <g data-name="eyelash-left:eyes.closed" id="lc"/>
  <g data-name="eyelash-right:eyes.open:default" id="ra"/>
  <g data-name="eyelash-right:eyes.closed" id="rc"/>
  <g data-name="eyeball-white-left:eyes.open" id="wl"/>
  <g data-name="eyeball-shadow-left:eyes.open" id="sl"/>
  <g data-name="pupil-left:eyes.open" id="pl"/>
  <g data-name="eyeball-white-right:eyes.open" id="wr"/>
  <g data-name="eyeball-shadow-right:eyes.open" id="sr"/>
  <g data-name="pupil-right:eyes.open" id="pr"/>
  <g data-name="creases" id="cr"/>
  <g data-name="eyebrows" id="eb"/>
  <g data-name="nose" id="no"/>
</g>
<g data-name="face.sleepy" id="sleepy">
  <g data-name="lids:eyes.closed:default" id="sl-lids"/>
  <g data-name="lids:eyes.open" id="sl-open"/>
</g>
</svg>`;

/** The canonical example from the portrait-morph design (#565). */
const BLINK = `morph blink with
  blend = morph
  method = bend
  fallback = fade

  layers {
    creases {
      fallback = scale
    }
  }

  keyframes {
    0% {
      eyes {
        state = eyes.open
      }
      eyebrows {
        translate = 0 0
      }
      nose {
        translate = 0 0
      }
    }
    33.333% {
      eyes {
        state = eyes.closed
      }
      eyebrows {
        translate = 0 8px
      }
      nose {
        translate = 0 -2px
      }
    }
    100% {
      eyes {
        state = eyes.open
      }
      eyebrows {
        translate = 0 0
      }
      nose {
        translate = 0 0
      }
    }
  }

  timing {
    duration = 0.25
    easing = steps(3)
    delay = 0.7
    iterations = infinite
    iteration_delay_min = 0.2
    iteration_delay_max = 6
  }

  clips {
    {
      between {
        eyelash-left
      }
      targets {
        eyeball-white-left
        eyeball-shadow-left
        pupil-left
      }
    }
    {
      between {
        eyelash-right
      }
      targets {
        eyeball-white-right
        eyeball-shadow-right
        pupil-right
      }
    }
  }
end
`;

type Image = { name: string; svg: string };

function compile(text: string, images: Image[] = [{ name: "bunny", svg: PORTRAIT }]) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      { uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" },
      ...images.map((image) => ({
        uri: `file:///${image.name}.svg`,
        type: "image",
        name: image.name,
        ext: "svg",
        data: image.svg,
      })),
    ],
  } as any);
  return compiler.compile({ textDocument: { uri: URI } }).program;
}

interface Found {
  message: string;
  severity: number | undefined;
  code: string | number | undefined;
  line: number;
  character: number;
  text: string;
}

function diagnosticsOf(text: string, images?: Image[]): Found[] {
  const program = compile(text, images);
  const lines = text.split("\n");
  return (program.diagnostics?.[URI] ?? []).map((d) => {
    const { start, end } = d.range;
    return {
      message: typeof d.message === "string" ? d.message : d.message.value,
      severity: d.severity,
      code: d.code,
      line: start.line,
      character: start.character,
      text:
        start.line === end.line
          ? lines[start.line]!.slice(start.character, end.character)
          : lines[start.line]!.slice(start.character),
    };
  });
}

/** Only the diagnostics the morph checks produce. */
function morphDiagnostics(text: string, images?: Image[]): Found[] {
  return diagnosticsOf(text, images).filter((d) => d.code === "morph");
}

function structOf(source: string, name: string): any {
  const entry = compileSource(source).find((e) => e.block?.context?.["morph"]?.[name]);
  return entry?.block?.context?.["morph"]?.[name];
}

describe("morph block lowering", () => {
  test("the canonical example lowers with its policies, literal states, offsets, timing and secondary containers", () => {
    const struct = structOf(BLINK, "blink");
    expect(struct).toMatchObject({
      $type: "morph",
      $name: "blink",
      blend: "morph",
      method: "bend",
      fallback: "fade",
      layers: { creases: { fallback: "scale" } },
      timing: {
        duration: 0.25,
        easing: "steps(3)",
        delay: 0.7,
        iterations: "infinite",
        iteration_delay_min: 0.2,
        iteration_delay_max: 6,
      },
      clips: [
        {
          between: ["eyelash-left"],
          targets: ["eyeball-white-left", "eyeball-shadow-left", "pupil-left"],
        },
        {
          between: ["eyelash-right"],
          targets: ["eyeball-white-right", "eyeball-shadow-right", "pupil-right"],
        },
      ],
    });
    expect(struct.$extends).toBeUndefined();
    expect(struct.keyframes.map((k: any) => k.eyes.state)).toEqual(["open", "closed", "open"]);
    expect(struct.keyframes.map((k: any) => k.offset)).toEqual([0, 33.333 / 100, 1]);
    expect(struct.keyframes[1].eyebrows).toEqual({ translate: "0 8px" });
    expect(struct.keyframes[1].nose).toEqual({ translate: "0 -2px" });
  });

  test("an explicit parent is kept as `$extends`", () => {
    const struct = structOf(
      `morph slow as blink with
  timing {
    duration = 1
  }
end
`,
      "slow",
    );
    expect(struct.$extends).toBe("blink");
  });

  test("list and from/to keyframes normalize to the same poses", () => {
    const keyed = structOf(
      `morph m with
  keyframes {
    from {
      eyes {
        state = open
      }
    }
    50% {
      eyes {
        state = closed
      }
    }
    to {
      eyes {
        state = open
      }
    }
  }
end
`,
      "m",
    );
    const listed = structOf(
      `morph m with
  keyframes {
    {
      eyes {
        state = open
      }
    }
    {
      eyes {
        state = closed
      }
    }
    {
      eyes {
        state = open
      }
    }
  }
end
`,
      "m",
    );
    // The list forms omit offsets, so only their normalized poses agree with
    // the keyed form.
    expect(listed.keyframes[0].offset).toBeUndefined();
    expect(normalizeMorphKeyframes(listed.keyframes)).toEqual(keyed.keyframes);

  });

  test("lists with the same explicit offsets are equal as written", () => {
    const listed = structOf(
      `morph m with
  keyframes {
    {
      offset = 0
      eyes {
        state = open
      }
    }
    {
      offset = 1
      eyes {
        state = closed
      }
    }
  }
end
`,
      "m",
    );
    const keyed = structOf(
      `morph m with
  keyframes {
    from {
      eyes {
        state = open
      }
    }
    to {
      eyes {
        state = closed
      }
    }
  }
end
`,
      "m",
    );
    expect(listed.keyframes).toEqual(keyed.keyframes);
  });

  test("omitted offsets are spaced between authored ones", () => {
    expect(
      normalizeMorphKeyframes([{}, {}, { offset: 0.8 }, {}]).map((k) => k["offset"]),
    ).toEqual([0, 0.4, 0.8, 1]);
  });
});

describe("literal state values", () => {
  const stateOf = (value: string) =>
    structOf(
      `morph m with
  keyframes {
    from {
      eyes {
        state = ${value}
      }
    }
    to {
      eyes {
        state = open
      }
    }
  }
end
`,
      "m",
    ).keyframes[0].eyes.state;

  test.each([
    ["01", "01"],
    ["closed", "closed"],
    [`"closed"`, "closed"],
    ["eyes.closed", "closed"],
    [`"eyes.closed"`, "closed"],
    ["true", "true"],
    ["1.50", "1.50"],
    ["open-wide", "open-wide"],
    ["closed -- a note", "closed"],
  ])("`state = %s` is the literal state %j", (value, expected) => {
    expect(stateOf(value)).toBe(expected);
  });

  test("a different group prefix is reported where it is written and not stripped", () => {
    const text = `morph m with
  method = match
  keyframes {
    from {
      eyes {
        state = mouth.closed
      }
    }
    to {
      eyes {
        state = open
      }
    }
  }
end
`;
    expect(structOf(text, "m").keyframes[0].eyes.state).toBe("mouth.closed");
    const found = morphDiagnostics(text).find((d) => d.message.includes("`mouth` group"));
    expect(found).toMatchObject({ line: 5, text: "mouth.closed", severity: 1 });
  });

  test("ordinary animation and style values keep their coercion", () => {
    const animation = compileSource(`animation a with
  target = layer.self
  timing {
    iterations = 01
  }
end
`).find((e) => e.block?.context?.["animation"]?.["a"])!.block!.context!["animation"]!["a"];
    expect(animation.target).toEqual({ $type: "layer", $name: "self" });
    expect(animation.timing.iterations).toBe(1);
  });

  test("clip labels stay literal text", () => {
    const struct = structOf(
      `morph m with
  clips {
    {
      between {
        01
        eyes.closed
      }
      targets {
        true
      }
    }
  }
end
`,
      "m",
    );
    expect(struct.clips[0]).toEqual({ between: ["01", "eyes.closed"], targets: ["true"] });
  });
});

describe("morph inheritance", () => {
  test("the builtin supplies policy and timing defaults, and `method` is required", () => {
    const text = `morph m with
  keyframes {
    from {
      eyes {
        state = open
      }
    }
    to {
      eyes {
        state = closed
      }
    }
  }
end
`;
    const program = compile(text);
    expect(program.context?.["morph"]?.["m"]).toMatchObject({
      blend: "morph",
      fallback: "fade",
      timing: { duration: 0.25, delay: 0, easing: "ease-out", iterations: 1, direction: "normal" },
    });
    expect(program.context?.["morph"]?.["m"].timing.iteration_delay_min).toBeUndefined();
    const found = morphDiagnostics(text).find((d) => d.message.includes("`method` is required"));
    expect(found).toMatchObject({ line: 0, text: "m", severity: 1 });
  });

  test("a parent's method and keyframes satisfy a child", () => {
    const text = `${BLINK}
morph slow as blink with
  timing {
    duration = 1
  }
end
`;
    expect(morphDiagnostics(text)).toEqual([]);
  });

  test("a parent written as `define … as morph` supplies what the child leaves out", () => {
    const text = `define base as morph with
  method = "bend"
end

morph child as base with
  keyframes {
    from {
      eyes {
        state = open
      }
    }
    to {
      eyes {
        state = closed
      }
    }
  }
end
`;
    expect(morphDiagnostics(text)).toEqual([]);
  });

  test("invalid values inherited from a `define … as morph` parent are reported on the child's `as`", () => {
    const text = `define base as morph with
  method = "bogus"
  timing = { duration = -1 }
end

morph child as base with
  keyframes {
    from {
      eyes {
        state = open
      }
    }
    to {
      eyes {
        state = closed
      }
    }
  }
end
`;
    const found = morphDiagnostics(text);
    expect(found.find((d) => d.message.includes("`method`, inherited from `base`: `bogus` is not a `method`"))).toMatchObject({ line: 5, text: "base", severity: 1 });
    expect(found.find((d) => d.message.includes("`timing.duration`, inherited from `base`"))).toMatchObject({ line: 5, text: "base" });
  });

  const CHILD_KEYFRAMES = `  keyframes {
    from {
      eyes {
        state = open
      }
    }
    to {
      eyes {
        state = closed
      }
    }
  }
`;

  test("a value the child sets itself is not reported as inherited", () => {
    const text = `define base as morph with
  method = "bogus"
  timing = { duration = -1 }
end

morph child as base with
  method = match
  timing {
    duration = 1
  }
${CHILD_KEYFRAMES}end
`;
    expect(morphDiagnostics(text).filter((d) => d.message.includes("inherited from"))).toEqual([]);
  });

  test("values inherited through a longer chain of `define`s are checked and name their source", () => {
    const text = `define base as morph with
  method = "bogus"
end

define middle as base with
  fallback = "cut"
end

morph child as middle with
${CHILD_KEYFRAMES}end
`;
    const found = morphDiagnostics(text).filter((d) => d.message.includes("inherited from"));
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ line: 8, text: "middle" });
    expect(found[0]!.message).toContain("`method`, inherited from `base`: `bogus` is not a `method`");
  });

  test("an inherited delay range is reported on the `as` that brings it in", () => {
    const text = `define base as morph with
  method = "bend"
  timing = { iteration_delay_min = 5, iteration_delay_max = 1 }
end

morph child as base with
${CHILD_KEYFRAMES}end
`;
    const found = morphDiagnostics(text).find((d) => d.message.includes("must be at least"));
    expect(found).toMatchObject({ line: 5, text: "base" });
  });

  test("a morph block's parent is only reported once, by the block that names it", () => {
    const text = `define base as morph with
  method = "bogus"
end

morph middle as base with
${CHILD_KEYFRAMES}end

morph child as middle with
  fallback = cut
end
`;
    const found = morphDiagnostics(text).filter((d) => d.message.includes("inherited from"));
    expect(found.map((d) => d.line)).toEqual([4]);
  });

  test("an unknown parent is reported", () => {
    const found = diagnosticsOf(`morph child as nowhere with
  method = bend
${CHILD_KEYFRAMES}end
`);
    expect(found.find((d) => d.text === "nowhere")).toMatchObject({
      severity: 2,
      message: expect.stringContaining("No morph named `nowhere`"),
    });
  });

  test("an authored block replaces the builtin of the same type and name", () => {
    const found = diagnosticsOf(`animation fadein with
  timing {
    duration = 9
  }
end
`);
    expect(found.filter((d) => d.severity === 1)).toEqual([]);
  });

  test("a parent's name may be shared by another type's block and by a variable", () => {
    const text = `store base = 7

animation base with
  timing {
    duration = 1
  }
end

animation child as base with
  timing {
    duration = 2
  }
end

theme base with
  colors {
    primary = red
  }
end

${BLINK.replace("morph blink with", "morph base with")}
morph slow as base with
  timing {
    duration = 1
  }
end
`;
    const found = diagnosticsOf(text);
    expect(found.filter((d) => d.message.includes("Duplicate identifier"))).toEqual([]);
    expect(found.filter((d) => d.severity === 1)).toEqual([]);
  });

  test("a label that morphs under a non-morph root needs its own method", () => {
    const text = `morph m with
  blend = fade
  layers {
    creases {
      blend = morph
    }
  }
  keyframes {
    from {
      eyes {
        state = open
      }
    }
    to {
      eyes {
        state = closed
      }
    }
  }
end
`;
    const found = morphDiagnostics(text).find((d) => d.message.includes("needs a `method`"));
    expect(found).toMatchObject({ line: 3, text: "creases" });
    expect(morphDiagnostics(text.replace("blend = morph", "blend = morph\n      method = trace"))).toEqual([]);
  });

  test("the builtin prototype itself is not checked", () => {
    const program = compile("Hello\n");
    expect(program.context?.["morph"]?.["$default"]).toBeDefined();
    expect(program.diagnostics?.[URI] ?? []).toEqual([]);
  });

  test("the reserved `morph` root name warns like other builtin types", () => {
    const found = diagnosticsOf("store morph = 1\n").find((d) =>
      d.message.includes("'morph' is a reserved builtin type"),
    );
    expect(found).toBeDefined();
  });

  test("`morph.blink` stays a reference in an expression", () => {
    const text = `${BLINK}
function _chosen()
  return morph.blink
end
`;
    const program = compile(text);
    expect(Object.keys(program.context?.["morph"] ?? {}).sort()).toEqual(["$default", "blink"]);
    expect(diagnosticsOf(text)).toEqual([]);
  });

  test("the whole chain supplies what a morph leaves out", () => {
    const text = `morph base with
  method = trace
  keyframes {
    from {
      eyes {
        state = open
      }
    }
    to {
      eyes {
        state = closed
      }
    }
  }
end

morph middle as base with
  fallback = cut
end

morph leaf as middle with
  timing {
    duration = 1
  }
end
`;
    expect(morphDiagnostics(text)).toEqual([]);
  });
});

/** Wrap keyframe lines into an otherwise valid morph. */
const BLINK_BRACED = `morph blink with
  blend = morph
  method = bend
  fallback = fade

  layers {
    creases { fallback = scale }
  }

  keyframes {
    0% {
      eyes { state = eyes.open }
      eyebrows { translate = 0 0 }
      nose { translate = 0 0 }
    }
    33.333% {
      eyes { state = eyes.closed }
      eyebrows { translate = 0 8px }
      nose { translate = 0 -2px }
    }
    100% {
      eyes { state = eyes.open }
      eyebrows { translate = 0 0 }
      nose { translate = 0 0 }
    }
  }

  timing {
    duration = 0.25
    easing = steps(3)
    delay = 0.7
    iterations = infinite
    iteration_delay_min = 0.2
    iteration_delay_max = 6
  }

  clips {
    { between { eyelash-left }; targets { eyeball-white-left; eyeball-shadow-left; pupil-left } }
    { between { eyelash-right }; targets { eyeball-white-right; eyeball-shadow-right; pupil-right } }
  }
end
`;

/** Wrap brace keyframe entries into an otherwise valid morph. */
const withBraceKeyframes = (keyframes: string, extra = "") => `morph m with
  method = match
${extra}  keyframes {
${keyframes}  }
end
`;

const TWO_POSES_BRACED = `    from { eyes { state = open } }
    to { eyes { state = closed } }
`;

describe("morph blocks written with braces", () => {
  test("the canonical example lowers to the struct of its indented form", () => {
    expect(structOf(BLINK_BRACED, "blink")).toEqual(structOf(BLINK, "blink"));
    expect(diagnosticsOf(BLINK_BRACED)).toEqual([]);
  });

  test.each([
    ["unknown root field", "  speed = 2\n", "Unknown morph field `speed`", "speed"],
    ["timing field at the root", "  duration = 2\n", "`duration` belongs in `timing { … }`", "duration"],
    ["policy inside timing", "  timing { method = bend }\n", "`method` belongs at the morph root", "method"],
    ["state at the root", "  state = open\n", "`state` belongs in a keyframe container", "state"],
    ["unknown blend", "  blend = melt\n", "`melt` is not a `blend`", "melt"],
    ["fallback cannot be morph", "  fallback = morph\n", "`morph` is not a `fallback`", "morph"],
    ["unknown method", "  layers { creases { method = taper } }\n", "`taper` is not a `method`", "taper"],
    ["string duration", "  timing { duration = \"0.25s\" }\n", "Timing values are numbers of seconds", "\"0.25s\""],
    ["zero duration", "  timing { duration = 0 }\n", "`duration` must be greater than 0", "0"],
    ["negative delay", "  timing { delay = -1 }\n", "`delay` must not be negative", "-1"],
    ["fractional iterations", "  timing { iterations = 1.5 }\n", "`iterations` is a whole number", "1.5"],
    ["unknown direction", "  timing { direction = backwards }\n", "`backwards` is not a `direction`", "backwards"],
    ["unknown easing", "  timing { easing = bouncy }\n", "`bouncy` is not an easing", "bouncy"],
    ["bad steps", "  timing { easing = steps(0) }\n", "`steps()` takes a whole number", "steps(0)"],
    ["bad cubic-bezier", "  timing { easing = cubic-bezier(2, 0, 1, 1) }\n", "x values of `cubic-bezier()`", "cubic-bezier(2, 0, 1, 1)"],
    ["unpaired bound", "  timing { iteration_delay_min = 1 }\n", "`iteration_delay_min` needs `iteration_delay_max`", "iteration_delay_min"],
    ["reversed bounds", "  timing { iteration_delay_min = 3; iteration_delay_max = 1 }\n", "`iteration_delay_max` (1) must be at least", "iteration_delay_max"],
    ["negative bound", "  timing { iteration_delay_min = -1; iteration_delay_max = 1 }\n", "`iteration_delay_min` must not be negative", "-1"],
    ["scalar layers entry", "  layers { creases = scale }\n", "`creases` in `layers { … }` is a label", "creases = scale"],
    ["unknown layer policy field", "  layers { creases { duration = 1 } }\n", "`duration` belongs in `timing { … }`", "duration"],
  ])("%s", (_name, extra, message, text) => {
    const found = morphDiagnostics(withBraceKeyframes(TWO_POSES_BRACED, extra)).find((d) =>
      d.message.includes(message),
    );
    expect(found, JSON.stringify(morphDiagnostics(withBraceKeyframes(TWO_POSES_BRACED, extra)))).toBeDefined();
    expect(found!.text).toBe(text);
  });

  // The same keyframe cases as the indented table. Where the indented form
  // reports a whole line (`- 0.5`, `eyes:`), the brace form reports the entry
  // as it is written there (`0.5`, `eyes {`).
  test.each([
    [
      "a scalar shorthand pose",
      "    from { eyes = closed }\n    to { eyes { state = open } }\n",
      "`eyes = …` is not a pose",
      "eyes = closed",
    ],
    [
      "a scalar list keyframe",
      "    0.5\n    { eyes { state = open } }\n",
      "A keyframe is a pose, not a single value",
      "0.5",
    ],
    [
      "an empty container",
      "    from { eyes {} }\n    to { eyes { state = open } }\n",
      "`eyes { … }` poses nothing",
      "eyes {",
    ],
    [
      "the historical `option` field",
      "    from { eyes { option = closed } }\n    to { eyes { state = open } }\n",
      "Use `state`",
      "option",
    ],
    [
      "an offset above 1",
      "    { offset = 1.5; eyes { state = open } }\n    { eyes { state = closed } }\n",
      "Keyframe offset 1.5 must be between 0 and 1",
      "1.5",
    ],
    [
      "decreasing offsets",
      "    { offset = 0.6; eyes { state = open } }\n    { offset = 0.4; eyes { state = closed } }\n",
      "Keyframe offsets must not decrease",
      "0.4",
    ],
    [
      "a 3D translate",
      "    from { nose { translate = 0 0 5px } }\n    to { nose { translate = 0 0 } }\n",
      "Only 2D `translate` is supported",
      "0 0 5px",
    ],
    [
      "a 3D transform function",
      "    from { nose { transform = rotateX(20deg) } }\n    to { nose { transform = none } }\n",
      "3D transforms are not supported",
      "rotateX(20deg)",
    ],
    [
      "an unsupported layer property",
      "    from { nose { perspective = 100px } }\n    to { nose { translate = 0 0 } }\n",
      "Unknown morph field `perspective`",
      "perspective",
    ],
    [
      "opacity above 1",
      "    from { nose { opacity = 2 } }\n    to { nose { opacity = 1 } }\n",
      "`opacity` must be between 0 and 1",
      "2",
    ],
    [
      "a keyframe block without positions or items",
      "    eyes { state = open }\n",
      "Write each keyframe as a position",
      "keyframes",
    ],
  ])("%s", (_name, keyframes, message, text) => {
    const found = morphDiagnostics(withBraceKeyframes(keyframes)).find((d) =>
      d.message.includes(message),
    );
    expect(found, JSON.stringify(morphDiagnostics(withBraceKeyframes(keyframes)))).toBeDefined();
    expect(found!.text).toBe(text);
  });

  test("fewer than two poses", () => {
    const found = morphDiagnostics(
      withBraceKeyframes("    from { eyes { state = open } }\n"),
    ).find((d) => d.message.includes("at least two keyframes"));
    expect(found?.text).toBe("keyframes");
  });

  test("clip entries need both label lists and cannot clip their own edges", () => {
    const text = withBraceKeyframes(
      TWO_POSES_BRACED,
      "  clips {\n    { between { eyelash-left }; targets { eyelash-left } }\n    { targets { pupil-left } }\n  }\n",
    );
    const found = morphDiagnostics(text);
    expect(found.find((d) => d.message.includes("cannot also clip it"))).toMatchObject({
      line: 3,
      text: "eyelash-left",
      character: text.split("\n")[3]!.lastIndexOf("eyelash-left"),
    });
    expect(found.find((d) => d.message.includes("needs `between { … }`"))).toMatchObject({
      line: 4,
      text: "{",
    });
  });
});

/** An image whose eyes live in two folders with their own defaults. */
const TWO_FOLDERS = `<svg xmlns="http://www.w3.org/2000/svg">
<g data-name="face.happy:default" id="happy">
  <g data-name="lids:eyes.open:default" id="h-open"/>
  <g data-name="lids:eyes.closed" id="h-closed"/>
</g>
<g data-name="face.sleepy" id="sleepy">
  <g data-name="lids:eyes.closed:default" id="s-closed"/>
  <g data-name="lids:eyes.open" id="s-open"/>
</g>
</svg>`;

const WIDE = `<svg xmlns="http://www.w3.org/2000/svg">
<g data-name="lids:eyes.open:default" id="open"/>
<g data-name="lids:eyes.closed" id="closed"/>
</svg>`;

const NO_CLOSED = `<svg xmlns="http://www.w3.org/2000/svg">
<g data-name="lids:eyes.open:default" id="open"/>
<g data-name="lids:eyes.squint" id="squint"/>
</svg>`;

const NO_GROUPS = `<svg xmlns="http://www.w3.org/2000/svg"><g data-name="tree" id="tree"/></svg>`;

const MOUTH_ONLY = `<svg xmlns="http://www.w3.org/2000/svg">
<g data-name="lips:mouth.open:default" id="open"/>
<g data-name="lips:mouth.closed" id="closed"/>
</svg>`;

const EYES_AND_MOUTH = `<svg xmlns="http://www.w3.org/2000/svg">
<g data-name="lids:eyes.open:default" id="open"/>
<g data-name="lids:eyes.closed" id="closed"/>
<g data-name="lips:mouth.open:default" id="mopen"/>
<g data-name="lips:mouth.closed" id="mclosed"/>
</svg>`;

const SIMPLE_BLINK = `morph blink with
  method = bend
  keyframes {
    from {
      eyes {
        state = open
      }
    }
    50% {
      eyes {
        state = closed
      }
    }
    to {
      eyes {
        state = open
      }
    }
  }
end
`;

const bindingOf = (text: string, images: Image[]) => {
  const program = compile(text, images);
  return bindMorph(program.context!, program.context!["morph"]!["blink"]);
};

describe("morph binding", () => {
  test("each folder rests by its own default; hidden folders do not count", () => {
    const binding = bindingOf(SIMPLE_BLINK, [{ name: "bunny", svg: TWO_FOLDERS }]);
    const bunny = binding.candidates.find((c) => c.image === "bunny")!;
    expect(bunny.compatible).toBe(true);
    const base = bunny.variants.find((v) => v.name === "bunny")!;
    // Only the happy face is shown at rest, so only its open default counts.
    expect(base.status).toBe("active");
    expect(base.rest["eyes"]).toEqual({ "face.happy:default": "open" });
  });

  test("a variant resting in another state is dormant, and one showing both disagreeing folders is skipped", () => {
    const text = `${SIMPLE_BLINK}
[[bunny~sleepy]]
[[bunny~eyes.closed]]
`;
    const binding = bindingOf(text, [{ name: "bunny", svg: TWO_FOLDERS }]);
    const variants = binding.candidates[0]!.variants;
    expect(variants.find((v) => v.name === "bunny~sleepy")?.status).toBe("dormant");
    expect(variants.find((v) => v.name === "bunny~eyes.closed")?.status).toBe("dormant");
    const warnings = morphDiagnostics(text, [{ name: "bunny", svg: TWO_FOLDERS }]);
    expect(warnings.filter((d) => d.message.includes("does not apply"))).toEqual([]);
  });

  test("folders that rest in different states when both are shown skip the variant with a warning", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
<g data-name="left" id="left">
  <g data-name="lid:eyes.open:default" id="l-open"/>
  <g data-name="lid:eyes.closed" id="l-closed"/>
</g>
<g data-name="right" id="right">
  <g data-name="lid:eyes.closed:default" id="r-closed"/>
  <g data-name="lid:eyes.open" id="r-open"/>
</g>
</svg>`;
    const binding = bindingOf(SIMPLE_BLINK, [{ name: "wink", svg }]);
    expect(binding.candidates[0]!.variants[0]!.status).toBe("skipped");
    const warning = morphDiagnostics(SIMPLE_BLINK, [{ name: "wink", svg }]).find((d) =>
      d.message.includes("does not apply to `wink`"),
    );
    expect(warning).toMatchObject({ line: 0, text: "blink", severity: 2 });
    expect(warning!.message).toContain("rest in different `eyes` states");
  });

  test("a directional refinement satisfies its base state and keeps its concrete rest", () => {
    const text = `${SIMPLE_BLINK}
[[bunny~eyes.open-wide]]
`;
    const binding = bindingOf(text, [{ name: "bunny", svg: WIDE }]);
    const wide = binding.candidates[0]!.variants.find((v) => v.name === "bunny~eyes.open-wide")!;
    expect(wide.status).toBe("active");
    expect(wide.rest["eyes"]).toEqual({ root: "open-wide" });
  });

  test("a refinement is shown by its base artwork, but a base state is not invented from a refinement", () => {
    // `open-wide` selects layers drawn for `open`, so this image can show it.
    const refined = SIMPLE_BLINK.replace("state = closed", "state = open-wide");
    expect(morphDiagnostics(refined, [{ name: "bunny", svg: WIDE }])).toEqual([]);
    // Artwork drawn only for `open-wide` cannot show a plain `open`.
    const wideOnly = `<svg xmlns="http://www.w3.org/2000/svg">
<g data-name="lids:eyes.open-wide:default" id="wide"/>
<g data-name="lids:eyes.closed" id="closed"/>
</svg>`;
    const found = morphDiagnostics(SIMPLE_BLINK, [{ name: "owl", svg: wideOnly }]);
    expect(found.find((d) => d.message.includes("image `owl`: its `eyes` group has no `open` state"))).toBeDefined();
  });

  test("a state missing from only some images warns for those images only", () => {
    const images = [
      { name: "bunny", svg: WIDE },
      { name: "raffles", svg: NO_CLOSED },
    ];
    const found = morphDiagnostics(SIMPLE_BLINK, images);
    const perImage = found.filter((d) => d.message.includes("does not apply"));
    expect(perImage).toHaveLength(1);
    expect(perImage[0]).toMatchObject({ line: 0, text: "blink" });
    expect(perImage[0]!.message).toContain("image `raffles`: its `eyes` group has no `closed` state");
    // Another image has the state, so the state itself is not unknown.
    expect(found.find((d) => d.message.includes("No image's `eyes` group"))).toBeUndefined();
  });

  test("images with none of the morph's groups are not candidates and stay silent", () => {
    const images = [
      { name: "bunny", svg: WIDE },
      { name: "tree", svg: NO_GROUPS },
      { name: "mouth", svg: MOUTH_ONLY },
    ];
    const binding = bindingOf(SIMPLE_BLINK, images);
    expect(binding.candidates.map((c) => c.image)).toEqual(["bunny"]);
    expect(morphDiagnostics(SIMPLE_BLINK, images)).toEqual([]);
  });

  test("every driven group must be present", () => {
    const text = SIMPLE_BLINK.replace(
      "    50% {\n      eyes {\n        state = closed\n      }\n",
      "    50% {\n      eyes {\n        state = closed\n      }\n      mouth {\n        state = closed\n      }\n",
    );
    const images = [
      { name: "bunny", svg: WIDE },
      { name: "talker", svg: EYES_AND_MOUTH },
    ];
    const binding = bindingOf(text, images);
    expect(binding.candidates.find((c) => c.image === "bunny")).toMatchObject({
      compatible: false,
      missingGroups: ["mouth"],
      variants: [],
    });
    expect(binding.candidates.find((c) => c.image === "talker")?.compatible).toBe(true);
    const found = morphDiagnostics(text, images).filter((d) => d.message.includes("does not apply"));
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain("image `bunny`: it has no `mouth` group");
  });

  test("a first keyframe that leaves a group out starts from each variant's own rest, as in CSS", () => {
    const text = `morph blink with
  method = bend
  keyframes {
    from {
      nose {
        translate = 0 0
      }
    }
    50% {
      eyes {
        state = closed
      }
    }
    to {
      nose {
        translate = 0 0
      }
    }
  }
end

[[bunny~eyes.closed]]
`;
    const binding = bindingOf(text, [{ name: "bunny", svg: WIDE }]);
    expect(binding.requirements.rest.has("eyes")).toBe(false);
    const closed = binding.candidates[0]!.variants.find((v) => v.name === "bunny~eyes.closed")!;
    expect(closed.status).toBe("active");
    expect(closed.rest["eyes"]).toEqual({ root: "closed" });
  });

  test("candidates are found by group before full compatibility", () => {
    const binding = bindingOf(SIMPLE_BLINK, [{ name: "raffles", svg: NO_CLOSED }]);
    expect(binding.candidates.map((c) => [c.image, c.compatible])).toEqual([["raffles", false]]);
  });
});

describe("block-level artwork coverage", () => {

  test("hypothetical binding selections publish no attribute warnings on the script", () => {
    const text = `${BLINK}
[[bunny~look.left]]
`;
    const svg = PORTRAIT.replace(
      '<g data-name="pupil-left:eyes.open" id="pl"/>',
      '<g data-name="pupil-left:eyes.open:look.left" id="pl"/>',
    );
    const found = diagnosticsOf(text, [{ name: "bunny", svg }]);
    expect(found.filter((d) => d.message.includes("closed eyes"))).toEqual([]);
  });
});

describe("transition `depth`", () => {
  const RAISE = (root: string, layers = "", keyframes = "from { eyes { state = open } }\n    to { eyes { state = closed } }") => `morph m with
  method = bend
${root}  layers {
    eyelash-left { fallback = fade${layers} }
  }
  keyframes {
    ${keyframes}
  }
end
`;
  const recipeOf = (text: string, name = "m") => JSON.parse(compile(text).morphs!.recipes[name]!);
  const depthErrors = (text: string) => morphDiagnostics(text).filter((d) => d.message.includes("depth"));

  test("`depth = eyes.closed` stays literal text at the root and under a label", () => {
    const struct = structOf(RAISE("  depth = eyes.closed\n", "; depth = rest"), "m");
    expect(struct.depth).toBe("eyes.closed");
    expect(struct.layers["eyelash-left"].depth).toBe("rest");
    expect(morphDiagnostics(RAISE("  depth = eyes.closed\n", "; depth = rest"))).toEqual([]);
  });

  test("`rest` is the builtin default and leaves the recipe as it is without the field", () => {
    const program = compile(RAISE(""));
    expect(program.context?.["morph"]?.["m"].depth).toBe("rest");
    const recipe = recipeOf(RAISE(""));
    expect(recipe.depth).toBeUndefined();
    expect(recipe.layers["eyelash-left"]).toEqual({ fallback: "fade" });
  });

  test("the recipe carries the resolved `depth`, so changing it changes the bake key", () => {
    expect(recipeOf(RAISE("  depth = eyes.closed\n")).depth).toBe("eyes.closed");
    expect(recipeOf(RAISE("", "; depth = eyes.closed")).layers["eyelash-left"]).toEqual({ fallback: "fade", depth: "eyes.closed" });
    const keys = (text: string) => compile(text, [{ name: "bunny", svg: PORTRAIT }]).morphs!.variants;
    const before = JSON.stringify(keys(RAISE("")));
    const after = JSON.stringify(keys(RAISE("  depth = eyes.closed\n")));
    expect(before).not.toBe("{}");
    expect(after).not.toBe(before);
  });

  test("a label's and the root's `depth` resolve field by field through `as PARENT`", () => {
    const text = `${RAISE("  depth = eyes.closed\n")}
morph child as m with
  layers {
    eyelash-left { depth = rest }
    pupil-left { method = match }
  }
end
`;
    expect(morphDiagnostics(text)).toEqual([]);
    const recipe = recipeOf(text, "child");
    expect(recipe.depth).toBe("eyes.closed");
    expect(recipe.layers["eyelash-left"]).toEqual({ fallback: "fade", depth: "rest" });
    expect(recipe.layers["pupil-left"]).toEqual({ method: "match" });
  });

  test.each([
    ["a value that is neither `rest` nor `group.state`", "2", "`2` is not a `depth`"],
    ["a bare state", "closed", "Write `depth = eyes.closed`"],
    ["a group the morph does not drive", "mouth.open", "does not drive `mouth`"],
    ["a state the keyframes do not name", "eyes.squint", "never shows `eyes.squint`"],
  ])("%s is reported at the value", (_, value, message) => {
    for (const text of [RAISE(`  depth = ${value}\n`), RAISE("", `; depth = ${value}`)]) {
      const found = depthErrors(text);
      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({ text: value, severity: 1 });
      expect(found[0]!.message).toContain(message);
    }
  });

  test("`depth` in a keyframe container says where it belongs", () => {
    const inContainer = RAISE("", "", "from { eyes { state = open; depth = eyes.closed } }\n    to { eyes { state = closed } }");
    expect(depthErrors(inContainer)).toEqual([
      expect.objectContaining({ text: "depth", message: "`depth` belongs at the morph root or under a label in `layers { … }`." }),
    ]);
  });

  test("an inherited `depth` the child's keyframes no longer show is reported on its `as`", () => {
    const text = `${RAISE("  depth = eyes.closed\n")}
morph child as m with
  keyframes {
    from { eyes { state = open } }
    to { eyes { state = squint } }
  }
end
`;
    const found = depthErrors(text).filter((d) => d.line > 10);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ text: "m", severity: 1 });
    expect(found[0]!.message).toContain("inherited");
  });

  test("a `depth` a `define` parent supplies with its keyframes is checked against them on the child's `as`", () => {
    const text = `define base as morph with
  method = "bend"
  depth = "eyes.missing"
  keyframes = { { offset = 0, eyes = { state = "open" } }, { offset = 1, eyes = { state = "closed" } } }
end

morph child as base with
  fallback = fade
end
`;
    const found = depthErrors(text);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ line: 6, text: "base", severity: 1 });
    expect(found[0]!.message).toContain("never shows `eyes.missing`");
  });

  test("a parent block's own `depth` problem is reported there, not again on a child that keeps it", () => {
    const text = `${RAISE("  depth = eyes.squint\n")}
morph child as m with
  fallback = cut
end
`;
    const found = depthErrors(text);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ text: "eyes.squint" });
  });
});

describe("`paints`", () => {
  const ENTRY = "{ targets { eyelash-left; eyelash-right }; state = eyes.closed; when = mask.on; fill = #c9c9c9; span = 40% }";
  const KEYFRAMES = "from { eyes { state = open } }\n    50% { eyes { state = closed } }\n    to { eyes { state = open } }";
  const PAINTED = (entries: string[] | null = [ENTRY], keyframes = KEYFRAMES, extra = "") => `morph m with
  method = bend
${extra}  keyframes {
    ${keyframes}
  }
${entries ? `  paints {\n    ${entries.join("\n    ")}\n  }\n` : ""}end
`;
  const recipeOf = (text: string, name = "m") => JSON.parse(compile(text).morphs!.recipes[name]!);
  const paintErrors = (text: string) => morphDiagnostics(text).filter((d) => d.severity === 1);

  test("the example entry lowers with literal `state`, `when`, `fill` and `stroke` and a parsed `span`", () => {
    const struct = structOf(PAINTED([ENTRY, "{ targets { lids }; state = eyes.closed; stroke = rgb(201, 201, 201) }"]), "m");
    expect(struct.paints).toEqual([
      { targets: ["eyelash-left", "eyelash-right"], state: "eyes.closed", when: "mask.on", fill: "#c9c9c9", span: "40%" },
      { targets: ["lids"], state: "eyes.closed", stroke: "rgb(201, 201, 201)" },
    ]);
    expect(morphDiagnostics(PAINTED())).toEqual([]);
    const recipe = recipeOf(PAINTED([ENTRY, "{ targets { lids }; state = eyes.closed; stroke = rgb(201, 201, 201); span = 0.25 }"]));
    expect(recipe.paints).toEqual([
      { targets: ["eyelash-left", "eyelash-right"], state: "eyes.closed", when: "mask.on", span: 0.4, fill: "rgba(201,201,201,1)" },
      { targets: ["lids"], state: "eyes.closed", span: 0.25, stroke: "rgba(201,201,201,1)" },
    ]);
  });

  test("the builtin's `paints = {}` leaves the recipe without the field, and a child inherits its parent's entries", () => {
    const program = compile(PAINTED(null));
    expect(program.context?.["morph"]?.["m"]?.paints).toEqual({});
    expect(recipeOf(PAINTED(null)).paints).toBeUndefined();
    const child = `${PAINTED()}
morph child as m with
  fallback = cut
end
`;
    expect(morphDiagnostics(child)).toEqual([]);
    expect(recipeOf(child, "child").paints).toEqual(recipeOf(child).paints);
  });

  test("`opacity = 0.4` and `opacity = 40%` give one recipe, alone or beside a colour", () => {
    const decimal = PAINTED(["{ targets { eyeshadow-left; eyeshadow-right }; state = eyes.closed; opacity = 0.4; span = 40% }"]);
    const percent = PAINTED(["{ targets { eyeshadow-left; eyeshadow-right }; state = eyes.closed; opacity = 40%; span = 40% }"]);
    expect(morphDiagnostics(decimal)).toEqual([]);
    expect(morphDiagnostics(percent)).toEqual([]);
    expect(recipeOf(decimal).paints).toEqual([{ targets: ["eyeshadow-left", "eyeshadow-right"], state: "eyes.closed", span: 0.4, opacity: 0.4 }]);
    expect(compile(percent).morphs!.recipes["m"]).toBe(compile(decimal).morphs!.recipes["m"]);
    expect(recipeOf(PAINTED(["{ targets { lids }; state = eyes.closed; fill = red; opacity = 0 }"])).paints).toEqual([
      { targets: ["lids"], state: "eyes.closed", span: 1, fill: "rgba(255,0,0,1)", opacity: 0 },
    ]);
  });

  test("an opacity-only entry written without its braces is told an entry may set `opacity`", () => {
    const found = paintErrors(PAINTED(["targets { eyeshadow-left }; state = eyes.closed; opacity = 0"]));
    expect(found.length).toBeGreaterThan(0);
    for (const d of found.filter((d) => d.message.includes("A `paints` entry is"))) {
      expect(d.message).toContain("at least one of `fill`, `stroke` and `opacity`");
    }
    expect(found.some((d) => d.message.includes("A `paints` entry is"))).toBe(true);
    expect(found.some((d) => d.message.includes("a `fill` or `stroke`:"))).toBe(false);
  });

  test("equal colours give one recipe, and changing a colour changes the bake key", () => {
    const spelled = PAINTED([ENTRY.replace("#c9c9c9", "rgb(201 201 201)")]);
    expect(compile(spelled).morphs!.recipes["m"]).toBe(compile(PAINTED()).morphs!.recipes["m"]);
    const keys = (text: string) => JSON.stringify(compile(text).morphs!.variants);
    expect(keys(PAINTED())).not.toBe("{}");
    expect(keys(PAINTED([ENTRY.replace("#c9c9c9", "#c9c9c8")]))).not.toBe(keys(PAINTED()));
  });

  test.each([
    ["an entry that is not a `{ … }` block", "eyelash-left", "eyelash-left", "A `paints` entry is a `{ … }` entry"],
    ["an unknown field", "{ targets { eyelash-left }; state = eyes.closed; fill = red; colour = red }", "colour", "Unknown morph field `colour`"],
    ["a field that belongs elsewhere", "{ targets { eyelash-left }; state = eyes.closed; fill = red; between { eyelash-left } }", "between", "`between` belongs in a `clips { … }` entry."],
    ["missing `targets`", "{ state = eyes.closed; fill = red }", "{", "needs `targets { … }`"],
    ["empty `targets`", "{ targets { }; state = eyes.closed; fill = red }", "targets", "`targets` is a list of layer labels"],
    ["a missing `state`", "{ targets { eyelash-left }; fill = red }", "{", "needs a `state`"],
    ["a bare `state`", "{ targets { eyelash-left }; state = closed; fill = red }", "closed", "Write `state = eyes.closed`"],
    ["an undriven `state`", "{ targets { eyelash-left }; state = mouth.open; fill = red }", "mouth.open", "does not drive `mouth`"],
    ["an unnamed `state`", "{ targets { eyelash-left }; state = eyes.squint; fill = red }", "eyes.squint", "never shows `eyes.squint`"],
    ["the starting state", "{ targets { eyelash-left }; state = eyes.open; fill = red }", "eyes.open", "the state this morph starts from"],
    ["a bare `when`", "{ targets { eyelash-left }; state = eyes.closed; when = on; fill = red }", "on", "`when` names a state with its group"],
    ["a `when` naming a driven group", "{ targets { eyelash-left }; state = eyes.closed; when = eyes.open; fill = red }", "eyes.open", "which this morph drives"],
    ["no `fill`, `stroke` or `opacity`", "{ targets { eyelash-left }; state = eyes.closed }", "{", "needs a `fill` or `stroke` colour or an `opacity`"],
    ["an `opacity` over 1", "{ targets { eyelash-left }; state = eyes.closed; opacity = 1.5 }", "1.5", "`opacity` is a number from 0 to 1"],
    ["an `opacity` over 100%", "{ targets { eyelash-left }; state = eyes.closed; opacity = 140% }", "140%", "`opacity` is a number from 0 to 1"],
    ["an unreadable `opacity`", "{ targets { eyelash-left }; state = eyes.closed; opacity = half }", "half", "`opacity` is a number from 0 to 1"],
    ["a `fill` that does not parse", "{ targets { eyelash-left }; state = eyes.closed; fill = #c9c9c9z }", "#c9c9c9z", "is not a `fill` colour"],
    ["a `stroke` that names no colour of its own", "{ targets { eyelash-left }; state = eyes.closed; stroke = currentColor }", "currentColor", "is not a `stroke` colour"],
    ["a `span` over 100%", "{ targets { eyelash-left }; state = eyes.closed; fill = red; span = 140% }", "140%", "`span` is a percentage from `0%` to `100%`"],
    ["a `span` over 1", "{ targets { eyelash-left }; state = eyes.closed; fill = red; span = 2 }", "2", "`span` is a percentage from `0%` to `100%`"],
  ])("%s is reported on its span", (_, entry, text, message) => {
    const found = paintErrors(PAINTED([entry]));
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ text, severity: 1 });
    expect(found[0]!.message).toContain(message);
    // A rejected value leaves the entry out of the recipe rather than guessed at.
    if (!message.startsWith("Unknown") && !message.includes("belongs")) expect(recipeOf(PAINTED([entry])).paints).toBeUndefined();
  });

  test.each([
    ["a multiline `paints` entry", PAINTED(["{\n      targets { eyelash-left }\n      state = eyes.closed\n      when = mask.on\n      fill: #c9c9c9\n      span = 40%\n    }"]), "fill: #c9c9c9", "`fill:` does not set a field: write `fill = #c9c9c9`."],
    ["a one-line `paints` entry", PAINTED(["{ targets { eyelash-left }; state = eyes.closed; fill: #c9c9c9 }"]), "fill: #c9c9c9", "`fill:` does not set a field: write `fill = #c9c9c9`."],
    ["`timing`", PAINTED(null, KEYFRAMES, "  timing {\n    duration: 3\n  }\n"), "duration: 3", "`duration:` does not set a field: write `duration = 3`."],
    ["a keyframe container", PAINTED(null, "from { eyes { state: open } }\n    to { eyes { state = closed } }"), "state: open", "`state:` does not set a field: write `state = open`."],
    ["a clip entry's label list", PAINTED(null, KEYFRAMES, "  clips {\n    {\n      between { eyelash-left }\n      targets: pupil-left\n    }\n  }\n"), "targets: pupil-left", "`targets:` does not set a field: write `targets { pupil-left }`."],
    ["a `layers` label", PAINTED(null, KEYFRAMES, "  layers {\n    creases {\n      fallback: scale\n    }\n  }\n"), "fallback: scale", "`fallback:` does not set a field: write `fallback = scale`."],
  ])("a field set with `:` in %s is reported on its line with its `=` form", (_, text, written, message) => {
    expect(paintErrors(text)).toEqual([expect.objectContaining({ text: written, message })]);
  });

  test("a `paints` block missing its closing brace is reported on the brace", () => {
    const text = PAINTED(["{ targets { eyelash-left }; state = eyes.closed; fill = #c9c9c9 }"]).replace("\n  }\nend", "\nend");
    const found = diagnosticsOf(text).filter((d) => d.message.includes("missing its closing"));
    expect(found).toEqual([expect.objectContaining({ text: "{", line: 7 })]);
  });

  test("`paints` that is not a list is reported", () => {
    const found = paintErrors(PAINTED(null, KEYFRAMES, "  paints = 2\n"));
    expect(found).toEqual([expect.objectContaining({ text: "paints", message: expect.stringContaining("`paints` is a list") })]);
  });

  test.each([
    ["a keyframe container", (paints: string) => PAINTED([ENTRY], `from { eyes { state = open; ${paints} } }\n    50% { eyes { state = closed } }\n    to { eyes { state = open } }`)],
    ["a `layers` label", (paints: string) => PAINTED([ENTRY], KEYFRAMES, `  layers { eyelash-left { ${paints} } }\n`)],
    ["a clip", (paints: string) => PAINTED([ENTRY], KEYFRAMES, `  clips { { between { eyelash-left }; targets { pupil-left }; ${paints} } }\n`)],
  ])("`paints` inside %s gets the placement message", (_, place) => {
    const found = paintErrors(place(`paints { ${ENTRY} }`));
    expect(found).toEqual([expect.objectContaining({ text: "paints", message: "`paints` belongs at the morph root." })]);
  });

  test("an inherited entry the child's keyframes no longer show is reported on its `as`", () => {
    const text = `${PAINTED()}
morph child as m with
  keyframes {
    from { eyes { state = open } }
    to { eyes { state = squint } }
  }
end
`;
    const found = paintErrors(text).filter((d) => d.line > 10);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ text: "m" });
    expect(found[0]!.message).toContain("`paints` entry 1, inherited");
    expect(found[0]!.message).toContain("never shows `eyes.closed`");
  });

  test("an entry a `define` parent supplies is checked on the child's `as`", () => {
    const text = `define base as morph with
  method = "bend"
  keyframes = { { offset = 0, eyes = { state = "open" } }, { offset = 1, eyes = { state = "closed" } } }
  paints = { { targets = { "eyelash-left" }, state = "eyes.closed", fill = "nocolour" } }
end

morph child as base with
  fallback = fade
end
`;
    const found = paintErrors(text);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ line: 6, text: "base" });
    expect(found[0]!.message).toContain("`paints`, inherited from `base`: entry 1:");
    expect(found[0]!.message).toContain("not a `fill` colour");
  });

  test.each([
    ["missing `targets`", '{ state = "eyes.closed", fill = "red" }', "needs `targets { … }`"],
    ["empty `targets`", '{ targets = {}, state = "eyes.closed", fill = "red" }', "`targets` is a list of layer labels"],
    ["a bare `state`", '{ targets = { "eyelash-left" }, state = "closed", fill = "red" }', "`closed` is not a pose"],
    ["an unknown field", '{ targets = { "eyelash-left" }, state = "eyes.closed", fill = "red", colour = "red" }', "Unknown morph field `colour`"],
    ["an entry that is not a block", '"eyelash-left"', "A `paints` entry is a `{ … }` entry"],
  ])("a `define` parent's entry with %s is reported on the child's `as`", (_, entry, message) => {
    const text = `define base as morph with
  method = "bend"
  keyframes = { { offset = 0, eyes = { state = "open" } }, { offset = 1, eyes = { state = "closed" } } }
  paints = { ${entry} }
end

morph child as base with
  fallback = fade
end
`;
    const found = paintErrors(text);
    expect(found).toEqual([expect.objectContaining({ line: 6, text: "base", message: expect.stringContaining(message) })]);
    expect(found[0]!.message).toContain("`paints`, inherited from `base`: entry 1:");
  });
});

describe("`partner`", () => {
  const CLIPS = "  clips {\n    { between { eyelash-left }; targets { eyeball-white-left; eyeball-shadow-left; pupil-left } }\n  }\n";
  const PARTNERED = (layers: string, root = "", clips = CLIPS) => `morph m with
  method = bend
${root}  layers {
    ${layers}
  }
  keyframes {
    from { eyes { state = open } }
    50% { eyes { state = closed } }
    to { eyes { state = open } }
  }
${clips}end
`;
  const recipeOf = (text: string, name = "m") => JSON.parse(compile(text).morphs!.recipes[name]!);
  const partnerIssues = (text: string) => morphDiagnostics(text).filter((d) => d.message.includes("partner") || d.message.includes("labelled"));

  test("one label, a `= { … }` list and a `{ … }` block lower to the same recipe, the label as a one-label list", () => {
    const scalar = PARTNERED("eyeball-shadow-left { partner = eyelash-left }");
    const listed = PARTNERED("eyeball-shadow-left { partner = { eyelash-left } }");
    const block = PARTNERED("eyeball-shadow-left {\n      partner {\n        eyelash-left\n      }\n    }");
    for (const text of [scalar, listed, block]) {
      expect(morphDiagnostics(text)).toEqual([]);
      expect(recipeOf(text).layers["eyeball-shadow-left"]).toEqual({ partner: ["eyelash-left"] });
    }
    expect(structOf(scalar, "m").layers["eyeball-shadow-left"].partner).toBe("eyelash-left");
    expect(structOf(listed, "m").layers["eyeball-shadow-left"].partner).toEqual(["eyelash-left"]);
  });

  test("a list keeps its written order, which is its priority", () => {
    const text = PARTNERED("eyeball-shadow-right { partner = { eyeball-shadow-right; eyelash-right; eyelash-left } }");
    expect(morphDiagnostics(text)).toEqual([]);
    expect(recipeOf(text).layers["eyeball-shadow-right"]).toEqual({ partner: ["eyeball-shadow-right", "eyelash-right", "eyelash-left"] });
  });

  test("a morph without `partner` keeps the recipe text it has without the field", () => {
    const text = PARTNERED("creases { fallback = scale }");
    expect(compile(text).morphs!.recipes["m"]).toBe(
      '{"name":"m","blend":"morph","method":"bend","fallback":"fade","layers":{"creases":{"fallback":"scale"}},"keyframes":[{"offset":0,"states":{"eyes":"open"}},{"offset":0.5,"states":{"eyes":"closed"}},{"offset":1,"states":{"eyes":"open"}}],"clips":[{"between":["eyelash-left"],"targets":["eyeball-white-left","eyeball-shadow-left","pupil-left"]}]}',
    );
  });

  test("adding a partner changes the bake key", () => {
    const keys = (text: string) => JSON.stringify(compile(text).morphs!.variants);
    expect(keys(PARTNERED("creases { fallback = scale }"))).not.toBe("{}");
    expect(keys(PARTNERED("creases { fallback = scale }\n    eyeball-shadow-left { partner = eyelash-left }"))).not.toBe(keys(PARTNERED("creases { fallback = scale }")));
  });

  test("a child morph inherits `partner` from its parent, field by field with the label's other fields", () => {
    const text = `${PARTNERED("eyeball-shadow-left { partner = { eyeball-shadow-left; eyelash-left } }")}
morph child as m with
  layers {
    eyeball-shadow-left { fallback = cut }
  }
end
`;
    expect(morphDiagnostics(text)).toEqual([]);
    expect(recipeOf(text, "child").layers["eyeball-shadow-left"]).toEqual({ fallback: "cut", partner: ["eyeball-shadow-left", "eyelash-left"] });
  });

  test("a child morph inherits `partner` from a `define` parent", () => {
    const text = `define base as morph with
  method = "bend"
  keyframes = { { offset = 0, eyes = { state = "open" } }, { offset = 1, eyes = { state = "closed" } } }
  layers = { ["eyeball-shadow-left"] = { partner = { "eyeball-shadow-left", "eyelash-left" } } }
end

morph child as base with
  fallback = cut
end
`;
    expect(morphDiagnostics(text)).toEqual([]);
    expect(recipeOf(text, "child").layers["eyeball-shadow-left"]).toEqual({ partner: ["eyeball-shadow-left", "eyelash-left"] });
  });

  test.each([
    ["`partner` at the morph root", PARTNERED("creases { fallback = scale }", "  partner = eyelash-left\n"), "partner", "`partner` belongs under a label in `layers { … }`."],
    [
      "`partner` in a clip entry",
      PARTNERED("creases { fallback = scale }", "", "  clips {\n    { between { eyelash-left }; targets { pupil-left }; partner = eyelash-left }\n  }\n"),
      "partner",
      "`partner` belongs under a label in `layers { … }`.",
    ],
    ["a value that is not a label", PARTNERED("eyeball-shadow-left { partner { eyelash-left = 2 } }"), "partner", "`partner` names a label or a list of labels"],
    ["a list item that is not a label", PARTNERED("eyeball-shadow-left { partner { eyelash-left; { eyelash-right } } }"), "{", "`partner` names a label or a list of labels"],
    ["an empty list", PARTNERED("eyeball-shadow-left { partner { } }"), "partner", "`partner` needs at least one label"],
    ["`partner` on a clip's `between` label", PARTNERED("eyelash-left { partner = eyeball-shadow-left }"), "partner", "`eyelash-left` forms an aperture in `clips`, so it cannot take a partner"],
  ])("%s is an error on its span", (_, text, span, message) => {
    const found = morphDiagnostics(text).filter((d) => d.severity === 1);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ text: span });
    expect(found[0]!.message).toContain(message);
  });

  test("a child whose clip makes an inherited partner's label an aperture edge is reported on its `as`, and loses the partner", () => {
    const text = `${PARTNERED("eyelash-left { partner = eyeball-shadow-left }", "", "")}
morph child as m with
  clips {
    { between { eyelash-left }; targets { pupil-left } }
  }
end
`;
    const found = morphDiagnostics(text).filter((d) => d.severity === 1);
    expect(found).toEqual([
      expect.objectContaining({ text: "m", message: "`layers.eyelash-left.partner`, inherited: `eyelash-left` forms an aperture in `clips`, so it cannot take a partner: an aperture edge pairs by its own label." }),
    ]);
    expect(found[0]!.line).toBeGreaterThan(10);
    expect(recipeOf(text, "child").layers["eyelash-left"]).toBeUndefined();
  });

  test("a parent's own partner on its aperture edge is reported once, where it is written", () => {
    const text = `${PARTNERED("eyelash-left { partner = eyeball-shadow-left }")}
morph child as m with
  fallback = cut
end
`;
    const found = morphDiagnostics(text).filter((d) => d.severity === 1);
    expect(found).toEqual([expect.objectContaining({ text: "partner", message: expect.stringContaining("forms an aperture in `clips`") })]);
    expect(found[0]!.line).toBeLessThan(10);
  });

  test("a rejected value leaves `partner` out of the recipe", () => {
    expect(recipeOf(PARTNERED("eyeball-shadow-left { partner { eyelash-left = 2 } }")).layers["eyeball-shadow-left"]).toBeUndefined();
    expect(recipeOf(PARTNERED("eyelash-left { partner = eyeball-shadow-left }")).layers["eyelash-left"]).toBeUndefined();
  });

  test.each([
    ["a list that names only the label itself", "eyeball-shadow-left { partner = eyeball-shadow-left }", "eyeball-shadow-left", "names only `eyeball-shadow-left` itself"],
    ["a label listed twice", "eyeball-shadow-left { partner = { eyelash-left; eyeball-shadow-left; eyelash-left } }", "eyelash-left", "`eyelash-left` is listed twice"],
    ["a label no candidate image has", "eyeball-shadow-left { partner = { eyeball-shadow-left; eyelash-middle } }", "eyelash-middle", "No image the morph applies to has a layer labelled `eyelash-middle`."],
  ])("%s is a warning on its span", (_, layers, span, message) => {
    const found = partnerIssues(PARTNERED(layers));
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ text: span, severity: 2 });
    expect(found[0]!.message).toContain(message);
  });

  test("the duplicate is warned on its second mention, and a self-only list leaves `partner` out of the recipe", () => {
    const layers = "eyeball-shadow-left { partner = { eyelash-left; eyeball-shadow-left; eyelash-left } }";
    const duplicate = partnerIssues(PARTNERED(layers));
    expect(duplicate).toHaveLength(1);
    expect(duplicate[0]!.character).toBe(4 + layers.lastIndexOf("eyelash-left"));
    expect(recipeOf(PARTNERED("eyeball-shadow-left { partner = { eyelash-left; eyeball-shadow-left; eyelash-left } }")).layers["eyeball-shadow-left"]).toEqual({
      partner: ["eyelash-left", "eyeball-shadow-left"],
    });
    expect(recipeOf(PARTNERED("eyeball-shadow-left { partner = eyeball-shadow-left }")).layers["eyeball-shadow-left"]).toBeUndefined();
  });

  test("an invalid `partner` a `define` parent supplies is reported on the child's `as`", () => {
    const text = `define base as morph with
  method = "bend"
  keyframes = { { offset = 0, eyes = { state = "open" } }, { offset = 1, eyes = { state = "closed" } } }
  layers = { ["eyeball-shadow-left"] = { partner = {} } }
end

morph child as base with
  fallback = cut
end
`;
    const found = morphDiagnostics(text).filter((d) => d.severity === 1);
    expect(found).toEqual([expect.objectContaining({ line: 6, text: "base", message: expect.stringContaining("`layers.eyeball-shadow-left.partner`, inherited from `base`") })]);
  });
});
