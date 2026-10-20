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

  test("the table form after a condition still becomes arms", () => {
    expect(formatSource('{plural(n){one="is",other="are"}}\n')).toBe('{plural(n)|one="is"|other="are"}\n');
  });
});
