// Luau's type-checker tests from `tests/TypeInfer.primitives.test.cpp` at the
// commit pinned in `../upstream/typecheck-cases.json`, ported as `README.md`
// describes. Each case names its upstream line.

import { portUpstreamFile } from "./portedCases";

portUpstreamFile("TypeInfer.primitives.test.cpp", [
  {
    // TypeInfer.primitives.test.cpp:14 TEST_CASE_FIXTURE(Fixture, "cannot_call_primitives")
    name: "cannot_call_primitives",
    fixture: "Fixture",
    source: `local foo = 5    foo()`,
    expect: [{ errors: 1 }, { error: 0, code: "CannotCallNonFunction" }],
  },
  {
    // TypeInfer.primitives.test.cpp:22 TEST_CASE_FIXTURE(Fixture, "string_length")
    // Upstream compares with the builtin `number` type itself, which prints as
    // `number`.
    name: "string_length",
    fixture: "Fixture",
    source: `
        local s = "Hello, World!"
        local t = #s
    `,
    expect: [{ errors: 0 }, { type: "t", equals: "number" }],
  },
  {
    // TypeInfer.primitives.test.cpp:33 TEST_CASE_FIXTURE(Fixture, "string_index")
    name: "string_index",
    fixture: "Fixture",
    source: `
        local s = "Hello, World!"
        local t = s[4]
    `,
    expect: [
      { errors: 1 },
      { error: 0, code: "NotATable", fields: { ty: "string" } },
      { type: "t", equals: "*error-type*" },
    ],
  },
  {
    // TypeInfer.primitives.test.cpp:49 TEST_CASE_FIXTURE(Fixture, "string_method")
    name: "string_method",
    fixture: "Fixture",
    source: `
        local p = ("tacos"):len()
    `,
    expect: [{ errors: 0 }, { type: "p", equals: "number" }],
  },
  {
    // TypeInfer.primitives.test.cpp:59 TEST_CASE_FIXTURE(Fixture, "string_function_indirect")
    name: "string_function_indirect",
    fixture: "Fixture",
    source: `
        local s:string
        local l = s.lower
        local p = l(s)
    `,
    expect: [{ errors: 0 }, { type: "p", equals: "string" }],
  },
  {
    // TypeInfer.primitives.test.cpp:71 TEST_CASE_FIXTURE(Fixture, "check_methods_of_number")
    name: "check_methods_of_number",
    fixture: "Fixture",
    source: `
        local x: number = 9999
        function x:y(z: number)
            local s: string = z
        end
    `,
    expect: [
      { errors: 2 },
      { error: 0, message: "Expected type table, got 'number' instead" },
      { error: 1, message: "Expected this to be 'string', but got 'number'" },
    ],
  },
  {
    // TypeInfer.primitives.test.cpp:94 TEST_CASE("singleton_types")
    // Upstream builds a second BuiltinsFixture before checking in the first, to
    // show the first's globals are untouched. Each checkLuau call has its own
    // compiler, so there is no shared state for the second to disturb.
    name: "singleton_types",
    checks: [
      {
        fixture: "BuiltinsFixture",
        source: `local s: string = 'hello' local t = s:lower()`,
        expect: [{ errors: 0 }],
      },
    ],
  },
  {
    // TypeInfer.primitives.test.cpp:108 TEST_CASE_FIXTURE(BuiltinsFixture, "property_of_buffers")
    // Sparkdown's standard library lists `buffer`, but it raises "not yet
    // implemented" at run time; the checker types it regardless.
    name: "property_of_buffers",
    fixture: "BuiltinsFixture",
    source: `
        local b = buffer.create(100)
        print(b.foo)
    `,
    expect: [{ errors: 1 }],
  },
  {
    // TypeInfer.primitives.test.cpp:118 TEST_CASE_FIXTURE(BuiltinsFixture, "properties_of_vectors")
    // Sparkdown's standard library lists `vector`, but it raises "not yet
    // implemented" at run time; the checker types it regardless.
    name: "properties_of_vectors",
    fixture: "BuiltinsFixture",
    source: `
        local a = vector.create(1, 2, 3)
        local b = vector.create(4, 5, 6)

        local t1 = {
            a + b,
            a - b,
            a * 3,
            a * b,
            3 * b,
            a / 3,
            a / b,
            3 / b,
            a // 4,
            a // b,
            4 // b,
            -a,
        }
        local t2 = {
            a.x,
            a.y,
            a.z,
        }
    `,
    expect: [{ errors: 0 }],
  },
]);
