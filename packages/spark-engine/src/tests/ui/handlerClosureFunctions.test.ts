// A handler's closure (`@click={ ... }`) is a function body, as in Luau
// (I-1332): a `local function` or `const function` declared in it compiles
// and a click runs it, as the same declaration does in a plain function body.

import { describe, expect, test } from "vitest";
import { createHarness } from "./harness/uiTestHarness";

const gText = (h: ReturnType<typeof createHarness>): string | undefined => {
  const m = h
    .snapshotFiltered("ui/update")
    .find(
      (x: any) =>
        typeof x.params?.content?.text === "string" &&
        x.params.content.text.startsWith("G:"),
    ) as any;
  return m?.params?.content?.text;
};

const clickSetsG = async (source: string) => {
  const h = createHarness(source, 0, { reactive: true });
  await h.ready;
  const buttonId = h.observedElementIds()[0];
  expect(buttonId).toBeTruthy();
  h.reset();
  h.emitEvent("click", buttonId!);
  return gText(h);
};

const layout = (handler: string, after = "") => `store g = 0
${after}layout form with
  text "G: {g}"
  button "Go" @click={ ${handler} }
end
`;

describe("a function declared in a handler's closure", () => {
  test.each([
    ["a local function", "local function x() return 1 end g = x()"],
    ["a const function", "const function x() return 1 end g = x()"],
    ["a local function that calls itself", "local function x(n) if n > 0 then return x(n - 1) end return 1 end g = x(2)"],
    ["a local function reading the event", "local function x() return event and 1 or 0 end g = x()"],
    ["a local function in a block", "do local function x() return 1 end g = x() end"],
    ["a local function reading the closure's local", "local n = 1 local function x() return n end g = x()"],
    ["a function value", "local f = function() return 1 end g = f()"],
    ["a function value reading the closure's local", "local n = 1 local f = function() return n end g = f()"],
  ])("%s runs when the element is clicked", async (_label, handler) => {
    expect(await clickSetsG(layout(handler))).toBe("G: 1");
  });

  test("a plain function's local function runs from a handler", async () => {
    const source = layout(
      "g = f()",
      "function f()\n  local function x() return 1 end\n  return x()\nend\n",
    );
    expect(await clickSetsG(source)).toBe("G: 1");
  });
});
