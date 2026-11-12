import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { bindMorph } from "../../compiler/morph/bindMorph";
import { parseMorphRecipe } from "../../morph/recipe";

const URI = "file:///main.sd";

const FACE = `<svg xmlns="http://www.w3.org/2000/svg">
<g data-name="lids:eyes.open:default" id="open"/>
<g data-name="lids:eyes.closed" id="closed"/>
<g data-name="lips:mouth.open:default" id="m-open"/>
<g data-name="lips:mouth.closed" id="m-closed"/>
<g data-name="lips:mouth.teeth" id="m-teeth"/>
</svg>`;

const SLEEPY = `<svg xmlns="http://www.w3.org/2000/svg">
<g data-name="lids:eyes.closed:default" id="closed"/>
<g data-name="lids:eyes.open" id="open"/>
</svg>`;

const NO_TEETH = `<svg xmlns="http://www.w3.org/2000/svg">
<g data-name="lips:mouth.open:default" id="m-open"/>
<g data-name="lips:mouth.closed" id="m-closed"/>
</svg>`;

const WIDE = `<svg xmlns="http://www.w3.org/2000/svg">
<g data-name="lids:eyes.open-wide:default" id="wide"/>
<g data-name="lids:eyes.open" id="open"/>
<g data-name="lids:eyes.closed" id="closed"/>
</svg>`;

const blink = (fields = "") => `morph blink {
  method = bend
${fields}
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
}
`;

const talkSmile = (fields = "") => `morph talk_smile {
  blend = cut
${fields}
  keyframes {
    from {
      mouth {
        state = closed
      }
    }
    50% {
      mouth {
        state = open
      }
    }
    to {
      mouth {
        state = closed
      }
    }
  }
}
`;

type Image = { name: string; svg: string };

const withStart = (text: string) =>
  /^scene start$/m.test(text) ? text : `${text}${text.endsWith("\n") ? "" : "\n"}scene start\nend\n`;

function compile(text: string, images: Image[] = [{ name: "bunny", svg: FACE }], unwritten?: Record<string, unknown>) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    ...(unwritten
      ? { useBuiltinsPrelude: false, definitions: { builtins: { morph: { base: { $type: "morph", $name: "base", ...unwritten } } } } }
      : {}),
    files: [
      { uri: URI, type: "script", name: "main", ext: "sd", text: withStart(text), version: 1, languageId: "sparkdown" },
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
  text: string;
}

function diagnosticsOf(text: string, images?: Image[], unwritten?: Record<string, unknown>): Found[] {
  const program = compile(text, images, unwritten);
  const lines = withStart(text).split("\n");
  return (program.diagnostics?.[URI] ?? []).map((d) => {
    const { start, end } = d.range;
    return {
      message: typeof d.message === "string" ? d.message : d.message.value,
      severity: d.severity,
      code: d.code,
      line: start.line,
      text:
        start.line === end.line
          ? lines[start.line]!.slice(start.character, end.character)
          : lines[start.line]!.slice(start.character),
    };
  });
}

const statusOf = (text: string, images: Image[], morph: string) => {
  const program = compile(text, images);
  const binding = bindMorph(program.context!, program.context!["morph"]![morph]);
  return Object.fromEntries(binding.candidates.flatMap((c) => c.variants.map((v) => [v.name, v.status])));
};

describe("`when`, `unless` and `rest` forms", () => {
  test("a single state and a block of several lower as states with their groups, and compile without problems", () => {
    const text = `${blink("  unless = eyes.closed\n")}
${talkSmile("  when {\n    mouth.teeth\n    eyes.open\n  }\n")}`;
    const program = compile(text);
    expect(program.context!["morph"]!["blink"]["unless"]).toBe("eyes.closed");
    expect(program.context!["morph"]!["talk_smile"]["when"]).toEqual(["mouth.teeth", "eyes.open"]);
    expect(diagnosticsOf(text).filter((d) => d.code === "morph")).toEqual([]);
  });

  test("`rest` holds group states, and its states are in the recipe", () => {
    const text = talkSmile("  rest {\n    mouth {\n      state = teeth\n    }\n  }\n");
    const program = compile(text);
    expect(diagnosticsOf(text).filter((d) => d.code === "morph")).toEqual([]);
    const recipe = parseMorphRecipe(program.morphs!.recipes["talk_smile"]!);
    expect(recipe?.rest).toEqual({ mouth: "teeth" });
  });

  test("a group prefix in `rest` is stripped as in a keyframe", () => {
    const text = talkSmile("  rest {\n    mouth {\n      state = mouth.teeth\n    }\n  }\n");
    const recipe = parseMorphRecipe(compile(text).morphs!.recipes["talk_smile"]!);
    expect(recipe?.rest).toEqual({ mouth: "teeth" });
  });

  test("a layer movement field inside `rest` is an error where it is written", () => {
    const text = talkSmile("  rest {\n    mouth {\n      state = teeth\n      translate = 0 2px\n    }\n  }\n");
    const found = diagnosticsOf(text).find((d) => d.text === "translate");
    expect(found).toMatchObject({ severity: 1 });
    expect(found!.message).toContain("`rest`");
  });

  test("`rest` written as a value is an error on the value that shows the block form", () => {
    const text = talkSmile("  rest = mouth.teeth\n");
    const found = diagnosticsOf(text).filter((d) => d.severity === 1);
    expect(found).toEqual([
      expect.objectContaining({ line: 2, text: "mouth.teeth", message: "`rest` is a block, not a value: write `rest { mouth { state = teeth } }`." }),
    ]);
  });

  test("a `rest` group written as a value is an error on its line that shows the container form", () => {
    for (const value of ["mouth.teeth", "teeth"]) {
      const found = diagnosticsOf(talkSmile(`  rest {\n    mouth = ${value}\n  }\n`)).filter((d) => d.severity === 1);
      expect(found).toEqual([
        expect.objectContaining({ line: 3, text: `mouth = ${value}`, message: "`mouth = …` is not a pose. Write `rest { mouth { state = teeth } }`." }),
      ]);
    }
  });

  test("a keyframe group written as a qualified value is reported on its line, not as internal fields at the name", () => {
    const text = talkSmile("").replace("    from {\n      mouth {\n        state = closed\n      }\n    }", "    from {\n      mouth = mouth.closed\n    }");
    const found = diagnosticsOf(text).filter((d) => d.severity === 1);
    expect(found.find((d) => d.text === "mouth = mouth.closed")?.message).toContain("`mouth = …` is not a pose");
    expect(found.filter((d) => d.message.includes("$type") || d.message.includes("$name"))).toEqual([]);
  });

  test("a malformed condition inherited from a parent the scripts do not write is reported on the `as`", () => {
    const text = `define base as morph with\n  unless = "closed"\nend\n\n${talkSmile("").replace("morph talk_smile {", "morph talk_smile as base {")}`;
    const found = diagnosticsOf(text).find((d) => d.message.startsWith("`unless`, inherited from `base`"));
    expect(found).toMatchObject({ line: 4, text: "base", severity: 1 });
  });

  test("a condition that is not a state with its group is an error", () => {
    const found = diagnosticsOf(blink("  unless = closed\n")).find((d) => d.text === "closed" && d.line === 2);
    expect(found).toMatchObject({ severity: 1 });
    expect(found!.message).toContain("`unless = eyes.closed`");
  });

  test("a state no candidate portrait draws is reported where it is written", () => {
    const rest = diagnosticsOf(talkSmile("  rest {\n    mouth {\n      state = grin\n    }\n  }\n"));
    expect(rest.find((d) => d.text === "grin")).toMatchObject({ severity: 2 });
    const unless = diagnosticsOf(blink("  unless = eyes.shut\n"));
    expect(unless.find((d) => d.text === "eyes.shut")).toMatchObject({ severity: 2 });
    const group = diagnosticsOf(blink("  unless = hat.on\n"));
    expect(group.find((d) => d.text === "hat.on")).toMatchObject({ severity: 2 });
  });
});

describe("where a morph plays", () => {
  test("a blink with no condition plays on a look whose eyes the directive closed, and rests it open", () => {
    const text = `${blink()}
scene start
  [[bunny~eyes.closed]]
end
`;
    expect(statusOf(text, [{ name: "bunny", svg: FACE }], "blink")["bunny~eyes.closed"]).toBe("active");
    const program = compile(text);
    expect(program.morphs!.variants["bunny~eyes.closed"]).toHaveLength(1);
  });

  test("`unless = eyes.closed` keeps the blink off a closed look and off a face drawn closed, with nothing reported", () => {
    const text = `${blink("  unless = eyes.closed\n")}
scene start
  [[bunny~eyes.closed]]
  [[sleepy]]
end
`;
    const images = [
      { name: "bunny", svg: FACE },
      { name: "sleepy", svg: SLEEPY },
    ];
    const status = statusOf(text, images, "blink");
    expect(status["bunny"]).toBe("active");
    expect(status["bunny~eyes.closed"]).toBe("excluded");
    expect(status["sleepy"]).toBe("excluded");
    const program = compile(text, images);
    expect(Object.keys(program.morphs!.variants).sort()).toEqual(["bunny"]);
    expect(diagnosticsOf(text, images).filter((d) => d.severity === 2 || d.severity === 1).map((d) => d.message)).toEqual([]);
  });

  test("without `unless`, a face drawn with closed eyes plays the blink and rests open", () => {
    const status = statusOf(blink(), [{ name: "sleepy", svg: SLEEPY }], "blink");
    expect(status["sleepy"]).toBe("active");
  });

  test("`when` admits only looks where every listed state is active", () => {
    const text = `${talkSmile("  when = mouth.teeth\n")}
scene start
  [[bunny~mouth.teeth]]
  [[bunny~mouth.closed]]
end
`;
    const status = statusOf(text, [{ name: "bunny", svg: FACE }], "talk_smile");
    expect(status).toMatchObject({ bunny: "excluded", "bunny~mouth.teeth": "active", "bunny~mouth.closed": "excluded" });
    expect(diagnosticsOf(text).filter((d) => d.code === "morph")).toEqual([]);
  });

  test("`when` with several states admits only a look where all of them are active", () => {
    const text = `${talkSmile("  when {\n    mouth.teeth\n    eyes.open\n  }\n")}
scene start
  [[bunny~mouth.teeth]]
  [[bunny~mouth.teeth~eyes.closed]]
end
`;
    expect(statusOf(text, [{ name: "bunny", svg: FACE }], "talk_smile")).toEqual({
      bunny: "excluded",
      "bunny~mouth.teeth": "active",
      "bunny~mouth.teeth~eyes.closed": "excluded",
    });
  });

  test("`unless` with several states keeps the morph off a look where any one of them is active", () => {
    const text = `${blink("  unless {\n    eyes.closed\n    mouth.teeth\n  }\n")}
scene start
  [[bunny~mouth.teeth]]
  [[bunny~eyes.closed]]
end
`;
    expect(statusOf(text, [{ name: "bunny", svg: FACE }], "blink")).toEqual({
      bunny: "active",
      "bunny~mouth.teeth": "excluded",
      "bunny~eyes.closed": "excluded",
    });
  });

  test("an image every look of which a condition keeps out is not reported, even when it lacks a state the morph names", () => {
    const asleep = `<svg xmlns="http://www.w3.org/2000/svg">
<g data-name="lid:eyes.closed:default" id="closed"/>
</svg>`;
    const images = [
      { name: "bunny", svg: FACE },
      { name: "asleep", svg: asleep },
    ];
    for (const condition of ["  unless = eyes.closed\n", "  when = eyes.open\n"]) {
      expect(diagnosticsOf(blink(condition), images).filter((d) => d.code === "morph").map((d) => d.message)).toEqual([]);
    }
    expect(diagnosticsOf(blink(), images).filter((d) => d.message.includes("does not apply to image `asleep`"))).toHaveLength(1);
  });

  test("an inherited `rest` naming a group the child's keyframes no longer drive is reported on the `as`", () => {
    const text = `morph base {
  method = bend
  rest {
    eyes { state = closed }
  }
  keyframes {
    from { eyes { state = open } }
    to { eyes { state = closed } }
  }
}

${talkSmile("").replace("morph talk_smile {", "morph talk_smile as base {")}`;
    const found = diagnosticsOf(text).filter((d) => d.message.includes("`rest.eyes`, inherited"));
    expect(found).toEqual([expect.objectContaining({ line: 11, text: "base", severity: 1 })]);
    expect(diagnosticsOf(text).filter((d) => d.code === "morph" && d.line < 10 && d.severity === 1)).toEqual([]);
  });

  test("an inherited `rest` from a parent the scripts do not write is checked like a written one, on the `as`", () => {
    const child = talkSmile("").replace("morph talk_smile {", "morph talk_smile as base {");
    const errorsOnAs = (rest: unknown) =>
      diagnosticsOf(child, undefined, { rest })
        .filter((d) => d.severity === 1 && d.text === "base")
        .map((d) => d.message);
    expect(errorsOnAs({ mouth: { state: "teeth", translate: "0 2px" } })).toEqual([
      expect.stringMatching(/^`rest\.mouth\.translate`, inherited from `base`: `translate` does not belong in `rest`/),
    ]);
    expect(errorsOnAs({ mouth: { state: "" } })).toEqual([
      "`rest.mouth.state`, inherited from `base`: `state` names an attribute state, such as `closed` or `eyes.closed`.",
    ]);
    expect(errorsOnAs({ mouth: { state: "teeth" } })).toEqual([]);
  });

  test("a state qualified with its own group, inherited from a parent the scripts do not write, is read like a written one", () => {
    const child = talkSmile("").replace("morph talk_smile {", "morph talk_smile as base {");
    const unwritten = { rest: { mouth: { state: "mouth.teeth" } } };
    expect(diagnosticsOf(child, undefined, unwritten).filter((d) => d.code === "morph" && (d.severity === 1 || d.severity === 2))).toEqual([]);
    expect(parseMorphRecipe(compile(child, undefined, unwritten).morphs!.recipes["talk_smile"]!)?.rest).toEqual({ mouth: "teeth" });
    const keyframes = [
      { offset: 0, mouth: { state: "mouth.closed" } },
      { offset: 1, mouth: { state: "mouth.open" } },
    ];
    const inheriting = "morph talk as base {\n  blend = cut\n}\n";
    expect(parseMorphRecipe(compile(inheriting, undefined, { keyframes }).morphs!.recipes["talk"]!)?.keyframes.map((k) => k.states)).toEqual([
      { mouth: "closed" },
      { mouth: "open" },
    ]);
  });

  test("an inherited `rest` naming another group's state, or written as a value, is an error on the `as`", () => {
    const child = talkSmile("").replace("morph talk_smile {", "morph talk_smile as base {");
    const errorsOnAs = (rest: unknown) =>
      diagnosticsOf(child, undefined, { rest })
        .filter((d) => d.severity === 1 && d.text === "base")
        .map((d) => d.message);
    expect(errorsOnAs({ mouth: { state: "eyes.closed" } })).toEqual([
      expect.stringMatching(/^`rest\.mouth\.state`, inherited from `base`: `eyes\.closed` names a state of the `eyes` group, but this container poses `mouth`/),
    ]);
    expect(errorsOnAs({ $type: "mouth", $name: "teeth" })).toEqual([
      "`rest`, inherited from `base`: `rest` is a block, not a value: write `rest { mouth { state = teeth } }`.",
    ]);
  });

  test("an inherited state that is only its group's prefix is empty, and is an error on the `as` like a written one", () => {
    const empty = "`state` names an attribute state, such as `closed` or `eyes.closed`.";
    const child = talkSmile("").replace("morph talk_smile {", "morph talk_smile as base {");
    const errorsOnAs = (text: string, unwritten: Record<string, unknown>) =>
      diagnosticsOf(text, undefined, unwritten)
        .filter((d) => d.severity === 1 && d.text === "base")
        .map((d) => d.message);
    expect(errorsOnAs(child, { rest: { mouth: { state: "mouth." } } })).toEqual([`\`rest.mouth.state\`, inherited from \`base\`: ${empty}`]);
    const keyframes = [
      { offset: 0, mouth: { state: "mouth." } },
      { offset: 1, mouth: { state: "open" } },
    ];
    expect(errorsOnAs("morph talk as base {\n  blend = cut\n}\n", { keyframes })).toContain(
      `\`keyframes\`, inherited from \`base\`: keyframe 1: \`mouth\`: ${empty}`,
    );
    const written = diagnosticsOf(talkSmile('  rest {\n    mouth {\n      state = "mouth."\n    }\n  }\n')).filter((d) => d.severity === 1);
    expect(written.map((d) => d.message)).toContain(empty);
  });

  test("inherited keyframe offsets from a parent the scripts do not write are checked, on the `as`", () => {
    const text = "morph talk as base {\n  blend = cut\n}\n";
    const keyframes = [
      { offset: 0, mouth: { state: "closed" } },
      { offset: 2, mouth: { state: "open" } },
    ];
    expect(diagnosticsOf(text, undefined, { keyframes }).filter((d) => d.severity === 1 && d.text === "base").map((d) => d.message)).toEqual([
      "`keyframes`, inherited from `base`: keyframe 2: Keyframe offset 2 must be between 0 and 1.",
    ]);
  });

  test("an inherited condition no candidate portrait draws is reported on the `as`", () => {
    const child = blink("").replace("morph blink {", "morph blink as base {");
    for (const field of ["when", "unless"]) {
      const found = diagnosticsOf(child, undefined, { [field]: "eyes.shut" }).filter((d) => d.severity === 2 && d.text === "base");
      expect(found.map((d) => d.message)).toEqual([`\`${field}\`, inherited from \`base\`: No image's \`eyes\` group has a \`shut\` state.`]);
    }
  });

  test("an inherited condition naming a group the child's portraits lack is reported on the child's `as`, and the parent's own warnings are not repeated", () => {
    const images = [
      { name: "sleepy", svg: SLEEPY },
      { name: "plain", svg: NO_TEETH },
    ];
    const base = (condition: string) => blink(condition).replace("morph blink {", "morph base {");
    const child = talkSmile("").replace("morph talk_smile {", "morph talk_smile as base {");
    for (const field of ["when", "unless"]) {
      const found = diagnosticsOf(`${base(`  ${field} = eyes.open\n`)}\n${child}`, images).filter((d) => d.code === "morph" && d.severity === 2);
      expect(found).toEqual([
        expect.objectContaining({
          text: "base",
          message: `\`${field}\`, inherited from \`base\`: No image \`talk_smile\` could play on has a \`eyes\` attribute group.`,
        }),
      ]);
    }
    const shut = diagnosticsOf(`${base("  unless = eyes.shut\n")}\n${blink("").replace("morph blink {", "morph blink_child as base {")}`, images)
      .filter((d) => d.message.includes("`shut` state"));
    expect(shut).toEqual([expect.objectContaining({ text: "eyes.shut" })]);
  });

  test("a condition holds only for the state it names, not for a hyphenated state", () => {
    const text = `${blink("  unless = eyes.open\n")}
scene start
  [[wide]]
end
`;
    expect(statusOf(text, [{ name: "wide", svg: WIDE }], "blink")["wide"]).toBe("active");
  });

  test("a look lacking a rest state is skipped and reported", () => {
    const text = talkSmile("  rest {\n    mouth {\n      state = teeth\n    }\n  }\n");
    const images = [
      { name: "bunny", svg: FACE },
      { name: "plain", svg: NO_TEETH },
    ];
    const program = compile(text, images);
    expect(Object.keys(program.morphs!.variants)).toEqual(["bunny"]);
    const found = diagnosticsOf(text, images).filter((d) => d.message.includes("does not apply"));
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain("image `plain`: its `mouth` group has no `teeth` state");
  });
});

describe("the override warning", () => {
  test("a directive's choice in a driven group warns on the choice, naming the morph, the group and the rest", () => {
    const text = `${blink()}
scene start
  [[bunny~eyes.closed]]
end
`;
    const found = diagnosticsOf(text).filter((d) => d.message.includes("`blink`") && d.line === 23);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ severity: 2 });
    expect(found[0]!.message).toContain("`eyes`");
    expect(found[0]!.message).toContain("`open`");
    expect(found[0]!.message).toContain("`unless`");
  });

  test("a choice the art's `:default` makes is not reported, nor is a choice equal to the rest", () => {
    const text = `${blink()}
scene start
  [[sleepy]]
  [[bunny~eyes.open]]
end
`;
    const images = [
      { name: "bunny", svg: FACE },
      { name: "sleepy", svg: SLEEPY },
    ];
    expect(diagnosticsOf(text, images).filter((d) => d.severity === 2 || d.severity === 1).map((d) => d.message)).toEqual([]);
  });

  test("a named look's choice warns on the named look, not on each directive that shows it", () => {
    const text = `${blink()}
define bunny_shut as filtered_image with
  image = image.bunny
  attributes = { "eyes.closed" }
end

scene start
  [[bunny_shut]]
  [[bunny_shut]]
end
`;
    const lines = text.split("\n");
    const found = diagnosticsOf(text).filter((d) => d.message.includes("plays on this look"));
    expect(found.map((d) => d.line)).toEqual([lines.findIndex((line) => line.startsWith("define bunny_shut"))]);
  });

  test("a directive adding a choice to a named look warns on the directive", () => {
    const text = `${blink()}
define bunny_look as filtered_image with
  image = image.bunny
  attributes = { "mouth.teeth" }
end

scene start
  [[bunny_look:eyes.closed]]
end
`;
    const found = diagnosticsOf(text).filter((d) => d.message.includes("plays on this look"));
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ text: "eyes.closed", line: text.split("\n").findIndex((line) => line.includes("[[bunny_look:eyes.closed]]")) });
  });

  test("a directive kept off the morph by `unless` is not reported", () => {
    const text = `${blink("  unless = eyes.closed\n")}
scene start
  [[bunny~eyes.closed]]
end
`;
    expect(diagnosticsOf(text).filter((d) => d.severity === 2 || d.severity === 1).map((d) => d.message)).toEqual([]);
  });
});
