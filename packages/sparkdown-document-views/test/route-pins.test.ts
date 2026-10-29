// #1657 — a pin on the option the Game Preview takes at a menu is kept on its
// option's line through edits, the way a breakpoint is: lines inserted above
// it move it with its line, and deleting the line deletes the pin.

import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import {
  getRoutePins,
  routePins,
  setRoutePinsEffect,
} from "../src/cm-route-pins/routePins";

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

/** A state of `script` with a pin on "Tell the truth." (line 3) at its
 *  first offer and one on "Lie." (line 5) at its second. */
const pinned = () =>
  EditorState.create({
    doc: script,
    extensions: [
      routePins([
        { line: 2, offer: 1 },
        { line: 4, offer: 2 },
      ]),
    ],
  });

describe("pins kept on their options' lines", () => {
  it("move with their lines when a choose block is inserted above them", () => {
    const state = pinned();
    const at = state.doc.line(2).from;
    const inserted = "  choose\n    * [Wait.]\n  end\n";
    const next = state.update({ changes: { from: at, insert: inserted } }).state;
    expect(getRoutePins(next)).toEqual([
      { line: 5, offer: 1 },
      { line: 7, offer: 2 },
    ]);
    expect(next.doc.line(6).text).toBe("    * [Tell the truth.]");
  });

  it("stay on their line when text is inserted at the line's start", () => {
    const state = pinned();
    const at = state.doc.line(3).from;
    const next = state.update({
      changes: { from: at, insert: "  choose\n    * [Wait.]\n  end\n" },
    }).state;
    expect(getRoutePins(next)[0]).toEqual({ line: 5, offer: 1 });
    expect(next.doc.line(6).text).toBe("    * [Tell the truth.]");
  });

  it("are deleted with their line", () => {
    const state = pinned();
    const line = state.doc.line(3);
    const next = state.update({
      changes: { from: line.from, to: state.doc.line(4).from },
    }).state;
    expect(getRoutePins(next)).toEqual([{ line: 3, offer: 2 }]);
  });

  it("are deleted with their line when it goes with the line break above it", () => {
    const state = pinned();
    const next = state.update({
      changes: { from: state.doc.line(4).to, to: state.doc.line(5).to },
    }).state;
    expect(getRoutePins(next)).toEqual([{ line: 2, offer: 1 }]);
  });

  it("stay when part of their line is edited", () => {
    const state = pinned();
    const line = state.doc.line(3);
    const next = state.update({
      changes: { from: line.from + 7, to: line.from + 11, insert: "Say" },
    }).state;
    expect(getRoutePins(next)[0]).toEqual({ line: 2, offer: 1 });
  });

  it("are replaced by the host's pins", () => {
    const state = pinned();
    const next = state.update({
      effects: setRoutePinsEffect.of([{ line: 4, offer: 1 }]),
    }).state;
    expect(getRoutePins(next)).toEqual([{ line: 4, offer: 1 }]);
  });
});
