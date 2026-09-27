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

const STORES = `store n = 0
store seen = 0
`;

// The same body lines, placed in a scene (indented under `scene s`) or at the
// top level of the script.
const indent = (body: string) =>
  body
    .split("\n")
    .map((line) => (line ? `  ${line}` : line))
    .join("\n");
const places = {
  "in a scene": (body: string) => `${STORES}-> s
scene s
${indent(body)}
  fin

end
`,
  "at the top level": (body: string) => `${STORES}${body}
`,
};

const forms: [string, string, string][] = [
  [
    "a while loop repeats its body until its condition is false",
    `while n < 2 do
  n = n + 1
  seen = seen + 10
end
n is {n}, seen is {seen}.`,
    "n is 2, seen is 20.\n",
  ],
  [
    "a numeric for loop runs once per value in its range",
    `for i = 1, 3 do
  seen = seen + i
end
seen is {seen}.`,
    "seen is 6.\n",
  ],
  [
    "a generic for loop runs once per entry",
    `for _, v in ipairs({4, 5, 6}) do
  seen = seen + v
end
seen is {seen}.`,
    "seen is 15.\n",
  ],
  [
    "a repeat loop runs its body until its condition is true",
    `repeat
  n = n + 1
until n >= 3
n is {n}.`,
    "n is 3.\n",
  ],
  [
    "a do block runs its body once",
    `do
  n = n + 5
end
n is {n}.`,
    "n is 5.\n",
  ],
  [
    "a while loop with an empty body still evaluates its condition",
    `while tick() do end
n is {n}.`,
    "n is 1.\n",
  ],
  [
    "a break leaves the loop",
    `while true do
  n = n + 1
  if n >= 4 then
    break
  end
end
n is {n}.`,
    "n is 4.\n",
  ],
  [
    "a loop nested in a loop runs its body on every outer iteration",
    `while n < 2 do
  n = n + 1
  for i = 1, 3 do
    seen = seen + 1
  end
end
n is {n}, seen is {seen}.`,
    "n is 2, seen is 6.\n",
  ],
  [
    "a display line in the body is shown on every iteration",
    `while n < 3 do
  n = n + 1
  Step {n}.
end
Done.`,
    "Step 1.\nStep 2.\nStep 3.\nDone.\n",
  ],
];

// `tick` counts its calls and returns false, so an empty-bodied loop on it
// runs its condition once.
const TICK = `function tick()
  n = n + 1
  return false
end
`;

for (const [place, wrap] of Object.entries(places)) {
  describe(`a loop ${place}`, () => {
    test.each(forms)("%s", (_, body, expected) => {
      expect(run(TICK + wrap(body))).toBe(expected);
    });
  });

  describe(`a loop without do ${place}`, () => {
    test.each([
      ["while", "while n < 2"],
      ["for", "for i = 1, 3"],
    ])("a %s loop is a compile error", (keyword, header) => {
      const ctx = makeRuntimeStoryFromSource(
        wrap(`${header}
  & n = n + 1
end
n is {n}.`),
      );
      expect(ctx.errorMessages).toEqual([
        expect.stringContaining(
          `Expected \`do\` after the \`${keyword}\` loop's condition`,
        ),
      ]);
    });
  });
}

test("a while loop in a function called from a scene matches", () => {
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
