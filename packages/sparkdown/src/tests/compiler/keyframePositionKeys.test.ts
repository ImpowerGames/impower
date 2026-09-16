import { describe, expect, test } from "vitest";
import { compileSource } from "./compileSnapshot";

function structOf(source: string, type: string, name: string): any {
  const entries = compileSource(source);
  const e = entries.find((x) => x.block?.context?.[type]?.[name]);
  return e?.block?.context?.[type]?.[name];
}

function messagesOf(source: string): string[] {
  return compileSource(source).flatMap((e) =>
    (e.block?.diagnostics ?? []).map((d) => d.message),
  );
}

describe("keyframes written as position keys", () => {
  test("`from` / percentage / `to` keys lower to the same struct as the offset list", () => {
    const keyed = structOf(
      `animation fade with
  keyframes:
    from:
      opacity = "0"
    40%:
      opacity = "1"
    to:
      opacity = "0"
end
`,
      "animation",
      "fade",
    );
    const listed = structOf(
      `animation fade with
  keyframes:
    -
      offset = 0
      opacity = "0"
    -
      offset = 0.4
      opacity = "1"
    -
      offset = 1
      opacity = "0"
end
`,
      "animation",
      "fade",
    );
    expect(keyed).toEqual(listed);
    expect(keyed.keyframes).toEqual([
      { offset: 0, opacity: "0" },
      { offset: 0.4, opacity: "1" },
      { offset: 1, opacity: "0" },
    ]);
  });

  test("positions written out of order are sorted by offset", () => {
    const struct = structOf(
      `animation swap with
  keyframes:
    to:
      opacity = "1"
    0%:
      opacity = "0"
    50%:
      opacity = "0.5"
end
`,
      "animation",
      "swap",
    );
    expect(struct.keyframes).toEqual([
      { offset: 0, opacity: "0" },
      { offset: 0.5, opacity: "0.5" },
      { offset: 1, opacity: "1" },
    ]);
  });

  test("a fractional percentage keeps its precision", () => {
    const struct = structOf(
      `animation precise with
  keyframes:
    12.5%:
      opacity = "0"
end
`,
      "animation",
      "precise",
    );
    expect(struct.keyframes).toEqual([{ offset: 0.125, opacity: "0" }]);
  });

  test("the list form with explicit offsets is unchanged", () => {
    const struct = structOf(
      `animation ping with
  keyframes:
    -
      offset = 0.75
      opacity = "0"
    -
      offset = 1
      opacity = "1"
end
`,
      "animation",
      "ping",
    );
    expect(struct.keyframes).toEqual([
      { offset: 0.75, opacity: "0" },
      { offset: 1, opacity: "1" },
    ]);
  });

  test("a container that is not `keyframes` keeps its keys verbatim", () => {
    const struct = structOf(
      `animation timed with
  timing:
    duration = 1
    easing = "ease"
end
`,
      "animation",
      "timed",
    );
    expect(struct.timing).toEqual({ duration: 1, easing: "ease" });
  });

  test("the position key wins over an `offset` written inside the keyframe", () => {
    const struct = structOf(
      `animation conflicting with
  keyframes:
    25%:
      offset = 0.9
      opacity = "1"
end
`,
      "animation",
      "conflicting",
    );
    expect(struct.keyframes).toEqual([{ offset: 0.25, opacity: "1" }]);
  });

  test("mixing position keys with `-` items is an error", () => {
    const source = `animation mixed with
  keyframes:
    from:
      opacity = "0"
    -
      offset = 1
      opacity = "1"
end
`;
    expect(messagesOf(source).join("\n")).toMatch(/mix/i);
  });

  test("a duplicate position is an error", () => {
    const source = `animation dupe with
  keyframes:
    50%:
      opacity = "0"
    50%:
      opacity = "1"
end
`;
    expect(messagesOf(source).join("\n")).toMatch(/duplicate/i);
  });

  test("a position outside 0% to 100% is an error", () => {
    const source = `animation wild with
  keyframes:
    0%:
      opacity = "0"
    150%:
      opacity = "1"
end
`;
    expect(messagesOf(source).join("\n")).toMatch(/between 0% and 100%/i);
  });

  test("a valid keyed block reports no errors", () => {
    const source = `animation clean with
  keyframes:
    from:
      opacity = "0"
    to:
      opacity = "1"
end
`;
    expect(messagesOf(source)).toEqual([]);
  });
});
