// Diagnostics for Sparkle element `@event` / `@handler` attributes plus the
// source-range of reactive-binding diagnostics. Three guarantees:
//   E) An unrecognized `@event` name (`@clik`) warns — the event set is closed
//      (EventMap) and an unknown name silently never fires.
//   B) An `@event=handler` that names no defined function/scene/knot warns
//      ("Cannot find function"), whole-program (so a cross-file or scene target
//      does NOT warn); closures and dotted/method targets are not refs.
//   C) A compile error inside a Sparkle binding (`for item in player.inventory`)
//      reports at the binding, not collapsed to line 0.
// See project_reactive_sparkle_ui.

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

interface Diag {
  message: string;
  line: number;
  from: number;
  to: number;
}

function diagnose(
  source: string,
  extraFiles: Record<string, string> = {},
): Diag[] {
  const compiler = new SparkdownCompiler();
  const mk = (name: string, text: string) => ({
    uri: `inmemory:///${name}.sd`,
    type: "script" as const,
    name,
    ext: "sd",
    text,
    version: 1,
    languageId: "sparkdown",
  });
  compiler.configure({
    files: [
      mk("main", source),
      ...Object.entries(extraFiles).map(([n, t]) => mk(n, t)),
    ],
  });
  const result = compiler.compile({
    textDocument: { uri: "inmemory:///main.sd" },
  });
  const out: Diag[] = [];
  for (const list of Object.values(result.program.diagnostics ?? {})) {
    for (const d of list as any[]) {
      const message =
        typeof d.message === "string" ? d.message : d.message?.value ?? "";
      out.push({
        message,
        line: d.range?.start?.line ?? -1,
        from: d.range?.start?.character ?? -1,
        to: d.range?.end?.character ?? -1,
      });
    }
  }
  return out;
}

const has = (ds: Diag[], sub: string) =>
  ds.some((d) => d.message.includes(sub));

describe("Sparkle @event name validation", () => {
  test("an unrecognized event name warns", () => {
    const ds = diagnose(`layout main with\n  button "x" @clik=foo\nend\n`);
    expect(has(ds, "Unrecognized event")).toBe(true);
  });

  test("a recognized event name does not warn about the event", () => {
    const ds = diagnose(
      `function foo()\nend\nlayout main with\n  button "x" @click=foo\nend\n`,
    );
    expect(has(ds, "Unrecognized event")).toBe(false);
  });
});

describe("Sparkle #prop name validation", () => {
  const propWarns = (src: string) =>
    has(diagnose(src), "Unrecognized prop");

  test("a misspelled prop warns", () => {
    expect(propWarns(`layout main with\n  row #colr=red:\n    text "x"\nend\n`)).toBe(true);
  });

  test("a valid sparkle vocab prop does not warn", () => {
    expect(propWarns(`layout main with\n  row #gap=12:\n    text "x"\nend\n`)).toBe(false);
  });

  test("a valid raw CSS prop (pass-through) does not warn", () => {
    expect(
      propWarns(`layout main with\n  row #object-fit=cover:\n    text "x"\nend\n`),
    ).toBe(false);
  });

  test("a --custom property does not warn", () => {
    expect(
      propWarns(`layout main with\n  row #--my-var=4:\n    text "x"\nend\n`),
    ).toBe(false);
  });

  test("a camelCase prop that normalizes to a CSS property does not warn", () => {
    expect(
      propWarns(`layout main with\n  row #maxWidth=10:\n    text "x"\nend\n`),
    ).toBe(false);
  });

  test("an element attribute like #src does not warn", () => {
    expect(
      propWarns(`layout main with\n  image #src="hero.png"\nend\n`),
    ).toBe(false);
  });

  test("a data-* attribute does not warn", () => {
    expect(
      propWarns(`layout main with\n  row #data-id=5:\n    text "x"\nend\n`),
    ).toBe(false);
  });
});

describe("Sparkle @event handler resolution", () => {
  test("a bare-ref handler to an undefined function warns", () => {
    const ds = diagnose(`layout main with\n  button "x" @click=go_back\nend\n`);
    expect(has(ds, "Cannot find function `go_back`")).toBe(true);
  });

  test("a call handler to an undefined function warns", () => {
    const ds = diagnose(`layout main with\n  button "x" @click=use_item(1)\nend\n`);
    expect(has(ds, "Cannot find function `use_item`")).toBe(true);
  });

  test("a handler to a defined function does not warn", () => {
    const ds = diagnose(
      `function increment()\nend\nlayout main with\n  button "x" @click=increment\nend\n`,
    );
    expect(has(ds, "Cannot find function")).toBe(false);
  });

  test("a handler to a defined scene does not warn", () => {
    const ds = diagnose(
      `scene menu\n  -> DONE\nend\nlayout main with\n  button "x" @click=menu\nend\n`,
    );
    expect(has(ds, "Cannot find function")).toBe(false);
  });

  test("a cross-file handler (function in an included file) does not warn", () => {
    const ds = diagnose(
      `include logic.sd\nlayout main with\n  button "x" @click=shared\nend\n`,
      { logic: `function shared()\nend\n` },
    );
    expect(has(ds, "Cannot find function")).toBe(false);
  });

  test("an inline closure handler is not treated as a function ref", () => {
    const ds = diagnose(
      `store count = 0\nlayout main with\n  button "x" @click={ count = count + 1 }\nend\n`,
    );
    expect(has(ds, "Cannot find function")).toBe(false);
  });

  test("a dotted/member target is not flagged as an undefined function", () => {
    const ds = diagnose(`layout main with\n  button "x" @click=hero.jump\nend\n`);
    expect(has(ds, "Cannot find function `hero")).toBe(false);
  });
});

describe("Sparkle binding diagnostic range", () => {
  test("an undefined reference in a for-iterable reports at the binding, not line 0", () => {
    const src = `layout main with\n  for item in player.inventory do\n    text "{item}"\n  end\nend\n`;
    const ds = diagnose(src);
    const d = ds.find((x) => x.message.includes("player.inventory"));
    expect(d).toBeDefined();
    // The `for` line (index 1) — NOT collapsed to line 0 (the old bug) — and the
    // range slices to exactly `player.inventory`.
    expect(d!.line).toBe(1);
    expect(src.split("\n")[d!.line]!.slice(d!.from, d!.to)).toBe(
      "player.inventory",
    );
  });

  test("an undefined reference in an interpolation points at the exact token", () => {
    const src = `store count = 0\nlayout main with\n  text "Count: {cont}"\nend\n`;
    const ds = diagnose(src);
    const d = ds.find((x) => x.message.includes("`cont`"));
    expect(d).toBeDefined();
    expect(d!.line).toBe(2);
    // The range must slice to exactly `cont` (absolute column, catching the
    // 1-based/0-based off-by-one) — not the surrounding `{cont}` or whole line.
    const line = src.split("\n")[d!.line]!;
    expect(line.slice(d!.from, d!.to)).toBe("cont");
  });

  test("an undefined reference inside a closure handler points at the exact token", () => {
    const src = `store count = 0\nlayout main with\n  button "x" @click={ count = cont - 1 }\nend\n`;
    const ds = diagnose(src);
    const d = ds.find((x) => x.message.includes("`cont`"));
    expect(d).toBeDefined();
    expect(d!.line).toBe(2);
    const line = src.split("\n")[d!.line]!;
    // Exactly `cont` — not the whole `{ … }` closure span.
    expect(line.slice(d!.from, d!.to)).toBe("cont");
  });
});
