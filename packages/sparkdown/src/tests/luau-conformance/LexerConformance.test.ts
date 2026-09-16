// Ported from Luau's lexer tests (`luau/tests/Lexer.test.cpp`). Sparkdown has
// no token stream: the TextMate grammar produces a parse tree, and malformed
// tokens surface as diagnostics. Each upstream case is therefore restated as
// the observable that corresponds to its lexeme: a node's name and extent, the
// `=` level of a long bracket, or the diagnostic the broken token produces.
//
// Every snippet is quoted verbatim from upstream, under its upstream case
// name. Snippets are Luau chunks, so they run inside `function run() ... end`
// (see diagnosticTestHarness.ts); an expression snippet is additionally put on
// the right of `local x = `, since a bare string is not a statement.
//
// Upstream reuses two case names (`lexer_determines_string_block_depth_1` and
// `_2` each appear once for a string and once for a comment); the comment
// variants are labelled "(comment)" here.
//
// Cases sparkdown does not match stay as `describe.skip` with the reason.

import { describe, expect, test } from "vitest";
import { parseSource } from "../compiler/grammarSnapshot";
import { diagnoseInFunction } from "./diagnosticTestHarness";

const PREFIX = "function run()\n";

interface FoundNode {
  name: string;
  /** Offsets relative to the start of the snippet. */
  from: number;
  to: number;
  text: string;
}

function wrap(body: string): string {
  return `${PREFIX}${body}\nend\n`;
}

/** Every node called `name` in the parse tree of the wrapped snippet. */
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

function onlyNode(body: string, name: string): FoundNode {
  const found = findNodes(body, name);
  expect(found, `expected exactly one ${name}`).toHaveLength(1);
  return found[0]!;
}

/** The `=` count of a long bracket's opening delimiter. */
function blockDepth(text: string): number {
  const match = /^(?:--)?\[(=*)\[/.exec(text);
  expect(match, `not a long bracket: ${JSON.stringify(text)}`).not.toBeNull();
  return match![1]!.length;
}

const UNFINISHED_STRING = "Malformed string; did you forget to finish it?";
const UNFINISHED_COMMENT =
  "Expected identifier when parsing expression, got unfinished comment";

// ---------------------------------------------------------------------------
// Broken tokens
// ---------------------------------------------------------------------------

describe("broken tokens", () => {
  // Luau: broken_string_works
  // Upstream lexes `[[` as a BrokenString spanning the two brackets.
  test("broken_string_works: `[[`", () => {
    const body = "local x = [[";
    expect(diagnoseInFunction(body)).toContain(UNFINISHED_STRING);
    const string = onlyNode(body, "LuauMultilineString");
    expect(string.from).toBe("local x = ".length);
  });

  // Luau: broken_comment
  // Upstream lexes `--[[  ` as a BrokenComment spanning all six characters.
  test("broken_comment: `--[[  `", () => {
    const body = "--[[  ";
    expect(diagnoseInFunction(body)).toContain(UNFINISHED_COMMENT);
    const comment = onlyNode(body, "LuauBlockComment");
    expect(comment.from).toBe(0);
    expect(comment.text.startsWith("--[[  ")).toBe(true);
  });

  // Luau: broken_comment_kept
  // With comment skipping on, a broken comment is still returned rather than
  // skipped. Sparkdown has no skipping mode; the equivalent is that an
  // unfinished comment is still reported even though a finished one is
  // silent.
  test("broken_comment_kept: `--[[  ` is reported, `--[[  ]]` is not", () => {
    expect(diagnoseInFunction("--[[  ")).toContain(UNFINISHED_COMMENT);
    expect(diagnoseInFunction("--[[  ]]")).toEqual([]);
  });

  // Luau: testBrokenEscapeTolerant
  // Upstream: `'\3729472897292378'` is still one QuotedString spanning the
  // whole input; the out-of-range escape is the parser's concern, not the
  // lexer's. Luau's parser then reports it as a malformed escape.
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

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

describe("comments", () => {
  // Luau: comment_skipped
  // Upstream: with comment skipping on, `--  ` yields only Eof. The
  // equivalent here is a line comment and nothing else in the body.
  test("comment_skipped: `--  `", () => {
    const body = "--  ";
    expect(onlyNode(body, "LuauLineComment").text).toBe("--  ");
    const content = onlyNode(body, "LuauFunctionBody_content");
    expect(content.text).toBe("--  \n");
    expect(diagnoseInFunction(body)).toEqual([]);
  });

  // Luau: multilineCommentWithLexemeInAndAfter
  // Upstream: the comment spans (0,0)-(1,2), so the `function` inside it is
  // not a token, and the `end` after it is ReservedEnd at (1,3)-(1,6).
  // Here the snippet's `end` closes `run`, so the wrapper supplies none.
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

// ---------------------------------------------------------------------------
// Long brackets
// ---------------------------------------------------------------------------

describe("long brackets", () => {
  // Luau: testBigDelimiters
  // Upstream: a level-3 comment spanning (0,0)-(4,5).
  test("testBigDelimiters: `--[===[\\n\\n\\n\\n]===]`", () => {
    const body = "--[===[\n" + "\n" + "\n" + "\n" + "]===]";
    const comment = onlyNode(body, "LuauBlockComment");
    expect(comment.from).toBe(0);
    expect(comment.to).toBe(body.length);
    expect(blockDepth(comment.text)).toBe(3);
    expect(diagnoseInFunction(body)).toEqual([]);
  });

  // Luau: lexer_determines_string_block_depth_*
  // Upstream: each is one RawString with the given block depth. Here: one
  // `LuauMultilineString` covering the whole literal, at that `=` level.
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

  // Upstream: each is one BlockComment with the given block depth. Here: one
  // `LuauBlockComment` covering the whole comment, at that `=` level.
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

    // Upstream covers comment depths only on one line; the multi-line forms
    // are added here so every level is pinned both ways for comments too.
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

  // Not upstream: a closing bracket of a different level does not end the
  // literal, which is what the depth is for.
  test.each([
    ["a level-0 close inside a level-2 string", "local x = [==[ a ]] b ]==]", "LuauMultilineString"],
    ["a level-2 close inside a level-1 string", "local x = [=[ a ]==] b ]=]", "LuauMultilineString"],
    ["a level-0 close inside a level-1 comment", "--[=[ a ]] b ]=]", "LuauBlockComment"],
  ])("%s", (_label, body, name) => {
    const node = onlyNode(body, name);
    expect(node.to).toBe(body.length);
    expect(diagnoseInFunction(body)).toEqual([]);
  });

  // Not upstream: the `locals.luau` line that UpstreamConformance.test.ts
  // skips. A multi-line `[[...]]` holding `%s` as a call argument parses
  // cleanly inside a function body.
  test("a multi-line string argument holding `%s` (locals.luau)", () => {
    const body =
      "for i=2,31 do assert(loadstring(string.format([[a=%s\n]], 1))) end";
    expect(onlyNode(body, "LuauMultilineString").text).toBe("[[a=%s\n]]");
    expect(diagnoseInFunction(body)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Interpolation
// ---------------------------------------------------------------------------

describe("interpolation", () => {
  // Luau: string_interpolation_basic
  // Upstream: InterpStringBegin, QuotedString, InterpStringEnd, with the end
  // lexeme starting at the `}` (column 11).
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
  // Upstream: Begin "`foo {", "bar", Mid "} {" at column 11, "baz", End
  // "} end`" at column 19.
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
  // Upstream: `{`, InterpStringBegin, QuotedString, then BrokenString for the
  // unclosed backtick, and the table's `}` is still read as `}`.
  test("string_interpolation_unmatched_brace", () => {
    const body =
      "local x = " +
      "{\n" +
      '        `hello {"world"}\n' +
      "    } -- this might be incorrectly parsed as a string";
    expect(diagnoseInFunction(body)).toContain(UNFINISHED_STRING);
    expect(onlyNode(body, "LuauBacktickStringInterpolation").text).toBe(
      '{"world"}',
    );
  });

  // Upstream then reads the table's `}` as `}`: the backtick string ends at
  // its line. Sparkdown's backtick string runs to the end of the body instead
  // and swallows the `}`, so only the diagnostic above matches.
  describe.skip("string_interpolation_unmatched_brace, token after the broken string (diverges: an unfinished backtick string runs past its line)", () => {
    test("the table's `}` is not inside the string", () => {
      const body =
        "local x = " +
        "{\n" +
        '        `hello {"world"}\n' +
        "    } -- this might be incorrectly parsed as a string";
      const string = onlyNode(body, "LuauInterpolatedString");
      expect(string.text).not.toContain("}\n");
    });
  });

  // Luau: string_interpolation_with_unicode_escape
  // Upstream: one InterpStringSimple, then Eof; the `{` of `\u{...}` does not
  // open an interpolation.
  test("string_interpolation_with_unicode_escape: `\\u{1F41B}`", () => {
    const body = "local x = `\\u{1F41B}`";
    expect(onlyNode(body, "LuauEscapeUnicode").text).toBe("\\u{1F41B}");
    expect(findNodes(body, "LuauBacktickStringInterpolation")).toEqual([]);
    expect(diagnoseInFunction(body)).toEqual([]);
  });

  // Luau: string_interpolation_double_brace
  // Luau: string_interpolation_double_but_unmatched_brace
  // Upstream lexes `{{` inside a backtick string as BrokenInterpDoubleBrace.
  // Deliberate divergence (#223, DIVERGENCES.md): `{{name}}` is sparkdown's
  // call shorthand, so `{{` opens a call rather than a broken token. The
  // parser-level counterpart is skipped in InterpolatedStringErrors.test.ts.
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

// ---------------------------------------------------------------------------
// Quotes
// ---------------------------------------------------------------------------

// Luau: single_quoted_string / double_quoted_string
// Upstream: both are QuotedString, told apart by quote style. Sparkdown gives
// them separate nodes because `"..."` interpolates and `'...'` does not
// (DIVERGENCES.md, "`"..."` interpolates; `'...'` does not").
describe("quotes", () => {
  test("single_quoted_string: `'test'`", () => {
    const body = "local x = 'test'";
    expect(onlyNode(body, "LuauSingleQuotedString").text).toBe("'test'");
    expect(findNodes(body, "LuauDoubleQuotedString")).toEqual([]);
    expect(findNodes("local x = '{x}'", "LuauStringInterpolation")).toEqual([]);
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

// ---------------------------------------------------------------------------
// Not applicable
// ---------------------------------------------------------------------------

// Luau: lookahead
// Tests `Lexer::lookahead()` over a skipped comment. Sparkdown's grammar has
// no token-stream API to peek with.
describe.skip("lookahead (N/A: no lexer token-stream API)", () => {
  test("foo --[[ comment ]] bar : nil end", () => {});
});
