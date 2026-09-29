// A function called from a `{...}` interpolation runs while the string the
// interpolation builds is open. A newline it pushes before it has shown
// anything is dropped, as it is when the same function runs outside a string:
// every pass of a `while` loop's non-inline body pushes one.
//
// Guarded here:
//   1. A loop's pass newlines never reach the displayed line, even when the
//      function prints after the loop.
//   2. They are not held in the open string until the function returns, so the
//      output stream does not grow with the number of passes.
//   3. A string opened inside the function keeps its literal newlines.

import { describe, expect, test } from "vitest";
// The harness first: it loads the engine in the order its classes need.
import { makeRuntimeStoryFromSource, runToEnd } from "./runtimeTestHarness";
import { ControlCommand } from "../../inkjs/engine/ControlCommand";
import { StringValue } from "../../inkjs/engine/Value";

// Runs the story as `Game` does, recording the most newlines that sat after
// the innermost open `BeginString` at any push.
const run = (source: string) => {
  const ctx = makeRuntimeStoryFromSource(source);
  expect(ctx.errorMessages).toEqual([]);
  ctx.story.collapseWhitespace = false;
  const state = ctx.story.state;
  const push = state.PushToOutputStream.bind(state);
  let most = 0;
  state.PushToOutputStream = (obj) => {
    push(obj);
    const stream = state.outputStream;
    let held = 0;
    for (let i = stream.length - 1; i >= 0; i--) {
      const o = stream[i];
      if (
        o instanceof ControlCommand &&
        o.commandType == ControlCommand.CommandType.BeginString
      ) {
        most = Math.max(most, held);
        break;
      }
      if (o instanceof StringValue && o.isNewline) held++;
    }
  };
  return { text: runToEnd(ctx.story), most };
};

const loopThen = (passes: number, after: string) => `function f()
  local n = 0
  while n < ${passes} do
    n = n + 1
  end
${after}  return n
end

BOB:
  Spinning {f()}.
`;

describe("loop newlines inside a function called from an interpolation", () => {
  test("a print after the loop leaves the loop's newlines out of the displayed line", () => {
    expect(run(loopThen(3, `  print("hi")\n`)).text).toBe("Spinning hi3.\n");
  });

  test("newlines held inside the open string do not grow with the loop's passes", () => {
    const thousand = run(loopThen(1000, ""));
    expect(thousand.text).toBe("Spinning 1000.\n");
    expect(thousand.most).toBeLessThanOrEqual(1);
  });

  // Controls: cases the fix must leave exactly as they were.

  test("a loop that makes no pass is unaffected", () => {
    expect(run(loopThen(0, `  print("hi")\n`)).text).toBe("Spinning hi0.\n");
  });

  test("a string built inside the function keeps its literal newline", () => {
    expect(
      run(`function g()
  local n = 0
  while n < 2 do
    n = n + 1
  end
  return #("a\\nb")
end

BOB:
  Length {g()}.
`).text,
    ).toBe("Length 3.\n");
  });
});
