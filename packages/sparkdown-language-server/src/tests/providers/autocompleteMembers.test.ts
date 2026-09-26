import { describe, expect } from "vitest";
import { BUG } from "./autocompleteBugs";
import { type CompleteOptions, labelsAt, upstreamCase } from "./completionHarness";

// Member-access cases from Luau's Autocomplete.test.cpp, ported against
// sparkdown tables and `define` structs. Luau's fixture adds `table` and `math`
// as untyped globals and its builtins fixture loads the standard library; the
// sparkdown equivalents are the runtime's own `table`, `math` and `string`
// libraries.

const TRIGGERS = new Set([".", ":", '"']);

/**
 * The labels offered where the author has just typed the character before the
 * cursor: when that character is one of the server's trigger characters, the
 * request carries it, as the editor's own request does.
 */
const labelsTypedAt = (source: string, options: CompleteOptions = {}) => {
  const marker = options.at ? `@${options.at}` : /@\d/.exec(source)![0];
  const typed = source[source.indexOf(marker) - 1] ?? "";
  return labelsAt(source, {
    ...options,
    trigger: TRIGGERS.has(typed) ? typed : undefined,
  });
};

describe("autocomplete · member access", () => {
  upstreamCase.bug(BUG.globals, "get_member_completions", "a standard library table offers its functions", () => {
    const labels = labelsTypedAt("function main()\n  local a = table.@1\nend\n");
    expect(labels).toEqual(expect.arrayContaining(["insert", "remove", "concat"]));
    expect(labels).not.toContain("math");
  });

  upstreamCase("get_member_completions#2", "a decimal point inside a number offers nothing", () => {
    // Member completion offers nothing anywhere while #867 is open, so this
    // starts guarding numbers once that is fixed.
    expect(labelsTypedAt("function main()\n  local a = 12.@13\nend\n")).toEqual([]);
  });

  upstreamCase.bug(BUG.members, "nested_member_completions", "a nested table offers its fields", () => {
    const labels = labelsTypedAt(
      "store tbl = { abc = { def = 1234, egh = false } }\nfunction main()\n  tbl.abc. @1\nend\n",
    );
    expect(labels.sort()).toEqual(["def", "egh"]);
  });

  upstreamCase.bug(BUG.members, "nested_member_completions", "a typed field name offers the matching fields", () => {
    const labels = labelsTypedAt(
      "store tbl = { abc = { def = 1234, egh = false } }\nfunction main()\n  return tbl.abc.d@1\nend\n",
    );
    expect(labels).toContain("def");
  });

  upstreamCase.bug(BUG.members, "unsealed_table", "a field assigned after the table is built is offered", () => {
    const labels = labelsTypedAt("function main()\n  local tbl = {}\n  tbl.prop = 5\n  tbl.@1\nend\n");
    expect(labels).toEqual(["prop"]);
  });

  upstreamCase.bug(BUG.members, "unsealed_table_2", "a field that holds another table offers that table's fields", () => {
    const labels = labelsTypedAt(
      "function main()\n  local tbl = {}\n  local inner = { prop = 5 }\n  tbl.inner = inner\n  tbl.inner. @1\nend\n",
    );
    expect(labels).toEqual(["prop"]);
  });

  upstreamCase.bug(BUG.members, "cyclic_table", "two tables that refer to each other offer their fields", () => {
    const labels = labelsTypedAt(
      "function main()\n  local abc = {}\n  local def = { abc = abc }\n  abc.def = def\n  abc.def. @1\nend\n",
    );
    expect(labels).toContain("abc");
  });

  upstreamCase.bug(BUG.members, "method_call_inside_function_body", "a colon after a table offers its methods and no globals", () => {
    const labels = labelsTypedAt(
      "store game = { GetService = function(s) return 'hello' end }\n\nfunction a()\n  game:  @1\nend\n",
    );
    expect(labels).toContain("GetService");
    expect(labels).not.toContain("math");
  });

  upstreamCase.bug(BUG.globals, "method_call_inside_if_conditional","a colon after a library in a condition offers its functions", () => {
    const labels = labelsTypedAt("function main()\n  if table:  @1\nend\n");
    expect(labels).toContain("concat");
    expect(labels).not.toContain("math");
  });

  upstreamCase.bug(BUG.members, "keyword_members", "fields named like keywords are offered", () => {
    const source =
      "function main()\n  local a = { done = 1, forever = 2 }\n  local b = a.do@1\n  local c = a.for@2\n  local d = a.@3\n  do\n  end\nend\n";
    for (const at of ["1", "2", "3"]) {
      expect(labelsTypedAt(source, { at }).sort()).toEqual(["done", "forever"]);
    }
  });

  upstreamCase.bug(BUG.members, "keyword_methods", "a method named like a keyword is offered", () => {
    expect(
      labelsTypedAt("function main()\n  local a = {}\n  function a:done() end\n  local b = a:do@1\nend\n"),
    ).toEqual(["done"]);
  });

  upstreamCase.bug(BUG.members, "do_compatible_self_calls", "a colon offers a method declared with a colon", () => {
    // Upstream also checks wrongIndexType, a type-checker judgment (#589).
    expect(labelsTypedAt("function main()\n  local t = {}\n  function t:m() end\n  t:@1\nend\n")).toContain("m");
  });

  upstreamCase.bug(BUG.members, "no_incompatible_self_calls", "a colon offers a function declared with a dot", () => {
    // Upstream also checks wrongIndexType, a type-checker judgment (#589).
    expect(labelsTypedAt("function main()\n  local t = {}\n  function t.m() end\n  t:@1\nend\n")).toContain("m");
  });

  upstreamCase.bug(BUG.globals, "library_non_self_calls_are_fine","the string and table libraries offer their functions after a dot", () => {
    // Upstream also checks wrongIndexType and indexedWithSelf flags, which
    // sparkdown's completion items do not carry.
    expect(labelsTypedAt("function main()\n  string.@1\nend\n")).toEqual(
      expect.arrayContaining(["byte", "char", "sub"]),
    );
    expect(labelsTypedAt("function main()\n  table.@1\nend\n")).toEqual(
      expect.arrayContaining(["remove", "insert"]),
    );
  });

  upstreamCase.bug(BUG.members, "autocomplete_at_end_of_stmt_should_continue_as_part_of_stmt", "a dot at the end of a statement completes the table's fields", () => {
    expect(
      labelsTypedAt("function main()\n  local data = { x = 1 }\n  local var = data.@1\nend\n"),
    ).toContain("x");
  });

  upstreamCase.bug(BUG.members, "autocomplete_method_in_unfinished_repeat_body_eof", "a method is offered in an unfinished repeat at the end of the file", () => {
    expect(
      labelsTypedAt("function main()\n  local t = {}\n  function t:Foo() end\n  repeat\n  t:@1"),
    ).toContain("Foo");
  });

  upstreamCase.bug(BUG.members, "autocomplete_method_in_unfinished_repeat_body_not_eof", "a method is offered in an unfinished repeat", () => {
    expect(
      labelsTypedAt("function main()\n  local t = {}\n  function t:Foo() end\n  repeat\n  t:@1\n\n"),
    ).toContain("Foo");
  });

  upstreamCase.bug(BUG.members, "autocomplete_method_in_unfinished_while_body", "a method is offered in an unfinished while", () => {
    expect(
      labelsTypedAt("function main()\n  local t = {}\n  function t:Foo() end\n  while true do\n  t:@1"),
    ).toContain("Foo");
  });

  upstreamCase.bug(BUG.members, "autocomplete_implicit_named_index_index_expr_without_annotation", "a quoted index offers the table's string keys", () => {
    // Upstream also checks each entry's inferred value type (#589).
    const labels = labelsTypedAt(
      'function main()\n  local foo = {\n    ["Item/Foo"] = 42,\n    ["Item/Bar"] = "it\'s true",\n    ["Item/Baz"] = true,\n  }\n  foo["@1"]\nend\n',
    );
    expect(labels).toEqual(expect.arrayContaining(["Item/Foo", "Item/Bar", "Item/Baz"]));
  });

  upstreamCase.bug(BUG.members, "we_know_the_fields_of_a_class_instance", "a define's fields are offered after a dot", () => {
    // Upstream uses a `class`, which sparkdown does not implement; a `define`
    // declares the sparkdown struct with the same fields.
    const labels = labelsTypedAt(
      "define Point2d with\n  x = 3\n  y = 4\nend\n\nfunction main()\n  local q = Point2d.@1\nend\n",
    );
    expect(labels).toContain("x");
    expect(labels).toContain("y");
    expect(labels).not.toContain("z");
  });

  upstreamCase.bug(BUG.members, "ac_static_method_autocomplete", "a define's method is offered after a dot", () => {
    // Upstream uses a `class`; a `define` with a method is the sparkdown form.
    const labels = labelsTypedAt(
      "define Bar with\n  value = 0\n  function new()\n    return Bar\n  end\nend\n\nfunction main()\n  Bar.@1\nend\n",
    );
    expect(labels).toContain("new");
  });
});
