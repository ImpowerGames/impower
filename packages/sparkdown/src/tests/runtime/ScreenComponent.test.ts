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

describe("screen · adjacency content", () => {
  test("`tag \"content\"` produces the same context struct as `tag = \"content\"`", () => {
    const r = compileUI(`screen main with
  stage:
    backdrop:
      image "black"
end
`);
    expect(r.errors).toEqual([]);
    // Adjacency `image "black"` lowers to { image: "black" } — identical to the
    // scalar `image = "black"` form (engine static path unchanged).
    expect(r.screen["main"]["stage"]).toEqual({ backdrop: { image: "black" } });
  });
});

describe("screen · inline events", () => {
  test("`@event` handlers are dropped from the static struct + compile cleanly", () => {
    const r = compileUI(`store hp = 100
function use_item()
end
function take_damage(n)
end
screen hud with
  row:
    button "Use" @click=use_item
    button "Hit" @click=take_damage(10)
end
`);
    expect(r.errors).toEqual([]);
    // The reactive `@click` attrs are not in the static context struct — only
    // the element + its content survive.
    expect(r.screen["hud"]["row"]).toEqual({
      button: "Hit",
    });
  });
});

describe("screen · inline props", () => {
  test("`#prop` is dropped from the static struct; container header keeps its `:`", () => {
    const r = compileUI(`store team_color = "red"
screen panel with
  column #gap=16:
    image #src="icon.png"
    text "hi" #color={team_color}
end
`);
    expect(r.errors).toEqual([]);
    // `column #gap=16:` stays a container (the `:` survives attribute excision);
    // its inline props are absent from the static struct. `image #src=…` → bare
    // marker {}, `text "hi" #color=…` → { text: "hi" }.
    expect(r.screen["panel"]["column"]).toEqual({
      image: {},
      text: "hi",
    });
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
