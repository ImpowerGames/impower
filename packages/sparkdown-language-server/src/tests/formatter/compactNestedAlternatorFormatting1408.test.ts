// An alternator in a candidate's head whose `end` stands against the outer
// `|` reads as the spaced spelling does (I-1408), so formatting gives the
// two spellings the same output.

import { describe, expect, test } from "vitest";
import { formatSource } from "./formatSource";

const spacedOf = (compact: string) => compact.replace(/\bend\|/g, "end |");

describe("formatting a nested alternator whose end stands against the outer bar", () => {
  for (const compact of [
    'function f()\n  local v = match match("x") | x = "mage" end| mage = "yes" end local after = 7\n  return after\nend\n',
    'function f()\n  match match("x") | x = print(1) end| mage = print(2)\n    | other = print(3)\n  end\n  return 3\nend\n',
    'function f()\n    match match("x") | x = print(1) end| mage = print(2)\n  | other = print(3)\n      end\n  return 3\nend\n',
    "function f()\n  match function() return 1 end| other = print(2) end local after = 7\n  return after\nend\n",
    'Value {cycle cycle match("x") | x = "a" end| "b" end|"c" end}.\n',
    'store s = cycle match("x") | x = "a" end| "b" end\n',
    'Value {cycle match("x") | x = "a" end| end}.\n',
    'Value {cycle match("x") | x = "a" end|}.\n',
    'function f()\n  match match("x") | x = print(1) end|\n    | other = print(3)\n  end\nend\n',
  ]) {
    test(`formats ${JSON.stringify(compact)} as its spaced spelling`, () => {
      expect(formatSource(compact)).toBe(formatSource(spacedOf(compact)));
    });
  }
});
