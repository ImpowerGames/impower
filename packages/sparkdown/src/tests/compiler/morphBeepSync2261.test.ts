import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

const URI = "file:///main.sd";

const FACE = `<svg xmlns="http://www.w3.org/2000/svg">
<g data-name="lips:mouth.open:default" id="m-open"/>
<g data-name="lips:mouth.closed" id="m-closed"/>
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

function compile(text: string) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      { uri: URI, type: "script", name: "main", ext: "sd", text: withStart(text), version: 1, languageId: "sparkdown" },
      { uri: "file:///bunny.svg", type: "image", name: "bunny", ext: "svg", data: FACE },
    ],
  } as any);
  return compiler.compile({ textDocument: { uri: URI } }).program;
}

function diagnosticsOf(text: string) {
  const program = compile(text);
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

const errorsOf = (text: string) => diagnosticsOf(text).filter((d) => d.severity === 1);

const lineOf = (text: string, needle: string, from = 0) =>
  text.split("\n").findIndex((line, i) => i >= from && line.includes(needle));

describe("`sync` in a speech morph's `timing` (#2261)", () => {
  test.each(["beep", "none"])("`sync = %s` compiles on a speech morph without problems", (sync) => {
    const text = talk(`    trigger = speech\n    sync = ${sync}\n    duration = 0.12`);
    expect(diagnosticsOf(text)).toEqual([]);
    expect(compile(text).context!["morph"]!["talk"]["timing"]["sync"]).toBe(sync);
  });

  test("an unknown value is reported on the value", () => {
    const text = talk("    trigger = speech\n    sync = typing");
    expect(errorsOf(text)).toEqual([
      expect.objectContaining({
        line: lineOf(text, "sync"),
        text: "typing",
        message: expect.stringMatching(/`sync`.*`none`.*`beep`/),
      }),
    ]);
  });

  test.each([
    ["no trigger", "    sync = beep"],
    ["`trigger = appear`", "    trigger = appear\n    sync = none"],
  ])("`sync` on a morph with %s is reported on the field", (_, timing) => {
    const text = talk(timing);
    expect(errorsOf(text)).toEqual([
      expect.objectContaining({ line: lineOf(text, "sync"), text: "sync", message: expect.stringContaining("speech morph") }),
    ]);
  });

  test("a child that makes its parent's `sync` an appear morph's is reported on the `as`", () => {
    const text = `${talk("    trigger = speech\n    sync = beep", "base")}
${talk("    trigger = appear", "child", "morph child as base {")}`;
    expect(errorsOf(text)).toEqual([
      expect.objectContaining({ line: lineOf(text, "morph child as base"), text: "base", message: expect.stringContaining("`sync`, inherited,") }),
    ]);
  });

  test("`iteration_delay_min` and `iteration_delay_max` are errors on the fields of a beep-synced morph", () => {
    const text = talk("    trigger = speech\n    sync = beep\n    iteration_delay_min = 0\n    iteration_delay_max = 0.08");
    expect(errorsOf(text)).toEqual([
      expect.objectContaining({ line: lineOf(text, "iteration_delay_min"), text: "iteration_delay_min", message: expect.stringContaining("beep") }),
      expect.objectContaining({ line: lineOf(text, "iteration_delay_max"), text: "iteration_delay_max", message: expect.stringContaining("beep") }),
    ]);
  });

  test("the quiet-time fields stay allowed with `sync = none`", () => {
    const text = talk("    trigger = speech\n    sync = none\n    iteration_delay_min = 0\n    iteration_delay_max = 0.08");
    expect(diagnosticsOf(text)).toEqual([]);
  });

  test("a child that syncs its parent's quiet times to beeps is reported on the `as`", () => {
    const text = `${talk("    trigger = speech\n    iteration_delay_min = 0\n    iteration_delay_max = 0.08", "base")}
morph child as base {
  timing {
    sync = beep
  }
}
`;
    const asLine = lineOf(text, "morph child as base");
    expect(errorsOf(text)).toEqual([
      expect.objectContaining({ line: asLine, text: "base", message: expect.stringContaining("`iteration_delay_min`, inherited,") }),
      expect.objectContaining({ line: asLine, text: "base", message: expect.stringContaining("`iteration_delay_max`, inherited,") }),
    ]);
  });

  test("a child's `sync = none` switches its parent's `sync = beep` back, so its own quiet times are allowed", () => {
    const text = `${talk("    trigger = speech\n    sync = beep", "base")}
morph child as base {
  timing {
    sync = none
    iteration_delay_min = 0
    iteration_delay_max = 0.08
  }
}
`;
    expect(errorsOf(text)).toEqual([]);
    expect(compile(text).context!["morph"]!["child"]["timing"]["sync"]).toBe("none");
  });
});
