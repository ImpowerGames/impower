import { describe, expect } from "vitest";
import { BUG } from "./autocompleteBugs";
import { complete, labelsAt, upstreamCase } from "./completionHarness";

// Scope and visibility cases from Luau's Autocomplete.test.cpp. Sparkdown runs
// Luau statements inside function bodies; its top level is narrative, where a
// bare word is prose. So an upstream snippet whose statements sit at the top
// of a Luau module is adapted by moving them into `function main() … end`, and
// an upstream top-level `local` that the rest of the snippet reads as a global
// becomes a `store` declaration. `local` stays block-scoped in sparkdown.

/**
 * `text` with a cursor at each position from the start of `from` up to the
 * start of `to` after it, both ends included: the sparkdown form of
 * upstream's loops over a range of columns.
 */
const cursorsWithin = (text: string, from: string, to: string) => {
  const start = text.indexOf(from);
  const end = text.indexOf(to, start);
  return Array.from(
    { length: end - start + 1 },
    (_, i) => `${text.slice(0, start + i)}@1${text.slice(start + i)}`,
  );
};

/** The sources, among `sources`, whose cursor is offered anything. */
const offering = (sources: string[]) =>
  sources.filter((source) => labelsAt(source).length > 0);

describe("autocomplete · scope and visibility", () => {
  upstreamCase("empty_program", "an empty function body offers statement keywords", () => {
    // Upstream: ` @1` in an empty module offers the globals and statement keywords.
    const labels = labelsAt("function main()\n  @1\nend\n");
    expect(labels).toEqual(expect.arrayContaining(["local", "if", "for", "while", "return"]));
  });

  upstreamCase.bug(BUG.globals, "empty_program", "an empty function body offers the standard library", () => {
    const labels = labelsAt("function main()\n  @1\nend\n");
    expect(labels).toEqual(expect.arrayContaining(["table", "math", "string"]));
  });

  upstreamCase.bug(BUG.emptySlot, "local_initializer", "the value of a new local offers the globals in scope", () => {
    // Upstream: `local a = @1` offers `table` and `math`.
    const labels = labelsAt("store gold = 5\nfunction main()\n  local a = @1\nend\n");
    expect(labels).toContain("gold");
  });

  upstreamCase("leave_numbers_alone", "a decimal point in a number offers nothing", () => {
    // Member completion after a dot offers nothing anywhere while #867 is
    // open, so this starts guarding numbers once that is fixed.
    expect(labelsAt("store a = 3.@11\n")).toEqual([]);
    expect(labelsAt("function main()\n  local a = 3.@11\nend\n")).toEqual([]);
  });

  upstreamCase("user_defined_globals", "a stored global is offered for a typed word in a function body", () => {
    // Upstream: `local myLocal = 4; @1` offers `myLocal` on an empty
    // statement; the empty statement is the next test.
    const labels = labelsAt("store myLocal = 4\nfunction main()\n  m@1\nend\n");
    expect(labels).toContain("myLocal");
  });

  upstreamCase.bug(BUG.emptySlot, "user_defined_globals", "a stored global is offered on an empty statement", () => {
    const labels = labelsAt("store myLocal = 4\nfunction main()\n  @1\nend\n");
    expect(labels).toContain("myLocal");
  });

  upstreamCase.bug(BUG.localScope, "dont_suggest_local_before_its_definition", "a local is offered only after its declaration and inside its block", () => {
    // Upstream's cursors are on empty lines; these type a first letter so the
    // case isolates scoping from the empty-statement gap tested above.
    const source = [
      "store myLocal = 4",
      "function abc()",
      "  m@1",
      "  local myInnerLocal = 1",
      "  m@2",
      "end",
      "{m@3}",
      "",
    ].join("\n");
    const one = labelsAt(source, { at: "1" });
    expect(one).toContain("myLocal");
    expect(one).not.toContain("myInnerLocal");
    const two = labelsAt(source, { at: "2" });
    expect(two).toContain("myLocal");
    expect(two).toContain("myInnerLocal");
    const three = labelsAt(source, { at: "3" });
    expect(three).toContain("myLocal");
    expect(three).not.toContain("myInnerLocal");
  });

  upstreamCase.bug(BUG.functions, "recursive_function", "a function's own name is offered inside its body", () => {
    expect(labelsAt("function foo()\n  f@1\nend\n")).toContain("foo");
  });

  upstreamCase.bug(BUG.functions, "nested_recursive_function", "a nested local function and its enclosing function are offered inside it", () => {
    const labels = labelsAt(
      "function outer()\n  local function inner()\n    i@1\n  end\nend\n",
    );
    expect(labels).toContain("inner");
    expect(labels).toContain("outer");
  });

  upstreamCase.bug(BUG.functions, "user_defined_local_functions_in_own_definition", "a local function is offered inside its own body", () => {
    // Upstream's second snippet, `local abc = function() @1 end`, expects
    // `abc` too and marks that expectation "actually incorrect": a local is
    // not in scope in its own initializer (skip_current_local), so it is not
    // ported.
    expect(
      labelsAt("function main()\n  local function abc()\n    a@1\n  end\nend\n"),
    ).toContain("abc");
  });

  upstreamCase.bug(BUG.functions, "global_functions_are_not_scoped_lexically", "a global function declared inside a block is offered after it", () => {
    const labels = labelsAt(
      "function main()\n  if true then\n    function abc()\n    end\n  end\n  a@1\nend\n",
    );
    expect(labels).toContain("abc");
  });

  upstreamCase("local_functions_fall_out_of_scope", "a local function declared inside a block is not offered after it", () => {
    const labels = labelsAt(
      "store another = 1\nfunction main()\n  if true then\n    local function abc()\n    end\n  end\n  a@1\nend\n",
    );
    expect(labels).toContain("another");
    expect(labels).not.toContain("abc");
  });

  upstreamCase("function_parameters", "a parameter is offered for a typed word in its function's body", () => {
    const one = complete("function abc(test)\n  t@1\nend\n");
    expect(one.labels).toContain("test");
    expect(one.detail("test")).toBe("param");
  });

  upstreamCase.bug(BUG.localScope, "function_parameters", "a parameter is not offered in another function's body", () => {
    const labels = labelsAt("function a(p1)\nend\nfunction b()\n  return p@1\nend\n");
    expect(labels).not.toContain("p1");
  });

  upstreamCase.bug(BUG.emptySlot, "function_parameters","a parameter is offered on an empty line of its function's body", () => {
    // Upstream's cursor is on a blank line of the body.
    expect(labelsAt("function abc(test)\n\n  @1\nend\n")).toContain("test");
  });

  upstreamCase("get_suggestions_for_new_statement", "a new statement in a function body offers statement keywords", () => {
    // Upstream: `@1` in an empty module offers `table`; the standard library
    // half is covered by empty_program's skipped test.
    const labels = labelsAt("function main()\n  @1\nend\n");
    expect(labels).toEqual(expect.arrayContaining(["local", "function", "if"]));
  });

  upstreamCase("get_suggestions_for_the_very_start_of_the_script", "the first word of a script offers the top-level statement keywords it starts", () => {
    // Upstream: `@1` before `function aaa() end` offers `table`. Sparkdown's
    // top level is narrative, so the first line offers the statement keywords
    // that match what has been typed.
    const labels = labelsAt("f@1\n\nfunction aaa() end\n");
    expect(labels).toEqual(expect.arrayContaining(["function", "for"]));
  });

  upstreamCase.bug(BUG.functions, "statement_between_two_statements", "a function declared above is offered between two statements", () => {
    const labels = labelsAt(
      "function getmyscripts() end\n\nfunction main()\n  g@1\n\n  getmyscripts()\nend\n",
    );
    expect(labels).toContain("getmyscripts");
  });

  upstreamCase("bias_toward_inner_scope", "a local that shadows a global is offered once", () => {
    const one = complete(
      "store A = { one = 1 }\n\nfunction B()\n  local A = { two = 2 }\n\n  A@1\nend\n",
    );
    expect(one.labels.filter((label) => label === "A")).toHaveLength(1);
  });

  upstreamCase.bug(BUG.members, "bias_toward_inner_scope", "the shadowing local's members are the ones offered", () => {
    // Upstream checks the offered `A` has the inner table's type, with `two`.
    const labels = labelsAt(
      "store A = { one = 1 }\n\nfunction B()\n  local A = { two = 2 }\n\n  return A.@1\nend\n",
    );
    expect(labels).toContain("two");
    expect(labels).not.toContain("one");
  });

  upstreamCase.bug(BUG.keywordPosition, "local_function#2", "a function's name slot before its name offers nothing", () => {
    expect(labelsAt("function main()\n  local function @1\nend\n")).toEqual([]);
    expect(labelsAt("function main()\n  local function @1()\nend\n")).toEqual([]);
    expect(labelsAt("function main()\n  local function @1s\nend\n")).toEqual([]);
  });

  upstreamCase("local_function#2", "a partly typed function name offers nothing", () => {
    expect(labelsAt("function main()\n  local function s@1\nend\n")).toEqual([]);
    expect(labelsAt("function main()\n  local function something@1\nend\n")).toEqual([]);
    expect(labelsAt("store tbl = {}\nfunction tbl.something@1() end\n")).toEqual([]);
  });

  upstreamCase("local_function_params", "every position inside a local function's name and parameters offers nothing", () => {
    // Upstream's markers @2 to @4 and its column loop over `abc(def`; the
    // position before the name (@1) is the next test.
    expect(offering(cursorsWithin("function main()\n  local function abc(def)\n  end\nend\n", "bc(", ")"))).toEqual([]);
    expect(labelsAt("function main()\n  local function abc(def, ghi@1)\n  end\nend\n")).toEqual([]);
  });

  upstreamCase.bug(BUG.keywordPosition, "local_function_params", "the position before a local function's name offers nothing", () => {
    // Upstream's marker @1.
    expect(labelsAt("function main()\n  local function @1abc(def)\n  end\nend\n")).toEqual([]);
  });

  upstreamCase("local_function_params", "a space after a local function's header offers something", () => {
    // Upstream's marker @6.
    expect(labelsAt("function main()\n  local function abc(def) @1")).not.toEqual([]);
  });

  upstreamCase.bug(BUG.keywordPosition, "local_function_params", "the end of a local function's header offers something", () => {
    // Upstream's marker @5, and its check one column past `)`.
    expect(labelsAt("function main()\n  local function abc(def)@1")).not.toEqual([]);
    expect(labelsAt("function main()\n  local function abc(def)@1\n  end\nend\n")).not.toEqual([]);
  });

  upstreamCase.bug(BUG.functions, "local_function_params", "a word typed in a local function's body offers the function and its parameter", () => {
    const labels = labelsAt("function main()\n  local function abc(def)\n    d@1\n  end\nend\n");
    expect(labels).toContain("def");
    const own = labelsAt("function main()\n  local function abc(def)\n    a@1\n  end\nend\n");
    expect(own).toContain("abc");
  });

  upstreamCase.bug([BUG.emptySlot, BUG.functions], "local_function_params", "a blank line in a local function's body offers the function and its parameter", () => {
    const labels = labelsAt("function main()\n  local function abc(def)\n    @1\n  end\nend\n");
    expect(labels).toContain("abc");
    expect(labels).toContain("def");
  });

  upstreamCase("global_function_params", "every position inside a global function's name and parameters offers nothing", () => {
    // Upstream's column loops, over an open and a closed function; their
    // first column, before the name, is the next test.
    for (const text of ["function abc(def)\n", "function abc(def)\nend\n"]) {
      expect(offering(cursorsWithin(text, "bc(", ")"))).toEqual([]);
    }
    expect(labelsAt("function abc(def, ghi@1)\nend\n")).toEqual([]);
  });

  upstreamCase.bug(BUG.keywordPosition, "global_function_params", "the position before a global function's name offers nothing", () => {
    expect(labelsAt("function @1abc(def)\n")).toEqual([]);
    expect(labelsAt("function @1abc(def)\nend\n")).toEqual([]);
  });

  upstreamCase.bug(BUG.keywordPosition, "global_function_params", "the end of a global function's header offers something", () => {
    // Upstream's column past `)`, over an open and a closed function.
    expect(labelsAt("function abc(def)@1\n")).not.toEqual([]);
    expect(labelsAt("function abc(def)@1\nend\n")).not.toEqual([]);
  });

  upstreamCase("global_function_params", "a word typed in a global function's body offers the parameter", () => {
    expect(labelsAt("function abc(def)\n  d@1\nend\n")).toContain("def");
  });

  upstreamCase.bug([BUG.emptySlot, BUG.functions], "global_function_params", "a blank line in a global function's body offers the function and its parameter", () => {
    const labels = labelsAt("function abc(def)\n  @1\nend\n");
    expect(labels).toContain("abc");
    expect(labels).toContain("def");
  });

  upstreamCase("arguments_to_global_lambda", "a function expression's parameter slot offers nothing", () => {
    expect(
      labelsAt("function main()\n  abc = function(def, ghi@1)\n  end\nend\n"),
    ).toEqual([]);
  });

  upstreamCase("function_expr_params", "every position in a function expression's parameters offers nothing, and a space after the header offers something", () => {
    // Upstream's column loops, over an open and a closed expression; their
    // first columns, inside `function` and at its end, are the next test.
    for (const text of ["function main()\n  abc = function(def) ", "function main()\n  abc = function(def) \n  end\nend\n"]) {
      expect(offering(cursorsWithin(text, "def)", ")"))).toEqual([]);
      const afterHeader = text.indexOf(") ") + 2;
      expect(labelsAt(`${text.slice(0, afterHeader)}@1${text.slice(afterHeader)}`)).not.toEqual([]);
    }
  });

  upstreamCase.bug(BUG.keywordPosition, "function_expr_params", "positions inside and at the end of a function expression's `function` keyword offer nothing", () => {
    // The keyword is finished and followed by its parameters, so offering
    // `function` there completes nothing.
    for (const text of ["function main()\n  abc = function(def) ", "function main()\n  abc = function(def) \n  end\nend\n"]) {
      expect(offering(cursorsWithin(text, "on(", "("))).toEqual([]);
    }
  });

  upstreamCase("function_expr_params", "a word typed in a function expression's body offers its parameter", () => {
    expect(
      labelsAt("function main()\n  abc = function(def)\n    d@1\n  end\nend\n"),
    ).toContain("def");
  });

  upstreamCase.bug(BUG.emptySlot, "function_expr_params", "a blank line in a function expression's body offers its parameter", () => {
    expect(
      labelsAt("function main()\n  abc = function(def)\n    @1\n  end\nend\n"),
    ).toContain("def");
  });

  upstreamCase("local_initializer#2", "a prefix in a new local's value offers the globals it matches", () => {
    // Upstream: `local a = t@1` offers `table` and `true`; `true` is the next
    // test, the standard library's `table` is empty_program's.
    const labels = labelsAt("store total = 5\nfunction main()\n  local a = t@1\nend\n");
    expect(labels).toContain("total");
  });

  upstreamCase.bug(BUG.keywordPosition, "local_initializer#2", "a prefix in a new local's value offers `true`", () => {
    expect(labelsAt("function main()\n  local a = t@1\nend\n")).toContain("true");
  });

  upstreamCase.bug(BUG.emptySlot, "local_initializer_2", "a value slot with nothing typed offers the globals", () => {
    const labels = labelsAt("store gold = 5\nfunction main()\n  local a=@1\nend\n");
    expect(labels).toContain("gold");
  });

  upstreamCase("no_function_name_suggestions", "a partly typed function name offers nothing", () => {
    expect(labelsAt("store name = 1\nfunction na@1\n")).toEqual([]);
    expect(labelsAt("store name = 1\nfunction main()\n  local function na@1\nend\n")).toEqual([]);
  });

  upstreamCase.bug(BUG.keywordPosition, "no_function_name_suggestions", "an empty local function name offers nothing", () => {
    expect(labelsAt("store name = 1\nfunction main()\n  local function @1\nend\n")).toEqual([]);
  });

  upstreamCase.bug(BUG.localScope, "skip_current_local", "the local being declared is not offered in its own value", () => {
    const one = labelsAt("function main()\n  local other = 1\n  local name = na@1\nend\n");
    expect(one).not.toContain("name");
    expect(one).toContain("other");
    const two = labelsAt("function main()\n  local other = 1\n  local name, test = o@1\nend\n");
    expect(two).not.toContain("name");
    expect(two).not.toContain("test");
    expect(two).toContain("other");
  });

  upstreamCase("not_the_var_we_are_defining", "an assignment target being written is not offered", () => {
    expect(labelsAt("function main()\n  abc, de@1\nend\n")).not.toContain("de");
  });

  upstreamCase.bug([BUG.emptySlot, BUG.functions], "recursive_function_global", "a global function is offered on a blank line of its body", () => {
    expect(labelsAt("function abc()\n@1\nend\n")).toContain("abc");
  });

  upstreamCase.bug(BUG.functions, "recursive_function_global", "a global function is offered for a typed word in its body", () => {
    expect(labelsAt("function abc()\n  a@1\nend\n")).toContain("abc");
  });

  upstreamCase.bug([BUG.emptySlot, BUG.functions], "recursive_function_local", "a local function is offered on a blank line of its body", () => {
    expect(
      labelsAt("function main()\n  local function abc()\n@1\n  end\nend\n"),
    ).toContain("abc");
  });

  upstreamCase.bug(BUG.functions, "recursive_function_local", "a local function is offered for a typed word in its body", () => {
    expect(
      labelsAt("function main()\n  local function abc()\n    a@1\n  end\nend\n"),
    ).toContain("abc");
  });

  upstreamCase("source_module_preservation_and_invalidation", "a request after an incremental edit sees the edit", () => {
    // Upstream clears, re-checks and marks the module dirty between requests,
    // and each request must still see the source. Sparkdown's equivalent is
    // the registry's incremental update: the document is opened without
    // `beta`, parsed, and edited to declare it, as an author types it in.
    const source = "store alpha = 2\nstore beta = 4\nfunction main()\n  return a@1\nend\n";
    const before = "store alpha = 2\nfunction main()\n  return a\nend\n";
    const labels = labelsAt(source, { editedFrom: before });
    expect(labels).toEqual(expect.arrayContaining(["alpha", "beta"]));
    expect([...labels].sort()).toEqual([...labelsAt(source)].sort());
  });

  upstreamCase("globals_are_order_independent", "globals and the enclosing function's locals are offered", () => {
    const labels = labelsAt(
      "store myLocal = 4\nfunction abc0()\n  local myInnerLocal = 1\n  m@1\nend\n\nfunction abc1()\n  local myInnerLocal = 1\nend\n",
    );
    expect(labels).toContain("myLocal");
    expect(labels).toContain("myInnerLocal");
  });

  upstreamCase.bug(BUG.functions, "globals_are_order_independent", "functions declared before and after are offered", () => {
    const labels = labelsAt(
      "store myLocal = 4\nfunction abc0()\n  local myInnerLocal = 1\n  a@1\nend\n\nfunction abc1()\n  local myInnerLocal = 1\nend\n",
    );
    expect(labels).toContain("abc0");
    expect(labels).toContain("abc1");
  });

  upstreamCase.bug([BUG.defineCrash, BUG.functions], "class_autocomplete_classname_inside_method","a define's name is offered inside its own method", () => {
    // Upstream uses a `class`, which sparkdown does not implement; a `define`
    // with a method is the sparkdown equivalent.
    const labels = labelsAt(
      "define Bar with\n  value = 0\n  function new()\n    return B@1\n  end\nend\n",
    );
    expect(labels).toContain("Bar");
  });
});
