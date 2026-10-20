// The false-positive corpus (`scripts/lintCorpus.ts`) reads each Luau
// conformance file wrapped in `function run()`. GlobalUsedAsLocal reports
// what a function of the file holds, and only the wrapper's own warning is
// left out (I-607).

import { describe, expect, test } from "vitest";
import { conformanceScript, lint } from "../../../scripts/lintCorpus.ts";

const found = (fileText: string) => {
  const script = conformanceScript("conformance/sample.luau", fileText);
  return lint([script], [script])
    .filter((finding) => finding.code === "GlobalUsedAsLocal")
    .map((finding) => `${finding.label}:${finding.line} ${finding.message}`);
};
const only = (name: string, fn: string) => `Global '${name}' is only used in the enclosing function '${fn}'; consider changing it to local`;

describe("GlobalUsedAsLocal in the corpus's conformance files", () => {
  test("a global only the corpus's wrapper holds is the file's own, and not reported", () => {
    expect(found("score = 1\nprint(score)\n")).toEqual([]);
  });

  test("a global only one of the file's functions uses is reported, on the file's own line", () => {
    expect(found("local function tally()\n  total = 1\n  return total\nend\nprint(tally())\n")).toEqual([
      `conformance/sample.luau:2 ${only("total", "tally")}`,
    ]);
  });

  test.each([
    ["a local function", "local function run()"],
    ["a generic function", "local function run<T>(value: T)"],
    ["a function with a comment before its name", "local function --[[name]] run()"],
  ])("%s the file names run is reported", (_label, header) => {
    expect(found(`${header}\n  score = 1\n  return score\nend\nprint(run(1))\n`)).toEqual([
      `conformance/sample.luau:2 ${only("score", "run")}`,
    ]);
  });
});
