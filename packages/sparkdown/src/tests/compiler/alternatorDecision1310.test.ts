// Whether a structural word (`queue`, `cycle`, `chain`, `shuffle`, `match`,
// `plural`) opens an alternator or names a value is decided where the
// tokens are known, not by a scan of the rest of its line (I-1310): the
// grammar opens a candidate at the word and its arms at a `|` at the word's
// own level, and the converter reads a candidate that holds no arms as Luau
// (`opensAlternator`). The editor follows through the semantic tokens.
import { beforeAll, describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { SparkdownDocumentRegistry } from "../../compiler/classes/SparkdownDocumentRegistry";
import { DiagnosticSeverity } from "../../compiler/types/SparkDiagnostic";
import { makeRuntimeStoryFromSource } from "../runtime/runtimeTestHarness";
import { alternatorArms } from "../../compiler/utils/alternatorDecision";
import { dumpTree, getParser, stripAnsi } from "./grammarSnapshot";
import { loadOfficialLuau } from "./officialLuau";
import { compareEnginesFull, formatDivergences } from "./scopeEquality";

const URI = "inmemory:///main.sd";

const run = (text: string) => {
  const ctx = makeRuntimeStoryFromSource(text);
  return { errors: ctx.errorMessages, warnings: ctx.warningMessages, output: ctx.story.ContinueMaximally() };
};

const tree = (text: string) => stripAnsi(dumpTree(text));

// What a `cycle` reports for anything before its first `|` (I-1446).
const HEAD_ERROR = "A `cycle` takes no value before its first `|`; write its arms as `| ...`";

/** Every error a full compile reports, with its range. */
const errorsOf = (text: string): string[] => {
  const c = new SparkdownCompiler();
  c.configure({
    files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
  } as never);
  const program = c.compile({ textDocument: { uri: URI } } as never).program as any;
  return (program.diagnostics?.[URI] ?? [])
    .filter((d: any) => d.severity === DiagnosticSeverity.Error)
    .map((d: any) => {
      const message = typeof d.message === "string" ? d.message : d.message.value;
      return `${d.range.start.line}:${d.range.start.character}-${d.range.end.line}:${d.range.end.character} ${message}`;
    })
    .sort();
};

let official: Awaited<ReturnType<typeof loadOfficialLuau>>;
beforeAll(async () => {
  official = await loadOfficialLuau("typecheck");
});

/** The official parser's errors for some Luau, ranged as the compile ranges its own. */
const officialErrors = (luau: string): string[] =>
  official(luau)
    .diagnostics.map((e) => `${e.location.begin.line}:${e.location.begin.column}-${e.location.end.line}:${e.location.end.column} ${e.message}`)
    .sort();

/** The semantic token on the `occurrence`th span of `word`, or undefined when none. */
const semanticTokenOf = (source: string, word: string, occurrence = 1): string | undefined => {
  const registry = new SparkdownDocumentRegistry(["semantics"]);
  const uri = "file:///alternator.sd";
  registry.set({ textDocument: { uri, text: source, version: 1, languageId: "sparkdown" } });
  const cur = registry.annotations(uri)!.semantics.iter();
  let seen = 0;
  for (; cur.value; cur.next()) {
    if (source.slice(cur.from, cur.to) !== word) continue;
    if (++seen === occurrence) return (cur.value as any).type.tokenType;
  }
  return undefined;
};

// A local function named for the word, which returns its argument, or
// "table" for a table.
const IDENTITY = (word: string) => `local ${word} = function(s) return if type(s) == "table" then "table" else s end`;

describe("a structural word followed by a call is a call (I-1304)", () => {
  test("match(1) on a local match keeps the function's end", () => {
    const source = "Value {f()}.\nfunction f()\n  local match = function(n) return n end\n  match(1)\n  return 7\nend\n\nAfter.\n";
    expect(run(source)).toEqual({ errors: [], warnings: [], output: "Value 7.\nAfter.\n" });
    expect(tree(source)).not.toMatch(/AlternatorArms \[/);
  });

  test("the call gets the diagnostics the same script with another name gets", () => {
    const script = (name: string) => `function inspect()\n  local ${name} = print\n  ${name}(1)\nend\n\nAfter.\n`;
    expect(run(script("match"))).toEqual(run(script("hp")));
    expect(run(script("match")).output).toBe("After.\n");
  });

  test("the converter reads the call as Luau reads it", () => {
    const luau = "function f()\n  local match = function(n) return n end\n  match(1)\n  return 7\nend\n";
    expect(officialErrors(luau)).toEqual([]);
    expect(errorsOf(luau)).toEqual([]);
  });
});

describe("a `|` the word's own level does not hold opens no alternator", () => {
  test.each([
    ["a level-4 long string holding a lower-level closer", "queue([====[a]=]|b]====])", "a]=]|b"],
    ["a level-4 long string", "queue([====[a|b]====])", "a|b"],
    ["a long string", "queue([[a|b]])", "a|b"],
    ["a quoted string", 'queue("a|b")', "a|b"],
    ["a call's string argument", 'queue "a|b"', "a|b"],
    ["a table's string", 'queue {"a|b"}', "table"],
    ["a comment after the call", 'queue("a") -- x | y', "a"],
    ["a cast union after the call", 'queue("a") :: string | number', "a"],
    ["a later string", 'queue("a") .. "|"', "a|"],
  ])("%s: %s", (_, call, value) => {
    const source = `Value {f()}.\nfunction f()\n  ${IDENTITY("queue")}\n  local s = ${call}\n  return s\nend\n`;
    expect(run(source)).toEqual({ errors: [], warnings: [], output: `Value ${value}.\n` });
    expect(tree(source)).not.toMatch(/AlternatorArms \[/);
  });

  test.each(["queue :: number | string", "match :: number | string"])("a cast union right after the word: %s", (cast) => {
    const word = cast.split(" ")[0]!;
    const source = `Value {f()}.\nfunction f()\n  local ${word} = "q"\n  local s = ${cast}\n  return s\nend\n`;
    expect(run(source)).toMatchObject({ errors: [], output: "Value q.\n" });
    expect(tree(source)).not.toMatch(/Alternator(Block|Statement|Arms) \[/);
  });
});

describe("a real alternator in each structural word opens and lowers as before", () => {
  test.each([
    ['{queue | "a" | "b" end}', "a"],
    ['{cycle | "a" | "b" end}', "a"],
    ['{chain | "a" | "b" end}', "a"],
    ['{shuffle | "a" end}', "a"],
    ['{match(x) | warrior = "w" | mage = "m"}', "m"],
    ['{match x | warrior = "w" | mage = "m"}', "m"],
    ['{plural(1) | one = "is" | other = "are"}', "is"],
  ])("%s", (alternator, value) => {
    const source = `store x = "mage"\n\nValue ${alternator}.\n`;
    expect(run(source)).toEqual({ errors: [], warnings: [], output: `Value ${value}.\n` });
    expect(tree(source)).toMatch(/─ LuauAlternatorArms \[/);
  });

  // A sequential head still opens the arms; it is an error, and the
  // alternator runs as if it had none (I-1446).
  test('{cycle "x" | "a" | "b" end}', () => {
    const source = 'store x = "mage"\n\nValue {cycle "x" | "a" | "b" end}.\n';
    expect(run(source)).toEqual({ errors: [HEAD_ERROR], warnings: [], output: "Value a.\n" });
    expect(tree(source)).toMatch(/─ LuauAlternatorArms \[/);
  });

  test.each([
    ["the sequential block form", "function f()\n  queue\n    | print(1)\n    | print(2)\n  end\n  return 3\nend\nValue {f()}.\n", "LuauSequentialAlternatorLineStart"],
    ["the sequential block form after a comment", "function f()\n  shuffle cycle -- note\n    | print(1)\n  end\n  return 3\nend\nValue {f()}.\n", "LuauSequentialAlternatorLineStart"],
    ["the conditional block form", "function f(n)\n  match n\n    | 1 = print(1)\n    | 2 = print(2)\n  end\n  return 3\nend\nValue {f(1)}.\n", "LuauConditionalAlternatorLineStart"],
    ["the sequential block form inside a bracket", "function f()\n  print(\n    chain\n      | 1\n      | 2\n    end\n  )\n  return 3\nend\nValue {f()}.\n", "LuauSequentialAlternatorLineStart"],
    ["the conditional block form with a parenthesized condition", "function f(n)\n  match (n)\n    | 1 = print(1)\n  end\n  return 3\nend\nValue {f(1)}.\n", "LuauConditionalAlternatorLineStart"],
  ])("%s keeps its arms and the function its end", (_, source, rule) => {
    expect(run(source)).toMatchObject({ errors: [], output: "Value 3.\n" });
    expect(tree(source)).toMatch(new RegExp(`─ ${rule} \\[`));
    expect(tree(source)).toMatch(/─ LuauAlternatorArms \[/);
  });
});

describe("where a candidate ends", () => {
  test("a candidate first on its line goes on past blank and comment lines to its arms", () => {
    const source = "function f(n)\n  match n\n\n  -- the arms\n    | 1 = print(1)\n  end\n  return 3\nend\nValue {f(1)}.\n";
    expect(run(source)).toMatchObject({ errors: [], output: "Value 3.\n" });
    expect(tree(source)).toMatch(/─ LuauAlternatorArms \[/);
  });

  test.each([
    ["a comment after the head that ends in `end`", "function f()\n  queue -- end\n    | print(1)\n  end\n  return 3\nend\nValue {f()}.\n"],
    ["a comment line between the head and its arms that ends in `end`", "function f(n)\n  match n\n    -- the end\n    | a = print(1)\n  end\n  return 3\nend\nValue {f(1)}.\n"],
    ["a comment after a bare condition that ends in `end`", "function f(n)\n  match n -- end\n    | print(1)\n  end\n  return 3\nend\nValue {f(1)}.\n"],
    ["a comment after a parenthesized condition that ends in `end`", "function f(n)\n  plural (n) -- the end\n    | one = print(1)\n  end\n  return 3\nend\nValue {f(1)}.\n"],
  ])("%s leaves the candidate open to its arms", (_, source) => {
    expect(run(source)).toEqual({ errors: [], warnings: expect.any(Array), output: "Value 3.\n" });
    expect(tree(source)).toMatch(/─ LuauAlternatorArms \[/);
  });

  test("a condition that is itself an alternator leaves the outer word its arms", () => {
    const source = 'Value {match match("x") | x = "mage" end | mage = "yes" end}.\n';
    expect(errorsOf(source)).toEqual([]);
    // Each word holds its own arms: both are alternators' words, with no
    // name token and no warning of an unknown `match`.
    expect(semanticTokenOf(source, "match", 1)).toBeUndefined();
    expect(semanticTokenOf(source, "match", 2)).toBeUndefined();
    expect(run(source).warnings.join("\n")).not.toContain("match");
    const owned: string[] = [];
    getParser().parse(source).iterate({
      enter: (ref) => {
        if (ref.name !== "LuauConditionalAlternatorBlock") return;
        const arms = alternatorArms(ref.node);
        owned.push(`${source.slice(ref.from, ref.from + 6)}: ${arms ? source.slice(arms.from, arms.to).trim() : "none"}`);
      },
    });
    expect(owned).toEqual(['match : | mage = "yes" end', 'match(: | x = "mage" end']);
  });

  // An alternator in the condition whose `end` stands against the outer `|`
  // leaves the outer word its arms as the spaced form does.
  test.each([
    ["in display text", 'Value {match match("x") | x = "mage" end| mage = "yes" end}.\n', "match"],
    ["in a narrative statement", '& local v = match match("x") | x = 1 end| mage = 2 end\nDone.\n', "match"],
    ["at the start of a function's line", 'function f()\n  match match("x") | x = print(1) end| mage = print(2) end\n  return 3\nend\nValue {f()}.\n', "match"],
    ["around a sequential word", 'Value {cycle match("x") | x = "a" end| "b" end}.\n', "cycle"],
  ])("written against the outer `|` %s", (_, source, outer) => {
    // A sequential word's head is an error (I-1446).
    expect(errorsOf(source)).toEqual(outer === "cycle" ? [`0:13-0:37 ${HEAD_ERROR}`] : []);
    expect(semanticTokenOf(source, outer, 1)).toBeUndefined();
    expect(semanticTokenOf(source, "match", outer === "match" ? 2 : 1)).toBeUndefined();
    const owners: string[] = [];
    getParser().parse(source).iterate({
      enter: (ref) => {
        if (!/^Luau(?:SparkdownExplicit)?(?:Conditional|Sequential)Alternator(?:Block|LineStart)$/.test(ref.name)) return;
        owners.push(alternatorArms(ref.node) ? "arms" : "none");
      },
    });
    expect(owners).toEqual(["arms", "arms"]);
  });

  // The head takes the outer `|` an alternator in the condition ends
  // against, as it takes the whitespace before it, so the candidate ends
  // after its own arms and a statement later on the line is the function's
  // in both spellings (I-1408, `compactNestedAlternator1408.test.ts`).
  test("a statement after the compact nested form on its line is the function's (I-1408)", () => {
    const compact = 'function f()\n  local v = match match("x") | x = "mage" end| mage = "yes" end local after = 7\n  return after\nend\nValue {f()}.\n';
    expect(run(compact)).toMatchObject({ errors: [], output: "Value 7.\n" });
    expect(run(compact).warnings.join("\n")).not.toContain("after");
    const spaced = compact.replace("end| mage", "end | mage");
    expect(run(spaced)).toEqual(run(compact));
  });

  // A nested condition's own `end` followed by more of the head (a comment,
  // here) leaves the outer word its arms (round 4).
  test("a nested condition followed by a comment before the arms on the next line keeps the function's end", () => {
    const source = 'function f(n)\n  match match("x") | x = "mage" end -- note\n    | mage = print(2)\n  end\n  return 3\nend\nValue {f(1)}.\nAfter.\n';
    expect(run(source)).toMatchObject({ errors: [], output: "Value 3.\nAfter.\n" });
  });

  test("a nested condition followed by a comment before the arms in an interpolation keeps its arms", () => {
    expect(run('Value {cycle match("x") | x = "mage" end --[[ note ]] | "yes" end}.\n')).toEqual({ errors: [HEAD_ERROR], warnings: [], output: "Value yes.\n" });
  });

  test.each(["true", "false", "nil", "-1", "not false", '#"x"'])("a block-form match on `%s` opens its arms", (condition) => {
    const source = `function f()\n  match ${condition}\n    | other = print(1)\n  end\n  return 3\nend\nValue {f()}.\nAfter.\n`;
    expect(run(source)).toMatchObject({ errors: [], output: "Value 3.\nAfter.\n" });
    expect(tree(source)).toMatch(/─ LuauConditionalAlternatorLineStart \[/);
    expect(tree(source)).toMatch(/─ LuauAlternatorArms \[/);
  });

  test.each([["\r\n"], ["\r"]])("a head comment ending in `end` reads the line break %j whole", (eol) => {
    const source = ["function f(n)", "  queue -- end", "    | print(1)", "  end", "  match n -- end", "    | a = print(1)", "  end", "  return 3", "end", "Value {f(1)}.", "After.", ""].join(eol);
    expect(tree(source)).not.toMatch(/ERROR_INCOMPLETE/);
    expect(run(source)).toMatchObject({ errors: [], output: "Value 3.\nAfter.\n" });
  });

  test("a candidate first on its line that no arms follow ends before the next statement", () => {
    const source = "Value {f()}.\nfunction f()\n  local match = function(n) return n end\n  match(1)\n\n  -- a note\n  return 7\nend\n\nAfter.\n";
    expect(run(source)).toEqual({ errors: [], warnings: [], output: "Value 7.\nAfter.\n" });
  });

  test("a candidate at its line's end with no arms is a call", () => {
    const source = `Value {f()}.\nfunction f()\n  ${IDENTITY("cycle")}\n  local s = cycle("a")\n  return s .. "b"\nend\n`;
    expect(run(source)).toEqual({ errors: [], warnings: [], output: "Value ab.\n" });
  });

  test("a candidate whose cast took its line break ends at the next line, which is its own statement", () => {
    const source = `function f(a)\n  ${IDENTITY("queue")}\n  local c = queue("a") :: string | number\n  match a\n    | x = print(1)\n  end\n  return c\nend\n\nValue {f("q")}.\n`;
    expect(run(source)).toMatchObject({ errors: [], output: "Value a.\n" });
    expect(tree(source)).toMatch(/─ LuauConditionalAlternatorLineStart \[/);
  });

  test("a candidate before a closer it does not own leaves it to its block: if c then match(1) end", () => {
    const source = "Value {f()}.\nfunction f()\n  local match = function(n) return n end\n  local c = true\n  if c then match(1) end\n  return 7\nend\n\nAfter.\n";
    expect(run(source)).toEqual({ errors: [], warnings: [], output: "Value 7.\nAfter.\n" });
  });

  test("the word alone on its line with no arms is Luau's incomplete statement", () => {
    const luau = "function f()\n  local queue = 1\n  queue\n  return queue\nend\n";
    expect(errorsOf(luau)).toEqual(officialErrors(luau));
    expect(officialErrors(luau)).not.toEqual([]);
  });
});

describe("the editors highlight the word as the converter reads it", () => {
  test("a word that names a value gets the name's semantic token", () => {
    const source = "function f()\n  local match = function(n) return n end\n  match(1)\nend\n";
    expect(semanticTokenOf(source, "match", 2)).toBe("function");
    expect(semanticTokenOf("Value {match(2)}.\n", "match")).toBe("variable");
  });

  test("an alternator's word keeps the keyword's scope, with no semantic token", () => {
    expect(semanticTokenOf('Value {match(x) | warrior = "w" | mage = "m"}.\n', "match")).toBeUndefined();
    expect(semanticTokenOf("function f()\n  queue\n    | print(1)\n  end\nend\n", "queue")).toBeUndefined();
  });
});

describe("both engines read the candidates alike", () => {
  test.each([
    "function inspect()\n  local match = print\n  match(1)\nend\n\nAfter.\n",
    "function f()\n  match(1)\n\n  -- c\n  return 1\nend\n",
    "function f(n)\n  match n\n    | 1 = print(1)\n    | 2 = print(2)\n  end\n  return 3\nend\n",
    "function f()\n  queue -- note\n\n    | print(1)\n    | print(2)\n  end\nend\n",
    "function f()\n  local x = queue | 1 | 2 end\n  return x\nend\n",
    "function f()\n  local s = queue([====[a]=]|b]====])\n  return s\nend\n",
    "function f()\n  local s = queue(1) :: number | string\n  return s\nend\n",
    "function f()\n  if c then match(1) end\n  return 1\nend\n",
    'Value {match(x) | 1 = "a" | 2 = "b"} {cycle "a" | "b" end} {match(x)}.\n',
    "& local y = queue | 1 | 2 end\n",
    "function f(n)\n  queue -- end\n    | print(1)\n  end\n  match n --[[ c ]] -- the end\n\n    -- end\n    | a = print(1)\n  end\nend\n",
    "function f(a)\n  local c = queue(\"a\") :: string | number\n  match a\n    | x = print(1)\n  end\n  return c\nend\n",
  ])("%j", async (source) => {
    const result = await compareEnginesFull(source);
    expect(result.divergences, formatDivergences(result.source, result.divergences)).toEqual([]);
  });
});
