import { describe, expect, it } from "vitest";
import {
  allRoutePins,
  changedRoutePins,
  mapRoutePinMarks,
  routePinMarks,
  routePinsOfMarks,
  type DocumentLines,
  type ScriptRoutePin,
  type TextReplacement,
} from "../src/utils/routePins";

const SCRIPT = [
  "scene interrogation",
  "  choose",
  "    * [Tell the truth.]",
  "      trust += 2",
  "    * [Lie.]",
  "      trust -= 1",
  "  end",
  "end",
].join("\n");

const linesOf = (text: string): DocumentLines => {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "\n") {
      starts.push(i + 1);
    }
  }
  return {
    lineCount: starts.length,
    lineSpan: (line) => ({
      lineStart: starts[line]!,
      lineEnd: line + 1 < starts.length ? starts[line + 1]! - 1 : text.length,
    }),
    lineAt: (offset) => {
      let line = 0;
      while (line + 1 < starts.length && starts[line + 1]! <= offset) {
        line += 1;
      }
      return line;
    },
  };
};

const offsetOf = (text: string, line: number, character = 0) =>
  linesOf(text).lineSpan(line).lineStart + character;

const apply = (text: string, replacements: TextReplacement[]) =>
  replacements.reduce(
    (t, r) =>
      t.slice(0, r.rangeOffset) + r.text + t.slice(r.rangeOffset + r.rangeLength),
    text,
  );

const pinsAfter = (
  text: string,
  pins: ScriptRoutePin[],
  replacements: TextReplacement[],
) => {
  const edited = apply(text, replacements);
  const marks = mapRoutePinMarks(
    routePinMarks(linesOf(text), pins),
    replacements,
    linesOf(edited),
  );
  return routePinsOfMarks(marks, linesOf(edited));
};

const insertAt = (text: string, line: number, inserted: string) => ({
  rangeOffset: offsetOf(text, line),
  rangeLength: 0,
  text: inserted,
});

const deleteLine = (text: string, line: number) => {
  const lines = linesOf(text);
  const start = lines.lineSpan(line).lineStart;
  const end = lines.lineSpan(line + 1).lineStart;
  return { rangeOffset: start, rangeLength: end - start, text: "" };
};

describe("pins kept on their lines through edits", () => {
  const pinned = [{ line: 2, offer: 1 }];

  it("moves a pin down with lines inserted above its option", () => {
    expect(
      pinsAfter(SCRIPT, pinned, [insertAt(SCRIPT, 0, "store a = 0\nstore b = 0\n")]),
    ).toEqual([{ line: 4, offer: 1 }]);
  });

  it("moves a pin up with a line deleted above its option", () => {
    expect(pinsAfter(SCRIPT, pinned, [deleteLine(SCRIPT, 0)])).toEqual([
      { line: 1, offer: 1 },
    ]);
  });

  it("keeps a pin on its option when a line is inserted at the option's start", () => {
    expect(pinsAfter(SCRIPT, pinned, [insertAt(SCRIPT, 2, "\n")])).toEqual([
      { line: 3, offer: 1 },
    ]);
  });

  it("keeps a pin on its line through an edit inside the option's text", () => {
    const start = offsetOf(SCRIPT, 2, "    * [".length);
    expect(
      pinsAfter(SCRIPT, pinned, [
        { rangeOffset: start, rangeLength: "Tell".length, text: "Speak" },
      ]),
    ).toEqual([{ line: 2, offer: 1 }]);
  });

  it("leaves a pin below the edit where it was", () => {
    expect(pinsAfter(SCRIPT, pinned, [insertAt(SCRIPT, 5, "      x += 1\n")])).toEqual(
      pinned,
    );
  });

  it("drops a pin with its deleted line", () => {
    expect(pinsAfter(SCRIPT, pinned, [deleteLine(SCRIPT, 2)])).toEqual([]);
  });

  it("drops a pin when its line's text is replaced by a join with the line above", () => {
    const start = linesOf(SCRIPT).lineSpan(1).lineEnd;
    const end = linesOf(SCRIPT).lineSpan(2).lineEnd;
    expect(
      pinsAfter(SCRIPT, pinned, [
        { rangeOffset: start, rangeLength: end - start, text: "" },
      ]),
    ).toEqual([]);
  });

  it("moves every pin through an edit's replacements, applied in the order given", () => {
    const pins = [
      { line: 2, offer: 1 },
      { line: 4, offer: 2 },
    ];
    expect(
      pinsAfter(SCRIPT, pins, [
        insertAt(SCRIPT, 3, "      trust += 1\n"),
        insertAt(SCRIPT, 0, "store a = 0\n"),
      ]),
    ).toEqual([
      { line: 3, offer: 1 },
      { line: 6, offer: 2 },
    ]);
  });

  it("leaves out a pin on a line the script does not have", () => {
    expect(routePinMarks(linesOf(SCRIPT), [{ line: 40, offer: 1 }])).toEqual([]);
  });
});

describe("changes to the pins from the route list", () => {
  const MAIN = "file:///project/main.sd";
  const END = "file:///project/end.sd";

  it("pins an option and removes the other pin at its stop", () => {
    const changed = changedRoutePins(
      { [MAIN]: [{ line: 9, offer: 1 }] },
      {
        add: [{ uri: MAIN, line: 7, offer: 1 }],
        remove: [{ uri: MAIN, line: 9, offer: 1 }],
      },
    );
    expect(allRoutePins(changed)).toEqual([{ uri: MAIN, line: 7, offer: 1 }]);
  });

  it("keeps a pin it is asked to add again once", () => {
    const changed = changedRoutePins(
      { [MAIN]: [{ line: 7, offer: 1 }] },
      { add: [{ uri: MAIN, line: 7, offer: 1 }] },
    );
    expect(changed).toEqual({ [MAIN]: [{ line: 7, offer: 1 }] });
  });

  it("clears every pin in the workspace", () => {
    expect(
      changedRoutePins(
        { [MAIN]: [{ line: 7, offer: 1 }], [END]: [{ line: 2, offer: 3 }] },
        { removeAll: true },
      ),
    ).toEqual({});
  });

  it("forgets a script whose last pin is removed", () => {
    expect(
      changedRoutePins(
        { [MAIN]: [{ line: 7, offer: 1 }], [END]: [{ line: 2, offer: 3 }] },
        { remove: [{ uri: END, line: 2, offer: 3 }] },
      ),
    ).toEqual({ [MAIN]: [{ line: 7, offer: 1 }] });
  });
});
