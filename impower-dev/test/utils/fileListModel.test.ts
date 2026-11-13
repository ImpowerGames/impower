import { describe, expect, it } from "vitest";
import {
  ago,
  availableName,
  bytesLabel,
  copyName,
  defaultName,
  holdingsLabel,
  NAME_MESSAGES,
  parseSort,
  referenceCounts,
  rowLine,
  sortEntries,
  sortLabel,
  sortMenu,
  storyOrder,
  storyPositions,
  UNREACHED,
  UNTITLED_SCRIPT,
  validName,
  type ListEntry,
  type Reference,
} from "../../src/modules/spark-editor/utils/fileListModel";

const HOUR = 3600_000;
const NOW = Date.UTC(2026, 10, 5, 12);

const entry = (
  path: string,
  facts: Partial<ListEntry> = {},
): ListEntry => ({
  kind: "file",
  path,
  name: path.split("/").pop()!,
  modified: 0,
  size: 0,
  uses: 0,
  position: UNREACHED,
  ...facts,
});

const fixture: ListEntry[] = [
  entry("Scripts/beta.sd", { modified: NOW - 3 * HOUR, size: 900, uses: 2, position: 2 }),
  entry("Scripts/alpha.sd", { modified: NOW - 1 * HOUR, size: 100, uses: 0, position: UNREACHED }),
  entry("Scripts/gamma.sd", { modified: NOW - 2 * HOUR, size: 5000, uses: 1, position: 1 }),
  entry("main.sd", { pinned: true, modified: NOW - 9 * HOUR, size: 1, position: 0 }),
  entry("Scripts/zeta", { kind: "folder", modified: NOW - 5 * HOUR, size: 10, position: 3 }),
  entry("Scripts/eta", { kind: "folder", modified: NOW, size: 99999, position: UNREACHED }),
];

const order = (sort: string) => sortEntries(fixture, sort).map((e) => e.name);

describe("sort model", () => {
  it.each([
    ["name-asc", ["main.sd", "eta", "zeta", "alpha.sd", "beta.sd", "gamma.sd"]],
    ["name-desc", ["main.sd", "zeta", "eta", "gamma.sd", "beta.sd", "alpha.sd"]],
    ["modified-asc", ["main.sd", "zeta", "eta", "beta.sd", "gamma.sd", "alpha.sd"]],
    ["modified-desc", ["main.sd", "eta", "zeta", "alpha.sd", "gamma.sd", "beta.sd"]],
    ["size-asc", ["main.sd", "zeta", "eta", "alpha.sd", "beta.sd", "gamma.sd"]],
    ["size-desc", ["main.sd", "eta", "zeta", "gamma.sd", "beta.sd", "alpha.sd"]],
    ["uses-asc", ["main.sd", "eta", "zeta", "alpha.sd", "gamma.sd", "beta.sd"]],
    ["uses-desc", ["main.sd", "eta", "zeta", "beta.sd", "gamma.sd", "alpha.sd"]],
    ["story-asc", ["main.sd", "zeta", "eta", "gamma.sd", "beta.sd", "alpha.sd"]],
    ["story-desc", ["main.sd", "zeta", "eta", "beta.sd", "gamma.sd", "alpha.sd"]],
  ])("%s keeps Main first, folders next, and orders by its label", (sort, expected) => {
    expect(order(sort)).toEqual(expected);
  });

  it("reads the legacy keys asc, desc and story", () => {
    expect(parseSort("asc")).toEqual({ field: "name", direction: "asc" });
    expect(parseSort("desc")).toEqual({ field: "name", direction: "desc" });
    expect(parseSort("story")).toEqual({ field: "story", direction: "asc" });
    expect(order("asc")).toEqual(order("name-asc"));
    expect(order("desc")).toEqual(order("name-desc"));
    expect(order("story")).toEqual(order("story-asc"));
  });

  it("falls back to Name A to Z for an unknown key and to a field's first direction", () => {
    expect(parseSort(undefined)).toEqual({ field: "name", direction: "asc" });
    expect(parseSort("colour-asc")).toEqual({ field: "name", direction: "asc" });
    expect(parseSort("size")).toEqual({ field: "size", direction: "desc" });
  });

  it("labels the button and the menu's fields and directions", () => {
    expect(sortLabel("story-asc")).toMatchObject({ name: "Story", description: "story order, by first reached" });
    const menu = sortMenu("modified-asc");
    expect(menu.fields.map((f) => [f.label, f.checked, f.key])).toEqual([
      ["Name", false, "name-asc"],
      ["Modified", true, "modified-asc"],
      ["Size", false, "size-desc"],
      ["Uses", false, "uses-desc"],
      ["Story order", false, "story-asc"],
    ]);
    expect(menu.directions.map((d) => [d.label, d.checked])).toEqual([
      ["Oldest first", true],
      ["Newest first", false],
    ]);
    expect(sortMenu("uses-desc").directions.map((d) => d.label)).toEqual(["Least used first", "Most used first"]);
    expect(sortMenu("name-asc").directions.map((d) => d.label)).toEqual(["A to Z", "Z to A"]);
    expect(sortMenu("size-asc").directions.map((d) => d.label)).toEqual(["Smallest first", "Largest first"]);
    expect(sortMenu("story").directions.map((d) => d.label)).toEqual(["By first reached", "By last reached"]);
  });
});

describe("name rules", () => {
  it.each([
    ["", NAME_MESSAGES.empty],
    ["   ", NAME_MESSAGES.empty],
    ["..", NAME_MESSAGES.empty],
    ["a/b", NAME_MESSAGES.characters],
    ["what?", NAME_MESSAGES.characters],
    ["trailing.", NAME_MESSAGES.characters],
    ["con", NAME_MESSAGES.reserved],
    ["LPT1.notes", NAME_MESSAGES.reserved],
    ["x".repeat(121), NAME_MESSAGES.length],
  ])("refuses %j with its message", (value, message) => {
    expect(() => validName(value, ".sd")).toThrow(message);
  });

  it("adds the extension once and keeps inner spaces", () => {
    expect(validName("chapter one", ".sd")).toBe("chapter one.sd");
    expect(validName("chapter.sd", ".sd")).toBe("chapter.sd");
    expect(validName("Drafts")).toBe("Drafts");
  });

  it("refuses a name already used in the folder, in any case, except the item's own", () => {
    expect(() => availableName("Intro", ["intro.sd"], ".sd")).toThrow(NAME_MESSAGES.taken);
    expect(availableName("intro", ["intro.sd"], ".sd", "intro.sd")).toBe("intro.sd");
  });

  it("names a duplicate '<name> copy', then numbers it", () => {
    expect(copyName("intro", ["intro.sd"], ".sd")).toBe("intro copy.sd");
    expect(copyName("intro", ["intro.sd", "intro copy.sd"], ".sd")).toBe("intro copy 2.sd");
  });

  describe("a new script's default name", () => {
    const named = (siblings: string[]) => defaultName(UNTITLED_SCRIPT, siblings, ".sd");

    it("is 'Untitled script' in an empty folder", () => {
      expect(named([])).toBe("Untitled script.sd");
    });

    it("numbers past every taken name, starting at 2", () => {
      expect(named(["Untitled script.sd"])).toBe("Untitled script 2.sd");
      expect(named(["Untitled script.sd", "Untitled script 2.sd"])).toBe("Untitled script 3.sd");
    });

    it("treats a name taken in another case as taken", () => {
      expect(named(["untitled SCRIPT.sd"])).toBe("Untitled script 2.sd");
    });

    it("takes 'Untitled script' when only 'Untitled script 2' is taken", () => {
      expect(named(["Untitled script 2.sd"])).toBe("Untitled script.sd");
    });

    it("compares whole names with the ending, as a rename does", () => {
      expect(named(["Untitled script"])).toBe("Untitled script.sd");
    });
  });
});

describe("formatters", () => {
  it("writes ago as the file lists do", () => {
    expect(ago(undefined, NOW)).toBe("");
    expect(ago(NOW - 20_000, NOW)).toBe("just now");
    expect(ago(NOW - 5 * 60_000, NOW)).toBe("5m");
    expect(ago(NOW - 3 * HOUR, NOW)).toBe("3h");
    expect(ago(NOW - 6 * 24 * HOUR, NOW)).toBe("6d");
    expect(ago(Date.UTC(2026, 8, 3, 12), NOW, "en-US")).toBe("Sep 3");
    expect(ago(Date.UTC(2025, 8, 3, 12), NOW, "en-US")).toBe("Sep 3, 2025");
  });

  it("writes sizes in B, kB and MB", () => {
    expect(bytesLabel(0)).toBe("0 B");
    expect(bytesLabel(883)).toBe("883 B");
    expect(bytesLabel(2048)).toBe("2 kB");
    expect(bytesLabel(570 * 1024)).toBe("570 kB");
    expect(bytesLabel(1.2 * 1048576)).toBe("1.2 MB");
  });

  it("writes a folder's holdings", () => {
    expect(holdingsLabel(0, 0, "script")).toBe("Empty");
    expect(holdingsLabel(0, 3, "script")).toBe("3 scripts");
    expect(holdingsLabel(1, 1, "script")).toBe("1 folder, 1 script");
  });
});

describe("row line", () => {
  const uses = (n: number) => `Referenced by ${n === 1 ? "1 script" : `${n} scripts`}`;
  const script = entry("Scripts/beta.sd", { modified: NOW - 5 * 60_000, size: 2048, uses: 3 });

  it("reads Modified and size for a script, and the entry label for Main", () => {
    expect(rowLine({ entry: script, sort: "name-asc", now: NOW })).toBe("Modified 5m · 2 kB");
    const main = entry("main.sd", { pinned: true, size: 2048 });
    expect(rowLine({ entry: main, sort: "name-asc", entryLabel: "Entry script", now: NOW })).toBe("Entry script · 2 kB");
  });

  it("reads the reference count under sort by Uses", () => {
    expect(rowLine({ entry: script, sort: "uses-desc", usesLabel: uses, now: NOW })).toBe("Referenced by 3 scripts");
    const main = entry("main.sd", { pinned: true, size: 2048 });
    expect(rowLine({ entry: main, sort: "uses-desc", entryLabel: "Entry script", usesLabel: uses })).toBe("Entry script");
  });

  it("puts a folder's holdings, or a search result's location, first", () => {
    const folder = entry("Scripts/eta", { kind: "folder" });
    expect(rowLine({ entry: folder, sort: "name-asc", holdings: "2 scripts" })).toBe("2 scripts");
    expect(rowLine({ entry: script, sort: "name-asc", location: "Scripts", now: NOW })).toBe("Scripts · Modified 5m · 2 kB");
  });
});

describe("story order and reference counts", () => {
  const refs: Reference[] = [
    { from: "main.sd", to: "Scripts/a.sd", divert: true },
    { from: "Scripts/a.sd", to: "Scripts/b.sd", divert: true },
    { from: "Scripts/b.sd", to: "Scripts/a.sd", divert: true },
    { from: "main.sd", to: "Scripts/c.sd", divert: true },
    { from: "Scripts/c.sd", to: "Scripts/defs.sd", divert: false },
    { from: "Scripts/a.sd", to: "Scripts/defs.sd", divert: false },
  ];

  it("reaches Main, then each script depth first, through a cycle, leaving unreached ones out", () => {
    expect(storyOrder("main.sd", refs)).toEqual(["main.sd", "Scripts/a.sd", "Scripts/b.sd", "Scripts/c.sd"]);
    const position = storyPositions(storyOrder("main.sd", refs));
    expect(position("Scripts/c.sd", "file")).toBe(3);
    expect(position("Scripts/defs.sd", "file")).toBe(UNREACHED);
    expect(position("Scripts", "folder")).toBe(1);
    expect(position("Elsewhere", "folder")).toBe(UNREACHED);
  });

  it("counts the other scripts that reference a script", () => {
    const count = referenceCounts([...refs, { from: "Scripts/a.sd", to: "Scripts/b.sd", divert: false }]);
    expect(count("Scripts/defs.sd")).toBe(2);
    expect(count("Scripts/b.sd")).toBe(1);
    expect(count("main.sd")).toBe(0);
  });
});
