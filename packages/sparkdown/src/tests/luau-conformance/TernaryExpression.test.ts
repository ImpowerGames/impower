// Regression tests for Luau's `if cond then a else b` EXPRESSION
// form (ifelseexpr.luau). Lowered to a `TernaryExpression`
// (TernaryExpression.ts) that emits conditional content-pointer
// jumps via the `sc:if` / `sc:jump` ControlCommand ops — only the
// taken arm's value ops execute (verified by the side-effect test).
// The unparenthesized nested-condition form parses FLAT (the grammar
// can't bracket without counting); the lowerer reconstructs the
// nesting by folding a completed chain into the enclosing clause's
// condition — see lowerTernaryExpression.
import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { Story as RuntimeStory } from "../../inkjs/engine/Story";

function compileAndCapture(source: string): {
  errors: string[];
  recorded: unknown[];
} {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri: "inmemory:///main.sd",
        type: "script",
        name: "main",
        ext: "sd",
        text: source,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  });
  const result = compiler.compile({
    textDocument: { uri: "inmemory:///main.sd" },
  });
  if (!result.program.compiled) {
    return { errors: ["NO_COMPILED"], recorded: [] };
  }
  const story = new RuntimeStory(result.program.compiled as Record<string, any>);
  const recorded: unknown[] = [];
  story.BindExternalFunction("host_record", (v: unknown) => {
    recorded.push(v);
    return v;
  });
  const errors: string[] = [];
  story.onError = (m: string) => errors.push(m);
  story.ContinueMaximally();
  return { errors, recorded };
}

describe("if-then-else expressions", () => {
  test("statement, paren, call-arg, and operand positions", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local a = if true then 1 else 2
host_record(a)
local b = if false then 1 else 2
host_record(b)
host_record((if true then "A" else "B"))
host_record(if false then "A" else "B")
host_record(7 + if true then 10 else 20)
host_record((7 + if false then 10 else 20) == 27)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([1, 2, "A", "B", 17, true]);
  });

  test("elseif chains evaluate in order", () => {
    // NB: don't name the helper `chain` — that's a reserved sparkdown
    // alternator keyword (`queue|chain|cycle|shuffle`) and hijacks the
    // parse.
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function pick(c1, c2, c3)
return if c1 then 10 elseif c2 then 20 elseif c3 then 30 else 40
end

function run()
host_record(pick(false, false, false))
host_record(pick(false, false, true))
host_record(pick(false, true, true))
host_record(pick(true, true, true))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([40, 30, 20, 10]);
  });

  test("only the taken arm evaluates", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local counter = 0
local function add(n)
counter += n
return counter
end
local r = if true then add(7) else add(17)
host_record(r)
host_record(counter)
local r2 = if false then add(100) else add(3)
host_record(r2)
host_record(counter)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([7, 7, 10, 10]);
  });

  test("nested ternary in condition position, with and without parens", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function truthy()
return true
end

function run()
host_record((if (if truthy() then false else true) then 10 else 20))
host_record((if if truthy() then false else true then 10 else 20))
host_record(if truthy() then 10 else if truthy() then 20 else 30)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([20, 20, 10]);
  });
});
