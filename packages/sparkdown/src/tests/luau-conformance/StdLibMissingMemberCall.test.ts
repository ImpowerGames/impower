// A call to a member a standard library table does not have names the
// missing member, as the uncalled form does, never the library (#915).
import { describe, expect, test } from "vitest";
import {
  diagnoseDetailed,
  diagnoseWithLints,
} from "./diagnosticTestHarness";

const spans = (source: string) =>
  diagnoseDetailed(source).map((d) => [
    d.message,
    d.range?.start,
    d.range?.end,
  ]);

describe("calling a missing stdlib member", () => {
  test("names the member at top level", () => {
    expect(spans("& print(table.nogetn())\n")).toEqual([
      [
        "Cannot find item or path named `table.nogetn`",
        { line: 0, character: 8 },
        { line: 0, character: 20 },
      ],
    ]);
  });

  test("names the member of another library", () => {
    expect(diagnoseWithLints("& print(math.nosuch(1))\n")).toEqual([
      "Cannot find item or path named `math.nosuch`",
    ]);
  });

  test("names the member inside a returned anonymous function", () => {
    expect(
      diagnoseWithLints(
        "function run()\nreturn function ()\n    print(table.nogetn())\nend\nend\n",
      ),
    ).toEqual(["Cannot find item or path named `table.nogetn`"]);
  });

  test("an existing member reports nothing", () => {
    expect(diagnoseWithLints('& print(table.concat({"a"}))\n')).toEqual([]);
  });

  test("a deprecated member keeps its deprecation", () => {
    expect(diagnoseWithLints("& print(table.getn({}))\n")).toEqual([
      "`table.getn(t)` is deprecated in Luau. Use the length operator `#t` instead.",
    ]);
  });

  test("an unknown global keeps its message", () => {
    expect(diagnoseWithLints("& print(foo.bar())\n")).toEqual([
      "Cannot find variable named `foo`",
    ]);
  });
});
