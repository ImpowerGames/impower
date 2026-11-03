import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { beforeAll, describe, expect, test } from "vitest";
import {
  bodyProbe,
  bodyProbes,
  type BodyProbe,
  closesAtItsBrace,
  readCorpus,
  treeBodyFailures,
  vscodeBodyFailures,
} from "./structBodyBoundaryCorpus";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../../..");

const CORPUS_BODIES = 252;

const HEADER_SHAPED_ENTRIES = [
  "theme label {",
  "}",
  "theme label",
  "function label",
  "function f()",
  "run label",
  "run x",
  "include label",
  "include shared.sd",
  "store label",
  "store trust",
  "store trust: number = 5",
  "style panel as base {",
  "}",
  "define hero as character with",
  "type K = number",
  "external message(x)",
  "& store x = 5",
  "@[deprecated] function f()",
  "@[deprecated{reason = [====[x]y]====]}] function s() return 6 end",
  "component card(title) {",
  "}",
];

const PINNED = ["style", "animation", "theme", "morph", "layout", "component", "screen"].flatMap(
  (keyword) => [
    bodyProbe("header-shaped entries", keyword, HEADER_SHAPED_ENTRIES),
    ...HEADER_SHAPED_ENTRIES.filter((entry) => entry !== "}" && !entry.endsWith("{")).map(
      (entry) => bodyProbe(`header-shaped entry ${entry}`, keyword, [entry]),
    ),
  ],
);

let probes: BodyProbe[] = [];
let corpusCount = 0;

beforeAll(() => {
  const corpus = bodyProbes(readCorpus(ROOT));
  corpusCount = corpus.length;
  probes = [...corpus, ...PINNED];
}, 600000);

const described = (failures: { path: string; text: string }[]) =>
  failures.map((failure) => `${failure.path}\n${failure.text}`);

describe("a struct keyword brace body whose entries all start at column 0", () => {
  test("the corpus supplies at least the closed bodies the repository holds today", () => {
    expect(corpusCount).toBeGreaterThanOrEqual(CORPUS_BODIES);
  });

  test("header-shaped entries stay inside the body and it closes at its own `}`", () => {
    expect(
      described(
        PINNED.flatMap((probe) =>
          [probe, { ...probe, probe: probe.indented }]
            .filter((variant) => !closesAtItsBrace(variant))
            .map((variant) => ({ path: probe.path, text: variant.probe })),
        ),
      ),
    ).toEqual([]);
  }, 600000);

  test("ends where the same body indented ends, in the tree engine", () => {
    expect(described(treeBodyFailures(probes))).toEqual([]);
  }, 600000);

  test("ends where the same body indented ends, in VS Code's engine", async () => {
    expect(described(await vscodeBodyFailures(probes))).toEqual([]);
  }, 600000);
});
