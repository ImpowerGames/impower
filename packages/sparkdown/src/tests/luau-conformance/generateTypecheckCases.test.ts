// Tests for how `scripts/generateTypecheckCases.ts` reads Luau's C++ test
// files into `upstream/typecheck-cases.json`: which cases it finds, and what
// it records about each.

import { describe, expect, test } from "vitest";
import { maskCpp, parseErrorKinds, parseTestFile } from "../../../scripts/generateTypecheckCases.ts";

const summary = (source: string) =>
  parseTestFile(source).map(({ name, fixture, doesNotPassNewSolver, disabledUpstream }) => ({
    name,
    ...(fixture ? { fixture } : {}),
    ...(doesNotPassNewSolver ? { doesNotPassNewSolver } : {}),
    ...(disabledUpstream !== undefined ? { disabledUpstream } : {}),
  }));

describe("reading the cases of a test file", () => {
  test("each case's name and fixture, with or without a fixture or a doctest decorator", () => {
    const source = [
      `TEST_SUITE_BEGIN("Example");`,
      `TEST_CASE_FIXTURE(Fixture, "plain")`,
      `{`,
      `}`,
      `TEST_CASE("no_fixture")`,
      `{`,
      `    BuiltinsFixture a;`,
      `}`,
      `TEST_CASE_FIXTURE(BuiltinsFixture, "timed" * doctest::timeout(LUAU_TIMEOUT))`,
      `{`,
      `}`,
      `TEST_SUITE_END();`,
    ].join("\n");
    expect(summary(source)).toEqual([
      { name: "plain", fixture: "Fixture" },
      { name: "no_fixture" },
      { name: "timed", fixture: "BuiltinsFixture" },
    ]);
  });

  test("Luau source in a raw string does not end a case early or start another", () => {
    const source = String.raw`TEST_CASE_FIXTURE(Fixture, "raw")
{
    CheckResult result = check(R"(
        local t = { "}" }
        -- TEST_CASE_FIXTURE(Fixture, "inside_the_snippet")
    )");
    check(R"LUA( local s = ")" )LUA");
}

TEST_CASE_FIXTURE(Fixture, "after")
{
}`;
    expect(summary(source)).toEqual([
      { name: "raw", fixture: "Fixture" },
      { name: "after", fixture: "Fixture" },
    ]);
  });

  test("a digit separator and a string continued on the next line are read as C++ reads them", () => {
    const source = String.raw`TEST_CASE_FIXTURE(Fixture, "separators")
{
    auto big = rep("x", 10'000);
    CHECK_EQ("first half \
second half }", message);
}

TEST_CASE_FIXTURE(Fixture, "next")
{
}`;
    expect(summary(source)).toEqual([
      { name: "separators", fixture: "Fixture" },
      { name: "next", fixture: "Fixture" },
    ]);
  });

  test("a guard over the whole body marks the case, a guard only in nested blocks marks it partly, and a guard in a comment does nothing", () => {
    const source = [
      `TEST_CASE_FIXTURE(Fixture, "whole")`,
      `{`,
      `    DOES_NOT_PASS_NEW_SOLVER_GUARD();`,
      `}`,
      `TEST_CASE_FIXTURE(Fixture, "part")`,
      `{`,
      `    {`,
      `        DOES_NOT_PASS_NEW_SOLVER_GUARD();`,
      `    }`,
      `    {`,
      `    }`,
      `}`,
      `TEST_CASE_FIXTURE(Fixture, "commented")`,
      `{`,
      `    // DOES_NOT_PASS_NEW_SOLVER_GUARD();`,
      `}`,
    ].join("\n");
    expect(summary(source)).toEqual([
      { name: "whole", fixture: "Fixture", doesNotPassNewSolver: true },
      { name: "part", fixture: "Fixture", doesNotPassNewSolver: "partly" },
      { name: "commented", fixture: "Fixture" },
    ]);
  });

  test("a case in an #if 0 region is disabled with its directive, and one after #else is not", () => {
    const source = [
      `#if 0 // CLI-1: flaky`,
      `TEST_CASE_FIXTURE(Fixture, "off")`,
      `{`,
      `#if defined(_DEBUG)`,
      `    int x = 1;`,
      `#endif`,
      `}`,
      `#else`,
      `TEST_CASE_FIXTURE(Fixture, "on")`,
      `{`,
      `}`,
      `#endif`,
      `#ifdef _WIN32`,
      `TEST_CASE_FIXTURE(Fixture, "configured")`,
      `{`,
      `}`,
      `#endif`,
    ].join("\n");
    expect(summary(source)).toEqual([
      { name: "off", fixture: "Fixture", disabledUpstream: "#if 0 // CLI-1: flaky" },
      { name: "on", fixture: "Fixture" },
      { name: "configured", fixture: "Fixture" },
    ]);
  });

  test("a case inside a block comment is listed as commented out, in its place", () => {
    const source = [
      `TEST_CASE_FIXTURE(Fixture, "before")`,
      `{`,
      `}`,
      `/*`,
      `TEST_CASE_FIXTURE(Fixture, "shelved")`,
      `{`,
      `    CHECK(true);`,
      `}`,
      `*/`,
      `/* Don't mistake this prose for code. */`,
      `TEST_CASE_FIXTURE(Fixture, "after")`,
      `{`,
      `}`,
    ].join("\n");
    expect(summary(source)).toEqual([
      { name: "before", fixture: "Fixture" },
      { name: "shelved", fixture: "Fixture", disabledUpstream: "commented out" },
      { name: "after", fixture: "Fixture" },
    ]);
  });

  test("CRLF line breaks read the same as LF", () => {
    const source = `#if 0\nTEST_CASE_FIXTURE(Fixture, "off")\n{\n}\n#endif\nTEST_CASE_FIXTURE(Fixture, "on")\n{\n}\n`;
    expect(summary(source.replace(/\n/g, "\r\n"))).toEqual(summary(source));
  });
});

describe("reading Luau's error kinds", () => {
  test("they are the alternatives of TypeErrorData, in order", () => {
    const header = `struct TypeError;\nusing TypeErrorData = Variant<\n    TypeMismatch,\n    UnknownSymbol,\n    SyntaxError>;\n`;
    expect(parseErrorKinds(header)).toEqual(["TypeMismatch", "UnknownSymbol", "SyntaxError"]);
  });

  test("a header without TypeErrorData is refused", () => {
    expect(() => parseErrorKinds("struct Nothing;")).toThrow(/TypeErrorData not found/);
  });
});

describe("masking C++", () => {
  test("comments and the contents of literals are blanked, keeping every length and line break", () => {
    const source = String.raw`a("x{", 'y'); // }
/* { */ R"(})" b`;
    const { masked, blockComments } = maskCpp(source);
    expect(masked).toHaveLength(source.length);
    expect(masked.split("\n").map((line) => line.length)).toEqual(source.split("\n").map((line) => line.length));
    expect(masked).not.toMatch(/[{}]/);
    expect(masked.replace(/\s+/g, " ").trim()).toBe(`a(" ", ' '); R" " b`);
    expect(blockComments).toEqual([{ from: source.indexOf("/*") + 2, to: source.indexOf("*/") }]);
  });
});
