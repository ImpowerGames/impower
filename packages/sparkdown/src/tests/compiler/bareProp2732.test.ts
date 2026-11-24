import { describe, expect, test } from "vitest";
import { compileScript, errorsOf } from "../program/programHarness";

const SOURCE = `layout main {
  stage {
    backdrop { image }
    portrait #clear { image }
    caption #clear #gap=4 {
      text
    }
  }
}

scene start
  Hello.
end
`;

const element = (program: any, ...path: string[]): any => {
  let nodes = program.sparkle?.layouts?.main?.children ?? [];
  let found: any;
  for (const tag of path) {
    found = nodes.find((n: any) => n.kind === "element" && n.tag === tag);
    nodes = found?.children ?? [];
  }
  return found;
};

describe("a bare prop on a layout element (I-2732)", () => {
  test("compiles with no error", () => {
    const { program } = compileScript(SOURCE);
    expect(errorsOf(program)).toEqual([]);
  });

  test("lowers to true, beside a valued prop", () => {
    const { program } = compileScript(SOURCE);
    expect(element(program, "stage", "portrait").props).toEqual({
      clear: { kind: "literal", value: true },
    });
    expect(element(program, "stage", "caption").props).toEqual({
      clear: { kind: "literal", value: true },
      gap: { kind: "literal", value: 4 },
    });
    expect(element(program, "stage", "backdrop").props).toEqual({});
  });

  test("marks the element $clear in the compiled layout and keeps its key free of the prop", () => {
    const { program } = compileScript(SOURCE);
    const stage = (program as any).context?.layout?.main?.stage;
    expect(stage).toEqual({
      backdrop: { image: {} },
      portrait: { image: {}, $clear: true },
      caption: { text: {}, $clear: true },
    });
  });

  test("marks an element with no block $clear", () => {
    const { program } = compileScript(
      "layout hud {\n  title #clear\n  note\n}\n\nscene start\n  Hello.\nend\n",
    );
    expect((program as any).context?.layout?.hud).toMatchObject({
      title: { $clear: true },
      note: {},
    });
  });
});
