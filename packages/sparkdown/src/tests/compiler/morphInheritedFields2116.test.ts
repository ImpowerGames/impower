import { describe, expect, test, vi } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { MORPH_OWN_FIELDS, MORPH_ROOT_FIELDS } from "../../compiler/morph/morphSchema";
import { validateMorphDeclaration } from "../../compiler/morph/validateMorph";

vi.mock("../../compiler/morph/validateMorph", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../compiler/morph/validateMorph")>();
  return { ...actual, validateMorphDeclaration: vi.fn(actual.validateMorphDeclaration) };
});

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

type Placement = "as" | "name";

interface Row {
  fields: Field[];
  written: string[];
  inherited: string[];
  parent: string[];
  at: Placement;
  prefixed: [prefix: string, message: string][];
}

const indent = (lines: string[]) => lines.map((line) => `  ${line}`);

const row = (field: Field, ...lines: string[]): Row => ({ fields: [field], written: indent(lines), inherited: [], parent: indent(lines), at: "as", prefixed: [] });

const split = (fields: Field[], written: string[], inherited: string[], parent: string[]): Row => ({
  fields,
  written: indent(written),
  inherited: indent(inherited),
  parent: indent(parent),
  at: "as",
  prefixed: [],
});

const from = (field: string) => `\`${field}\`, inherited from \`base\`: `;

const prefixed = (r: Row, ...pairs: [prefix: string, message: string][]): Row => ({ ...r, prefixed: pairs });


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
  prefixed(row("layers", "layers {", "  nose { method = bend }", "}"), [from("layers.nose"), "No image the morph applies to has a layer labelled `nose`."]),
  row("keyframes", ...KEYFRAMES.map((line) => line.slice(2))),
  row("keyframes", "keyframes {", "  from { mouth { state = mouth.closed } }", "  to { mouth { state = mouth.open } }", "}"),
  prefixed(row("keyframes", "keyframes {", "  from { mouth { state = closed } }", "  to { mouth { state = grin } }", "}"), [from("keyframes"), "No image's `mouth` group has a `grin` state."]),
  prefixed(row("keyframes", "keyframes {", "  from { mouth { state = closed } }", "  to { mouth { state = eyes.open } }", "}"), ["`keyframes` (keyframe 2), inherited from `base`: ", "`eyes.open` names a state of the `eyes` group, but this container poses `mouth`. Write `state = open` or `state = mouth.open`, or move it into a `eyes:` container."]),
  prefixed(row("keyframes", "keyframes {", "  from { mouth { state = closed } }", "  to { hat { state = on } }", "}"), [from("keyframes"), "No image has a `hat` attribute group."]),
  row("keyframes", "keyframes {", "  0% { mouth { state = closed } }", "  200% { mouth { state = open } }", "}"),
  row("keyframes", "keyframes {", "  { offset = 0; mouth { state = closed } }", "  { offset = 2; mouth { state = open } }", "}"),
  row("keyframes", "keyframes {", '  from { mouth { state = "mouth." } }', "  to { mouth { state = open } }", "}"),
  row("keyframes", "keyframes {", "  from { mouth { state = closed } }", "}"),
  row("timing", "timing {", "  duration = 0.5", "}"),
  row("timing", "timing {", "  duration = -1", "}"),
  row("timing", "timing {", "  easing = wobble", "}"),
  prefixed(row("clips", "clips {", "  { between { nose }; targets { chin } }", "}"), [from("clips"), "No image the morph applies to has a layer labelled `nose`."], [from("clips"), "No image the morph applies to has a layer labelled `chin`."]),
  row("paints", "paints {", "  { targets { lips }; state = mouth.open; fill = red }", "}"),
  row("paints", "paints {", "  { targets { lips }; state = mouth.grin; fill = red }", "}"),
  row("when", "when = mouth.teeth"),
  prefixed(row("when", "when = eyes.shut"), [from("when"), "No image's `eyes` group has a `shut` state."]),
  row("when", "when = closed"),
  row("when", "when {", "  mouth.teeth", "  eyes.open", "}"),
  row("unless", "unless = eyes.closed"),
  prefixed(row("unless", "unless = hat.on"), [from("unless"), "No image `child` could play on has a `hat` attribute group."]),
  row("unless", "unless {", "  eyes.closed", "  mouth.teeth", "}"),
  row("rest", "rest {", "  mouth { state = teeth }", "}"),
  row("rest", "rest {", "  mouth { state = mouth.teeth }", "}"),
  prefixed(row("rest", "rest {", "  mouth { state = eyes.closed }", "}"), [from("rest.mouth.state"), "`eyes.closed` names a state of the `eyes` group, but this container poses `mouth`. Write `state = closed` or `state = mouth.closed`, or move it into a `eyes:` container."]),
  row("rest", "rest {", '  mouth { state = "mouth." }', "}"),
  row("rest", "rest {", "  mouth { state = teeth; translate = 0 2px }", "}"),
  prefixed(row("rest", "rest {", "  mouth { state = grin }", "}"), [from("rest.mouth"), "No image's `mouth` group has a `grin` state."]),
  row("rest", "rest {", "  eyes { state = closed }", "}"),
  row("rest", "rest = mouth.teeth"),
  prefixed(row("rest", "rest {", "  mouth { state = mouth.mouth.closed }", "}"), [from("rest.mouth.state"), "`mouth.mouth.closed` is not a state: a state is one name, written alone or after its group once, such as `state = closed` or `state = mouth.closed`."]),
  prefixed(row("keyframes", "keyframes {", "  from { mouth { state = mouth.mouth.closed } }", "  to { mouth { state = open } }", "}"), ["`keyframes` (keyframe 1), inherited from `base`: ", "`mouth.mouth.closed` is not a state: a state is one name, written alone or after its group once, such as `state = closed` or `state = mouth.closed`."]),
  prefixed(row("keyframes", "keyframes {", "  from { mouth { state = closed; rotate = bad } }", "  to { mouth { state = open } }", "}"), [from("keyframes"), "No image the morph applies to has a layer labelled `mouth`."]),
  prefixed(row("keyframes", "keyframes {", "  from { mouth = mouth.closed }", "  to { mouth { state = open } }", "}"), [from("keyframes"), "No image the morph applies to has a layer labelled `mouth`."]),
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
  split(["clips", "layers"], ["clips {", "  { between { lips }; targets { lids }; spread = big }", "}", "layers {", "  lips { spread = big }", "}"], [], ["clips {", "  { between { lips }; targets { lids }; spread = big }", "}", "layers {", "  lips { spread = big }", "}"]),
  prefixed(
    split(["layers"], ["layers {", "  lips { spread = 1px }", "  constructor { blend = jump }", "}"], ["layers {", "  lips { spread = 1px }", "}"], ["layers {", "  constructor { blend = jump }", "}"]),
    [from("layers.constructor"), "No image the morph applies to has a layer labelled `constructor`."],
  ),
  split(["keyframes", "rest"], ["keyframes {", "  from { mouth { state = closed } }", "  to { mouth { state = open } }", "}", "rest {", "  eyes { state = closed }", "}"], [], ["keyframes {", "  from { mouth { state = closed } }", "  to { mouth { state = open } }", "}", "rest {", "  eyes { state = closed }", "}"]),
];

const PLACEMENTS: Record<string, Placement[]> = {};

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

function diagnostics(program: ReturnType<typeof compile>, text: string, fieldLines: Set<number>) {
  const lines = text.split("\n");
  return (program.diagnostics?.[URI] ?? [])
    .filter((d) => d.severity === 1 || d.severity === 2)
    .map((d) => {
      const { start, end } = d.range;
      const message = typeof d.message === "string" ? d.message : d.message.value;
      const spanned = start.line === end.line ? lines[start.line]!.slice(start.character, end.character) : lines[start.line]!.slice(start.character);
      const where = fieldLines.has(start.line) ? "<field>" : start.line === 0 && spanned === "base" ? "as" : start.line === 0 && spanned === "child" ? "name" : spanned;
      return { where, severity: d.severity === 1 ? "error" : "warning", message };
    });
}

const listed = (found: { where: string; severity: string; message: string }[]) => found.map(({ where, severity, message }) => `${where} | ${severity} : ${message}`).sort();

function binding(program: ReturnType<typeof compile>) {
  const channel = program.morphs;
  const variants = Object.entries(channel?.variants ?? {})
    .flatMap(([variant, refs]) => refs.filter((ref) => ref.morphs.includes("child")).map((ref) => `${variant}: ${ref.morphs.join(",")} ${ref.selection}`))
    .sort();
  return { recipe: channel?.recipes["child"], conditions: channel?.conditions?.["child"], variants };
}

describe("a field inherited from a parent the scripts do not write reads as the same field written on the child", () => {
  test("the table covers every field a morph's root admits and a child inherits", () => {
    expect([...new Set(ROWS.flatMap((r) => r.fields))].sort()).toEqual(MORPH_ROOT_FIELDS.filter((field) => !MORPH_OWN_FIELDS.has(field)).sort());
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
    const writtenFound = diagnostics(written, writtenText, movedLines(r));
    const moved = writtenFound.filter((d) => d.where === "<field>").sort((a, b) => a.message.localeCompare(b.message));
    const placements = PLACEMENTS[rowName(r)] ?? moved.map(() => r.at);
    expect(placements).toHaveLength(moved.length);
    const pairs = [...r.prefixed];
    const inheritedMessage = (message: string) => {
      const at = pairs.findIndex(([, said]) => said === message);
      if (at < 0) return message;
      const [prefix] = pairs.splice(at, 1)[0]!;
      return `${prefix}${message}`;
    };
    const expected = [
      ...writtenFound.filter((d) => d.where !== "<field>"),
      ...moved.map((d, i) => ({ where: placements[i]!, severity: d.severity, message: inheritedMessage(d.message) })),
    ];
    expect(pairs, "every expected prefix matches a moved diagnostic").toEqual([]);
    expect(listed(diagnostics(inherited, inheritedText, new Set()))).toEqual(listed(expected));
    expect(binding(inherited)).toEqual(binding(written));
  });

  test("the written validator runs once for a child of a parent the scripts do not write, as for a written child", () => {
    const r = ROWS.find((candidate) => rowName(candidate) === "method + layers: method = warp layers { lips { method = warp } }")!;
    const lowered = compile(childText(r, r.parent), {}).context?.["morph"]?.["child"] as Record<string, unknown>;
    const calls = vi.mocked(validateMorphDeclaration);
    calls.mockClear();
    compile(childText(r, r.written), {});
    const writtenCalls = calls.mock.calls.length;
    calls.mockClear();
    compile(childText(r, r.inherited), { method: lowered["method"], layers: lowered["layers"] });
    expect(writtenCalls).toBe(1);
    expect(calls.mock.calls.length).toBe(1);
  });
});
