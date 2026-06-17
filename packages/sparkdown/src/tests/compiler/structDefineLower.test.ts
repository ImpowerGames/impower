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
      $extends: "animation",
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
      $extends: "theme",
      color: "#112233",
      radius: "8px",
    });
  });
});
