import { describe, expect, test } from "vitest";
import { parseSource } from "../compiler/grammarSnapshot";
import { diagnoseInFunction } from "./diagnosticTestHarness";

const PREFIX = "function run()\n";

interface FoundNode {
  name: string;
  from: number;
  to: number;
  text: string;
}

function wrap(body: string): string {
  return `${PREFIX}${body}\nend\n`;
}

function findNodes(body: string, name: string): FoundNode[] {
  const source = wrap(body);
  const found: FoundNode[] = [];
  parseSource(source).iterate({
    enter: (node) => {
      if (node.name === name) {
        found.push({
          name,
          from: node.from - PREFIX.length,
          to: node.to - PREFIX.length,
          text: source.slice(node.from, node.to),
        });
      }
    },
  });
  return found;
}

function nodeNames(body: string): string[] {
  const names: string[] = [];
  parseSource(wrap(body)).iterate({
    enter: (node) => {
      names.push(node.name);
    },
  });
  return names;
}

function onlyNode(body: string, name: string): FoundNode {
  const found = findNodes(body, name);
  expect(found, `expected exactly one ${name}`).toHaveLength(1);
  return found[0]!;
}

function blockDepth(text: string): number {
  const match = /^(?:--)?\[(=*)\[/.exec(text);
  expect(match, `not a long bracket: ${JSON.stringify(text)}`).not.toBeNull();
  return match![1]!.length;
}

const UNFINISHED_STRING = "Malformed string; did you forget to finish it?";
const UNFINISHED_INTERPOLATED_STRING = "Malformed interpolated string; did you forget to add a '`'?";
const UNFINISHED_COMMENT =
  "Expected identifier when parsing expression, got unfinished comment";

describe("broken tokens", () => {
  // Luau: broken_string_works
  test("broken_string_works: `[[`", () => {
    const body = "local x = [[";
    expect(diagnoseInFunction(body)).toContain(UNFINISHED_STRING);
    const string = onlyNode(body, "LuauMultilineString");
    expect(string.from).toBe("local x = ".length);
  });

  // Luau: broken_comment
  test("broken_comment: `--[[  `", () => {
    const body = "--[[  ";
    expect(diagnoseInFunction(body)).toContain(UNFINISHED_COMMENT);
    const comment = onlyNode(body, "LuauBlockComment");
    expect(comment.from).toBe(0);
    expect(comment.text.startsWith("--[[  ")).toBe(true);
  });

  // Luau: broken_comment_kept
  test("broken_comment_kept: `--[[  ` is reported, `--[[  ]]` is not", () => {
    expect(diagnoseInFunction("--[[  ")).toContain(UNFINISHED_COMMENT);
    expect(diagnoseInFunction("--[[  ]]")).toEqual([]);
  });

  // Luau: testBrokenEscapeTolerant
  test("testBrokenEscapeTolerant: `'\\3729472897292378'`", () => {
    const literal = "'\\3729472897292378'";
    const body = `local x = ${literal}`;
    const string = onlyNode(body, "LuauSingleQuotedString");
    expect(string.text).toBe(literal);
    expect(diagnoseInFunction(body)).toEqual([
      "String literal contains malformed escape sequence",
    ]);
  });
});

describe("comments", () => {
  // Luau: comment_skipped
  test("comment_skipped: `--  `", () => {
    const body = "--  ";
    expect(onlyNode(body, "LuauLineComment").text).toBe("--  ");
    const content = onlyNode(body, "LuauFunctionBody_content");
    expect(content.text).toBe("--  \n");
    expect(diagnoseInFunction(body)).toEqual([]);
  });

  // Luau: multilineCommentWithLexemeInAndAfter
  test("multilineCommentWithLexemeInAndAfter: `--[[ function \\n]] end`", () => {
    const body = "--[[ function \n" + "]] end";
    const source = `${PREFIX}${body}\n`;
    const comments: string[] = [];
    const ends: number[] = [];
    parseSource(source).iterate({
      enter: (node) => {
        if (node.name === "LuauBlockComment") {
          comments.push(source.slice(node.from, node.to));
        }
        if (node.name === "LuauEndKeyword") {
          ends.push(node.from - PREFIX.length);
        }
        if (node.name === "LuauFunctionKeyword") {
          expect(node.from, "`function` inside the comment is a token").toBe(0);
        }
      },
    });
    expect(comments.map((c) => c.trimEnd())).toEqual(["--[[ function \n]]"]);
    expect(ends).toEqual([body.indexOf("end")]);
    expect(onlyNode(body, "LuauFunctionDefinition_end").to).toBe(body.length);
  });
});

describe("long brackets", () => {
  // Luau: testBigDelimiters
  test("testBigDelimiters: `--[===[\\n\\n\\n\\n]===]`", () => {
    const body = "--[===[\n" + "\n" + "\n" + "\n" + "]===]";
    const comment = onlyNode(body, "LuauBlockComment");
    expect(comment.from).toBe(0);
    expect(comment.to).toBe(body.length);
    expect(blockDepth(comment.text)).toBe(3);
    expect(diagnoseInFunction(body)).toEqual([]);
  });

  // Luau: lexer_determines_string_block_depth_*
  describe("strings", () => {
    test.each([
      ["lexer_determines_string_block_depth_0", "[[ test ]]", 0],
      ["lexer_determines_string_block_depth_0_multiline_1", "[[ test\n    ]]", 0],
      ["lexer_determines_string_block_depth_0_multiline_2", "[[\n    test\n    ]]", 0],
      ["lexer_determines_string_block_depth_0_multiline_3", "[[\n    test ]]", 0],
      ["lexer_determines_string_block_depth_1", "[=[[%s]]=]", 1],
      ["lexer_determines_string_block_depth_2", "[==[ test ]==]", 2],
      ["lexer_determines_string_block_depth_2_multiline_1", "[==[ test\n    ]==]", 2],
      ["lexer_determines_string_block_depth_2_multiline_2", "[==[\n    test\n    ]==]", 2],
      ["lexer_determines_string_block_depth_2_multiline_3", "[==[\n\n    test ]==]", 2],
    ])("%s", (_name, literal, depth) => {
      const body = `local x = ${literal}`;
      const string = onlyNode(body, "LuauMultilineString");
      expect(string.text).toBe(literal);
      expect(blockDepth(string.text)).toBe(depth);
      expect(diagnoseInFunction(body)).toEqual([]);
    });
  });

  describe("comments", () => {
    test.each([
      ["lexer_determines_comment_block_depth_0", "--[[ test ]]", 0],
      ["lexer_determines_string_block_depth_1 (comment)", "--[=[ μέλλον ]=]", 1],
      ["lexer_determines_string_block_depth_2 (comment)", "--[==[ test ]==]", 2],
    ])("%s", (_name, body, depth) => {
      const comment = onlyNode(body, "LuauBlockComment");
      expect(comment.from).toBe(0);
      expect(comment.to).toBe(body.length);
      expect(blockDepth(comment.text)).toBe(depth);
      expect(diagnoseInFunction(body)).toEqual([]);
    });

    test.each([
      ["depth 0 across lines", "--[[ test\n    ]]", 0],
      ["depth 1 across lines", "--[=[\n    test ]=]", 1],
      ["depth 2 across lines", "--[==[\n\n    test ]==]", 2],
    ])("%s", (_name, body, depth) => {
      const comment = onlyNode(body, "LuauBlockComment");
      expect(comment.from).toBe(0);
      expect(comment.to).toBe(body.length);
      expect(blockDepth(comment.text)).toBe(depth);
      expect(diagnoseInFunction(body)).toEqual([]);
    });
  });

  test.each([
    ["a level-0 close inside a level-2 string", "local x = [==[ a ]] b ]==]", "LuauMultilineString"],
    ["a level-2 close inside a level-1 string", "local x = [=[ a ]==] b ]=]", "LuauMultilineString"],
    ["a level-0 close inside a level-1 comment", "--[=[ a ]] b ]=]", "LuauBlockComment"],
  ])("%s", (_label, body, name) => {
    const node = onlyNode(body, name);
    expect(node.to).toBe(body.length);
    expect(diagnoseInFunction(body)).toEqual([]);
  });

  test("a multi-line string argument holding `%s` (locals.luau)", () => {
    const body =
      "for i=2,31 do assert(loadstring(string.format([[a=%s\n]], 1))) end";
    expect(onlyNode(body, "LuauMultilineString").text).toBe("[[a=%s\n]]");
    expect(diagnoseInFunction(body)).toEqual([]);
  });
});

describe("interpolation", () => {
  // Luau: string_interpolation_basic
  test('string_interpolation_basic: `foo {"bar"}`', () => {
    const literal = '`foo {"bar"}`';
    const body = `local x = ${literal}`;
    const base = "local x = ".length;
    const interp = onlyNode(body, "LuauBacktickStringInterpolation");
    expect(interp.text).toBe('{"bar"}');
    expect(interp.to - 1 - base).toBe(11);
    expect(onlyNode(body, "LuauDoubleQuotedString").text).toBe('"bar"');
    expect(onlyNode(body, "LuauInterpolatedString").text).toBe(literal);
    expect(diagnoseInFunction(body)).toEqual([]);
  });

  // Luau: string_interpolation_full
  test('string_interpolation_full: `foo {"bar"} {"baz"} end`', () => {
    const literal = '`foo {"bar"} {"baz"} end`';
    const body = `local x = ${literal}`;
    const base = "local x = ".length;
    const interps = findNodes(body, "LuauBacktickStringInterpolation");
    expect(interps.map((n) => n.text)).toEqual(['{"bar"}', '{"baz"}']);
    expect(interps.map((n) => n.to - 1 - base)).toEqual([11, 19]);
    expect(
      findNodes(body, "LuauDoubleQuotedString").map((n) => n.text),
    ).toEqual(['"bar"', '"baz"']);
    expect(onlyNode(body, "LuauInterpolatedString").text).toBe(literal);
    expect(diagnoseInFunction(body)).toEqual([]);
  });

  // Luau: string_interpolation_unmatched_brace
  test("string_interpolation_unmatched_brace", () => {
    const body =
      "local x = " +
      "{\n" +
      '        `hello {"world"}\n' +
      "    } -- this might be incorrectly parsed as a string";
    expect(diagnoseInFunction(body)).toEqual([UNFINISHED_INTERPOLATED_STRING]);
    expect(onlyNode(body, "LuauBacktickStringInterpolation").text).toBe(
      '{"world"}',
    );
    expect(onlyNode(body, "LuauInterpolatedString").text).toBe('`hello {"world"}');
  });

  // Luau: string_interpolation_with_unicode_escape
  test("string_interpolation_with_unicode_escape: `\\u{1F41B}`", () => {
    const body = "local x = `\\u{1F41B}`";
    expect(onlyNode(body, "LuauEscapeUnicode").text).toBe("\\u{1F41B}");
    expect(findNodes(body, "LuauBacktickStringInterpolation")).toEqual([]);
    expect(diagnoseInFunction(body)).toEqual([]);
  });

  // Luau: string_interpolation_double_brace
  // Luau: string_interpolation_double_but_unmatched_brace
  describe.skip("double braces (diverges: `{{fn}}` is the call shorthand)", () => {
    test.each([
      ["string_interpolation_double_brace", "local x = `foo{{bad}}bar`"],
      ["string_interpolation_double_but_unmatched_brace", "local x = `{{oops}`, 1"],
    ])("%s", (_name, body) => {
      expect(
        diagnoseInFunction(body).some((m) => m.includes("Double braces")),
      ).toBe(true);
    });
  });
});

// Luau: single_quoted_string / double_quoted_string
describe("quotes", () => {
  test("single_quoted_string: `'test'`", () => {
    const body = "local x = 'test'";
    expect(onlyNode(body, "LuauSingleQuotedString").text).toBe("'test'");
    expect(findNodes(body, "LuauDoubleQuotedString")).toEqual([]);
    const braces = "local x = '{x}'";
    expect(onlyNode(braces, "LuauSingleQuotedString").text).toBe("'{x}'");
    expect(nodeNames(braces).filter((n) => n.includes("Interpolation"))).toEqual(
      [],
    );
  });

  test('double_quoted_string: `"test"`', () => {
    const body = 'local x = "test"';
    expect(onlyNode(body, "LuauDoubleQuotedString").text).toBe('"test"');
    expect(findNodes(body, "LuauSingleQuotedString")).toEqual([]);
    expect(
      findNodes('local y = 1\nlocal x = "{y}"', "LuauDoubleQuotedStringInterpolation"),
    ).toHaveLength(1);
  });
});

// Luau: lookahead
describe.skip("lookahead (N/A: no lexer token-stream API)", () => {
  test("foo --[[ comment ]] bar : nil end", () => {});
});
