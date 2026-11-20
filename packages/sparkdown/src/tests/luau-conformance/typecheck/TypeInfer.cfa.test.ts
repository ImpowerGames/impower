// Luau tests/TypeInfer.cfa.test.cpp at 7d5f73364fdbbaa984fa545071630eba73cfea98.
// Sources and expectations follow the new-solver CI branches at this pin.

import { portUpstreamFile, type PortedCase } from "./portedCases";

export const cases: PortedCase[] = [
  // TypeInfer.cfa.test.cpp:9 TEST_CASE_FIXTURE(BuiltinsFixture, "if_not_x_return")
  {
    name: "if_not_x_return",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(x: string?)
            if not x then
                return
            end

            local foo = x
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [6, 24],
            equals: "string",
          }
        ],
      }
    ],
  },
  // TypeInfer.cfa.test.cpp:25 TEST_CASE_FIXTURE(BuiltinsFixture, "if_not_x_break")
  {
    name: "if_not_x_break",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(x: {{value: string?}})
            for _, record in x do
                if not record.value then
                    break
                end

                local foo = record.value
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [7, 34],
            equals: "string",
          }
        ],
      }
    ],
  },
  // TypeInfer.cfa.test.cpp:43 TEST_CASE_FIXTURE(BuiltinsFixture, "if_not_x_continue")
  {
    name: "if_not_x_continue",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(x: {{value: string?}})
            for _, record in x do
                if not record.value then
                    continue
                end

                local foo = record.value
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [7, 38],
            equals: "string",
          }
        ],
      }
    ],
  },
  // TypeInfer.cfa.test.cpp:61 TEST_CASE_FIXTURE(BuiltinsFixture, "if_not_x_return_elif_not_y_return")
  {
    name: "if_not_x_return_elif_not_y_return",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(x: string?, y: string?)
            if not x then
                return
            elseif not y then
                return
            end

            local foo = x
            local bar = y
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [8, 24],
            equals: "string",
          },
          {
            typeAt: [9, 24],
            equals: "string",
          }
        ],
      }
    ],
  },
  // TypeInfer.cfa.test.cpp:81 TEST_CASE_FIXTURE(BuiltinsFixture, "if_not_x_break_elif_not_y_break")
  {
    name: "if_not_x_break_elif_not_y_break",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(x: {{value: string?}}, y: {{value: string?}})
            for i, recordX in x do
                local recordY = y[i]
                if not recordX.value then
                    break
                elseif not recordY.value then
                    break
                end

                local foo = recordX.value
                local bar = recordY.value
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [10, 38],
            equals: "string",
          },
          {
            typeAt: [11, 38],
            equals: "string",
          }
        ],
      }
    ],
  },
  // TypeInfer.cfa.test.cpp:104 TEST_CASE_FIXTURE(BuiltinsFixture, "if_not_x_continue_elif_not_y_continue")
  {
    name: "if_not_x_continue_elif_not_y_continue",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(x: {{value: string?}}, y: {{value: string?}})
            for i, recordX in x do
                local recordY = y[i]
                if not recordX.value then
                    continue
                elseif not recordY.value then
                    continue
                end

                local foo = recordX.value
                local bar = recordY.value
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [10, 38],
            equals: "string",
          },
          {
            typeAt: [11, 38],
            equals: "string",
          }
        ],
      }
    ],
  },
  // TypeInfer.cfa.test.cpp:127 TEST_CASE_FIXTURE(BuiltinsFixture, "if_not_x_return_elif_not_y_break")
  {
    name: "if_not_x_return_elif_not_y_break",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(x: {{value: string?}}, y: {{value: string?}})
            for i, recordX in x do
                local recordY = y[i]
                if not recordX.value then
                    return
                elseif not recordY.value then
                    break
                end

                local foo = recordX.value
                local bar = recordY.value
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [10, 38],
            equals: "string",
          },
          {
            typeAt: [11, 38],
            equals: "string",
          }
        ],
      }
    ],
  },
  // TypeInfer.cfa.test.cpp:150 TEST_CASE_FIXTURE(BuiltinsFixture, "if_not_x_break_elif_not_y_continue")
  {
    name: "if_not_x_break_elif_not_y_continue",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(x: {{value: string?}}, y: {{value: string?}})
            for i, recordX in x do
                local recordY = y[i]
                if not recordX.value then
                    break
                elseif not recordY.value then
                    continue
                end

                local foo = recordX.value
                local bar = recordY.value
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [10, 38],
            equals: "string",
          },
          {
            typeAt: [11, 38],
            equals: "string",
          }
        ],
      }
    ],
  },
  // TypeInfer.cfa.test.cpp:173 TEST_CASE_FIXTURE(BuiltinsFixture, "if_not_x_return_elif_rand_return_elif_not_y_return")
  {
    name: "if_not_x_return_elif_rand_return_elif_not_y_return",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(x: string?, y: string?)
            if not x then
                return
            elseif math.random() > 0.5 then
                return
            elseif not y then
                return
            end

            local foo = x
            local bar = y
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [10, 24],
            equals: "string",
          },
          {
            typeAt: [11, 24],
            equals: "string",
          }
        ],
      }
    ],
  },
  // TypeInfer.cfa.test.cpp:195 TEST_CASE_FIXTURE(BuiltinsFixture, "if_not_x_break_elif_rand_break_elif_not_y_break")
  {
    name: "if_not_x_break_elif_rand_break_elif_not_y_break",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(x: {{value: string?}}, y: {{value: string?}})
            for i, recordX in x do
                local recordY = y[i]
                if not recordX.value then
                    break
                elseif math.random() > 0.5 then
                    break
                elseif not recordY.value then
                    break
                end

                local foo = recordX.value
                local bar = recordY.value
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [12, 38],
            equals: "string",
          },
          {
            typeAt: [13, 38],
            equals: "string",
          }
        ],
      }
    ],
  },
  // TypeInfer.cfa.test.cpp:220 TEST_CASE_FIXTURE(BuiltinsFixture, "if_not_x_continue_elif_rand_continue_elif_not_y_continue")
  {
    name: "if_not_x_continue_elif_rand_continue_elif_not_y_continue",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(x: {{value: string?}}, y: {{value: string?}})
            for i, recordX in x do
                local recordY = y[i]
                if not recordX.value then
                    continue
                elseif math.random() > 0.5 then
                    continue
                elseif not recordY.value then
                    continue
                end

                local foo = recordX.value
                local bar = recordY.value
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [12, 38],
            equals: "string",
          },
          {
            typeAt: [13, 38],
            equals: "string",
          }
        ],
      }
    ],
  },
  // TypeInfer.cfa.test.cpp:245 TEST_CASE_FIXTURE(BuiltinsFixture, "if_not_x_return_elif_not_rand_return_elif_not_y_fallthrough")
  {
    name: "if_not_x_return_elif_not_rand_return_elif_not_y_fallthrough",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(x: string?, y: string?)
            if not x then
                return
            elseif math.random() > 0.5 then
                return
            elseif not y then

            end

            local foo = x
            local bar = y
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [10, 24],
            equals: "string",
          },
          {
            typeAt: [11, 24],
            equals: "string?",
          }
        ],
      }
    ],
  },
  // TypeInfer.cfa.test.cpp:267 TEST_CASE_FIXTURE(BuiltinsFixture, "if_not_x_break_elif_rand_break_elif_not_y_fallthrough")
  {
    name: "if_not_x_break_elif_rand_break_elif_not_y_fallthrough",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(x: {{value: string?}}, y: {{value: string?}})
            for i, recordX in x do
                local recordY = y[i]
                if not recordX.value then
                    break
                elseif math.random() > 0.5 then
                    break
                elseif not recordY.value then

                end

                local foo = recordX.value
                local bar = recordY.value
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [12, 38],
            equals: "string",
          },
          {
            typeAt: [13, 38],
            equals: "string?",
          }
        ],
      }
    ],
  },
  // TypeInfer.cfa.test.cpp:292 TEST_CASE_FIXTURE(BuiltinsFixture, "if_not_x_continue_elif_rand_continue_elif_not_y_fallthrough")
  {
    name: "if_not_x_continue_elif_rand_continue_elif_not_y_fallthrough",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(x: {{value: string?}}, y: {{value: string?}})
            for i, recordX in x do
                local recordY = y[i]
                if not recordX.value then
                    continue
                elseif math.random() > 0.5 then
                    continue
                elseif not recordY.value then

                end

                local foo = recordX.value
                local bar = recordY.value
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [12, 38],
            equals: "string",
          },
          {
            typeAt: [13, 38],
            equals: "string?",
          }
        ],
      }
    ],
  },
  // TypeInfer.cfa.test.cpp:317 TEST_CASE_FIXTURE(BuiltinsFixture, "if_not_x_return_elif_not_y_fallthrough_elif_not_z_return")
  {
    name: "if_not_x_return_elif_not_y_fallthrough_elif_not_z_return",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(x: string?, y: string?, z: string?)
            if not x then
                return
            elseif not y then

            elseif not z then
                return
            end

            local foo = x
            local bar = y
            local baz = z
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [10, 24],
            equals: "string",
          },
          {
            typeAt: [11, 24],
            equals: "string?",
          },
          {
            typeAt: [12, 24],
            equals: "string?",
          }
        ],
      }
    ],
  },
  // TypeInfer.cfa.test.cpp:341 TEST_CASE_FIXTURE(BuiltinsFixture, "if_not_x_break_elif_not_y_fallthrough_elif_not_z_break")
  {
    name: "if_not_x_break_elif_not_y_fallthrough_elif_not_z_break",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(x: {{value: string?}}, y: {{value: string?}}, z: {{value: string?}})
            for i, recordX in x do
                local recordY = y[i]
                local recordZ = y[i]
                if not recordX.value then
                    break
                elseif not recordY.value then

                elseif not recordZ.value then
                    break
                end

                local foo = recordX.value
                local bar = recordY.value
                local baz = recordZ.value
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [13, 38],
            equals: "string",
          },
          {
            typeAt: [14, 38],
            equals: "string?",
          },
          {
            typeAt: [15, 38],
            equals: "string?",
          }
        ],
      }
    ],
  },
  // TypeInfer.cfa.test.cpp:369 TEST_CASE_FIXTURE(BuiltinsFixture, "if_not_x_continue_elif_not_y_fallthrough_elif_not_z_continue")
  {
    name: "if_not_x_continue_elif_not_y_fallthrough_elif_not_z_continue",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(x: {{value: string?}}, y: {{value: string?}}, z: {{value: string?}})
            for i, recordX in x do
                local recordY = y[i]
                local recordZ = y[i]
                if not recordX.value then
                    continue
                elseif not recordY.value then

                elseif not recordZ.value then
                    continue
                end

                local foo = recordX.value
                local bar = recordY.value
                local baz = recordZ.value
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [13, 38],
            equals: "string",
          },
          {
            typeAt: [14, 38],
            equals: "string?",
          },
          {
            typeAt: [15, 38],
            equals: "string?",
          }
        ],
      }
    ],
  },
  // TypeInfer.cfa.test.cpp:397 TEST_CASE_FIXTURE(BuiltinsFixture, "if_not_x_continue_elif_not_y_throw_elif_not_z_fallthrough")
  {
    name: "if_not_x_continue_elif_not_y_throw_elif_not_z_fallthrough",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(x: {{value: string?}}, y: {{value: string?}}, z: {{value: string?}})
            for i, recordX in x do
                local recordY = y[i]
                local recordZ = y[i]
                if not recordX.value then
                    continue
                elseif not recordY.value then
                    error("Y value not defined")
                elseif not recordZ.value then

                end

                local foo = recordX.value
                local bar = recordY.value
                local baz = recordZ.value
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [13, 38],
            equals: "string",
          },
          {
            typeAt: [14, 38],
            equals: "string",
          },
          {
            typeAt: [15, 38],
            equals: "string?",
          }
        ],
      }
    ],
  },
  // TypeInfer.cfa.test.cpp:425 TEST_CASE_FIXTURE(BuiltinsFixture, "if_not_x_return_elif_not_y_fallthrough_elif_not_z_break")
  {
    name: "if_not_x_return_elif_not_y_fallthrough_elif_not_z_break",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(x: {{value: string?}}, y: {{value: string?}}, z: {{value: string?}})
            for i, recordX in x do
                local recordY = y[i]
                local recordZ = y[i]
                if not recordX.value then
                    return
                elseif not recordY.value then

                elseif not recordZ.value then
                    break
                end

                local foo = recordX.value
                local bar = recordY.value
                local baz = recordZ.value
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [13, 38],
            equals: "string",
          },
          {
            typeAt: [14, 38],
            equals: "string?",
          },
          {
            typeAt: [15, 38],
            equals: "string?",
          }
        ],
      }
    ],
  },
  // TypeInfer.cfa.test.cpp:453 TEST_CASE_FIXTURE(BuiltinsFixture, "do_if_not_x_return")
  {
    name: "do_if_not_x_return",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(x: string?)
            do
                if not x then
                    return
                end
            end

            local foo = x
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [8, 24],
            equals: "string",
          }
        ],
      }
    ],
  },
  // TypeInfer.cfa.test.cpp:471 TEST_CASE_FIXTURE(BuiltinsFixture, "for_record_do_if_not_x_break")
  {
    name: "for_record_do_if_not_x_break",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(x: {{value: string?}})
            for _, record in x do
                do
                    if not record.value then
                        break
                    end
                end

                local foo = record.value
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [9, 38],
            equals: "string",
          }
        ],
      }
    ],
  },
  // TypeInfer.cfa.test.cpp:491 TEST_CASE_FIXTURE(BuiltinsFixture, "for_record_do_if_not_x_continue")
  {
    name: "for_record_do_if_not_x_continue",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(x: {{value: string?}})
            for _, record in x do
                do
                    if not record.value then
                        continue
                    end
                end

                local foo = record.value
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [9, 38],
            equals: "string",
          }
        ],
      }
    ],
  },
  // TypeInfer.cfa.test.cpp:511 TEST_CASE_FIXTURE(BuiltinsFixture, "early_return_in_a_loop_which_isnt_guaranteed_to_run_first")
  {
    name: "early_return_in_a_loop_which_isnt_guaranteed_to_run_first",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(x: string?)
            while math.random() > 0.5 do
                if not x then
                    return
                end

                local foo = x
            end

            local bar = x
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [7, 28],
            equals: "string",
          },
          {
            typeAt: [10, 24],
            equals: "string?",
          }
        ],
      }
    ],
  },
  // TypeInfer.cfa.test.cpp:532 TEST_CASE_FIXTURE(BuiltinsFixture, "early_return_in_a_loop_which_is_guaranteed_to_run_first")
  {
    name: "early_return_in_a_loop_which_is_guaranteed_to_run_first",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(x: string?)
            repeat
                if not x then
                    return
                end

                local foo = x
            until math.random() > 0.5

            local bar = x
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [7, 28],
            equals: "string",
          },
          {
            typeAt: [10, 24],
            equals: "string?",
          }
        ],
      }
    ],
  },
  // TypeInfer.cfa.test.cpp:553 TEST_CASE_FIXTURE(BuiltinsFixture, "early_return_in_a_loop_which_is_guaranteed_to_run_first_2")
  {
    name: "early_return_in_a_loop_which_is_guaranteed_to_run_first_2",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(x: string?)
            for i = 1, 10 do
                if not x then
                    return
                end

                local foo = x
            end

            local bar = x
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [7, 28],
            equals: "string",
          },
          {
            typeAt: [10, 24],
            equals: "string?",
          }
        ],
      }
    ],
  },
  // TypeInfer.cfa.test.cpp:574 TEST_CASE_FIXTURE(BuiltinsFixture, "if_not_x_then_error")
  {
    name: "if_not_x_then_error",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(x: string?)
            if not x then
                error("oops")
            end

            local foo = x
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [6, 24],
            equals: "string",
          }
        ],
      }
    ],
  },
  // TypeInfer.cfa.test.cpp:590 TEST_CASE_FIXTURE(BuiltinsFixture, "if_not_x_then_assert_false")
  {
    name: "if_not_x_then_assert_false",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(x: string?)
            if not x then
                assert(false)
            end

            local foo = x
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [6, 24],
            equals: "string",
          }
        ],
      }
    ],
  },
  // TypeInfer.cfa.test.cpp:606 TEST_CASE_FIXTURE(BuiltinsFixture, "if_not_x_return_if_not_y_return")
  {
    name: "if_not_x_return_if_not_y_return",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(x: string?, y: string?)
            if not x then
                return
            end

            if not y then
                return
            end

            local foo = x
            local bar = y
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [10, 24],
            equals: "string",
          },
          {
            typeAt: [11, 24],
            equals: "string",
          }
        ],
      }
    ],
  },
  // TypeInfer.cfa.test.cpp:628 TEST_CASE_FIXTURE(BuiltinsFixture, "if_not_x_break_if_not_y_break")
  {
    name: "if_not_x_break_if_not_y_break",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(x: {{value: string?}}, y: {{value: string?}})
            for i, recordX in x do
                local recordY = y[i]
                if not recordX.value then
                    break
                end

                if not recordY.value then
                    break
                end

                local foo = recordX.value
                local bar = recordY.value
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [12, 38],
            equals: "string",
          },
          {
            typeAt: [13, 38],
            equals: "string",
          }
        ],
      }
    ],
  },
  // TypeInfer.cfa.test.cpp:653 TEST_CASE_FIXTURE(BuiltinsFixture, "if_not_x_continue_if_not_y_continue")
  {
    name: "if_not_x_continue_if_not_y_continue",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(x: {{value: string?}}, y: {{value: string?}})
            for i, recordX in x do
                local recordY = y[i]
                if not recordX.value then
                    continue
                end

                if not recordY.value then
                    continue
                end

                local foo = recordX.value
                local bar = recordY.value
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [12, 38],
            equals: "string",
          },
          {
            typeAt: [13, 38],
            equals: "string",
          }
        ],
      }
    ],
  },
  // TypeInfer.cfa.test.cpp:678 TEST_CASE_FIXTURE(BuiltinsFixture, "if_not_x_continue_if_not_y_throw")
  {
    name: "if_not_x_continue_if_not_y_throw",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(x: {{value: string?}}, y: {{value: string?}})
            for i, recordX in x do
                local recordY = y[i]
                if not recordX.value then
                    continue
                end

                if not recordY.value then
                    error("Y value not defined")
                end

                local foo = recordX.value
                local bar = recordY.value
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [12, 38],
            equals: "string",
          },
          {
            typeAt: [13, 38],
            equals: "string",
          }
        ],
      }
    ],
  },
  // TypeInfer.cfa.test.cpp:703 TEST_CASE_FIXTURE(BuiltinsFixture, "if_not_x_break_if_not_y_continue")
  {
    name: "if_not_x_break_if_not_y_continue",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(x: {{value: string?}}, y: {{value: string?}})
            for i, recordX in x do
                local recordY = y[i]
                if not recordX.value then
                    break
                end

                if not recordY.value then
                    continue
                end

                local foo = recordX.value
                local bar = recordY.value
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [12, 38],
            equals: "string",
          },
          {
            typeAt: [13, 38],
            equals: "string",
          }
        ],
      }
    ],
  },
  // TypeInfer.cfa.test.cpp:728 TEST_CASE_FIXTURE(BuiltinsFixture, "type_alias_does_not_leak_out")
  {
    name: "type_alias_does_not_leak_out",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(x: string?)
            if typeof(x) == "string" then
                return
            else
                type Foo = number
            end

            local foo: Foo = x
        end
    `,
        expect: [
          {
            errors: 1,
          },
          {
            error: 0,
            message: "Unknown type 'Foo'",
          },
          {
            typeAt: [8, 29],
            equals: "nil",
          }
        ],
      }
    ],
  },
  // TypeInfer.cfa.test.cpp:749 TEST_CASE_FIXTURE(BuiltinsFixture, "type_alias_does_not_leak_out_breaking")
  {
    name: "type_alias_does_not_leak_out_breaking",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(x: {{value: string?}})
            for _, record in x do
                if typeof(record.value) == "string" then
                    break
                else
                    type Foo = number
                end

                local foo: Foo = record.value
            end
        end
    `,
        expect: [
          {
            errors: 1,
          },
          {
            error: 0,
            message: "Unknown type 'Foo'",
          },
          {
            typeAt: [9, 43],
            equals: "nil",
          }
        ],
      }
    ],
  },
  // TypeInfer.cfa.test.cpp:772 TEST_CASE_FIXTURE(BuiltinsFixture, "type_alias_does_not_leak_out_continuing")
  {
    name: "type_alias_does_not_leak_out_continuing",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(x: {{value: string?}})
            for _, record in x do
                if typeof(record.value) == "string" then
                    continue
                else
                    type Foo = number
                end

                local foo: Foo = record.value
            end
        end
    `,
        expect: [
          {
            errors: 1,
          },
          {
            error: 0,
            message: "Unknown type 'Foo'",
          },
          {
            typeAt: [9, 43],
            equals: "nil",
          }
        ],
      }
    ],
  },
  // TypeInfer.cfa.test.cpp:795 TEST_CASE_FIXTURE(BuiltinsFixture, "prototyping_and_visiting_alias_has_the_same_scope")
  {
    name: "prototyping_and_visiting_alias_has_the_same_scope",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(x: string?)
            type Foo = number

            if typeof(x) == "string" then
                return
            end

            local foo: Foo = x
        end
    `,
        expect: [
          {
            errors: 1,
          },
          {
            error: 0,
            message: "Expected this to be 'number', but got 'nil'",
          },
          {
            typeAt: [8, 29],
            equals: "nil",
          }
        ],
      }
    ],
  },
  // TypeInfer.cfa.test.cpp:819 TEST_CASE_FIXTURE(BuiltinsFixture, "prototyping_and_visiting_alias_has_the_same_scope_breaking")
  {
    name: "prototyping_and_visiting_alias_has_the_same_scope_breaking",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(x: {{value: string?}})
            for _, record in x do
                type Foo = number

                if typeof(record.value) == "string" then
                    break
                end

                local foo: Foo = record.value
            end
        end
    `,
        expect: [
          {
            errors: 1,
          },
          {
            error: 0,
            message: "Expected this to be 'number', but got 'nil'",
          },
          {
            typeAt: [9, 43],
            equals: "nil",
          }
        ],
      }
    ],
  },
  // TypeInfer.cfa.test.cpp:842 TEST_CASE_FIXTURE(BuiltinsFixture, "prototyping_and_visiting_alias_has_the_same_scope_continuing")
  {
    name: "prototyping_and_visiting_alias_has_the_same_scope_continuing",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(x: {{value: string?}})
            for _, record in x do
                type Foo = number

                if typeof(record.value) == "string" then
                    continue
                end

                local foo: Foo = record.value
            end
        end
    `,
        expect: [
          {
            errors: 1,
          },
          {
            error: 0,
            message: "Expected this to be 'number', but got 'nil'",
          },
          {
            typeAt: [9, 43],
            equals: "nil",
          }
        ],
      }
    ],
  },
  // TypeInfer.cfa.test.cpp:865 TEST_CASE_FIXTURE(BuiltinsFixture, "tagged_unions")
  {
    name: "tagged_unions",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        type Ok<T> = { tag: "ok", value: T }
        type Err<E> = { tag: "err", error: E }
        type Result<T, E> = Ok<T> | Err<E>

        local function map<T, U, E>(result: Result<T, E>, f: (T) -> U): Result<U, E>
            if result.tag == "ok" then
                local tag = result.tag
                local val = result.value

                return { tag = "ok", value = f(result.value) }
            end

            local tag = result.tag
            local err = result.error

            return result
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [7, 35],
            equals: "\"ok\"",
          },
          {
            typeAt: [8, 35],
            equals: "T",
          },
          {
            typeAt: [13, 31],
            equals: "\"err\"",
          },
          {
            typeAt: [14, 31],
            equals: "E",
          },
          {
            typeAt: [16, 19],
            equals: "Err<E>",
          }
        ],
      }
    ],
  },
  // TypeInfer.cfa.test.cpp:898 TEST_CASE_FIXTURE(BuiltinsFixture, "tagged_unions_breaking")
  {
    name: "tagged_unions_breaking",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        type Ok<T> = { tag: "ok", value: T }
        type Err<E> = { tag: "err", error: E }
        type Result<T, E> = Ok<T> | Err<E>

        local function process<T, E>(results: {Result<T, E>})
            for _, result in results do
                if result.tag == "ok" then
                    local tag = result.tag
                    local val = result.value

                    break
                end

                local tag = result.tag
                local err = result.error
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [8, 39],
            equals: "\"ok\"",
          },
          {
            typeAt: [9, 39],
            equals: "T",
          },
          {
            typeAt: [14, 35],
            equals: "\"err\"",
          },
          {
            typeAt: [15, 35],
            equals: "E",
          }
        ],
        unparsed: {
          defect: 1370,
        },
      }
    ],
  },
  // TypeInfer.cfa.test.cpp:929 TEST_CASE_FIXTURE(BuiltinsFixture, "tagged_unions_continuing")
  {
    name: "tagged_unions_continuing",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        type Ok<T> = { tag: "ok", value: T }
        type Err<E> = { tag: "err", error: E }
        type Result<T, E> = Ok<T> | Err<E>

        local function process<T, E>(results: {Result<T, E>})
            for _, result in results do
                if result.tag == "ok" then
                    local tag = result.tag
                    local val = result.value

                    continue
                end

                local tag = result.tag
                local err = result.error
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [8, 39],
            equals: "\"ok\"",
          },
          {
            typeAt: [9, 39],
            equals: "T",
          },
          {
            typeAt: [14, 35],
            equals: "\"err\"",
          },
          {
            typeAt: [15, 35],
            equals: "E",
          }
        ],
        unparsed: {
          defect: 1370,
        },
      }
    ],
  },
  // TypeInfer.cfa.test.cpp:960 TEST_CASE_FIXTURE(BuiltinsFixture, "do_assert_x")
  {
    name: "do_assert_x",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(x: string?)
            do
                assert(x)
            end

            local foo = x
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [6, 24],
            equals: "string",
          }
        ],
      }
    ],
  },
];

portUpstreamFile("TypeInfer.cfa.test.cpp", cases);
