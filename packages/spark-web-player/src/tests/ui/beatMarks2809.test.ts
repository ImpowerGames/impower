import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createDOMHarness, flushMicrotasks, untilShown } from "./domTestHarness";

const SOURCE = `

scene start
  HERO: The first line plays.
  HERO: The second line plays.
end
`;

const lineOf = (text: string) =>
  SOURCE.split("\n").findIndex((l) => l.includes(text));

const FIRST = lineOf("The first line plays.");
const SECOND = lineOf("The second line plays.");

const beatEntries = () =>
  [
    ...performance.getEntriesByType("mark"),
    ...performance.getEntriesByType("measure"),
  ].filter((entry) => entry.name.startsWith("beat "));

const kinds = (line: number) =>
  beatEntries()
    .filter((entry) => entry.name.includes(`main.sd:${line + 1} #`))
    .map((entry) => `${entry.entryType} ${entry.name.split(" ")[1]}`)
    .sort();

const ALL_KINDS = [
  "mark fired",
  "mark ready",
  "mark received",
  "measure wait",
];

const clearBeatEntries = () => {
  for (const entry of beatEntries()) {
    performance.clearMarks(entry.name);
    performance.clearMeasures(entry.name);
  }
};

beforeEach(clearBeatEntries);
afterEach(clearBeatEntries);

describe("beat performance marks (I-2809)", () => {
  test("a beat records received, ready and fired marks and a wait measure named with its script line", async () => {
    const h = createDOMHarness(SOURCE, FIRST, { compose: true });
    await h.ready;
    await h.rerender(SOURCE, FIRST);
    await untilShown(h.overlay);

    expect(kinds(FIRST)).toEqual(ALL_KINDS);
    const named = beatEntries().filter((entry) =>
      entry.name.includes(`main.sd:${FIRST + 1} #`),
    );
    const beatIds = new Set(named.map((entry) => entry.name.split(" #")[1]));
    expect(beatIds.size).toBe(1);
    const at = (kind: string) =>
      named.find((entry) => entry.name.startsWith(`beat ${kind} `))!;
    expect(at("ready").startTime).toBeGreaterThanOrEqual(
      at("received").startTime,
    );
    expect(at("fired").startTime).toBeGreaterThanOrEqual(
      at("ready").startTime,
    );
    expect(at("wait").startTime).toBe(at("received").startTime);
    expect(at("wait").duration).toBeCloseTo(
      at("fired").startTime - at("received").startTime,
      6,
    );
  });

  test("the entries of an earlier beat are gone after a later one fires", async () => {
    const h = createDOMHarness(SOURCE, FIRST, { compose: true });
    await h.ready;
    await h.rerender(SOURCE, FIRST);
    await untilShown(h.overlay);
    expect(kinds(FIRST)).toEqual(ALL_KINDS);

    await h.preview(SECOND);
    await flushMicrotasks(10);
    await untilShown(h.overlay);

    expect(kinds(SECOND)).toEqual(ALL_KINDS);
    expect(kinds(FIRST)).toEqual([]);
    expect(
      beatEntries().every((entry) =>
        entry.name.includes(`main.sd:${SECOND + 1} #`),
      ),
    ).toBe(true);
  });
});
