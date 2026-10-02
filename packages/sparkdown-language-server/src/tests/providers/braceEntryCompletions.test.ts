import { describe, expect, test } from "vitest";
import { accept, completeAt } from "./braceCompletionHarness";

// One table over where a brace entry starts and whether the cursor is inside
// a value (#1228), in the struct, morph and element providers and in brace and
// indented bodies. Every row asserts what is offered and, for every item
// offered, that accepting it replaces only the word being typed: an edit that
// would delete a quote, a `;` or a brace fails here whatever the row expects.

const structProgram = {
  context: {
    animation: {
      $default: {
        $type: "animation",
        $name: "$default",
        target: { $type: "layer", $name: "self" },
        keyframes: [],
        timing: {
          delay: 0,
          duration: 0,
          easing: "ease",
          iterations: 1,
          fill: "both",
          direction: "normal",
        },
      },
      $schema: { timing: { easing: ["ease", "linear"] } },
    },
  },
} as any;

const morphProgram = { context: { morph: { $default: {} } } } as any;

const elements = { text: { content: "" }, row: { gap: 0 } };
const elementProgram = {
  context: {
    layout: { $default: { $type: "layout", $name: "$default", ...elements } },
    component: {
      $default: { $type: "component", $name: "$default", ...elements },
    },
  },
} as any;

interface Row {
  /** What the row's cursor stands after. */
  name: string;
  /** The body line(s), with `|` at the cursor. */
  body: string;
  offers?: string[];
  omits?: string[];
  /** Nothing at all is offered. */
  none?: boolean;
  /** Accepting `label` gives this body. */
  edit?: { label: string; body: string };
}

const run = (
  wrap: (body: string) => string,
  program: any,
  row: Row,
) => {
  const source = wrap(row.body);
  const items = completeAt(source, program);
  const labels = items.map((i) => String(i.label));
  for (const label of row.offers ?? []) expect(labels, source).toContain(label);
  for (const label of row.omits ?? []) expect(labels, source).not.toContain(label);
  if (row.none) expect(labels, source).toEqual([]);
  for (const item of items) {
    const { replaced } = accept(source, item);
    expect(replaced, `${item.label} in ${source}`).toMatch(/^[\w.%-]*$/);
  }
  if (row.edit) {
    const item = items.find((i) => i.label === row.edit!.label);
    expect(item, `${row.edit.label} in ${source}`).toBeDefined();
    expect(accept(source, item!).text).toBe(wrap(row.edit.body.replace("|", "")));
  }
};

describe("struct property completion: where a brace entry starts", () => {
  const brace = (body: string) => `animation fade with\n  ${body}\nend\n`;
  const rows: Row[] = [
    { name: "a `;` after a closed double-quoted value", body: `timing { easing = "ease"; dur| }`, offers: ["duration"] },
    { name: "a closed double-quoted value, same entry", body: `timing { easing = "ease"| }`, omits: ["duration", "delay"] },
    { name: "inside a closed double-quoted value", body: `timing { easing = "ea|" }`, omits: ["duration", "delay"] },
    { name: "a `;` after a closed single-quoted value", body: `timing { easing = 'ease'; dur| }`, offers: ["duration"] },
    { name: "an unclosed double quote", body: `timing { easing = "ease; dur| }`, omits: ["duration"] },
    { name: "an unclosed single quote (text in a value)", body: `timing { easing = 'ease; dur| }`, offers: ["duration"] },
    { name: "a value containing a quote", body: `timing { easing = a"b"c; dur| }`, offers: ["duration"] },
    { name: "a value containing a bracket run", body: `timing { easing = a[b]c; dur| }`, offers: ["duration"] },
    { name: "a lone `[`", body: `timing { easing = ease[; dur| }`, offers: ["duration"] },
    { name: "an `=` with no quote", body: `timing { easing = | }`, offers: ['"ease"', '"linear"'], omits: ["duration"], edit: { label: '"linear"', body: `timing { easing = linear }` } },
    { name: "`;`-separated entries", body: `timing { delay = 1; duration = 2; it| }`, offers: ["iterations"], edit: { label: "iterations", body: `timing { delay = 1; duration = 2; iterations =  }` } },
    { name: "an apostrophe (`don't`)", body: `timing { easing = don't; dur| }`, offers: ["duration"] },
  ];
  test.each(rows.map((r) => [r.name, r] as const))("brace: %s", (_n, row) =>
    run(brace, structProgram, row),
  );

  const root = (body: string) => `animation fade with\n${body}\nend\n`;
  const rootRows: Row[] = [
    { name: "a key at the root", body: `  tim|`, offers: ["timing"], edit: { label: "timing", body: `  timing {  }` } },
    { name: "inside a closed double-quoted value", body: `  timing {\n    easing = "ea|"`, omits: ["duration", "timing"] },
    { name: "an unclosed double quote", body: `  timing {\n    easing = "ea|`, omits: ["duration", "timing"] },
  ];
  test.each(rootRows.map((r) => [r.name, r] as const))("root: %s", (_n, row) =>
    run(root, structProgram, row),
  );
});

describe("morph completion: where a brace entry starts", () => {
  const brace = (body: string) => `morph blink with\n  ${body}\nend\n`;
  const rows: Row[] = [
    { name: "a `;` after a closed double-quoted value", body: `timing { easing = "ease"; dur| }`, offers: ["duration"] },
    { name: "a closed double-quoted value, same entry", body: `timing { easing = "ease"| }`, none: true },
    { name: "inside a closed double-quoted value", body: `timing { easing = "ea|" }`, none: true },
    { name: "a `;` after a closed single-quoted value", body: `timing { easing = 'ease'; dur| }`, offers: ["duration"] },
    { name: "an unclosed double quote", body: `timing { easing = "ease; dur| }`, none: true },
    { name: "an unclosed single quote (text in a value)", body: `timing { easing = 'tis; dur| }`, offers: ["duration"] },
    { name: "a value containing a bracket run", body: `timing { easing = a[b]c; dur| }`, offers: ["duration"] },
    { name: "a lone `[`", body: `timing { easing = ease[; dur| }`, offers: ["duration"] },
    { name: "an `=` with no quote", body: `timing { easing = | }`, offers: ["linear", "steps()"], edit: { label: "linear", body: `timing { easing = linear }` } },
    { name: "an `=` and part of a value", body: `timing { easing = li| }`, offers: ["linear"], edit: { label: "linear", body: `timing { easing = linear }` } },
    { name: "`;`-separated entries", body: `timing { duration = 1; delay = 2; it| }`, offers: ["iterations"], edit: { label: "iterations", body: `timing { duration = 1; delay = 2; iterations =  }` } },
    { name: "an apostrophe (`don't`)", body: `timing { easing = don't; dur| }`, offers: ["duration"] },
    { name: "inside a call's arguments", body: `timing { easing = steps(1|) }`, none: true },
    { name: "after a call's comma", body: `timing { easing = cubic-bezier(0.2, |) }`, none: true },
    { name: "inside a call's decimal argument", body: `timing { easing = cubic-bezier(0.2|) }`, none: true },
  ];
  test.each(rows.map((r) => [r.name, r] as const))("brace: %s", (_n, row) =>
    run(brace, morphProgram, row),
  );

  const root = (body: string) => `morph blink with\n${body}\nend\n`;
  const rootRows: Row[] = [
    { name: "inside a closed double-quoted value", body: `  timing {\n    easing = "ea|"`, none: true },
    { name: "an unclosed double quote", body: `  timing {\n    easing = "ea|`, none: true },
    { name: "an unclosed single quote", body: `  timing {\n    easing = 'ea|`, none: true },
    { name: "an `=` and part of a value", body: `  timing {\n    easing = li|`, offers: ["linear"], edit: { label: "linear", body: `  timing {\n    easing = linear` } },
    { name: "inside a call's arguments", body: `  timing {\n    easing = steps(1|)`, none: true },
  ];
  test.each(rootRows.map((r) => [r.name, r] as const))("root: %s", (_n, row) =>
    run(root, morphProgram, row),
  );
});

describe.each(["layout", "component"])("%s element completion: where a brace entry starts", (keyword) => {
  const brace = (body: string) => `${keyword} hud with\n  ${body}\nend\n`;
  const rows: Row[] = [
    { name: "inside closed single-quoted content", body: `row { text 'a; te|' }`, omits: ["text", "row"] },
    { name: "inside closed single-quoted content glued to the name", body: `row { text'a; te|' }`, omits: ["text", "row"] },
    { name: "inside unclosed single-quoted content", body: `row { text 'a; te| }`, omits: ["text", "row"] },
    { name: "inside unclosed single-quoted content glued to the name", body: `row { text'a; te| }`, omits: ["text", "row"] },
    { name: "inside unclosed single-quoted content after a class", body: `row { text.title'a; te| }`, omits: ["text", "row"] },
    { name: "inside a closed single-quoted attribute", body: `row { text #label='a; te|' }`, omits: ["text", "row"] },
    { name: "inside an unclosed single-quoted attribute", body: `row { text #label='a; te| }`, omits: ["text", "row"] },
    { name: "inside unclosed double-quoted content", body: `row { text "a; te| }`, omits: ["text", "row"] },
    { name: "a `;` after closed single-quoted content", body: `row { text 'a'; te| }`, offers: ["text"], edit: { label: "text", body: `row { text 'a'; text {  } }` } },
    { name: "a `;` after closed double-quoted content", body: `row { text "a"; te| }`, offers: ["text"] },
    { name: "a `;` after content holding a quote", body: `row { text 'a"b'; te| }`, offers: ["text"] },
    { name: "a `;` after content holding a bracket", body: `row { text 'a[b'; te| }`, offers: ["text"] },
    { name: "a `;` after a closed single-quoted attribute", body: `row { text #label='a'; te| }`, offers: ["text"] },
    { name: "`;`-separated entries", body: `row { text "a"; row; te| }`, offers: ["text"] },
    { name: "inside a handler closure on a later line", body: `row { text @click={\n    te|\n  } }`, omits: ["text", "row"] },
    { name: "inside a handler closure on its own line", body: `row { text @click={ te| } }`, omits: ["text", "row"] },
    { name: "inside an unclosed handler closure on a later line", body: `row { button "Go" @click={\n    te|`, omits: ["text", "row"] },
    { name: "after a handler closure closes", body: `row {\n    text @click={ go() }\n    te|\n  }`, offers: ["text"] },
  ];
  test.each(rows.map((r) => [r.name, r] as const))("brace: %s", (_n, row) =>
    run(brace, elementProgram, row),
  );

  test("root: an element line", () =>
    run((body) => `${keyword} hud with\n${body}\nend\n`, elementProgram, {
      name: "an element line",
      body: `  te|`,
      offers: ["text"],
    }));
});
