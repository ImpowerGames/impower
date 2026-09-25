import { describe, expect } from "vitest";
import { BUG } from "./autocompleteBugs";
import { labelsAt, upstreamCase } from "./completionHarness";

// Keyword and statement-start cases from Luau's Autocomplete.test.cpp. Inside
// a function body sparkdown's statement keywords are Luau's, so those cases
// keep their upstream expectations with the snippet moved into a function
// body. At the top level the narrative grammar differs: a line starts prose,
// and the statement keywords it offers are sparkdown's own (`scene`,
// `branch`, `define`, `include`, the Luau blocks), filtered by what has been
// typed.
//
// Upstream writes most of these snippets unclosed, and its expectations
// depend on it: a closing keyword (`end`, `until`) is offered while its block
// is still open and not once the block is closed. `openMain` keeps a snippet
// unclosed to the end of the file; `inMain` closes the function after it.

const indent = (body: string) =>
  body
    .split("\n")
    .map((line) => (line ? `  ${line}` : line))
    .join("\n");

const openMain = (body: string) => `function main()\n${indent(body)}`;
const inMain = (body: string) => `${openMain(body)}\nend\n`;

describe("autocomplete · keywords and statement starts", () => {
  upstreamCase("recommend_statement_starting_keywords", "a statement start offers `local`", () => {
    expect(labelsAt(inMain("@1"))).toContain("local");
  });

  upstreamCase.bug(BUG.keywordPosition, "recommend_statement_starting_keywords", "an expression slot does not offer `local`", () => {
    expect(labelsAt(inMain("local i = @1"))).not.toContain("local");
  });

  upstreamCase("recommend_statement_starting_keywords", "the top level offers sparkdown's statement keywords for what has been typed", () => {
    expect(labelsAt("l@1")).toContain("local");
    expect(labelsAt("s@1")).toContain("scene");
    expect(labelsAt("d@1")).toEqual(expect.arrayContaining(["define", "do"]));
    expect(labelsAt("i@1")).toEqual(expect.arrayContaining(["if", "include"]));
  });

  upstreamCase.bug(BUG.functions, "do_not_overwrite_context_sensitive_kws", "a function named like a keyword is offered as a name", () => {
    // Upstream declares `local function continue()`; `continue` is a keyword
    // only inside a loop, so the name is still a binding.
    const labels = labelsAt(inMain("local function continue()\nend\nc@1"));
    expect(labels).toContain("continue");
  });

  upstreamCase.bug(BUG.keywordPosition, "autocomplete_for_middle_keywords", "a numeric for offers `do` after its bounds and nothing before them", () => {
    const beforeEquals = labelsAt(openMain("for x @1="));
    expect(beforeEquals).not.toContain("do");
    expect(beforeEquals).not.toContain("end");
    expect(labelsAt(openMain("for x = 1, 2 @1"))).toEqual(["do"]);
    expect(labelsAt(openMain("for x = 1, 2, 5 d@1"))).toEqual(["do"]);
  });

  upstreamCase("autocomplete_for_middle_keywords", "an open numeric for's body offers `end`", () => {
    expect(labelsAt(openMain("for x = 1, 2, 5 do      @1"))).toContain("end");
  });

  upstreamCase.bug(BUG.emptySlot, "autocomplete_for_middle_keywords", "a numeric for's bounds offer the names in scope and not `do`", () => {
    const source = "store Foo = 1\n" + openMain("for x = @11, @22, @35");
    for (const at of ["1", "2", "3"]) {
      const labels = labelsAt(source, { at });
      expect(labels).toContain("Foo");
      expect(labels).not.toContain("do");
    }
  });

  upstreamCase.bug(BUG.keywordPosition, "autocomplete_for_in_middle_keywords", "a generic for offers `in` after its names and `do` after its iterator", () => {
    expect(labelsAt(openMain("for @1"))).toEqual([]);
    expect(labelsAt(openMain("for x @1"))).toEqual(["in"]);
    expect(labelsAt(openMain("for x in y @1"))).toEqual(["do"]);
    expect(labelsAt(openMain("for x in f f@1"))).toEqual(["do"]);
  });

  upstreamCase("autocomplete_for_in_middle_keywords", "an open generic for's body offers `end` and `function` and not `in`", () => {
    const labels = labelsAt(openMain("for x in y do  @1"));
    expect(labels).toContain("end");
    expect(labels).toContain("function");
    expect(labels).not.toContain("in");
  });

  upstreamCase.bug(BUG.keywordPrefix, "autocomplete_for_in_middle_keywords", "a word typed in an open generic for's body offers `end`", () => {
    expect(labelsAt(openMain("for x in y do e@1"))).toContain("end");
  });

  upstreamCase.bug(BUG.keywordPosition, "autocomplete_while_middle_keywords", "a while offers `do`, `and` and `or` after its condition", () => {
    expect(labelsAt(openMain("while@1"))).not.toContain("do");
    expect(labelsAt(openMain("while true @1")).sort()).toEqual(["and", "do", "or"]);
    expect(labelsAt(openMain("while true d@1")).sort()).toEqual(["and", "do", "or"]);
  });

  upstreamCase("autocomplete_while_middle_keywords", "an open while's body offers `end`", () => {
    expect(labelsAt(openMain("while true do  @1"))).toContain("end");
  });

  upstreamCase.bug(BUG.keywordPosition, "autocomplete_while_middle_keywords", "a while's condition offers `true` and `false`", () => {
    const labels = labelsAt(openMain("while t@1"));
    expect(labels).toEqual(expect.arrayContaining(["true", "false"]));
    expect(labels).not.toContain("do");
  });

  upstreamCase.bug(BUG.keywordPosition, "autocomplete_if_middle_keywords", "an if offers `then` after its condition and no branch keywords before it", () => {
    const empty = labelsAt(openMain("if   @1"));
    expect(empty).not.toContain("then");
    expect(empty).not.toContain("else");
    expect(empty).not.toContain("elseif");
    expect(empty).not.toContain("end");
    const afterCondition = labelsAt(openMain("if x  @1"));
    expect(afterCondition).toContain("then");
    expect(afterCondition).not.toContain("function");
    expect(afterCondition).not.toContain("else");
    expect(labelsAt(openMain("if x t@1")).sort()).toEqual(["and", "or", "then"]);
  });

  upstreamCase.bug(BUG.keywordPosition, "autocomplete_if_middle_keywords", "a closed if's body offers `else` and `elseif` and neither `then` nor `end`", () => {
    const labels = labelsAt(inMain("if x then\n  @1\nend"));
    expect(labels).not.toContain("then");
    expect(labels).not.toContain("end");
    expect(labels).toContain("else");
    expect(labels).toContain("elseif");
    expect(labels).toContain("function");
  });

  upstreamCase.bug(BUG.keywordPrefix, "autocomplete_if_middle_keywords", "a word typed in an if's body offers `else` and `elseif`", () => {
    // Upstream types `t` and expects every keyword, leaving the filtering to
    // the client; sparkdown filters keywords by the typed word, so it types `e`.
    const labels = labelsAt(inMain("if x then\n  e@1\nend"));
    expect(labels).toContain("else");
    expect(labels).toContain("elseif");
  });

  upstreamCase.bug(BUG.keywordPosition, "autocomplete_if_middle_keywords", "a body followed by `elseif` offers no branch keywords", () => {
    const labels = labelsAt(inMain("if x then\n  @1\nelseif x then\nend"));
    expect(labels).not.toContain("then");
    expect(labels).not.toContain("else");
    expect(labels).not.toContain("elseif");
    expect(labels).not.toContain("end");
    expect(labels).toContain("function");
  });

  upstreamCase.bug(BUG.keywordPosition, "autocomplete_if_middle_keywords", "a typed condition offers `true` and `false` and no branch keywords", () => {
    const labels = labelsAt(openMain("if t@1"));
    expect(labels).toEqual(expect.arrayContaining(["true", "false"]));
    expect(labels).not.toContain("then");
    expect(labels).not.toContain("end");
  });

  upstreamCase("autocomplete_if_middle_keywords", "a narrative if's body offers `else` and `elseif`", () => {
    const labels = labelsAt("if x then\n  e@1\nend\n");
    expect(labels).toContain("else");
    expect(labels).toContain("elseif");
  });

  upstreamCase("autocomplete_until_in_repeat", "an open repeat's body offers `until`", () => {
    expect(labelsAt(openMain("repeat  @1"))).toContain("until");
    expect(labelsAt("repeat\n  u@1")).toContain("until");
  });

  upstreamCase.bug(BUG.emptySlot, "autocomplete_until_in_repeat", "an open repeat's body offers the names in scope", () => {
    expect(labelsAt("store ready = true\n" + openMain("repeat  @1"))).toContain("ready");
  });

  upstreamCase.bug(BUG.emptySlot, "autocomplete_until_expression", "an until's condition offers the names in scope", () => {
    const labels = labelsAt("store ready = true\n" + openMain("repeat\nuntil   @1"));
    expect(labels).toContain("ready");
  });

  upstreamCase.bug(BUG.keywordPosition, "local_names", "a new local's name offers only `function`", () => {
    expect(labelsAt(openMain("local ab@1"))).toEqual(["function"]);
    expect(labelsAt(openMain("local ab, cd@1"))).toEqual([]);
  });

  upstreamCase("autocomplete_end_with_fn_exprs", "an open local function offers `end`", () => {
    expect(labelsAt(openMain("local function f()  @1"))).toContain("end");
  });

  upstreamCase.bug(BUG.keywordPrefix, "autocomplete_end_with_lambda", "a typed `en` in a function expression offers `end`", () => {
    expect(labelsAt(openMain("local a = function() local bar = foo en@1"))).toContain("end");
  });

  upstreamCase("autocomplete_end_of_do_block", "an open do block offers `end`", () => {
    expect(labelsAt(openMain("do @1"))).toContain("end");
    const source = "function f()\n  do\n    @1\n  end\n  @2";
    expect(labelsAt(source, { at: "1" })).toContain("end");
    expect(labelsAt(source, { at: "2" })).toContain("end");
    expect(labelsAt("do\n  e@1")).toContain("end");
  });

  upstreamCase.bug(BUG.keywordPosition, "stop_at_first_stat_when_recommending_keywords", "a for inside a repeat offers `in` and not `until`", () => {
    const labels = labelsAt(openMain("repeat\n  for x @1"));
    expect(labels).toContain("in");
    expect(labels).not.toContain("until");
  });

  upstreamCase("autocomplete_repeat_middle_keyword", "an open repeat's body offers `do`, `function` and `until`", () => {
    const labels = labelsAt(openMain("repeat @1"));
    expect(labels).toEqual(expect.arrayContaining(["do", "function", "until"]));
  });

  upstreamCase.bug(BUG.keywordPrefix, "autocomplete_repeat_middle_keyword", "a word typed in an open repeat's body offers `function` and `until`", () => {
    // Upstream types `f` and expects `until` too, leaving the filtering to the
    // client; sparkdown filters keywords by the typed word.
    expect(labelsAt(openMain("repeat f f@1"))).toContain("function");
    expect(labelsAt(openMain("repeat\n  u@1"))).toContain("until");
  });

  upstreamCase.bug(BUG.keywordPosition, "autocomplete_repeat_middle_keyword", "a repeat already closed by `until` does not offer `until`", () => {
    expect(labelsAt(openMain("repeat\n  u@1\nuntil"))).not.toContain("until");
    expect(labelsAt("repeat\n  u@1\nuntil x\n")).not.toContain("until");
  });

  upstreamCase.bug(BUG.keywordPosition, "local_function", "a local's name offers `function`, and a second name offers nothing", () => {
    expect(labelsAt(openMain("local f@1"))).toEqual(["function"]);
    expect(labelsAt(openMain("local f@1, cd"))).toEqual([]);
  });

  upstreamCase.bug(BUG.keywordPosition, "local_function#2", "a local function's closed header offers `end`", () => {
    expect(labelsAt(openMain("local function f()@1"))).toContain("end");
  });

  upstreamCase("if_then_else_full_keywords", "a keyword being typed at the end of a header completes to itself", () => {
    const source = openMain(
      "local thenceforth = false\nlocal elsewhere = false\nlocal doover = false\nlocal endurance = true\n\nif 1 then@1\nelse@2\nend\n\nwhile false do@3\nend\n\nrepeat@4\nuntil",
    );
    expect(labelsAt(source, { at: "1" })).toEqual(["then"]);
    expect(labelsAt(source, { at: "2" })).toEqual(expect.arrayContaining(["else", "elseif"]));
    expect(labelsAt(source, { at: "3" })).toContain("do");
  });

  upstreamCase.bug(BUG.keywordPrefix, "if_then_else_elseif_completions", "`el` inside an if offers `else` and `elseif` and not a local", () => {
    const labels = labelsAt(
      openMain("local elsewhere = false\n\nif true then\n  return 1\nel@1\nend"),
    );
    expect(labels).toContain("else");
    expect(labels).toContain("elseif");
    expect(labels).not.toContain("elsewhere");
  });

  upstreamCase("if_then_else_elseif_completions", "`el` after an else offers the local and no branch keywords", () => {
    const labels = labelsAt(
      openMain("local elsewhere = false\n\nif true then\n  return 1\nelse\n  return 2\nel@1\nend"),
    );
    expect(labels).not.toContain("else");
    expect(labels).not.toContain("elseif");
    expect(labels).toContain("elsewhere");
  });

  upstreamCase.bug(BUG.keywordPosition, "autocomplete_ifelse_expressions", "an if-expression offers `then`, `else` and `elseif` in turn", () => {
    // Upstream's first cursor sits inside the word (`t@1emp`). Sparkdown
    // completes a word from its end and deliberately offers nothing with text
    // after the cursor, so the cursor moves to the end of `t`.
    const source = openMain(
      [
        "local temp = false",
        "local even = true",
        "local a = true",
        "a = if t@1 then t",
        "a = if temp t@2",
        "a = if temp then e@3",
        "a = if temp then even e@4",
      ].join("\n"),
    );
    const one = labelsAt(source, { at: "1" });
    expect(one).toContain("temp");
    expect(one).toContain("true");
    expect(one).not.toContain("then");
    expect(labelsAt(source, { at: "2" })).toContain("then");
    const three = labelsAt(source, { at: "3" });
    expect(three).toContain("even");
    expect(three).not.toContain("else");
    const four = labelsAt(source, { at: "4" });
    expect(four).toContain("else");
    expect(four).toContain("elseif");
    expect(four).not.toContain("even");
  });

  upstreamCase("autocomplete_if_else_regression", "after an if-expression's `else` no `else` is offered and names are", () => {
    const source = openMain(
      "local abcdef = 0\nlocal temp = false\nlocal even = true\nlocal a\na = if temp then even else@1\na = if temp then even else abc@3",
    );
    expect(labelsAt(source, { at: "1" })).not.toContain("else");
    expect(labelsAt(source, { at: "3" })).toContain("abcdef");
  });

  upstreamCase("autocomplete_include_break_continue_in_loop", "a loop's body and an if inside it offer `break` and `continue`", () => {
    const source = openMain("for x in y do\n  @1\n  if true then\n    @2\n  end\nend");
    for (const at of ["1", "2"]) {
      const labels = labelsAt(source, { at });
      expect(labels).toContain("break");
      expect(labels).toContain("continue");
    }
  });

  upstreamCase("autocomplete_exclude_break_continue_outside_loop", "an if outside any loop does not offer `break` or `continue`", () => {
    const source = openMain("@1if true then\n  @2\nend");
    for (const at of ["1", "2"]) {
      const labels = labelsAt(source, { at });
      expect(labels).not.toContain("break");
      expect(labels).not.toContain("continue");
    }
  });

  upstreamCase.bug(BUG.keywordPosition, "autocomplete_exclude_break_continue_function_boundary", "a function inside a loop does not offer `break` or `continue`", () => {
    const labels = labelsAt(openMain("for i = 1, 10 do\n  local function helper()\n    @1\n  end\nend"));
    expect(labels).not.toContain("break");
    expect(labels).not.toContain("continue");
  });

  upstreamCase.bug(BUG.keywordPosition, "autocomplete_exclude_break_continue_in_param", "a while's condition does not offer `break` or `continue`", () => {
    const labels = labelsAt(openMain("while @1 do\nend"));
    expect(labels).not.toContain("break");
    expect(labels).not.toContain("continue");
  });

  upstreamCase.bug(BUG.keywordPosition, "autocomplete_exclude_break_continue_incomplete_while", "an unfinished while's condition does not offer `break` or `continue`", () => {
    const labels = labelsAt(openMain("while @1"));
    expect(labels).not.toContain("break");
    expect(labels).not.toContain("continue");
  });

  upstreamCase.bug(BUG.keywordPosition, "autocomplete_exclude_break_continue_incomplete_for", "a for's names and iterator do not offer `break` or `continue`", () => {
    const source = openMain("for @1 in @2 do");
    for (const at of ["1", "2"]) {
      const labels = labelsAt(source, { at });
      expect(labels).not.toContain("break");
      expect(labels).not.toContain("continue");
    }
  });

  upstreamCase.bug(BUG.keywordPosition, "autocomplete_exclude_break_continue_expr_func", "a function expression inside a loop does not offer `break` or `continue`", () => {
    const labels = labelsAt(openMain("while true do\n  local _ = function ()\n  @1\n  end\nend"));
    expect(labels).not.toContain("break");
    expect(labels).not.toContain("continue");
  });

  upstreamCase("autocomplete_include_break_continue_in_repeat", "a repeat's body offers `break` and `continue`", () => {
    const labels = labelsAt(openMain("repeat\n  @1\nuntil foo()"));
    expect(labels).toContain("break");
    expect(labels).toContain("continue");
  });

  upstreamCase("autocomplete_include_break_continue_in_nests", "a loop nested in a function in a loop condition offers `break` and `continue`", () => {
    const labels = labelsAt(
      openMain("while ((function ()\n  while true do\n    @1\n  end\n  end)()) do\nend"),
    );
    expect(labels).toContain("break");
    expect(labels).toContain("continue");
  });

  upstreamCase("autocomplete_exclude_break_continue_in_incomplete_loop", "an unclosed loop's body offers `break` and `continue`", () => {
    // Upstream excludes them only because Luau's parser ends the incomplete
    // loop at once, and notes that including them is what it would like.
    // Sparkdown's grammar keeps the unclosed body open, so they are offered.
    const labels = labelsAt(openMain("while foo() do\n  @1"));
    expect(labels).toContain("break");
    expect(labels).toContain("continue");
  });

  upstreamCase.bug(BUG.emptySlot, "autocomplete_after_semicolon_should_complete_a_new_statement", "a semicolon starts a new statement", () => {
    const labels = labelsAt(openMain("local data = { x = 1 }\nlocal var = data;@1"));
    expect(labels).toEqual(expect.arrayContaining(["local", "function", "if"]));
  });
});
