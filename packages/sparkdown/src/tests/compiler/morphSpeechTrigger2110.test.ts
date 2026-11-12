import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

const URI = "file:///main.sd";

const FACE = `<svg xmlns="http://www.w3.org/2000/svg">
<g data-name="lids:eyes.open:default" id="open"/>
<g data-name="lids:eyes.closed" id="closed"/>
<g data-name="lips:mouth.open:default" id="m-open"/>
<g data-name="lips:mouth.closed" id="m-closed"/>
<g data-name="lips:mouth.teeth" id="m-teeth"/>
</svg>`;

const talk = (timing: string, name = "talk", head = `morph ${name} {`) => `${head}
  blend = cut
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
  timing {
${timing}
  }
}
`;

const withStart = (text: string) => `${text}${text.endsWith("\n") ? "" : "\n"}scene start\nend\n`;

function compile(text: string, builtins?: Record<string, Record<string, unknown>>) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    ...(builtins ? { useBuiltinsPrelude: false, definitions: { builtins } } : {}),
    files: [
      { uri: URI, type: "script", name: "main", ext: "sd", text: withStart(text), version: 1, languageId: "sparkdown" },
      { uri: "file:///bunny.svg", type: "image", name: "bunny", ext: "svg", data: FACE },
    ],
  } as any);
  return compiler.compile({ textDocument: { uri: URI } }).program;
}

function diagnosticsOf(text: string, builtins?: Record<string, Record<string, unknown>>) {
  const program = compile(text, builtins);
  const lines = withStart(text).split("\n");
  return (program.diagnostics?.[URI] ?? []).map((d) => {
    const { start, end } = d.range;
    return {
      message: typeof d.message === "string" ? d.message : d.message.value,
      severity: d.severity,
      line: start.line,
      text:
        start.line === end.line
          ? lines[start.line]!.slice(start.character, end.character)
          : lines[start.line]!.slice(start.character),
    };
  });
}

const errorsOf = (text: string, builtins?: Record<string, Record<string, unknown>>) =>
  diagnosticsOf(text, builtins).filter((d) => d.severity === 1);

const DEFAULT_TIMING = { trigger: "appear", delay: 0, duration: 0.25, easing: "ease-out", iterations: 1, direction: "normal" };

const withConfiguredBase = (timing: Record<string, unknown>) => ({
  morph: {
    $default: { $type: "morph", $name: "$default", blend: "morph", fallback: "fade", timing: DEFAULT_TIMING },
    base: { $type: "morph", $name: "base", timing },
  },
});

const lineOf = (text: string, needle: string, from = 0) =>
  text.split("\n").findIndex((line, i) => i >= from && line.includes(needle));

describe("`trigger` in a morph's `timing`", () => {
  test("defaults to `appear` from the builtin morph", () => {
    const text = talk("    duration = 0.16");
    expect(compile(text).context!["morph"]!["talk"]["timing"]["trigger"]).toBe("appear");
    expect(errorsOf(text)).toEqual([]);
  });

  test("accepts `speech` and `appear` without problems", () => {
    for (const trigger of ["speech", "appear"]) {
      const text = talk(`    trigger = ${trigger}\n    duration = 0.16`);
      expect(compile(text).context!["morph"]!["talk"]["timing"]["trigger"]).toBe(trigger);
      expect(diagnosticsOf(text)).toEqual([]);
    }
  });

  test("rejects any other value on the value", () => {
    const text = talk("    trigger = typing");
    expect(errorsOf(text)).toEqual([
      expect.objectContaining({
        line: lineOf(text, "trigger"),
        text: "typing",
        message: expect.stringMatching(/`trigger`.*`appear`.*`speech`/),
      }),
    ]);
  });

  test("`delay` and `iterations` are errors on the field of a speech morph", () => {
    const text = talk("    trigger = speech\n    delay = 1\n    iterations = infinite\n    duration = 0.16");
    expect(errorsOf(text)).toEqual([
      expect.objectContaining({ line: lineOf(text, "delay"), text: "delay", message: expect.stringContaining("speech") }),
      expect.objectContaining({ line: lineOf(text, "iterations"), text: "iterations", message: expect.stringContaining("speech") }),
    ]);
  });

  test("`delay` and `iterations` are allowed on an appear morph", () => {
    expect(errorsOf(talk("    trigger = appear\n    delay = 1\n    iterations = infinite"))).toEqual([]);
    expect(errorsOf(talk("    delay = 1\n    iterations = infinite"))).toEqual([]);
  });

  test("the duration, easing, direction and quiet-time fields are accepted on a speech morph", () => {
    const text = talk(
      "    trigger = speech\n    duration = 0.16\n    easing = linear\n    direction = alternate\n    iteration_delay_min = 0\n    iteration_delay_max = 0.08",
    );
    expect(diagnosticsOf(text)).toEqual([]);
  });

  test("a child that makes its parent's delay a speech morph's is reported on the `as`", () => {
    const text = `${talk("    delay = 1\n    iterations = 3", "base")}
${talk("    trigger = speech", "child", "morph child as base {")}`;
    const asLine = lineOf(text, "morph child as base");
    const found = errorsOf(text);
    expect(found).toEqual([
      expect.objectContaining({ line: asLine, text: "base", message: expect.stringContaining("`delay`") }),
      expect.objectContaining({ line: asLine, text: "base", message: expect.stringContaining("`iterations`") }),
    ]);
  });

  test("a child of a speech morph is a speech morph, and its own `delay` is an error on the field", () => {
    const text = `${talk("    trigger = speech", "base")}
morph child as base {
  timing {
    delay = 2
  }
}
`;
    expect(compile(text).context!["morph"]!["child"]["timing"]["trigger"]).toBe("speech");
    const childLine = lineOf(text, "morph child as base");
    expect(errorsOf(text)).toEqual([
      expect.objectContaining({ line: lineOf(text, "delay", childLine), text: "delay", message: expect.stringContaining("speech") }),
    ]);
  });

  test.each([
    ["delay", 0],
    ["delay", 2],
    ["iterations", 1],
    ["iterations", 2],
  ] as const)("a configured parent that supplies `%s = %s` to a speech child is reported on the `as`, even at the default value", (field, value) => {
    const text = talk("    trigger = speech", "child", "morph child as base {");
    const found = errorsOf(text, withConfiguredBase({ [field]: value }));
    expect(found).toEqual([
      expect.objectContaining({ line: lineOf(text, "morph child as base"), text: "base", message: expect.stringContaining(`\`${field}\`, inherited,`) }),
    ]);
  });

  test("a configured parent that supplies neither `delay` nor `iterations` adds no speech error", () => {
    const text = talk("    trigger = speech", "child", "morph child as base {");
    expect(errorsOf(text, withConfiguredBase({ duration: 1 }))).toEqual([]);
  });

  test("the builtin morph's `delay` and `iterations` defaults are not an error on a speech morph or its child", () => {
    const text = `${talk("    trigger = speech", "base")}
morph child as base {
  timing {
    duration = 0.2
  }
}
`;
    expect(errorsOf(text)).toEqual([]);
  });
});

describe("which layer supplies a speech morph's `delay` and `iterations`", () => {
  test("a chain of a written and a configured parent reports each supplied field once, on the child's `as`", () => {
    const text = `${talk("    delay = 2", "middle", "morph middle as base {")}
${talk("    trigger = speech", "child", "morph child as middle {")}`;
    const asLine = lineOf(text, "morph child as middle");
    expect(errorsOf(text, withConfiguredBase({ iterations: 1 }))).toEqual([
      expect.objectContaining({ line: asLine, text: "middle", message: expect.stringMatching(/^`delay`, inherited, does not apply to a speech morph/) }),
      expect.objectContaining({ line: asLine, text: "middle", message: expect.stringMatching(/^`iterations`, inherited, does not apply to a speech morph/) }),
    ]);
  });

  test("a field written by the child and by its parent is reported once, on the child's field, and the parent's other field on the `as`", () => {
    const text = `${talk("    delay = 2\n    iterations = 3", "base")}
morph child as base {
  timing {
    trigger = speech
    delay = 1
  }
}
`;
    const asLine = lineOf(text, "morph child as base");
    expect(errorsOf(text)).toEqual([
      expect.objectContaining({ line: lineOf(text, "delay = 1"), text: "delay", message: expect.stringMatching(/^`delay` does not apply to a speech morph/) }),
      expect.objectContaining({ line: asLine, text: "base", message: expect.stringMatching(/^`iterations`, inherited, does not apply to a speech morph/) }),
    ]);
  });

  const MIDDLE = talk("    duration = 0.2", "middle");
  const speechChildOf = (parent: string) => `morph child as ${parent} {
  timing {
    trigger = speech
  }
}
`;

  test("a script `define` of a named morph supplies the timing fields its own body writes, even at the builtin's values", () => {
    const text = `${MIDDLE}
define alias as middle with
  timing = { delay = 0, iterations = 1 }
end

${speechChildOf("alias")}`;
    const asLine = lineOf(text, "morph child as alias");
    expect(errorsOf(text)).toEqual([
      expect.objectContaining({ line: asLine, text: "alias", message: expect.stringMatching(/^`delay`, inherited, does not apply to a speech morph/) }),
      expect.objectContaining({ line: asLine, text: "alias", message: expect.stringMatching(/^`iterations`, inherited, does not apply to a speech morph/) }),
    ]);
  });

  test("a chain of configured, written, script-`define` and written layers reports each supplied field once, on the child's `as`", () => {
    const text = `${talk("    duration = 0.2", "middle", "morph middle as base {")}
define alias as middle with
  timing = { delay = 0 }
end

${speechChildOf("alias")}`;
    const asLine = lineOf(text, "morph child as alias");
    expect(errorsOf(text, withConfiguredBase({ iterations: 1 }))).toEqual([
      expect.objectContaining({ line: asLine, text: "alias", message: expect.stringContaining("`delay`, inherited,") }),
      expect.objectContaining({ line: asLine, text: "alias", message: expect.stringContaining("`iterations`, inherited,") }),
    ]);
  });

  test("a refused script `define … as morph` keeps its own error, and the timing fields its body writes reach a speech child's `as`", () => {
    const text = `define base as morph with
  timing = { delay = 0, iterations = 1 }
end

${talk("    trigger = speech", "child", "morph child as base {")}`;
    const found = errorsOf(text);
    expect(found).toEqual(expect.arrayContaining([expect.objectContaining({ line: 0, message: expect.stringContaining("A morph is declared with its own keyword") })]));
    expect(found.filter((d) => d.message.includes("speech morph")).map((d) => [d.line, d.text, d.message.split(" does")[0]])).toEqual([
      [lineOf(text, "morph child as base"), "base", "`delay`, inherited,"],
      [lineOf(text, "morph child as base"), "base", "`iterations`, inherited,"],
    ]);
  });
});
