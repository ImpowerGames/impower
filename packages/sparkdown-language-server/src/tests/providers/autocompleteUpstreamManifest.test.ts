import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { BUG } from "./autocompleteBugs";
import { UPSTREAM_CASES, UPSTREAM_COMMIT } from "./autocompleteUpstreamCases";

// Holds the port to its manifest: every upstream case is accounted for, every
// ported or adapted case has at least one test, the tests name no case the
// manifest does not list as tested, every skipped case names its Bugs from
// the Bug map, and the manifest's upstream commit is the one the vendored
// Luau suite is pinned to.

const DIRECTORY = new URL(".", import.meta.url);

const suiteFiles = readdirSync(DIRECTORY).filter((name) =>
  /^autocomplete(?!UpstreamManifest).*\.test\.ts$/.test(name),
);
const sources = suiteFiles.map((file) => ({
  file,
  source: readFileSync(new URL(file, DIRECTORY), "utf8"),
}));

const CASE_CALL =
  /upstreamCase(?:\.bug\(\s*(?:[\w.]+|\[[^\]]*\])\s*,|\()\s*"([^"]+)"/g;
// The first argument of every skipped registration: one Bug or a list.
const BUG_CALL = /(?:upstreamCase\.bug|sparkdownBug)\(\s*(\[[^\]]*\]|[^,]+),/g;

const testedCases = new Map<string, string[]>();
for (const { file, source } of sources) {
  for (const match of source.matchAll(CASE_CALL)) {
    const files = testedCases.get(match[1]!) ?? [];
    testedCases.set(match[1]!, [...files, file]);
  }
}

describe("autocomplete · upstream manifest", () => {
  test("lists all 215 upstream cases", () => {
    expect(Object.keys(UPSTREAM_CASES)).toHaveLength(215);
  });

  test("names the commit the vendored Luau suite is pinned to", () => {
    const vendoring = readFileSync(
      new URL(
        "../../../../sparkdown/src/tests/luau-conformance/upstream/VENDORING.md",
        DIRECTORY,
      ),
      "utf8",
    );
    expect(vendoring).toContain(`\`${UPSTREAM_COMMIT}\``);
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

  test("names every skipped case's Bugs from the Bug map", () => {
    const known = new Set(Object.keys(BUG));
    const refused: string[] = [];
    let calls = 0;
    for (const { file, source } of sources) {
      for (const match of source.matchAll(BUG_CALL)) {
        calls += 1;
        const names = match[1]!.replace(/^\[|\]$/g, "").split(",").map((part) => part.trim());
        for (const name of names) {
          const key = /^BUG\.(\w+)$/.exec(name)?.[1];
          if (!key || !known.has(key)) refused.push(`${file}: ${name}`);
        }
      }
    }
    expect(calls).toBeGreaterThan(0);
    expect(refused).toEqual([]);
    for (const [name, number] of Object.entries(BUG)) {
      expect(number, name).toBeGreaterThan(0);
    }
  });
});
