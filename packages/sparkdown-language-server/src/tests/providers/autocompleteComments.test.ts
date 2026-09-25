import { describe, expect } from "vitest";
import { BUG } from "./autocompleteBugs";
import { labelsAt, upstreamCase } from "./completionHarness";

// Comment, string and broken-input cases from Luau's Autocomplete.test.cpp.
// Luau's comments (`--`, `--[[ ]]`) are comments inside Luau code, so those
// cases sit in a function body. At the top level `--` is prose and the
// comment is `//`, so the top-level adaptations use `//`.

describe("autocomplete · comments, strings and broken input", () => {
  upstreamCase("dont_offer_any_suggestions_from_within_a_comment", "a member access inside a block comment in Luau code offers nothing", () => {
    const labels = labelsAt(
      "store foo = {}\nfunction foo:bar() end\n\nfunction main()\n  --[[\n    foo:@1\n  ]]\nend\n",
    );
    expect(labels).toEqual([]);
  });

  upstreamCase.bug(BUG.comments, "dont_offer_any_suggestions_from_within_a_comment", "a space inside a block comment in Luau code offers nothing", () => {
    expect(labelsAt("function main()\n  --[[\n    @1\n  ]]\nend\n")).toEqual([]);
  });

  upstreamCase.bug(BUG.comments, "dont_offer_any_suggestions_from_within_a_broken_comment", "an unclosed block comment in Luau code offers nothing", () => {
    expect(labelsAt("function main()\n  --[[ @1\n")).toEqual([]);
  });

  upstreamCase("dont_offer_any_suggestions_from_within_a_broken_comment_at_the_very_end_of_the_file", "an unclosed block comment at the end of the file offers nothing", () => {
    expect(labelsAt("function main()\n  --[[@1")).toEqual([]);
  });

  upstreamCase("dont_offer_any_suggestions_from_within_a_comment", "a top-level comment offers nothing", () => {
    expect(labelsAt("store foo = {}\n// foo.@1\n")).toEqual([]);
    expect(labelsAt("// @1")).toEqual([]);
  });

  upstreamCase("comments", "a top-level comment at the end of the file offers nothing", () => {
    // Upstream: `--foo` with the cursor at its end.
    expect(labelsAt("//foo@1")).toEqual([]);
  });

  upstreamCase.bug(BUG.comments, "comments", "a line comment in Luau code offers nothing", () => {
    expect(labelsAt("function main()\n  --foo@1\nend\n")).toEqual([]);
    expect(labelsAt("function main()\n  -- @1\nend\n")).toEqual([]);
  });

  upstreamCase("autocomplete_interpolated_string_constant", "the text of an interpolated string offers nothing", () => {
    const at = (body: string) => labelsAt(`function main()\n  f(${body})\nend\n`);
    expect(at("`@1`")).toEqual([]);
    expect(at('`@1 {"a"}`')).toEqual([]);
    expect(at('`{"a"} @1`')).toEqual([]);
    expect(at('`{"a"} @1 {"b"}`')).toEqual([]);
  });

  upstreamCase.bug(BUG.comments, "autocomplete_interpolated_string_constant", "a word in a quoted string offers nothing", () => {
    // Upstream checks backtick strings; a sparkdown double-quoted string also
    // interpolates, and its text offers keywords for a typed word.
    expect(labelsAt('function main()\n  return "g@1"\nend\n')).toEqual([]);
  });

  upstreamCase.bug(BUG.emptySlot, "autocomplete_interpolated_string_expression", "an empty interpolation offers the names in scope", () => {
    expect(labelsAt("store gold = 5\nfunction main()\n  f(`expression = {@1}`)\nend\n")).toContain("gold");
    expect(labelsAt("store gold = 5\nYou have {@1} gold.\n")).toContain("gold");
  });

  upstreamCase("autocomplete_interpolated_string_expression", "a typed interpolation offers the names in scope", () => {
    expect(labelsAt("store gold = 5\nfunction main()\n  f(`expression = {g@1}`)\nend\n")).toContain("gold");
    expect(labelsAt('store gold = 5\nfunction main()\n  return "x{g@1}"\nend\n')).toContain("gold");
    expect(labelsAt("store gold = 5\nYou have {g@1} gold.\n")).toContain("gold");
  });

  upstreamCase.bug(BUG.emptySlot, "autocomplete_interpolated_string_expression_with_comments", "an interpolation holding a comment still offers the names in scope", () => {
    expect(
      labelsAt("store gold = 5\nfunction main()\n  f(`expression = {--[[ bla bla bla ]]@1`)\nend\n"),
    ).toContain("gold");
    expect(
      labelsAt("store gold = 5\nfunction main()\n  f(`expression = {@1 --[[ bla bla bla ]]`)\nend\n"),
    ).toContain("gold");
  });

  upstreamCase("sometimes_the_metatable_is_an_error", "a member request on a broken metatable does not throw", () => {
    const source = [
      "function main()",
      "  local T = {}",
      "  T.__index = T",
      "",
      "  function T.new()",
      "    return setmetatable({x=6}, X) -- oops!",
      "  end",
      "  local t = T.new()",
      "  t.  @1",
      "end",
      "",
    ].join("\n");
    expect(() => labelsAt(source)).not.toThrow();
  });
});
