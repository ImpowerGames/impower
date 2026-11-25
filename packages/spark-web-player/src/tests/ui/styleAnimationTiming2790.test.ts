import { describe, expect, test } from "vitest";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";

async function css(src: string): Promise<string> {
  const h = createDOMHarness(src, 0, { autoOpenAll: true });
  await h.ready;
  await flushMicrotasks(20);
  return [...h.overlay.querySelectorAll("style")]
    .map((s) => s.textContent ?? "")
    .join("\n");
}

const rule = (out: string, selector: string): string => {
  const start = out.indexOf(`${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  return out.slice(start, out.indexOf("}", start) + 1);
};

const variable = (out: string, name: string): string | undefined =>
  out.match(new RegExp(`--theme-animation-${name}:\\s*([^;]*);`))?.[1]?.trim();

const POP = `animation pop {
  keyframes {
    from { opacity = "0" }
    to { opacity = "1" }
  }
  timing { duration = 0.6 }
}
`;

describe("a style's `animation = name` plays the declaration's timing (#2790)", () => {
  test("the animation's declared duration reaches the style's animation", async () => {
    const out = await css(`${POP}style box {
  animation = pop
}
layout main {
  box
}
`);
    expect(rule(out, ".box")).toContain("animation: var(--theme-animation-pop);");
    const value = variable(out, "pop");
    expect(value).toBeDefined();
    expect(value!.split(/\s+/)).toContain("0.6s");
    expect(value!.split(/\s+/).at(-1)).toBe("pop");
  });

  test("every declared timing setting is carried", async () => {
    const out = await css(`animation whirl {
  keyframes {
    from { rotate = 0deg }
    to { rotate = 360deg }
  }
  timing {
    duration = 2
    delay = 0.25
    easing = linear
    iterations = infinite
    direction = alternate
    fill = forwards
  }
}
style box {
  animation = whirl
}
layout main {
  box
}
`);
    expect(variable(out, "whirl")?.split(/\s+/)).toEqual([
      "2s",
      "cubic-bezier(0,0,1,1)",
      "0.25s",
      "infinite",
      "alternate",
      "forwards",
      "whirl",
    ]);
  });

  test("a declared `fill = auto` leaves the shorthand valid CSS", async () => {
    const out = await css(`animation fade {
  keyframes {
    from { opacity = "0" }
    to { opacity = "1" }
  }
  timing {
    duration = 0.6
    fill = auto
  }
}
style box {
  animation = fade
}
layout main {
  box
}
`);
    const parts = variable(out, "fade")?.split(/\s+/);
    expect(parts).toContain("0.6s");
    expect(parts).not.toContain("auto");
    expect(parts?.at(-1)).toBe("fade");
  });

  test("timing written in the value itself is the animation's whole timing", async () => {
    const out = await css(`${POP}style box {
  animation = 0.5s infinite pop
}
layout main {
  box
}
`);
    expect(rule(out, ".box")).toContain("animation: 0.5s infinite pop;");
  });

  test("a longhand set after `animation` still overrides the declared timing", async () => {
    const out = await css(`${POP}style box {
  animation = pop
  animation-duration = 2s
}
layout main {
  box
}
`);
    const box = rule(out, ".box");
    const shorthand = box.indexOf("animation: var(--theme-animation-pop);");
    const longhand = box.indexOf("animation-duration: 2s;");
    expect(shorthand).toBeGreaterThanOrEqual(0);
    expect(longhand).toBeGreaterThan(shorthand);
  });

  test("a longhand written before `animation` comes before the shorthand, and one written after it follows", async () => {
    const out = await css(`${POP}style box {
  animation-delay = 1s
  animation-fill-mode = forwards
  animation = pop
  animation-iteration-count = 3
}
layout main {
  box
}
`);
    const box = rule(out, ".box");
    const shorthand = box.indexOf("animation: var(--theme-animation-pop);");
    expect(shorthand).toBeGreaterThanOrEqual(0);
    expect(box.indexOf("animation-delay: 1s;")).toBeGreaterThanOrEqual(0);
    expect(box.indexOf("animation-delay: 1s;")).toBeLessThan(shorthand);
    expect(box.indexOf("animation-fill-mode: forwards;")).toBeGreaterThanOrEqual(0);
    expect(box.indexOf("animation-fill-mode: forwards;")).toBeLessThan(shorthand);
    expect(box.indexOf("animation-iteration-count: 3;")).toBeGreaterThan(shorthand);
  });

  test("an animation set in a presence block uses the declared timing", async () => {
    const out = await css(`${POP}style box {
  @show { animation = pop }
}
layout main {
  box
}
`);
    expect(out).toContain("animation: var(--theme-animation-pop);");
    expect(variable(out, "pop")?.split(/\s+/)).toContain("0.6s");
  });
});
