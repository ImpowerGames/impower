import { portUpstreamFile } from "./portedCases";

portUpstreamFile("TypeInfer.negations.test.cpp", [
  {
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
