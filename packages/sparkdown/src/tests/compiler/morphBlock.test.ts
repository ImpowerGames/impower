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

  layers:
    creases:
      fallback = scale

  keyframes:
    0%:
      eyes:
        state = eyes.open
      eyebrows:
        translate = 0 0
      nose:
        translate = 0 0
    33.333%:
      eyes:
        state = eyes.closed
      eyebrows:
        translate = 0 8px
      nose:
        translate = 0 -2px
    100%:
      eyes:
        state = eyes.open
      eyebrows:
        translate = 0 0
      nose:
        translate = 0 0

  timing:
    duration = 0.25
    easing = steps(3)
    delay = 0.7
    iterations = infinite
    iteration_delay_min = 0.2
    iteration_delay_max = 6

  clips:
    -
      between:
        - eyelash-left
      targets:
        - eyeball-white-left
        - eyeball-shadow-left
        - pupil-left
    -
      between:
        - eyelash-right
      targets:
        - eyeball-white-right
        - eyeball-shadow-right
        - pupil-right
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
  timing:
    duration = 1
end
`,
      "slow",
    );
    expect(struct.$extends).toBe("blink");
  });

  test("list, collapsed and from/to keyframes normalize to the same poses", () => {
    const keyed = structOf(
      `morph m with
  keyframes:
    from:
      eyes:
        state = open
    50%:
      eyes:
        state = closed
    to:
      eyes:
        state = open
end
`,
      "m",
    );
    const listed = structOf(
      `morph m with
  keyframes:
    -
      eyes:
        state = open
    -
      eyes:
        state = closed
    -
      eyes:
        state = open
end
`,
      "m",
    );
    const collapsed = structOf(
      `morph m with
  keyframes:
    - eyes:
        state = open
    - eyes:
        state = closed
    - eyes:
        state = open
end
`,
      "m",
    );
    // The list forms omit offsets, so only their normalized poses agree with
    // the keyed form.
    expect(listed.keyframes[0].offset).toBeUndefined();
    expect(collapsed).toEqual(listed);
    expect(normalizeMorphKeyframes(listed.keyframes)).toEqual(keyed.keyframes);
    expect(normalizeMorphKeyframes(collapsed.keyframes)).toEqual(
      normalizeMorphKeyframes(keyed.keyframes),
    );
  });

  test("lists with the same explicit offsets are equal as written", () => {
    const listed = structOf(
      `morph m with
  keyframes:
    -
      offset = 0
      eyes:
        state = open
    -
      offset = 1
      eyes:
        state = closed
end
`,
      "m",
    );
    const keyed = structOf(
      `morph m with
  keyframes:
    from:
      eyes:
        state = open
    to:
      eyes:
        state = closed
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
  keyframes:
    from:
      eyes:
        state = ${value}
    to:
      eyes:
        state = open
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
  keyframes:
    from:
      eyes:
        state = mouth.closed
    to:
      eyes:
        state = open
end
`;
    expect(structOf(text, "m").keyframes[0].eyes.state).toBe("mouth.closed");
    const found = morphDiagnostics(text).find((d) => d.message.includes("`mouth` group"));
    expect(found).toMatchObject({ line: 5, text: "mouth.closed", severity: 1 });
  });

  test("ordinary animation and style values keep their coercion", () => {
    const animation = compileSource(`animation a with
  target = layer.self
  timing:
    iterations = 01
end
`).find((e) => e.block?.context?.["animation"]?.["a"])!.block!.context!["animation"]!["a"];
    expect(animation.target).toEqual({ $type: "layer", $name: "self" });
    expect(animation.timing.iterations).toBe(1);
  });

  test("clip labels stay literal text", () => {
    const struct = structOf(
      `morph m with
  clips:
    -
      between:
        - 01
        - eyes.closed
      targets:
        - true
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
  keyframes:
    from:
      eyes:
        state = open
    to:
      eyes:
        state = closed
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
  timing:
    duration = 1
end
`;
    expect(morphDiagnostics(text)).toEqual([]);
  });

  test("a label that morphs under a non-morph root needs its own method", () => {
    const text = `morph m with
  blend = fade
  layers:
    creases:
      blend = morph
  keyframes:
    from:
      eyes:
        state = open
    to:
      eyes:
        state = closed
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
function chosen()
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
  keyframes:
    from:
      eyes:
        state = open
    to:
      eyes:
        state = closed
end

morph middle as base with
  fallback = cut
end

morph leaf as middle with
  timing:
    duration = 1
end
`;
    expect(morphDiagnostics(text)).toEqual([]);
  });
});

/** Wrap keyframe lines into an otherwise valid morph. */
const withKeyframes = (keyframes: string, extra = "") => `morph m with
  method = match
${extra}  keyframes:
${keyframes}end
`;

const TWO_POSES = `    from:
      eyes:
        state = open
    to:
      eyes:
        state = closed
`;

describe("morph diagnostics", () => {
  test("the canonical example is clean", () => {
    expect(diagnosticsOf(BLINK)).toEqual([]);
  });

  test.each([
    ["unknown root field", "  speed = 2\n", "Unknown morph field `speed`", "speed"],
    ["timing field at the root", "  duration = 2\n", "`duration` belongs in `timing:`", "duration"],
    ["policy inside timing", "  timing:\n    method = bend\n", "`method` belongs at the morph root", "method"],
    ["state at the root", "  state = open\n", "`state` belongs in a keyframe container", "state"],
    ["unknown blend", "  blend = melt\n", "`melt` is not a `blend`", "melt"],
    ["fallback cannot be morph", "  fallback = morph\n", "`morph` is not a `fallback`", "morph"],
    ["unknown method", "  layers:\n    creases:\n      method = taper\n", "`taper` is not a `method`", "taper"],
    ["string duration", "  timing:\n    duration = \"0.25s\"\n", "Timing values are numbers of seconds", "\"0.25s\""],
    ["zero duration", "  timing:\n    duration = 0\n", "`duration` must be greater than 0", "0"],
    ["negative delay", "  timing:\n    delay = -1\n", "`delay` must not be negative", "-1"],
    ["fractional iterations", "  timing:\n    iterations = 1.5\n", "`iterations` is a whole number", "1.5"],
    ["unknown direction", "  timing:\n    direction = backwards\n", "`backwards` is not a `direction`", "backwards"],
    ["unknown easing", "  timing:\n    easing = bouncy\n", "`bouncy` is not an easing", "bouncy"],
    ["bad steps", "  timing:\n    easing = steps(0)\n", "`steps()` takes a whole number", "steps(0)"],
    ["bad cubic-bezier", "  timing:\n    easing = cubic-bezier(2, 0, 1, 1)\n", "x values of `cubic-bezier()`", "cubic-bezier(2, 0, 1, 1)"],
    ["unpaired bound", "  timing:\n    iteration_delay_min = 1\n", "`iteration_delay_min` needs `iteration_delay_max`", "iteration_delay_min"],
    ["reversed bounds", "  timing:\n    iteration_delay_min = 3\n    iteration_delay_max = 1\n", "`iteration_delay_max` (1) must be at least", "iteration_delay_max"],
    ["negative bound", "  timing:\n    iteration_delay_min = -1\n    iteration_delay_max = 1\n", "`iteration_delay_min` must not be negative", "-1"],
    ["scalar layers entry", "  layers:\n    creases = scale\n", "`creases` under `layers:` is a label", "creases = scale"],
    ["unknown layer policy field", "  layers:\n    creases:\n      duration = 1\n", "`duration` belongs in `timing:`", "duration"],
  ])("%s", (_name, extra, message, text) => {
    const found = morphDiagnostics(withKeyframes(TWO_POSES, extra)).find((d) =>
      d.message.includes(message),
    );
    expect(found, JSON.stringify(morphDiagnostics(withKeyframes(TWO_POSES, extra)))).toBeDefined();
    expect(found!.text).toBe(text);
  });

  test.each([
    ["supported easings", ["linear", "ease-in-out", "step-end", "steps(3)", "steps(2, jump-none)", "cubic-bezier(0.1, 0.7, 1, 0.1)", "linear(0, 0.25 25%, 1)"]],
  ])("%s pass", (_name, easings) => {
    for (const easing of easings) {
      expect(
        morphDiagnostics(withKeyframes(TWO_POSES, `  timing:\n    easing = ${easing}\n`)),
        easing,
      ).toEqual([]);
    }
  });

  test("zero iterations and equal bounds are valid", () => {
    expect(
      morphDiagnostics(
        withKeyframes(
          TWO_POSES,
          "  timing:\n    iterations = 0\n    iteration_delay_min = 2\n    iteration_delay_max = 2\n",
        ),
      ),
    ).toEqual([]);
  });

  test.each([
    [
      "a scalar shorthand pose",
      "    from:\n      eyes = closed\n    to:\n      eyes:\n        state = open\n",
      "`eyes = …` is not a pose",
      "eyes = closed",
    ],
    [
      "a scalar list keyframe",
      "    - 0.5\n    -\n      eyes:\n        state = open\n",
      "A keyframe is a pose, not a single value",
      "- 0.5",
    ],
    [
      "an empty container",
      "    from:\n      eyes:\n    to:\n      eyes:\n        state = open\n",
      "`eyes:` poses nothing",
      "eyes:",
    ],
    [
      "the historical `option` field",
      "    from:\n      eyes:\n        option = closed\n    to:\n      eyes:\n        state = open\n",
      "Use `state`",
      "option",
    ],
    [
      "an offset above 1",
      "    -\n      offset = 1.5\n      eyes:\n        state = open\n    -\n      eyes:\n        state = closed\n",
      "Keyframe offset 1.5 must be between 0 and 1",
      "1.5",
    ],
    [
      "decreasing offsets",
      "    -\n      offset = 0.6\n      eyes:\n        state = open\n    -\n      offset = 0.4\n      eyes:\n        state = closed\n",
      "Keyframe offsets must not decrease",
      "0.4",
    ],
    [
      "a 3D translate",
      "    from:\n      nose:\n        translate = 0 0 5px\n    to:\n      nose:\n        translate = 0 0\n",
      "Only 2D `translate` is supported",
      "0 0 5px",
    ],
    [
      "a 3D transform function",
      "    from:\n      nose:\n        transform = rotateX(20deg)\n    to:\n      nose:\n        transform = none\n",
      "3D transforms are not supported",
      "rotateX(20deg)",
    ],
    [
      "an unsupported layer property",
      "    from:\n      nose:\n        perspective = 100px\n    to:\n      nose:\n        translate = 0 0\n",
      "Unknown morph field `perspective`",
      "perspective",
    ],
    [
      "opacity above 1",
      "    from:\n      nose:\n        opacity = 2\n    to:\n      nose:\n        opacity = 1\n",
      "`opacity` must be between 0 and 1",
      "2",
    ],
    [
      "a keyframe block without positions or items",
      "    eyes:\n      state = open\n",
      "Write each keyframe as a position key",
      "keyframes",
    ],
  ])("%s", (_name, keyframes, message, text) => {
    const found = morphDiagnostics(withKeyframes(keyframes)).find((d) =>
      d.message.includes(message),
    );
    expect(found, JSON.stringify(morphDiagnostics(withKeyframes(keyframes)))).toBeDefined();
    expect(found!.text).toBe(text);
  });

  test("fewer than two poses", () => {
    const found = morphDiagnostics(
      withKeyframes("    from:\n      eyes:\n        state = open\n"),
    ).find((d) => d.message.includes("at least two keyframes"));
    expect(found?.text).toBe("keyframes");
  });

  test("clip entries need both label lists and cannot clip their own edges", () => {
    const text = withKeyframes(
      TWO_POSES,
      "  clips:\n    -\n      between:\n        - eyelash-left\n      targets:\n        - eyelash-left\n    -\n      targets:\n        - pupil-left\n",
    );
    const found = morphDiagnostics(text);
    expect(found.find((d) => d.message.includes("cannot also clip it"))?.text).toBe("- eyelash-left");
    expect(found.find((d) => d.message.includes("needs `between:`"))?.line).toBe(8);
  });

  test("a missing `with` is reported and the next block still parses", () => {
    const text = `morph m
  method = match
end

animation fade with
  timing:
    duration = 1
end
`;
    const found = morphDiagnostics(text).find((d) => d.message.includes("Expected `with`"));
    expect(found).toMatchObject({ line: 0, text: "m" });
    const program = compile(text);
    expect(program.context?.["morph"]?.["m"]?.method).toBe("match");
    expect(program.context?.["animation"]?.["fade"]?.timing?.duration).toBe(1);
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
  keyframes:
    from:
      eyes:
        state = open
    50%:
      eyes:
        state = closed
    to:
      eyes:
        state = open
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
      "    50%:\n      eyes:\n        state = closed\n",
      "    50%:\n      eyes:\n        state = closed\n      mouth:\n        state = closed\n",
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

  test("candidates are found by group before full compatibility", () => {
    const binding = bindingOf(SIMPLE_BLINK, [{ name: "raffles", svg: NO_CLOSED }]);
    expect(binding.candidates.map((c) => [c.image, c.compatible])).toEqual([["raffles", false]]);
  });
});

describe("block-level artwork coverage", () => {
  test("unknown groups, states and labels are reported where they are written", () => {
    const text = `morph blink with
  method = bend
  layers:
    crease:
      fallback = scale
  keyframes:
    from:
      eyes:
        state = open
      brows:
        translate = 0 0
    to:
      eyes:
        state = shut
      tail:
        state = up
  clips:
    -
      between:
        - eyelash-left
      targets:
        - pupil
end
`;
    const found = morphDiagnostics(text);
    const at = (message: string) => found.find((d) => d.message.includes(message));
    expect(at("No image has a `tail` attribute group")).toMatchObject({ line: 14, text: "tail" });
    expect(at("No image's `eyes` group has a `shut` state")).toMatchObject({ line: 13, text: "shut" });
    expect(at("layer labelled `crease`")).toMatchObject({ line: 3, text: "crease" });
    expect(at("layer labelled `brows`")).toMatchObject({ line: 9, text: "brows" });
    expect(at("layer labelled `pupil`")).toMatchObject({ line: 21, text: "pupil" });
    expect(at("layer labelled `eyelash-left`")).toBeUndefined();
  });

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
