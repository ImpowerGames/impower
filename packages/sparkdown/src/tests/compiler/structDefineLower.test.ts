import { describe, expect, test } from "vitest";
import { compileSource } from "./compileSnapshot";

function ctxOf(source: string, type: string, name: string): any {
  const entries = compileSource(source);
  const e = entries.find((x) => x.block?.context?.[type]?.[name]);
  return e?.block?.context?.[type]?.[name];
}

describe("animation/theme structural lowering", () => {
  test("typed body: numbers stay numbers, quoted CSS stays string, refs resolve, keyframes array", () => {
    const struct = ctxOf(
      `animation ping with
  target = layer.self
  keyframes:
    -
      offset = 0.75
      transform = "scale(2)"
      opacity = "0"
    -
      offset = 1
      opacity = "1"
  timing:
    delay = 0
    duration = 0
    easing = "ease"
    iterations = 1
    fill = "both"
end
`,
      "animation",
      "ping",
    );
    expect(struct).toEqual({
      $type: "animation",
      $name: "ping",
      target: { $type: "layer", $name: "self" },
      keyframes: [
        { offset: 0.75, transform: "scale(2)", opacity: "0" },
        { offset: 1, opacity: "1" },
      ],
      timing: {
        delay: 0,
        duration: 0,
        easing: "ease",
        iterations: 1,
        fill: "both",
      },
    });
  });

  test("`as PARENT` overrides the implicit type extend", () => {
    const struct = ctxOf(
      `animation fast_show as show with
  timing:
    duration = "200ms"
end
`,
      "animation",
      "fast_show",
    );
    expect(struct.$extends).toBe("show");
    expect(struct.timing).toEqual({ duration: "200ms" });
  });

  test("theme tokens lower with unquoted CSS values as strings", () => {
    const struct = ctxOf(
      `theme dusk with
  color = #112233
  radius = 8px
end
`,
      "theme",
      "dusk",
    );
    expect(struct).toEqual({
      $type: "theme",
      $name: "dusk",
      color: "#112233",
      radius: "8px",
    });
  });
});

describe("screen/component structural lowering (static context channel)", () => {
  // Reactive inline attributes (`@event=`, `#prop=`) live on element lines but
  // are NOT part of the static struct the engine consumes from `context.screen`
  // — the reactive AST builder (lowerSparkleBody) reads them instead. The static
  // `lowerStructBody` reader must EXCISE their spans from every text it reads:
  // object-header keys (`column #gap=16:` → `column`), adjacency content
  // (`button "Use" @click=x` → `{ button: "Use" }`), and bare markers. This
  // guards the merge of dev's attribute-excision with the grammar's shape-node
  // dispatch — a regression would leak `@click` / `#gap` into the static channel
  // (e.g. as a bogus key/value or a malformed selector).
  test("static screen body excises inline `@event` / `#prop` attributes", () => {
    const struct = ctxOf(
      `screen hud with
  column #gap=16:
    button "Use" @click=use_item
    text "HP: {hp}" #color=red
end
`,
      "screen",
      "hud",
    );
    expect(struct).toEqual({
      $type: "screen",
      $name: "hud",
      $recursive: true,
      // `#gap=16` excised from the header key; `@click` / `#color` excised from
      // the element lines; the display content (`"Use"`, `"HP: {hp}"`) is kept
      // raw (the `{hp}` interpolation stays as literal text in the static struct).
      column: { button: "Use", text: "HP: {hp}" },
    });
  });
});
