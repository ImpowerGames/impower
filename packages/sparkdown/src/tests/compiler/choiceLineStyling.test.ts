import { describe, expect, test } from "vitest";
import { testCompiler, testStory } from "../engineUnderTest";
import { parseSource } from "./grammarSnapshot";
import { treeScopeStackAt, vscodeScopeStacksPerChar } from "./scopeEquality";

const SCOPE_STYLES: [scope: string, style: string][] = [
  ["markup.other.bold.sd", "bold"],
  ["markup.other.italic.sd", "italic"],
  ["markup.other.underline.sd", "underline"],
  ["constant.character.escape.centered.sd", "centered"],
  ["markup.emphasis.tilde.sd", "wavy"],
  ["markup.emphasis.colon.sd", "shaky"],
];

const SUPPRESSION_BRACKET = /^punctuation\.definition\.template-expression\.(begin|end)\.choice\.suppression\.sd$/;

const stylesOf = (scopes: string[]): string => {
  const styles = SCOPE_STYLES.filter(([scope]) => scopes.includes(scope)).map(([, style]) => style);
  if (scopes.filter((scope) => scope.startsWith("markup.raw.")).length >= 2) styles.push("raw");
  if (scopes.some((scope) => SUPPRESSION_BRACKET.test(scope))) styles.push("bracket");
  return [...new Set(styles)].sort().join(" ");
};

const show = (cells: { char: string; style: string }[]): string => {
  let out = "";
  let current = "";
  for (const { char, style } of cells) {
    if (style !== current) {
      out += (current ? "]" : "") + (style ? `[${style}: ` : "");
      current = style;
    }
    out += char;
  }
  return out + (current ? "]" : "");
};

const VALUES = `store x = "plain"\n`;

const choiceScript = (text: string) =>
  `${VALUES}scene start\n  choose\n    + ${text}\n      Body.\n      done\n  end\nend\nscene next\n  Next.\n  done\nend\n`;

const displayScript = (text: string) => `${VALUES}scene start\n  ${text}\n  done\nend\n`;

async function choiceReadings(text: string) {
  const source = choiceScript(text);
  const from = source.indexOf(`+ ${text}`) + 2;
  const tree = parseSource(source);
  const vscode = await vscodeScopeStacksPerChar(source);
  const hidden = new Set<number>();
  const cursor = tree.cursor();
  do {
    if (/^Span(?:Open|Close)Mark$/.test(cursor.name) || /^Escape_c[135]$/.test(cursor.name)) {
      for (let i = cursor.from; i < cursor.to; i++) hidden.add(i);
    }
  } while (cursor.next());
  const treeCells: { char: string; style: string }[] = [];
  const vscodeCells: { char: string; style: string }[] = [];
  let doubled = false;
  for (let i = from; i < from + text.length; i++) {
    const treeScopes = treeScopeStackAt(tree, i);
    for (const [scope] of SCOPE_STYLES) {
      if (treeScopes.filter((s) => s === scope).length > 1 || (vscode[i] ?? []).filter((s) => s === scope).length > 1) {
        doubled = true;
      }
    }
    if (hidden.has(i)) continue;
    treeCells.push({ char: source[i]!, style: stylesOf(treeScopes) });
    vscodeCells.push({ char: source[i]!, style: stylesOf(vscode[i] ?? []) });
  }
  return { tree: show(treeCells), vscode: show(vscodeCells), doubled };
}

const compile = (source: string) => {
  const compiler = testCompiler();
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
      } as any,
    ],
  });
  const result = compiler.compile({ textDocument: { uri: "inmemory:///main.sd" } });
  const errors = Object.values(result.program.diagnostics ?? {})
    .flat()
    .filter((d: any) => d?.severity === 1)
    .map((d: any) => (typeof d.message === "string" ? d.message : d.message.value));
  return { story: testStory(result.program.chunks), errors };
};

const choiceOutcome = (text: string) => {
  const { story, errors } = compile(choiceScript(text));
  story.Continue();
  const labels = story.currentChoices.map((choice: { text: string }) => choice.text);
  story.ChooseChoiceIndex(0);
  return { errors, labels, chosen: story.ContinueMaximally() };
};

const displayOutput = (text: string) => compile(displayScript(text)).story.ContinueMaximally();

const both = (reading: string) => ({ tree: reading, vscode: reading, doubled: false });

const CROSSING = ["*", "**", "_", "^", "~~", "::"].flatMap((mark) => [
  `Go ${mark}a [b${mark} c] d`,
  `Go ${mark}a [b] c${mark} d`,
  `Go [a ${mark}b] c${mark} d`,
]);

describe("marks never cross a choice bracket", () => {
  test.each(CROSSING)("both grammar engines colour the marks of %s as text", async (text) => {
    const reading = text.replace(/\[/, "[bracket: []").replace(/\](?=[^\]]*$)/, "[bracket: ]]");
    expect(await choiceReadings(text)).toEqual(both(reading));
  });

  test("the label and the output keep the marks as written", () => {
    expect(choiceOutcome("Cross *far [away] now* x")).toEqual({
      errors: [],
      labels: ["Cross *far away"],
      chosen: "Cross *far now* x\nBody.\n",
    });
  });
});

describe("a raw span in choice text holds a bracket as its text, as a code span holds a link bracket in CommonMark", () => {
  test.each([
    ["Go `a [b` c] d", "Go [raw: a [b] c] d", ["Go `a [b` c] d"], "Go `a [b` c] d\nBody.\n"],
    ["Go `a [b] c` d", "Go [raw: a [b] c] d", ["Go `a [b] c` d"], "Go `a [b] c` d\nBody.\n"],
    ["Go [a `b] c` d", "Go [a [raw: b] c] d", ["Go [a `b] c` d"], "Go [a `b] c` d\nBody.\n"],
  ])("%s opens no suppression", async (text, reading, labels, chosen) => {
    expect(await choiceReadings(text)).toEqual(both(reading));
    expect(choiceOutcome(text)).toEqual({ errors: [], labels, chosen });
  });
});

describe("a glued alternator in choice text is read as the grammar marks it", () => {
  test.each([
    ["Alt .. cycle |a|b .. now", "Alt a now"],
    ["Alt .. cycle |a {x}|b .. now", "Alt a {x} now"],
  ])("%s reads an arm in the label and the output, as the same display line does", (text, shown) => {
    expect(displayOutput(text).trim()).toBe(shown);
    const outcome = choiceOutcome(text);
    expect(outcome.errors).toEqual([]);
    expect(outcome.labels).toEqual([shown]);
    expect(outcome.chosen).not.toMatch(/\||\.\.|cycle/);
  });
});

describe("a backslash before a suppression bracket escapes it", () => {
  test("an escaped bracket is text in the label and the output, and the grammar opens no suppression", async () => {
    expect(choiceOutcome("Go \\[a] b")).toEqual({ errors: [], labels: ["Go [a] b"], chosen: "Go [a] b\nBody.\n" });
    expect(await choiceReadings("Go \\[a] b")).toEqual(both("Go [a] b"));
  });

  test("a later bracket still suppresses", async () => {
    expect(choiceOutcome("Go \\[a] [b] c")).toEqual({ errors: [], labels: ["Go [a] b"], chosen: "Go [a] c\nBody.\n" });
    expect(await choiceReadings("Go \\[a] [b] c")).toEqual(both("Go [a] [bracket: []b[bracket: ]] c"));
  });
});

describe("a styled span around an interpolation that ends early opens no second span", () => {
  test.each(["Go *far {x ] *y* away* now", "Go *far {x )) * away* now", "Go _far {x ] _ away_ now"])(
    "%s never stacks one style twice",
    async (text) => {
      expect((await choiceReadings(text)).doubled).toBe(false);
    },
  );
});
