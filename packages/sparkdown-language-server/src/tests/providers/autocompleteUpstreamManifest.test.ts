import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { BUG } from "./autocompleteBugs";
import { UPSTREAM_CASES } from "./autocompleteUpstreamCases";

// Holds the port to its manifest: every upstream case is accounted for, every
// ported or adapted case has at least one test, the tests name no case the
// manifest does not list as tested, and every skipped case names a filed Bug.

const DIRECTORY = new URL(".", import.meta.url);

const suiteFiles = readdirSync(DIRECTORY).filter((name) =>
  /^autocomplete(?!UpstreamManifest).*\.test\.ts$/.test(name),
);

const CASE_CALL =
  /upstreamCase(?:\.bug\(\s*(?:[\w.]+|\[[^\]]*\])\s*,|\()\s*"([^"]+)"/g;

const testedCases = new Map<string, string[]>();
for (const file of suiteFiles) {
  const source = readFileSync(new URL(file, DIRECTORY), "utf8");
  for (const match of source.matchAll(CASE_CALL)) {
    const files = testedCases.get(match[1]!) ?? [];
    testedCases.set(match[1]!, [...files, file]);
  }
}

describe("autocomplete · upstream manifest", () => {
  test("lists all 215 upstream cases", () => {
    expect(Object.keys(UPSTREAM_CASES)).toHaveLength(215);
  });

  test("gives every case without a test a reason", () => {
    for (const [name, entry] of Object.entries(UPSTREAM_CASES)) {
      if (entry.status === "n/a") {
        expect(entry.reason.trim(), name).not.toBe("");
      }
    }
  });

  test("has a test for every ported and adapted case", () => {
    const untested = Object.entries(UPSTREAM_CASES)
      .filter(([name, entry]) => entry.status !== "n/a" && !testedCases.has(name))
      .map(([name]) => name);
    expect(untested).toEqual([]);
  });

  test("names only ported and adapted cases in its tests", () => {
    const unknown = [...testedCases.keys()].filter(
      (name) => !UPSTREAM_CASES[name] || UPSTREAM_CASES[name]!.status === "n/a",
    );
    expect(unknown).toEqual([]);
  });

  test("names a filed Bug for every skipped case", () => {
    for (const [name, number] of Object.entries(BUG)) {
      expect(number, name).toBeGreaterThan(0);
    }
  });
});
