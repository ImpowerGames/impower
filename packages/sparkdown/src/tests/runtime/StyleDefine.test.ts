// Phase 1 of the structured UI syntax: `style NAME [as PARENT] with
// ... end` blocks. A style is a COMPILE-TIME struct only — it produces
// no runtime objects, just a `style` entry in `program.context` that the
// engine's sparkle UI system consumes. These tests pin:
//   - the produced context shape (canonical sparkle keys, $type/$name)
//   - alias de-aliasing (bg-color → background-color, p → padding)
//   - inheritance ($extends)
//   - schema validation (unknown props warn, don't block)
//
// Run: npx vitest run .../StyleDefine.test.ts

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

function compileStyle(source: string): {
  context: any;
  style: Record<string, any>;
  errors: string[];
  warnings: string[];
} {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri: "inmemory:///main.sd",
        type: "script",
        name: "main",
        ext: "sd",
        text: source,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  });
  const result = compiler.compile({
    textDocument: { uri: "inmemory:///main.sd" },
  });
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const docDiags of Object.values(result.program.diagnostics ?? {})) {
    for (const d of docDiags as any[]) {
      const msg =
        typeof d?.message === "string"
          ? d.message
          : (d?.message?.value ?? JSON.stringify(d));
      if (d?.severity === 1) errors.push(msg);
      else if (d?.severity === 2) warnings.push(msg);
      else if (d?.severity == null) errors.push(msg);
    }
  }
  const context = result.program.context ?? {};
  return { context, style: context["style"] ?? {}, errors, warnings };
}

describe("style · context shape", () => {
  test("emits a style struct with $type/$name", () => {
    const r = compileStyle(`style panel with
  background-color = surface-2
  corner = md
end
`);
    expect(r.errors).toEqual([]);
    expect(r.style["panel"]).toBeTruthy();
    expect(r.style["panel"]["$type"]).toBe("style");
    expect(r.style["panel"]["$name"]).toBe("panel");
    expect(r.style["panel"]["background-color"]).toBe("surface-2");
    expect(r.style["panel"]["corner"]).toBe("md");
  });

  test("does NOT create a runtime global for the style name", () => {
    const r = compileStyle(`style panel with
  corner = md
end
`);
    expect(r.errors).toEqual([]);
    // No "panel" leaks into any non-style context bucket.
    for (const [type, structs] of Object.entries(r.context)) {
      if (type === "style") continue;
      expect(Object.keys(structs as object)).not.toContain("panel");
    }
  });
});

describe("style · aliases de-alias to canonical", () => {
  test("short aliases resolve (bg-color, p, m, c, w)", () => {
    const r = compileStyle(`style box with
  bg-color = surface-1
  p = sm
  m = lg
  c = md
  w = 100
end
`);
    expect(r.errors).toEqual([]);
    const s = r.style["box"];
    expect(s["background-color"]).toBe("surface-1");
    expect(s["padding"]).toBe("sm");
    expect(s["margin"]).toBe("lg");
    expect(s["corner"]).toBe("md");
    expect(s["width"]).toBe("100");
    // The authored alias spelling must NOT survive as its own key.
    expect(s["bg-color"]).toBeUndefined();
    expect(s["p"]).toBeUndefined();
  });

  test("multi-value shorthand stored raw", () => {
    const r = compileStyle(`style box with
  padding = sm md
end
`);
    expect(r.errors).toEqual([]);
    expect(r.style["box"]["padding"]).toBe("sm md");
  });
});

describe("style · inheritance", () => {
  test("`as PARENT` records $extends", () => {
    const r = compileStyle(`style danger as button with
  background-color = red-5
end
`);
    expect(r.errors).toEqual([]);
    expect(r.style["danger"]["$extends"]).toBe("button");
    expect(r.style["danger"]["background-color"]).toBe("red-5");
  });
});

describe("style · schema validation", () => {
  test("unknown property warns (does not block)", () => {
    const r = compileStyle(`style box with
  not-a-real-prop = 5
  corner = md
end
`);
    // Build still succeeds; the valid prop is still captured.
    expect(r.errors).toEqual([]);
    expect(r.style["box"]["corner"]).toBe("md");
    expect(r.style["box"]["not-a-real-prop"]).toBeUndefined();
    expect(r.warnings.join(" ")).toMatch(/not-a-real-prop/);
  });
});

describe("style · block boundaries", () => {
  test("two style blocks in one file", () => {
    const r = compileStyle(`style a with
  corner = md
end
style b with
  corner = lg
end
`);
    expect(r.errors).toEqual([]);
    expect(r.style["a"]["corner"]).toBe("md");
    expect(r.style["b"]["corner"]).toBe("lg");
  });

  test("style block coexists with narrative content", () => {
    const r = compileStyle(`style title with
  text-size = lg
end
-> main
scene main
  Hello.
  done
end
`);
    expect(r.errors).toEqual([]);
    expect(r.style["title"]["text-size"]).toBe("lg");
    // The scene still compiles to a runnable story.
    expect(r.context["style"]["title"]["$type"]).toBe("style");
  });

  test("comments inside a style block are ignored", () => {
    const r = compileStyle(`style box with
  -- the panel background
  background-color = surface-2
end
`);
    expect(r.errors).toEqual([]);
    expect(r.style["box"]["background-color"]).toBe("surface-2");
  });
});
