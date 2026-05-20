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
  const errors: string[] = [];
  if (!result.program.compiled) {
    return { errors: ["NO_COMPILED"], recorded: [] };
  }
  const story = new RuntimeStory(result.program.compiled as Record<string, any>);
  const recorded: unknown[] = [];
  story.BindExternalFunction("host_record", (v: unknown) => {
    recorded.push(v);
    return v;
  });
  story.onError = (m: string) => errors.push(m);
  story.ContinueMaximally();
  return { errors, recorded };
}

describe("while loop", () => {
  test("counter mutation reaches outer scope", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local n = 0
while n < 3 do
n = n + 1
end
host_record(n)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([3]);
  });

  test("body fires for each iteration", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local n = 0
while n < 3 do
host_record(n)
n = n + 1
end
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([0, 1, 2]);
  });

  test("zero iterations — condition false from start", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local n = 100
while n < 3 do
n = n + 1
end
host_record(n)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([100]);
  });

  test("loop body can read AND mutate multiple outer locals", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local i = 0
local total = 0
while i < 5 do
total = total + i
i = i + 1
end
host_record(total)
host_record(i)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([10, 5]);
  });

  test("loops nest — inner while inside outer while", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local i = 0
local sum = 0
while i < 3 do
local j = 0
while j < 3 do
sum = sum + 1
j = j + 1
end
i = i + 1
end
host_record(sum)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([9]);
  });
});

describe("numeric for loop", () => {
  test("for i = 1, 3 do — counts 1 through 3", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
for i = 1, 3 do
host_record(i)
end
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([1, 2, 3]);
  });

  test("for i = 1, 10, 2 do — explicit step of 2", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
for i = 1, 10, 2 do
host_record(i)
end
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([1, 3, 5, 7, 9]);
  });

  test("descending: for i = 5, 1, -1 do", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
for i = 5, 1, -1 do
host_record(i)
end
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([5, 4, 3, 2, 1]);
  });

  test("zero iterations when start > stop with positive step", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
for i = 10, 1 do
host_record(i)
end
host_record(99)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([99]);
  });

  test("loop variable doesn't leak past the loop", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local i = 100
for i = 1, 3 do
end
host_record(i)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([100]);
  });

  test("stop expression is snapshot at entry (mutating outer stop doesn't extend the loop)", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local stop = 3
for i = 1, stop do
host_record(i)
stop = 100
end
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([1, 2, 3]);
  });
});

describe("repeat ... until loop", () => {
  test("body runs at least once even when condition is true on entry", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local n = 0
repeat
n = n + 1
host_record(n)
until n >= 1
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([1]);
  });

  test("counts up until condition becomes true", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local n = 0
repeat
n = n + 1
host_record(n)
until n >= 3
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([1, 2, 3]);
  });

  test("until condition sees body locals (Luau scope rule)", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local i = 0
repeat
i = i + 1
local done = i >= 2
host_record(i)
until done
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([1, 2]);
  });
});

describe("break and continue", () => {
  test("break exits the innermost while loop", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local i = 0
while i < 10 do
i = i + 1
if i >= 3 then
break
end
host_record(i)
end
host_record(99)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([1, 2, 99]);
  });

  test("continue skips to next iteration of a while loop", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local i = 0
while i < 5 do
i = i + 1
if i == 3 then
continue
end
host_record(i)
end
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([1, 2, 4, 5]);
  });

  test("break exits a numeric for loop", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
for i = 1, 10 do
if i > 4 then
break
end
host_record(i)
end
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([1, 2, 3, 4]);
  });

  test("continue in numeric for still applies the step", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
for i = 1, 6 do
if i == 3 then
continue
end
host_record(i)
end
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([1, 2, 4, 5, 6]);
  });

  test("break exits a repeat-until loop", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local n = 0
repeat
n = n + 1
if n == 3 then
break
end
host_record(n)
until n >= 100
host_record(999)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([1, 2, 999]);
  });

  test("nested loops — break exits only the innermost", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
for i = 1, 3 do
for j = 1, 3 do
if j == 2 then
break
end
host_record(j)
end
host_record(i)
end
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([1, 1, 1, 2, 1, 3]);
  });
});

describe("do ... end block", () => {
  test("body runs once", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local n = 1
do
n = n + 10
end
host_record(n)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([11]);
  });

  test("inner local shadows outer for the block's duration", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local x = 1
do
local x = 99
host_record(x)
end
host_record(x)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([99, 1]);
  });

  test("outer reassignment from inside the block propagates", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local x = 1
do
x = 7
end
host_record(x)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([7]);
  });
});

describe("generic for-in loop (iterator protocol)", () => {
  test("iterates a closure-based user iterator (range)", () => {
    // The classic "stateful iterator" form: `range(a, b)` returns a
    // closure that walks a..b. Each iteration calls the closure with
    // (state, ctrl); the closure ignores those args and uses its
    // captured `i` instead. When the closure returns nil (i > b),
    // the loop exits.
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function range(start, stop)
local i = start - 1
return function()
i = i + 1
if i <= stop then
return i
end
end
end

function run()
for n in range(1, 5) do
host_record(n)
end
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([1, 2, 3, 4, 5]);
  });

  test("zero iterations — iterator returns nil on first call", () => {
    // An iterator that immediately runs out: the closure returns
    // without producing a value, the loop should terminate before
    // executing the body once.
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function empty_iter()
return function()
local done = true
end
end

function run()
for n in empty_iter() do
host_record(n)
end
host_record(99)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([99]);
  });

  test("break exits the for-in loop", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function range(start, stop)
local i = start - 1
return function()
i = i + 1
if i <= stop then
return i
end
end
end

function run()
for n in range(1, 10) do
if n >= 4 then
break
end
host_record(n)
end
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([1, 2, 3]);
  });

  test("continue skips to next iteration of the for-in loop", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function range(start, stop)
local i = start - 1
return function()
i = i + 1
if i <= stop then
return i
end
end
end

function run()
for n in range(1, 5) do
if n == 3 then
continue
end
host_record(n)
end
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([1, 2, 4, 5]);
  });
});
