import { describe, expect, test } from "vitest";
import { getCSSSelector, getStyleContent } from "@impower/spark-dom/src/utils/getStyleContent";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";

const marked = (presence: string) =>
  `:is([data-presence="${presence}"],[data-presence="${presence}"] *)`;

async function css(src: string): Promise<string> {
  const h = createDOMHarness(src, 0, { autoOpenAll: true });
  await h.ready;
  await flushMicrotasks(20);
  return [...h.overlay.querySelectorAll("style")]
    .map((s) => s.textContent ?? "")
    .join("\n");
}

const blockAfter = (out: string, opener: string): string => {
  const start = out.indexOf(opener);
  expect(start, `${opener} is written in:\n${out}`).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (let i = out.indexOf("{", start); i < out.length; i += 1) {
    if (out[i] === "{") depth += 1;
    if (out[i] === "}") depth -= 1;
    if (depth === 0) return out.slice(start, i + 1);
  }
  return out.slice(start);
};

describe("@initial, @show and @hide in a style (#2733)", () => {
  test("each block is written as a rule for the element's presence mark", () => {
    expect(getCSSSelector("@initial", {})).toBe(marked("initial"));
    expect(getCSSSelector("@show", {})).toBe(marked("show"));
    expect(getCSSSelector("@hide", {})).toBe(marked("hide"));
  });

  test("a style's three blocks hold their own properties beside the settled look", async () => {
    const out = await css(`style frame {
  opacity = 1
  transition-duration = 80ms
  @initial { opacity = 0 }
  @show { transition-duration = 280ms }
  @hide { opacity = 0; transition-duration = 0s }
}
layout main {
  frame
}
`);
    const frame = blockAfter(out, ".frame {");
    expect(frame).toContain("opacity: 1;");
    expect(frame).toContain("transition-duration: 80ms;");
    expect(blockAfter(frame, `&${marked("initial")} {`)).toContain("opacity: 0;");
    expect(blockAfter(frame, `&${marked("show")} {`)).toContain("transition-duration: 280ms;");
    const hide = blockAfter(frame, `&${marked("hide")} {`);
    expect(hide).toContain("opacity: 0;");
    expect(hide).toContain("transition-duration: 0s;");
    expect(out).not.toContain("@starting-style");
  });

  test("the blocks nest under a #name=value selector", () => {
    const out = getStyleContent(
      {
        line: {
          $type: "style",
          $name: "line",
          "#side=left": {
            "@initial": { translate: "-150px 0" },
            "@hide": { opacity: "0" },
          },
        },
      },
      { breakpoints: {}, theme: {} as any },
    );
    const left = blockAfter(blockAfter(out, ".line {"), "&[side=left] {");
    expect(blockAfter(left, `&${marked("initial")} {`)).toContain("translate: -150px 0px;");
    expect(blockAfter(left, `&${marked("hide")} {`)).toContain("opacity: 0;");
  });

  test("an animation may be set inside each block", async () => {
    const out = await css(`animation pop {
  keyframes {
    from { opacity = "0" }
    to { opacity = "1" }
  }
  timing { duration = 0.3 }
}
style bubble {
  @initial { animation = pop; animation-duration = 0.3s }
  @show { animation = pop; animation-duration = 0.3s }
  @hide { animation = pop; animation-duration = 0.3s }
}
layout main {
  bubble
}
`);
    const bubble = blockAfter(out, ".bubble {");
    for (const presence of ["initial", "show", "hide"]) {
      const block = blockAfter(bubble, `&${marked(presence)} {`);
      expect(block).toMatch(/animation[\w-]*: [^;]*pop/);
      expect(block).toContain("animation-duration: 0.3s;");
    }
  });
});
