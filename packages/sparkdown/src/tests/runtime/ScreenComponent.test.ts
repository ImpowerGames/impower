// Phase 2 of the structured UI syntax: `screen` / `component` element
// trees. Like `style`, these are COMPILE-TIME structs only — they emit a
// nested-object tree into `program.context.screen.<name>` /
// `program.context.component.<name>` that the engine's UIModule turns
// into a class-keyed <div> tree.
//
// Engine model (UIModule.constructScreen): each element is an object key
// whose space-separated tokens are CSS classes; the LAST token-list
// determines content (a `text` class makes the string value a text span).
// So we emit keys of the form "<uid> <#class values...> <tag>" and nest
// children as the value (or a string for text leaves).
//
// Run: npx vitest run .../ScreenComponent.test.ts

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

function compileUI(source: string): {
  context: any;
  screen: Record<string, any>;
  component: Record<string, any>;
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
  return {
    context,
    screen: context["screen"] ?? {},
    component: context["component"] ?? {},
    errors,
    warnings,
  };
}

// Strip the $-metadata so tests assert on the element tree only.
function tree(struct: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(struct)) {
    if (!k.startsWith("$")) out[k] = v;
  }
  return out;
}

describe("screen · metadata + simple tree", () => {
  test("nested column/text tree → class-keyed nested objects", () => {
    const r = compileUI(`screen settings_menu with
  column #class=root
    text #class=title "Settings"
    text #class=hint "Choose options"
end
`);
    expect(r.errors).toEqual([]);
    const s = r.screen["settings_menu"];
    expect(s["$type"]).toBe("screen");
    expect(s["$name"]).toBe("settings_menu");
    expect(s["$recursive"]).toBe(true);
    expect(tree(s)).toEqual({
      "root_0 root column": {
        "title_1 title text": "Settings",
        "hint_2 hint text": "Choose options",
      },
    });
  });

  test("element with no #class keys off the tag", () => {
    const r = compileUI(`screen s with
  column
    text "Hi"
end
`);
    expect(r.errors).toEqual([]);
    expect(tree(r.screen["s"])).toEqual({
      "column_0 column": {
        "text_1 text": "Hi",
      },
    });
  });
});

describe("screen · deeper nesting", () => {
  test("three levels nest by indentation", () => {
    const r = compileUI(`screen s with
  column #class=outer
    row #class=mid
      text #class=leaf "X"
end
`);
    expect(r.errors).toEqual([]);
    expect(tree(r.screen["s"])).toEqual({
      "outer_0 outer column": {
        "mid_1 mid row": {
          "leaf_2 leaf text": "X",
        },
      },
    });
  });

  test("siblings at the same depth stay siblings", () => {
    const r = compileUI(`screen s with
  column #class=a
    text #class=x "1"
  column #class=b
    text #class=y "2"
end
`);
    expect(r.errors).toEqual([]);
    expect(tree(r.screen["s"])).toEqual({
      "a_0 a column": { "x_1 x text": "1" },
      "b_2 b column": { "y_3 y text": "2" },
    });
  });
});

describe("component", () => {
  test("component produces $type component", () => {
    const r = compileUI(`component card with
  column #class=body
    text #class=title "Card"
end
`);
    expect(r.errors).toEqual([]);
    const c = r.component["card"];
    expect(c["$type"]).toBe("component");
    expect(c["$name"]).toBe("card");
    expect(tree(c)).toEqual({
      "body_0 body column": { "title_1 title text": "Card" },
    });
  });

  test("component inheritance records $extends", () => {
    const r = compileUI(`component my_button as button with
  text #class=label "Go"
end
`);
    expect(r.errors).toEqual([]);
    expect(r.component["my_button"]["$extends"]).toBe("button");
  });
});

describe("screen · coexistence", () => {
  test("screen + style + narrative compile together", () => {
    const r = compileUI(`style title with
  text-size = lg
end
screen s with
  text #class=title "Hello"
end
-> main
scene main
  Hi.
  done
end
`);
    expect(r.errors).toEqual([]);
    expect(r.context["style"]["title"]["text-size"]).toBe("lg");
    expect(tree(r.screen["s"])).toEqual({
      "title_0 title text": "Hello",
    });
  });
});
