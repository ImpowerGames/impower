// Valid Luau forms that the grammar did not read (#1924, a slice of #1904).
// Since #1905 a pure-Luau body tiles with `LuauUnreadToken`, so a token no
// rule read there is an unread leaf (`LuauUnreadName`, `LuauUnreadCharacter`)
// with no scope of its own, or a statement rule closed unfinished at it.
// Outside a pure-Luau body, or where the tree read the form as something
// else, the form also compiled or ran wrongly (a header's name, a loop's
// condition, an attributed function at the top level, a marked operator
// line). Each form here is read by the grammar's own rules: no unread leaf
// and no unfinished node, each token carries the scope it carries in the
// forms the grammar already read (`@deprecated`, `T...`, `number | string`,
// ...), and the script compiles and runs. Each form is a grammar fixture in
// `__snapshots__/grammar/luau-forms/`.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import type { SyntaxNode } from "@lezer/common";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { DiagnosticSeverity } from "../../compiler/types/SparkDiagnostic";
import { checkLuau, describeDiagnostic } from "../luau-conformance/typecheckTestHarness";
import { makeRuntimeStoryFromSource } from "../runtime/runtimeTestHarness";
import { parseSource } from "./grammarSnapshot";
import { tokenize } from "./vscodeGrammarSnapshot";

const URI = "inmemory:///main.sd";
const FORMS_DIR = join(dirname(fileURLToPath(import.meta.url)), "__snapshots__/grammar/luau-forms");

const OPEN = "punctuation.definition.template-expression.begin.sd";
const CLOSE = "punctuation.definition.template-expression.end.sd";
const TYPE = "entity.name.type.luau";
const PRIMITIVE = "support.type.primitive.luau";
const TYPE_OPERATOR = "keyword.operator.type.luau";
const VARARGS = "variable.parameter.function.varargs.luau";
const ATTRIBUTE_OPERATOR = "keyword.operator.attribute.luau";
const ATTRIBUTE = "storage.type.attribute.luau";
const COMMA = "keyword.operator.comma.luau";
const FUNCTION = "keyword.control.luau";
const FUNCTION_NAME = "entity.name.function.luau";
const PARAMETER = "variable.parameter.function.luau";
const VARIABLE = "variable.other.readwrite.luau";
const DEFINE_NAME = "entity.name.type.define.luau";
const WITH = "keyword.control.as.luau";
const MARK = "keyword.other.statement.explicit.luau.mark.sd";

interface Form {
  /** The grammar fixture that holds the form, in `luau-forms`. */
  fixture: string;
  /**
   * Tokens in the order they are written, each with the innermost scope
   * vscode-textmate gives it. A token is the whole text one scope covers
   * (`T...`), and each is looked for after the one before it.
   */
  scopes: [text: string, scope: string][];
  /**
   * Text written once in the source, with a rule whose node holds its last
   * character in the tree.
   */
  within?: [text: string, rule: string][];
  /** What the story shows, when the form's value reaches it. */
  output?: string;
  /**
   * The same script written in a form the grammar already read, whose
   * compile errors the form's must equal, where the script has some of its
   * own; otherwise the form compiles with no error.
   */
  control?: string;
}

const FORMS: Record<string, Form> = {
  "#921 an attribute list before a function": {
    fixture: "attribute-list-921",
    scopes: [
      ["@", ATTRIBUTE_OPERATOR],
      ["[", OPEN],
      ["deprecated", ATTRIBUTE],
      ["]", CLOSE],
      ["function", FUNCTION],
      ["f", FUNCTION_NAME],
      ["@", ATTRIBUTE_OPERATOR],
      ["[", OPEN],
      ["deprecated", ATTRIBUTE],
      ["{", OPEN],
      ["reason", VARIABLE],
      ["}", CLOSE],
      ["]", CLOSE],
      ["h", FUNCTION_NAME],
      ["@", ATTRIBUTE_OPERATOR],
      ["[", OPEN],
      ["native", ATTRIBUTE],
      [",", COMMA],
      ["deprecated", ATTRIBUTE],
      ["]", CLOSE],
      ["function", FUNCTION],
      ["k", FUNCTION_NAME],
    ],
    output: "Value 1.\n",
  },
  "#1329 an attribute list before a function value": {
    fixture: "attribute-list-value-1329",
    scopes: [
      ["@", ATTRIBUTE_OPERATOR],
      ["[", OPEN],
      ["native", ATTRIBUTE],
      ["]", CLOSE],
      ["function", FUNCTION],
      ["return", FUNCTION],
    ],
    output: "Value 7.\n",
  },
  "#1329 an attribute before a function at the top level": {
    fixture: "attribute-top-level-1329",
    scopes: [
      ["@", ATTRIBUTE_OPERATOR],
      ["native", ATTRIBUTE],
      ["function", FUNCTION],
      ["f", FUNCTION_NAME],
      // indented
      ["@", ATTRIBUTE_OPERATOR],
      ["native", ATTRIBUTE],
      ["function", FUNCTION],
      ["k", FUNCTION_NAME],
      // with a block comment before the function
      ["@", ATTRIBUTE_OPERATOR],
      ["native", ATTRIBUTE],
      ["function", FUNCTION],
      ["m", FUNCTION_NAME],
      // with a block comment between two attributes
      ["@", ATTRIBUTE_OPERATOR],
      ["native", ATTRIBUTE],
      ["@", ATTRIBUTE_OPERATOR],
      ["checked", ATTRIBUTE],
      ["function", FUNCTION],
      ["n", FUNCTION_NAME],
      // with a long string in a list's argument
      ["@", ATTRIBUTE_OPERATOR],
      ["deprecated", ATTRIBUTE],
      ["function", FUNCTION],
      ["q", FUNCTION_NAME],
      // with no space after a list
      ["@", ATTRIBUTE_OPERATOR],
      ["native", ATTRIBUTE],
      ["function", FUNCTION],
      ["r", FUNCTION_NAME],
    ],
    output: "Value 7 1 2 3 4 5.\n",
  },
  "#1329 attributes that end their line before the function value they mark": {
    fixture: "attribute-line-break-1329",
    scopes: [
      ["@", ATTRIBUTE_OPERATOR],
      ["native", ATTRIBUTE],
      ["function", FUNCTION],
      ["@", ATTRIBUTE_OPERATOR],
      ["native", ATTRIBUTE],
      ["@", ATTRIBUTE_OPERATOR],
      ["checked", ATTRIBUTE],
      ["function", FUNCTION],
      // a block comment between them on the line
      ["@", ATTRIBUTE_OPERATOR],
      ["native", ATTRIBUTE],
      ["function", FUNCTION],
      // a list that spans lines
      ["@", ATTRIBUTE_OPERATOR],
      ["native", ATTRIBUTE],
      ["function", FUNCTION],
      // with a `]` in an argument's string on its first line
      ["@", ATTRIBUTE_OPERATOR],
      ["deprecated", ATTRIBUTE],
      ["native", ATTRIBUTE],
      ["function", FUNCTION],
      // with a long string in an argument
      ["@", ATTRIBUTE_OPERATOR],
      ["deprecated", ATTRIBUTE],
      ["function", FUNCTION],
      ["@", ATTRIBUTE_OPERATOR],
      ["native", ATTRIBUTE],
      ["function", FUNCTION],
      ["@", ATTRIBUTE_OPERATOR],
      ["native", ATTRIBUTE],
      ["@", ATTRIBUTE_OPERATOR],
      ["checked", ATTRIBUTE],
      ["function", FUNCTION],
    ],
    within: [
      // an unindented function line
      ["@[native]\nfunction", "LuauSparkdownVariableDefinition"],
      // past a line comment that ends with the word `end`
      ["@checked\n  function", "LuauSparkdownVariableDefinition"],
      ["@[native] --[[c]] function", "LuauSparkdownVariableDefinition"],
      ["  native\n]\nfunction", "LuauSparkdownVariableDefinition"],
      ['"]" },\n  native\n]\nfunction', "LuauSparkdownVariableDefinition"],
      ["[=[x]]=] }]\nfunction", "LuauSparkdownVariableDefinition"],
      ["@native\n    function", "LuauVariableDefinition"],
      ["@checked function", "LuauVariableDefinition"],
    ],
    output: "Value 9 3 4 5 6 10 15.\n",
  },
  "#921 attributes on their own line before a function statement, and a block comment after an attribute": {
    fixture: "attribute-statement-lines-921",
    scopes: [
      ["@", ATTRIBUTE_OPERATOR],
      ["[", OPEN],
      ["deprecated", ATTRIBUTE],
      ["]", CLOSE],
      ["function", FUNCTION],
      ["hello", FUNCTION_NAME],
      ["@", ATTRIBUTE_OPERATOR],
      ["native", ATTRIBUTE],
      ["function", FUNCTION],
    ],
    output: "Value 10.\n",
  },
  "#1329 an attribute before a stored function": {
    fixture: "attribute-store-1329",
    scopes: [
      ["@", ATTRIBUTE_OPERATOR],
      ["native", ATTRIBUTE],
      ["function", FUNCTION],
      ["return", FUNCTION],
    ],
    output: "Value 7.\n",
  },
  "#876 a variadic type written ...T, and a type pack inside << >>": {
    fixture: "variadic-type-pack-876",
    scopes: [
      ["...", VARARGS],
      ["number", PRIMITIVE],
      ["return", FUNCTION],
      ["(", OPEN],
      ["...", VARARGS],
      ["number", PRIMITIVE],
      [")", CLOSE],
      ["return", FUNCTION],
      ["->", TYPE_OPERATOR],
      ["...", VARARGS],
      ["number", PRIMITIVE],
      ["T...", VARARGS],
      ["<<", OPEN],
      ["number...", VARARGS],
      [">>", CLOSE],
      // in a narrative `&` line
      ["->", TYPE_OPERATOR],
      ["...", VARARGS],
      ["number", PRIMITIVE],
    ],
  },
  "#1370 a generic alias as an array element": {
    fixture: "generic-array-element-1370",
    scopes: [
      ["x", VARIABLE],
      ["{", OPEN],
      ["Box", TYPE],
      ["<", OPEN],
      ["number", PRIMITIVE],
      [">", CLOSE],
      ["}", CLOSE],
    ],
  },
  "#1376 union and intersection arguments inside << >>": {
    fixture: "instantiation-operators-1376",
    scopes: [
      ["f", FUNCTION_NAME],
      ["<<", OPEN],
      ["number", PRIMITIVE],
      ["|", TYPE_OPERATOR],
      ["string", PRIMITIVE],
      [">>", CLOSE],
      ["<<", OPEN],
      ["number", PRIMITIVE],
      ["&", TYPE_OPERATOR],
      ["string", PRIMITIVE],
      [">>", CLOSE],
      // after a method's name too
      ["<<", OPEN],
      ["number", PRIMITIVE],
      ["|", TYPE_OPERATOR],
      ["string", PRIMITIVE],
      [">>", CLOSE],
    ],
  },
  "#1375 a generic function type returned by a function type": {
    fixture: "generic-function-return-1375",
    scopes: [
      ["F", TYPE],
      ["<", OPEN],
      ["a", TYPE],
      [">", CLOSE],
      ["->", TYPE_OPERATOR],
      ["<", OPEN],
      ["b", TYPE],
      [">", CLOSE],
      ["(", OPEN],
      ["a", TYPE],
      [",", COMMA],
      ["b", TYPE],
      [")", CLOSE],
      ["->", TYPE_OPERATOR],
      ["a", TYPE],
    ],
  },
  "#1378 a space before a function's generic list": {
    fixture: "spaced-generics-1378",
    scopes: [
      ["f", FUNCTION_NAME],
      ["<", OPEN],
      ["A", TYPE],
      [">", CLOSE],
      ["op", PARAMETER],
      [":", TYPE_OPERATOR],
      ["A", TYPE],
      ["->", TYPE_OPERATOR],
      ["A", TYPE],
    ],
  },
  "#1382 a line break inside typeof(...)": {
    fixture: "typeof-line-break-1382",
    scopes: [
      ["typeof", "support.function.luau"],
      ["(", OPEN],
      ["1", "constant.numeric.decimal.luau"],
      [")", CLOSE],
      ["typeof", "support.function.luau"],
      ["(", OPEN],
      ["1", "constant.numeric.decimal.luau"],
      [")", CLOSE],
    ],
  },
  "#1343 a block comment between a block keyword and its name": {
    fixture: "header-comment-blocks-1343",
    scopes: [
      ["banner", DEFINE_NAME],
      ["with", WITH],
      ["color", "variable.other.property.define.sd"],
      ["red", "string.unquoted.identifier.sd"],
      ["hud", DEFINE_NAME],
      ["with", WITH],
      ["text", "keyword.other.component.builtin.name.sd"],
      ["card", DEFINE_NAME],
      ["with", WITH],
    ],
  },
  "#1343 a levelled block comment holding brackets between a keyword and its name": {
    fixture: "header-comment-levels-1343",
    scopes: [
      ["banner", DEFINE_NAME],
      ["with", WITH],
      ["red", "string.unquoted.identifier.sd"],
      ["other", DEFINE_NAME],
      ["with", WITH],
      ["blue", "string.unquoted.identifier.sd"],
      // a comment whose text ends with a `]` right before its close
      ["third", DEFINE_NAME],
      ["green", "string.unquoted.identifier.sd"],
      // a comment of level four
      ["fourth", DEFINE_NAME],
      ["green", "string.unquoted.identifier.sd"],
      ["h", FUNCTION_NAME],
      ["x", PARAMETER],
    ],
  },
  "#1343 a block comment between the other header keywords and their names": {
    fixture: "header-comment-other-blocks-1343",
    control:
      'define Person with\n  name = "a"\nend\n' +
      "animation fade with\n  keyframes {\n    from { opacity = 0 }\n  }\nend\n" +
      "theme t with\n  colors { primary = red }\nend\n" +
      "morph m with\n  method = bend\n  keyframes {\n    { offset = 0; eyes { state = eyes.open } }\n    { offset = 0.4; eyes { state = eyes.closed } }\n  }\nend\n" +
      "screen hud with\nend\n" +
      "external message(x)\nHi.\n",
    scopes: [
      ["Person", DEFINE_NAME],
      ["with", WITH],
      ["fade", DEFINE_NAME],
      ["with", WITH],
      ["t", DEFINE_NAME],
      ["with", WITH],
      ["m", DEFINE_NAME],
      ["with", WITH],
      ["method", "variable.other.property.define.sd"],
      ["hud", DEFINE_NAME],
      ["with", WITH],
      ["message", FUNCTION_NAME],
      ["x", PARAMETER],
    ],
  },
  "#1343 a block comment between function and its name": {
    fixture: "header-comment-functions-1343",
    scopes: [
      ["f", FUNCTION_NAME],
      ["x", PARAMETER],
      ["g", FUNCTION_NAME],
      ["y", PARAMETER],
      ["Keys", TYPE],
      ["T", TYPE],
      ["t", PARAMETER],
      // after an attribute
      ["h", FUNCTION_NAME],
      ["z", PARAMETER],
      // after an attribute and a block comment
      ["p", FUNCTION_NAME],
      ["w", PARAMETER],
    ],
  },
  "#1344 a loop condition on the line after for or while": {
    fixture: "loop-condition-next-line-1344",
    scopes: [
      ["for", "keyword.control.for.luau"],
      ["i", VARIABLE],
      ["do", "keyword.control.do.luau"],
      ["while", "keyword.control.while.luau"],
      ["x", VARIABLE],
      ["do", "keyword.control.do.luau"],
    ],
    within: [
      ["for\n  i", "LuauForCondition"],
      ["3\ndo", "LuauSparkdownForLoop"],
      ["while\n  x", "LuauWhileCondition"],
      ["  x\ndo", "LuauSparkdownWhileLoop"],
    ],
  },
  "#1344 a loop condition on the line after for or while, in a function": {
    fixture: "loop-condition-next-line-in-function-1344",
    scopes: [
      ["i", VARIABLE],
      ["do", "keyword.control.do.luau"],
      ["x", VARIABLE],
      ["do", "keyword.control.do.luau"],
    ],
    within: [
      ["for\n    i", "LuauForCondition"],
      ["3\n  do", "LuauForLoop"],
      ["while\n    x", "LuauWhileCondition"],
      ["    x\n  do", "LuauWhileLoop"],
    ],
  },
  "#1647 a block comment before a multi-line if expression": {
    fixture: "if-expression-after-comment-1647",
    scopes: [
      ["if", "keyword.control.if.luau"],
      ["then", "keyword.control.then.luau"],
      ["else", "keyword.control.else.luau"],
      ["if", "keyword.control.if.luau"],
      ["then", "keyword.control.then.luau"],
      ["else", "keyword.control.else.luau"],
      [")", CLOSE],
      ["if", "keyword.control.if.luau"],
      ["then", "keyword.control.then.luau"],
      ["else", "keyword.control.else.luau"],
      // after two comments
      ["if", "keyword.control.if.luau"],
      ["then", "keyword.control.then.luau"],
      ["else", "keyword.control.else.luau"],
    ],
  },
  "#1248 two calls on one line": {
    fixture: "calls-on-one-line-1248",
    scopes: [
      ["print", "support.function.luau"],
      ["print", "support.function.luau"],
      ["greet", FUNCTION_NAME],
      ["greet", FUNCTION_NAME],
    ],
  },
  "#1369 a marked leading operator after return": {
    fixture: "marked-continuation-1369",
    scopes: [
      ["return", FUNCTION],
      ["&", MARK],
      ["+", "keyword.operator.arithmetic.luau"],
      ["return", FUNCTION],
      ["&", MARK],
      ["-", "keyword.operator.arithmetic.luau"],
    ],
    within: [
      ["& + 2", "LuauLineContinuation"],
      ["& - 2", "LuauMinusLineContinuation"],
    ],
    output: "Value 3 -1.\n",
  },
};

function compile(text: string) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
  } as never);
  const program = compiler.compile({ textDocument: { uri: URI } } as never).program as any;
  return (program.diagnostics?.[URI] ?? [])
    .filter((d: any) => d.severity === DiagnosticSeverity.Error)
    .map((d: any) => (typeof d.message === "string" ? d.message : d.message.value));
}

/** The unread leaves and unfinished nodes of a tree, with the text at each. */
function unreadOrUnfinished(source: string): string[] {
  const found: string[] = [];
  const cursor = parseSource(source).topNode.cursor();
  do {
    if (cursor.type.isError || cursor.name === "LuauUnreadName" || cursor.name === "LuauUnreadCharacter") {
      found.push(`${cursor.name} at ${cursor.from}: ${JSON.stringify(source.slice(cursor.from, cursor.from + 12))}`);
    }
  } while (cursor.next());
  return found;
}

/** Each expected token's text with the innermost scope vscode-textmate gives the token found for it. */
async function scopesOf(source: string, expected: [string, string][]): Promise<[string, string][]> {
  const tokens = (await tokenize(source)).flatMap((line) => line.tokens);
  const found: [string, string][] = [];
  let at = 0;
  for (const [text] of expected) {
    const index = tokens.findIndex((token, i) => i >= at && token.text === text);
    if (index < 0) {
      found.push([text, "(no such token)"]);
      continue;
    }
    found.push([text, tokens[index]!.scopes.at(-1)!]);
    at = index + 1;
  }
  return found;
}

/** Each text with its rule, when a node of that rule holds the text's last character. */
function holders(source: string, expected: [string, string][]): [string, string][] {
  const tree = parseSource(source);
  return expected.map(([text, rule]) => {
    const offset = source.indexOf(text) + text.length - 1;
    for (let node: SyntaxNode | null = tree.resolveInner(offset, 1); node; node = node.parent) {
      if (node.name === rule) return [text, rule];
    }
    return [text, `(not in ${rule})`];
  });
}

// Both engines' agreement on each fixture is `scopeEquality.test.ts`'s, and
// its tree and tokens are the grammar snapshots'.
describe("valid Luau forms the grammar reads with their usual scopes (#1924)", () => {
  for (const [name, form] of Object.entries(FORMS)) {
    const source = readFileSync(join(FORMS_DIR, `${form.fixture}.sd`), "utf8");
    describe(name, () => {
      test("leaves no unread or unfinished node", () => {
        expect(unreadOrUnfinished(source)).toEqual([]);
      });
      test("gives each token its usual scope", async () => {
        expect(await scopesOf(source, form.scopes)).toEqual(form.scopes);
      });
      if (form.within) {
        test("holds each token in its construct", () => {
          expect(holders(source, form.within!)).toEqual(form.within);
        });
      }
      test(form.control ? "compiles as its control does" : "compiles with no error", () => {
        expect(compile(source)).toEqual(form.control ? compile(form.control) : []);
      });
      if (form.output !== undefined) {
        test("shows its value", () => {
          const ctx = makeRuntimeStoryFromSource(source);
          expect(ctx.errorMessages).toEqual([]);
          expect(ctx.story.ContinueMaximally()).toBe(form.output);
        });
      }
    });
  }
});

// The attributes before a top-level function are read with the function, as
// Luau reads them, so an invalid list reports Luau's error for it.
test("an invalid attribute list before a top-level function reports Luau's error (#1924)", () => {
  expect(compile("@[native; deprecated] function first()\n  return 7\nend\nValue: {first()}.\n")).toContain(
    "Expected ']' (to close '[' at column 2), got ';'",
  );
});

// A header keyword written inside a comment in a block's body is no header,
// so the word after the comment declares nothing.
test("a header keyword inside a body line's comment declares no name (#1924)", () => {
  const source = "style banner with\n  --[[style --[[note]] accidental\nend\nHello.\n";
  const names: string[] = [];
  parseSource(source).iterate({
    enter: (node) => {
      if (node.name === "LuauDefineName") names.push(source.slice(node.from, node.to));
    },
  });
  expect(names).toEqual(["banner"]);
});

// Forms that already ran correctly, whose tree still held an unfinished node
// where the form goes on, which the checker reports as a syntax error.
// #922's `then` and `end` glued to a `)` are left to #1906, which changes
// how the grammar reads closers.
describe("tree-shape residues read to their end (#1924)", () => {
  test.each([
    ["#1373 a statement after a repeat-until call condition", "local x = 1\nlocal function p() return true end\nrepeat until p() x = x\n"],
    ["#924 an if expression returned before its block's end", "local function foo(a) return if a then 2 else 3 end\n"],
    ["#924 an if expression before an until", "local x = 1\nrepeat x = if x then 2 else 3 until x\n"],
  ])("%s", (_name, source) => {
    expect(checkLuau(source).syntaxDiagnostics.map(describeDiagnostic)).toEqual([]);
  });
});
