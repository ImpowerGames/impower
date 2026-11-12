import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

const URI = "inmemory:///main.sd";

const compile = (prefix = "") => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    useBuiltinsPrelude: true,
    seedBuiltinsIntoStory: true,
    files: [
      { uri: URI, type: "script", name: "main", ext: "sd", text: `${prefix}scene A\n  Hi.\nend\n`, version: 1, languageId: "sparkdown" },
    ],
  });
  const program: any = compiler.compile({ textDocument: { uri: URI } }).program;
  return { styles: program.styles ?? {}, config: program.context?.config ?? {} };
};

const prop = (block: any, name: string) => block?.[name] ?? block?.[name.replace(/-/g, "_")];

const DARK = "@theme(dark)";

const ROLES = {
  paper: { property: "background-color", light: "neutral_99", dark: "neutral_10" },
  ink: { property: "text-color", light: "slate_20", dark: "slate_90" },
  accent: { property: "text-color", light: "orange_30", dark: "orange_80" },
  muted: { property: "text-color", light: "slate_60", dark: "slate_70" },
} as const;

describe("the game's colour scheme setting (#2062)", () => {
  test("ui.color_scheme defaults to system", () => {
    expect(compile().config.ui?.color_scheme).toBe("system");
  });

  test("a game can pin it", () => {
    expect(compile(`define ui as config with\n  color_scheme = "dark"\nend\n\n`).config.ui?.color_scheme).toBe("dark");
  });
});

describe("the page's four colour roles have dark variants (#2062)", () => {
  const { styles } = compile();

  for (const [role, { property, light, dark }] of Object.entries(ROLES)) {
    test(`${role} keeps ${light} as its base and gives ${dark} under @theme(dark)`, () => {
      expect(prop(styles[role], property)).toBe(light);
      expect(prop(styles[role][DARK], property)).toBe(dark);
    });
  }

  test("paper sets the color-scheme of its ground in both schemes, and its dark variant its text colour", () => {
    expect(prop(styles.paper, "color-scheme")).toBe("light");
    expect(prop(styles.paper[DARK], "text-color")).toBe("slate_90");
    expect(prop(styles.paper[DARK], "color-scheme")).toBe("dark");
  });

  test("no other builtin style has a scheme variant", () => {
    const withVariant = Object.entries(styles)
      .filter(([, style]) => JSON.stringify(style).includes("@theme("))
      .map(([name]) => name)
      .sort();
    expect(withVariant).toEqual(Object.keys(ROLES).sort());
  });
});

describe("a game that sets its own role colours keeps them in both schemes (#2062)", () => {
  test("redefining ink's text colour drops the builtin's dark text colour", () => {
    const { styles } = compile("style ink {\n  text-color = red_50\n}\n\n");
    expect(prop(styles.ink, "text-color")).toBe("red_50");
    expect(prop(styles.ink[DARK], "text-color")).toBeUndefined();
  });

  test.each(["color", "text_color"])("redefining ink with the %s spelling also drops the builtin's dark text colour", (spelling) => {
    const { styles } = compile(`style ink {\n  ${spelling} = red_50\n}\n\n`);
    expect(prop(styles.ink[DARK] ?? {}, "text-color")).toBeUndefined();
  });

  test("redefining paper's ground with the background shorthand drops the builtin's dark ground", () => {
    const { styles } = compile("style paper {\n  background = red_50\n}\n\n");
    expect(prop(styles.paper[DARK] ?? {}, "background-color")).toBeUndefined();
    expect(prop(styles.paper[DARK] ?? {}, "text-color")).toBe("slate_90");
  });

  test("the guide's restyled paper keeps its own ground in the dark scheme", () => {
    const { styles } = compile("style paper {\n  background-color = slate_10\n}\n\nstyle ink {\n  text-color = slate_95\n}\n\n");
    expect(prop(styles.paper, "background-color")).toBe("slate_10");
    expect(prop(styles.paper[DARK], "background-color")).toBeUndefined();
    expect(prop(styles.ink[DARK], "text-color")).toBeUndefined();
  });

  test("a role the game leaves alone still follows the scheme", () => {
    const { styles } = compile("style ink {\n  text-color = red_50\n}\n\n");
    expect(prop(styles.accent[DARK], "text-color")).toBe("orange_80");
  });

  test("a game's own dark variant of a role replaces the builtin's", () => {
    const { styles } = compile("style ink {\n  text-color = red_50\n  @theme(dark) {\n    text-color = red_90\n  }\n}\n\n");
    expect(prop(styles.ink, "text-color")).toBe("red_50");
    expect(prop(styles.ink[DARK], "text-color")).toBe("red_90");
  });

  test("a game's own style opts into the dark scheme with @theme(dark)", () => {
    const { styles } = compile("style note {\n  text-color = slate_20\n  @theme(dark) {\n    text-color = slate_90\n  }\n}\n\n");
    expect(prop(styles.note[DARK], "text-color")).toBe("slate_90");
  });
});
