// `screen NAME [as PARENT] with <colon/indent element tree> end` (and
// `component`). Structural UI keywords lowering to a compile-time struct
// in program.context.screen|component.<name>. The body is the colon/indent
// named-element tree the engine consumes directly: named elements as keys,
// `key = value` scalars, and bare markers (`image`, `text`, `mask shadow_1`)
// as `{}` leaves. (Matches production ui.sd.)
//
// Run: npx vitest run .../ScreenComponent.test.ts

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

function compileUI(source: string): {
  screen: Record<string, any>;
  component: Record<string, any>;
  errors: string[];
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
  for (const docDiags of Object.values(result.program.diagnostics ?? {})) {
    for (const d of docDiags as any[]) {
      const msg =
        typeof d?.message === "string"
          ? d.message
          : (d?.message?.value ?? JSON.stringify(d));
      if (d?.severity === 1 || d?.severity == null) errors.push(msg);
    }
  }
  const context = result.program.context ?? {};
  return {
    screen: context["screen"] ?? {},
    component: context["component"] ?? {},
    errors,
  };
}

describe("screen · named-element tree", () => {
  test("nested elements + scalars + bare markers", () => {
    const r = compileUI(`screen main with
  stage:
    backdrop:
      image = "black"
    portrait:
      mask shadow_1
      mask shadow_2
      image
end
`);
    expect(r.errors).toEqual([]);
    expect(r.screen["main"]).toEqual({
      $type: "screen",
      $name: "main",
      $recursive: true,
      stage: {
        backdrop: { image: "black" },
        portrait: {
          "mask shadow_1": {},
          "mask shadow_2": {},
          image: {},
        },
      },
    });
  });
});

describe("screen · reactive content interpolation", () => {
  test("interpolated content compiles cleanly (binding evaluators hoisted)", () => {
    // `{expr}` in display content lowers to a hoisted nullary binding function
    // (`__binding_<from>() return <expr> end`). The full pipeline must compile
    // those with no errors — a malformed flow or unresolved reference would
    // surface as a diagnostic here.
    const r = compileUI(`store hp = 100
store max_hp = 100
screen hud with
  text = "HP: {hp} / {max_hp + 0}"
end
`);
    expect(r.errors).toEqual([]);
    // Static struct still carries the raw content string (engine path
    // unchanged in Phase 1).
    expect(r.screen["hud"]["text"]).toBe("HP: {hp} / {max_hp + 0}");
  });
});

describe("component", () => {
  test("component produces $type component", () => {
    const r = compileUI(`component card with
  body:
    title:
      text
end
`);
    expect(r.errors).toEqual([]);
    const c = r.component["card"];
    expect(c["$type"]).toBe("component");
    expect(c["$name"]).toBe("card");
    expect(c["body"]).toEqual({ title: { text: {} } });
  });

  test("component inheritance records $extends", () => {
    const r = compileUI(`component my_button as button with
  label:
    text
end
`);
    expect(r.errors).toEqual([]);
    expect(r.component["my_button"]["$extends"]).toBe("button");
  });
});

describe("screen · coexistence", () => {
  test("screen + style + narrative compile together", () => {
    const r = compileUI(`style title with
  font_size = lg
end
screen s with
  textbox:
    title:
      text
end
-> main
scene main
  Hi.
  done
end
`);
    expect(r.errors).toEqual([]);
    expect(r.screen["s"]["textbox"]).toEqual({ title: { text: {} } });
  });
});
