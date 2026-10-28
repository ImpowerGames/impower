import { EditorState, Text } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  movePlaceLines,
  placeKey,
  type StartingValues,
} from "@impower/sparkdown/src/program/startingValueLiterals";
import { afterEach, describe, expect, it } from "vitest";
import {
  getLineAnchors,
  lineAnchorMoves,
  lineAnchors,
  setLineAnchors,
} from "../src/cm-line-anchors/lineAnchors";

// #1666 — a once-only option's or an alternator's starting value has no name
// and is kept on its line, which the editor keeps on the same text through
// edits: inserting lines above it moves the value down with its option,
// Enter at the option's start moves it with the option's text, and deleting
// the option's line leaves the value on no line, so it no longer resolves.
// Each edit reports the lines it moved, which the host applies to the values
// it keeps.

const URI = "file:///proj/main.sd";

const script = [
  "scene interrogation",
  "  choose",
  "    * [Tell the truth.]",
  "      trust += 2",
  "    * [Lie.]",
  "      trust -= 1",
  "  end",
  "end",
].join("\n");

let view: EditorView | undefined;
let moved: [number, number | null][][] = [];

afterEach(() => {
  view?.destroy();
  view = undefined;
  moved = [];
});

/** An editor of `script` with anchors on the lines `lines`, counting from
 *  0, which records every edit's moves. */
const editor = (lines: number[]) => {
  view = new EditorView({
    state: EditorState.create({
      doc: script,
      extensions: [
        lineAnchors(Text.of(script.split("\n")), lines),
        EditorView.updateListener.of((u) => {
          const moves = lineAnchorMoves(u);
          if (moves.length > 0) {
            moved.push(moves);
          }
        }),
      ],
    }),
    parent: document.body,
  });
  return view;
};

const lineStart = (v: EditorView, line: number) =>
  v.state.doc.line(line + 1).from;

describe("a starting value kept on its line", () => {
  it("stays on its option when lines are inserted above it", () => {
    const v = editor([2, 4]);
    v.dispatch({ changes: { from: 0, insert: "// one\n// two\n" } });
    expect(getLineAnchors(v)).toEqual([4, 6]);
    expect(moved).toEqual([
      [
        [2, 4],
        [4, 6],
      ],
    ]);
    // The host moves the values it keeps by the moves, so the option's value
    // is on the option's new line.
    const values: StartingValues = {
      interrogation: { [placeKey(URI, 4)]: "1", "store:trust": "2" },
    };
    let kept = values;
    for (const moves of moved) {
      kept = movePlaceLines(kept, URI, new Map(moves));
    }
    expect(kept).toEqual({
      interrogation: { [placeKey(URI, 6)]: "1", "store:trust": "2" },
    });
    expect(v.state.doc.line(7).text).toBe("    * [Lie.]");
  });

  it("moves down with its option's text on Enter at the option's start", () => {
    const v = editor([4]);
    v.dispatch({ changes: { from: lineStart(v, 4), insert: "\n" } });
    expect(getLineAnchors(v)).toEqual([5]);
    expect(moved).toEqual([[[4, 5]]]);
  });

  it("stays where it is for edits below it or within its line", () => {
    const v = editor([2]);
    v.dispatch({ changes: { from: lineStart(v, 5), insert: "  // note\n" } });
    v.dispatch({
      changes: { from: v.state.doc.line(3).to, insert: " // the truth" },
    });
    expect(getLineAnchors(v)).toEqual([2]);
    expect(moved).toEqual([]);
  });

  it("is on no line once its option's line is deleted", () => {
    const v = editor([2, 4]);
    v.dispatch({
      changes: { from: lineStart(v, 2), to: lineStart(v, 4) },
    });
    expect(getLineAnchors(v)).toEqual([2]);
    expect(moved).toEqual([
      [
        [2, null],
        [4, 2],
      ],
    ]);
    const kept = movePlaceLines(
      { s: { [placeKey(URI, 2)]: "1", [placeKey(URI, 4)]: "2" } },
      URI,
      new Map(moved[0]),
    );
    expect(Object.keys(kept["s"]!)).toEqual([
      `place:0:~2:${URI}`,
      placeKey(URI, 2),
    ]);
  });

  it("takes the lines the host sets", () => {
    const v = editor([]);
    setLineAnchors(v, [2, 99]);
    expect(getLineAnchors(v)).toEqual([2]);
    v.dispatch({ changes: { from: 0, insert: "\n" } });
    expect(getLineAnchors(v)).toEqual([3]);
  });
});
