// A structural word whose rule holds no arms names a value (I-1310), so
// formatting leaves it as the call or name it is, and only an alternator's
// own form is rewritten or kept tight.

import { describe, expect, test } from "vitest";
import { formatSource } from "./formatSource";

describe("formatting a structural word that names a value", () => {
  for (const source of [
    "function f()\n  local match = print\n  match(1)\nend\n",
    "function f()\n  local s = queue({ a = 1 })\n  return s\nend\n",
    "function f()\n  local s = cycle(\"a\") .. \"b\"\n  return s\nend\n",
    "function f()\n  if c then match(2) end\nend\n",
  ]) {
    test(`leaves ${JSON.stringify(source)} as written`, () => {
      expect(formatSource(source)).toBe(source);
    });
  }

  test("an alternator's arms keep their place and its end aligns with its word", () => {
    const source = "function f(n)\n  match n\n    | a = print(1)\n  end\n  return (\n    chain\n      | \"first\"\n    end\n  )\nend\n";
    expect(formatSource(source)).toBe(source);
  });

  // A table after the condition is a call's argument in Luau, not arms, so
  // formatting never turns the call into an alternator.
  test("a table after a call of the word stays the call's", () => {
    const source = "function choose()\n  local match = function (n)\n    return function (t) return t.one end\n  end\n  return match(1){ one = \"is\", other = \"are\" }\nend\n";
    expect(formatSource(source)).toBe(source);
    expect(formatSource('{plural(n){one="is",other="are"}}\n')).not.toContain("|");
  });
});
