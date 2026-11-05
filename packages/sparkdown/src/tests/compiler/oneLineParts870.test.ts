import { describe, expect, test } from "vitest";
import { compileSource } from "./compileSnapshot";

const PRELUDE = "store score = 0\nfunction go()\n  score = 1\nend\n";

const BODIES = {
  brace: (line: string) => `layout hud {\n  ${line}\n}\n`,
  with: (line: string) => `layout hud with\n  ${line}\nend\n`,
};

const hud = (body: (line: string) => string, line: string) =>
  compileSource(PRELUDE + body(line)).find((e: any) => e.block?.sparkle)
    ?.block?.sparkle?.layouts?.["hud"]?.children?.[0] as any;

describe.each(Object.entries(BODIES))(
  "parts written after a one-line element's content or handler (%s body)",
  (_, body) => {
    test("a class after the content is kept", () => {
      const el = hud(body, 'text "Hi" .a #width=3');
      expect(el.tag).toBe("text");
      expect(el.classes).toEqual(["a"]);
      expect(el.content).toEqual([{ kind: "literal", text: "Hi" }]);
      expect(el.props).toEqual({ width: { kind: "literal", value: 3 } });
    });

    test("parts after a bare handler are the element's", () => {
      const el = hud(body, 'button @click=go .a "Hi"');
      expect(el.tag).toBe("button");
      expect(el.classes).toEqual(["a"]);
      expect(el.content).toEqual([{ kind: "literal", text: "Hi" }]);
      expect(el.events).toHaveLength(1);
      expect(el.events[0].event).toBe("click");
      expect(el.events[0].handler).toEqual({ kind: "ref", name: "go" });
    });
  },
);
