import { portUpstreamFile } from "./portedCases";

portUpstreamFile("TypeInfer.primitives.test.cpp", [
  {
    name: "cannot_call_primitives",
    fixture: "Fixture",
    source: `local foo = 5    foo()`,
    expect: [{ errors: 1 }, { error: 0, code: "CannotCallNonFunction" }],
  },
  {
    name: "string_length",
    fixture: "Fixture",
    source: `
        local s = "Hello, World!"
        local t = #s
    `,
    expect: [{ errors: 0 }, { type: "t", equals: "number" }],
  },
  {
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
    name: "string_method",
    fixture: "Fixture",
    source: `
        local p = ("tacos"):len()
    `,
    expect: [{ errors: 0 }, { type: "p", equals: "number" }],
  },
  {
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
    name: "property_of_buffers",
    fixture: "BuiltinsFixture",
    source: `
        local b = buffer.create(100)
        print(b.foo)
    `,
    expect: [{ errors: 1 }],
  },
  {
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
