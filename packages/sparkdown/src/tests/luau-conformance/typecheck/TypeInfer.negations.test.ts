// Luau's type-checker tests from `tests/TypeInfer.negations.test.cpp` at the
// commit pinned in `../upstream/typecheck-cases.json`, ported as `README.md`
// describes. Each case names its upstream line.

import { portUpstreamFile } from "./portedCases";

portUpstreamFile("TypeInfer.negations.test.cpp", [
  {
    // TypeInfer.negations.test.cpp:32 TEST_CASE_FIXTURE(NegationFixture, "negated_string_is_a_subtype_of_string")
    name: "negated_string_is_a_subtype_of_string",
    fixture: "NegationFixture",
    source: `
        function foo(arg: string) end
        local a: string & Not<"Hello">
        foo(a)
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.negations.test.cpp:43 TEST_CASE_FIXTURE(NegationFixture, "string_is_not_a_subtype_of_negated_string")
    name: "string_is_not_a_subtype_of_negated_string",
    fixture: "NegationFixture",
    source: `
        function foo(arg: string & Not<"hello">) end
        local a: string
        foo(a)
    `,
    expect: [{ errors: 1 }],
  },
  {
    // TypeInfer.negations.test.cpp:54 TEST_CASE_FIXTURE(Fixture, "cofinite_strings_can_be_compared_for_equality")
    name: "cofinite_strings_can_be_compared_for_equality",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        function f(e)
            if e == 'strictEqual' then
                e = 'strictEqualObject'
            end
            if e == 'deepStrictEqual' or e == 'strictEqual' then
            elseif e == 'notDeepStrictEqual' or e == 'notStrictEqual' then
            end
            return e
        end
    `,
    expect: [{ errors: 0 }, { type: "f", equals: "(string) -> string" }],
  },
  {
    // TypeInfer.negations.test.cpp:73 TEST_CASE_FIXTURE(NegationFixture, "compare_cofinite_strings")
    name: "compare_cofinite_strings",
    fixture: "NegationFixture",
    source: `
local u : Not<"a">
local v : "b"
if u == v then
end
`,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.negations.test.cpp:84 TEST_CASE_FIXTURE(NegationFixture, "subtyping_path_is_valid_for_union")
    name: "subtyping_path_is_valid_for_union",
    fixture: "NegationFixture",
    flags: { LuauNewTypePathErrorMessages: true, LuauFixSuperNegationTypePaths: true },
    source: `
        local a: Not<false?> = false
    `,
    expect: [
      { errors: 1 },
      { error: 0, message: {
        oneOf: [
          "Expected this to be '~(false?)', but got 'false'; \n`false` cannot be `~(false?)`",
          "Expected this to be '~(false?)', but got 'boolean'; \n`boolean` cannot be `~(false?)`",
        ],
      } },
    ],
  },
  {
    // TypeInfer.negations.test.cpp:102 TEST_CASE_FIXTURE(NegationFixture, "subtype_path_is_valid_for_intersections")
    name: "subtype_path_is_valid_for_intersections",
    fixture: "NegationFixture",
    flags: { LuauNewTypePathErrorMessages: true, LuauFixSuperNegationTypePaths: true },
    source: `
        type T = Not<unknown & boolean>
        local x: T = false
    `,
    expect: [
      { errors: 1 },
      { error: 0, message: "Expected this to be '~(boolean & unknown)', but got 'boolean'; \n`boolean` cannot be `~(boolean & unknown)`" },
    ],
  },
]);
