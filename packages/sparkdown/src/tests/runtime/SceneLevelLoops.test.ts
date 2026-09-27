// A loop written directly in a scene's body, or at the top level, runs in that
// flow the same as one written in a function: every iteration applies every
// statement of its body, and the flow continues after the loop ends. A loop
// written without `do` has no body and is a compile error.

import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";

const run = (source: string) => {
  const ctx = makeRuntimeStoryFromSource(source);
  expect(ctx.errorMessages).toEqual([]);
  return ctx.story.ContinueMaximally();
};

const inScene = (body: string) => `store n = 0
store seen = 0
-> s
scene s
${body}
  fin

end
`;

describe("a loop in a scene's body", () => {
  test("a while loop repeats its body until its condition is false", () => {
    expect(
      run(
        inScene(`  while n < 2 do
    n = n + 1
    seen = seen + 10
  end
  n is {n}, seen is {seen}.`),
      ),
    ).toBe("n is 2, seen is 20.\n");
  });

  test("a numeric for loop runs once per value in its range", () => {
    expect(
      run(
        inScene(`  for i = 1, 3 do
    seen = seen + i
  end
  seen is {seen}.`),
      ),
    ).toBe("seen is 6.\n");
  });

  test("a generic for loop runs once per entry", () => {
    expect(
      run(
        inScene(`  for _, v in ipairs({4, 5, 6}) do
    seen = seen + v
  end
  seen is {seen}.`),
      ),
    ).toBe("seen is 15.\n");
  });

  test("a repeat loop runs its body until its condition is true", () => {
    expect(
      run(
        inScene(`  repeat
    n = n + 1
  until n >= 3
  n is {n}.`),
      ),
    ).toBe("n is 3.\n");
  });

  test("a do block runs its body once", () => {
    expect(
      run(
        inScene(`  do
    n = n + 5
  end
  n is {n}.`),
      ),
    ).toBe("n is 5.\n");
  });

  test("a break leaves the loop", () => {
    expect(
      run(
        inScene(`  while true do
    n = n + 1
    if n >= 4 then
      break
    end
  end
  n is {n}.`),
      ),
    ).toBe("n is 4.\n");
  });

  test("a display line in the body is shown on every iteration", () => {
    expect(
      run(
        inScene(`  while n < 3 do
    n = n + 1
    Step {n}.
  end
  Done.`),
      ),
    ).toBe("Step 1.\nStep 2.\nStep 3.\nDone.\n");
  });

  test("a while loop in a function called from the scene matches", () => {
    expect(
      run(`-> s
function count()
  local n = 0
  local seen = 0
  while n < 2 do
    n = n + 1
    seen = seen + 10
  end
  return seen
end
scene s
  & local total = count()
  total is {total}.
  fin

end
`),
    ).toBe("total is 20.\n");
  });
});

describe("a loop at the top level", () => {
  test("a while loop repeats its body until its condition is false", () => {
    expect(
      run(`store n = 0
while n < 2 do
  n = n + 1
end
n is {n}.
`),
    ).toBe("n is 2.\n");
  });
});

describe("a loop without do", () => {
  test.each([
    ["while", "while n < 2"],
    ["for", "for i = 1, 3"],
  ])("a %s loop in a scene is a compile error", (keyword, header) => {
    const ctx = makeRuntimeStoryFromSource(
      inScene(`  ${header}
    & n = n + 1
  end
  n is {n}.`),
    );
    expect(ctx.errorMessages).toEqual([
      expect.stringContaining(`Expected \`do\` after the \`${keyword}\` loop's condition`),
    ]);
  });
});
