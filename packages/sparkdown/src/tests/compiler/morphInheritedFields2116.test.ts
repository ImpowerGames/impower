import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { MORPH_ROOT_FIELDS } from "../../compiler/morph/morphSchema";

const URI = "file:///main.sd";

const FACE = `<svg xmlns="http://www.w3.org/2000/svg">
<g data-name="lids:eyes.open:default" id="open"/>
<g data-name="lids:eyes.closed" id="closed"/>
<g data-name="lips:mouth.open:default" id="m-open"/>
<g data-name="lips:mouth.closed" id="m-closed"/>
<g data-name="lips:mouth.teeth" id="m-teeth"/>
</svg>`;

const KEYFRAMES = [
  "  keyframes {",
  "    from { mouth { state = closed } }",
  "    50% { mouth { state = open } }",
  "    to { mouth { state = closed } }",
  "  }",
];

const SCENE = ["scene start", "  [[bunny]]", "  [[bunny~eyes.closed]]", "  [[bunny~mouth.teeth]]", "  [[bunny~mouth.open]]", "end", ""];

type Field = (typeof MORPH_ROOT_FIELDS)[number];

interface Row {
  fields: Field[];
  written: string[];
  inherited: string[];
  parent: string[];
}

const indent = (lines: string[]) => lines.map((line) => `  ${line}`);

const row = (field: Field, ...lines: string[]): Row => ({ fields: [field], written: indent(lines), inherited: [], parent: indent(lines) });

const split = (fields: Field[], written: string[], inherited: string[], parent: string[]): Row => ({
  fields,
  written: indent(written),
  inherited: indent(inherited),
  parent: indent(parent),
});

const ROWS: Row[] = [
  row("blend", "blend = cut"),
  row("blend", "blend = jump"),
  row("method", "method = bend"),
  row("method", "method = warp"),
  row("fallback", "fallback = fade"),
  row("fallback", "fallback = boom"),
  row("depth", "depth = mouth.teeth"),
  row("depth", "depth = rest"),
  row("depth", "depth = mouth"),
  row("spread", "spread = 1px"),
  row("spread", "spread = big"),
  row("layers", "layers {", "  lips { spread = 1px }", "}"),
  row("layers", "layers {", "  lips { blend = jump }", "}"),
  row("layers", "layers {", "  nose { method = bend }", "}"),
  row("keyframes", ...KEYFRAMES.map((line) => line.slice(2))),
  row("keyframes", "keyframes {", "  from { mouth { state = mouth.closed } }", "  to { mouth { state = mouth.open } }", "}"),
  row("keyframes", "keyframes {", "  from { mouth { state = closed } }", "  to { mouth { state = grin } }", "}"),
  row("keyframes", "keyframes {", "  from { mouth { state = closed } }", "  to { mouth { state = eyes.open } }", "}"),
  row("keyframes", "keyframes {", "  from { mouth { state = closed } }", "  to { hat { state = on } }", "}"),
  row("keyframes", "keyframes {", "  0% { mouth { state = closed } }", "  200% { mouth { state = open } }", "}"),
  row("keyframes", "keyframes {", "  { offset = 0; mouth { state = closed } }", "  { offset = 2; mouth { state = open } }", "}"),
  row("keyframes", "keyframes {", '  from { mouth { state = "mouth." } }', "  to { mouth { state = open } }", "}"),
  row("keyframes", "keyframes {", "  from { mouth { state = closed } }", "}"),
  row("timing", "timing {", "  duration = 0.5", "}"),
  row("timing", "timing {", "  duration = -1", "}"),
  row("timing", "timing {", "  easing = wobble", "}"),
  row("clips", "clips {", "  { between { nose }; targets { chin } }", "}"),
  row("paints", "paints {", "  { targets { lips }; state = mouth.open; fill = red }", "}"),
  row("paints", "paints {", "  { targets { lips }; state = mouth.grin; fill = red }", "}"),
  row("when", "when = mouth.teeth"),
  row("when", "when = eyes.shut"),
  row("when", "when = closed"),
  row("when", "when {", "  mouth.teeth", "  eyes.open", "}"),
  row("unless", "unless = eyes.closed"),
  row("unless", "unless = hat.on"),
  row("unless", "unless {", "  eyes.closed", "  mouth.teeth", "}"),
  row("rest", "rest {", "  mouth { state = teeth }", "}"),
  row("rest", "rest {", "  mouth { state = mouth.teeth }", "}"),
  row("rest", "rest {", "  mouth { state = eyes.closed }", "}"),
  row("rest", "rest {", '  mouth { state = "mouth." }', "}"),
  row("rest", "rest {", "  mouth { state = teeth; translate = 0 2px }", "}"),
  row("rest", "rest {", "  mouth { state = grin }", "}"),
  row("rest", "rest {", "  eyes { state = closed }", "}"),
  row("rest", "rest = mouth.teeth"),
  row("rest", "rest {", "  mouth { state = mouth.mouth.closed }", "}"),
  row("keyframes", "keyframes {", "  from { mouth { state = mouth.mouth.closed } }", "  to { mouth { state = open } }", "}"),
  row("keyframes", "keyframes {", "  from { mouth { state = closed; rotate = bad } }", "  to { mouth { state = open } }", "}"),
  row("keyframes", "keyframes {", "  from { mouth = mouth.closed }", "  to { mouth { state = open } }", "}"),
  row("clips", "clips {", "  { between { lips }; targets { lips } }", "}"),
  row("clips", "clips {", "  { between { lips }; targets { lids }; spread = big }", "}"),
  row("clips", "clips {", "  { between { lips } }", "}"),
  row("timing", "timing {", "  iteration_delay_min = 2", "  iteration_delay_max = 1", "}"),
  row("timing", "timing {", "  duration = 1", "  nope = 2", "}"),
  row("layers", "layers {", "  lips { partner = lips }", "}"),
  row("depth", "depth = closed"),
  row("paints", "paints {", "  { targets { lips }; state = closed; fill = red }", "}"),
  split(["layers"], ["layers {", "  lips { spread = 1px; blend = jump }", "}"], ["layers {", "  lips { spread = 1px }", "}"], ["layers {", "  lips { blend = jump }", "}"]),
  split(["rest"], ["rest {", "  mouth { state = closed; translate = 0 2px }", "}"], ["rest {", "  mouth { state = closed }", "}"], ["rest {", "  mouth { translate = 0 2px }", "}"]),
  split(["rest"], ["rest {", "  mouth { state = teeth }", "}"], ["rest {", "  mouth { }", "}"], ["rest {", "  mouth { state = teeth }", "}"]),
  split(["timing"], ["blend = jump", "timing {", "  duration = 0.5", "}"], ["blend = jump"], ["timing {", "  duration = 0.5", "}"]),
  split(["timing"], ["when = closed", "timing {", "  duration = 0.5", "}"], ["when = closed"], ["timing {", "  duration = 0.5", "}"]),
  split(["method", "layers"], ["method = warp", "layers {", "  lips { method = warp }", "}"], [], ["method = warp", "layers {", "  lips { method = warp }", "}"]),
];

const preamble = (row: Row) => (row.fields.includes("keyframes") ? [] : KEYFRAMES);

const childText = (row: Row, lines: string[]) => ["morph child as base {", ...preamble(row), ...lines, "}", "", ...SCENE].join("\n");

const movedLines = (row: Row) => {
  const kept = [...row.inherited];
  const moved = new Set<number>();
  row.written.forEach((line, index) => {
    const at = kept.indexOf(line);
    if (at >= 0) kept.splice(at, 1);
    else moved.add(1 + preamble(row).length + index);
  });
  return moved;
};

function compile(text: string, base: Record<string, unknown>) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    useBuiltinsPrelude: false,
    definitions: { builtins: { morph: { base: { $type: "morph", $name: "base", ...base } } } },
    files: [
      { uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" },
      { uri: "file:///bunny.svg", type: "image", name: "bunny", ext: "svg", data: FACE },
    ],
  } as any);
  return compiler.compile({ textDocument: { uri: URI } }).program;
}

const INHERITED = /^`[^`]+`(?: \((?:keyframe|entry) [0-9]+\))?, inherited(?: from `base`)?: /;

function diagnostics(program: ReturnType<typeof compile>, text: string, fieldLines: Set<number> | null) {
  const lines = text.split("\n");
  return (program.diagnostics?.[URI] ?? [])
    .filter((d) => d.severity === 1 || d.severity === 2)
    .map((d) => {
      const { start, end } = d.range;
      const message = typeof d.message === "string" ? d.message : d.message.value;
      const spanned = start.line === end.line ? lines[start.line]!.slice(start.character, end.character) : lines[start.line]!.slice(start.character);
      const onField = fieldLines ? fieldLines.has(start.line) : start.line === 0 && spanned === "base";
      return `${d.severity === 1 ? "error" : "warning"} @ ${onField ? "<field>" : spanned} : ${message.replace(INHERITED, "")}`;
    })
    .sort();
}

function binding(program: ReturnType<typeof compile>) {
  const channel = program.morphs;
  const variants = Object.entries(channel?.variants ?? {})
    .flatMap(([variant, refs]) => refs.filter((ref) => ref.morphs.includes("child")).map((ref) => `${variant}: ${ref.morphs.join(",")} ${ref.selection}`))
    .sort();
  return { recipe: channel?.recipes["child"], conditions: channel?.conditions?.["child"], variants };
}

describe("a field inherited from a parent the scripts do not write reads as the same field written on the child", () => {
  test("the table covers every field a morph's root admits", () => {
    expect([...new Set(ROWS.flatMap((r) => r.fields))].sort()).toEqual([...MORPH_ROOT_FIELDS].sort());
  });

  const rowName = (r: Row) =>
    `${r.fields.join(" + ")}: ${r.written.map((l) => l.trim()).join(" ")}${r.inherited.length ? ` (the child keeps: ${r.inherited.map((l) => l.trim()).join(" ")})` : ""}`;

  test.each(ROWS.map((r) => [rowName(r), r] as const))("%s", (_name, r) => {
    const parentProgram = compile(childText(r, r.parent), {});
    const lowered = parentProgram.context?.["morph"]?.["child"] as Record<string, unknown> | undefined;
    const base: Record<string, unknown> = {};
    for (const field of r.fields) {
      expect(lowered?.[field], `the parent's ${field} lowers to a value`).not.toBeUndefined();
      base[field] = lowered![field];
    }
    const writtenText = childText(r, r.written);
    const written = compile(writtenText, {});
    const inheritedText = childText(r, r.inherited);
    const inherited = compile(inheritedText, base);
    expect(diagnostics(inherited, inheritedText, null)).toEqual(diagnostics(written, writtenText, movedLines(r)));
    expect(binding(inherited)).toEqual(binding(written));
  });
});
