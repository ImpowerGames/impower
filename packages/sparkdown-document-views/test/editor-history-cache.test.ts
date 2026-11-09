import { history, historyField, undo, undoDepth } from "@codemirror/commands";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import {
  EDITOR_HISTORY_CACHE_LIMIT,
  EditorHistoryCache,
} from "../src/modules/script-editor/classes/EditorHistoryCache";

const NEWLINE = String.fromCharCode(10);
const lines = (...text: string[]) => text.join(NEWLINE);

const at = (line: number, from: number, to: number, newText: string) => ({
  range: {
    start: { line, character: from },
    end: { line, character: to },
  },
  newText,
});

const recorded = (
  cache: EditorHistoryCache,
  ...args: Parameters<EditorHistoryCache["record"]>
) => {
  const after = cache.record(...args);
  expect(after).toBeDefined();
  return after!;
};

const reopen = (cache: EditorHistoryCache, uri: string, text: string) => {
  const restored = cache.restore(uri, text);
  if (!restored) {
    return EditorState.create({ doc: text, extensions: [history()] });
  }
  const json = EditorState.fromJSON(
    { doc: text, selection: restored.selection, history: restored.history },
    {},
    { history: historyField },
  );
  return EditorState.create({
    doc: text,
    selection: json.selection,
    extensions: [history(), historyField.init(() => json.field(historyField))],
  });
};

const undoOnce = (state: EditorState) => {
  let next = state;
  undo({
    state,
    dispatch: (tr) => {
      next = tr.state;
    },
  });
  return next;
};

describe("the editor's per-script history cache", () => {
  const before = lines("scene start", "  The rumour spread.", "  A rumour more.", "end");

  it("records a replace in a closed script as one undo step the reopened editor undoes", () => {
    const cache = new EditorHistoryCache();
    const after = recorded(cache, "file:///chapter.sd", before, [
      at(1, 6, 12, "tale"),
      at(2, 4, 10, "tale"),
    ]);
    expect(after).toBe(lines("scene start", "  The tale spread.", "  A tale more.", "end"));
    const state = reopen(cache, "file:///chapter.sd", after);
    expect(undoDepth(state)).toBe(1);
    expect(undoOnce(state).doc.toString()).toBe(before);
  });

  it("keeps the steps already in a saved history and adds the replace after them", () => {
    const cache = new EditorHistoryCache();
    const typed = EditorState.create({ doc: before, extensions: [history()] })
      .update({ changes: { from: 0, insert: "// note" + NEWLINE }, userEvent: "input.type" }).state;
    cache.save("file:///chapter.sd", typed);
    const after = recorded(cache, "file:///chapter.sd", typed.doc.toString(), [
      at(2, 6, 12, "tale"),
    ]);
    const state = reopen(cache, "file:///chapter.sd", after);
    expect(undoDepth(state)).toBe(2);
    const once = undoOnce(state);
    expect(once.doc.toString()).toBe(typed.doc.toString());
    expect(undoOnce(once).doc.toString()).toBe(before);
  });

  it("drops a history whose text no longer matches the script that is loaded", () => {
    const cache = new EditorHistoryCache();
    cache.record("file:///chapter.sd", before, [at(1, 6, 12, "tale")]);
    expect(cache.restore("file:///chapter.sd", before + NEWLINE + "changed elsewhere")).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it("starts a fresh history when the saved one was for other text", () => {
    const cache = new EditorHistoryCache();
    cache.record("file:///chapter.sd", "old text", [at(0, 0, 3, "new")]);
    const after = recorded(cache, "file:///chapter.sd", before, [at(1, 6, 12, "tale")]);
    const state = reopen(cache, "file:///chapter.sd", after);
    expect(undoDepth(state)).toBe(1);
    expect(undoOnce(state).doc.toString()).toBe(before);
  });

  it("matches text whatever its line breaks", () => {
    const cache = new EditorHistoryCache();
    const crlf = before.split(NEWLINE).join(String.fromCharCode(13, 10));
    const after = recorded(cache, "file:///chapter.sd", crlf, [at(1, 6, 12, "tale")]);
    expect(cache.restore("file:///chapter.sd", after.split(NEWLINE).join(String.fromCharCode(13, 10)))).toBeDefined();
  });

  const typedIn = (text: string) =>
    EditorState.create({ doc: text, extensions: [history()] }).update({
      changes: { from: 0, insert: "x" },
      userEvent: "input.type",
    }).state;

  it(`keeps the histories of at most ${EDITOR_HISTORY_CACHE_LIMIT} scripts an editor saved, dropping the one used longest ago`, () => {
    const cache = new EditorHistoryCache();
    for (let i = 0; i < EDITOR_HISTORY_CACHE_LIMIT; i++) {
      cache.save(`file:///s${i}.sd`, typedIn(before));
    }
    cache.save("file:///s0.sd", typedIn(before));
    cache.save("file:///extra.sd", typedIn(before));
    expect(cache.size).toBe(EDITOR_HISTORY_CACHE_LIMIT);
    expect(cache.uris()).not.toContain("file:///s1.sd");
    expect(cache.uris()).toContain("file:///s0.sd");
    expect(cache.uris()).toContain("file:///extra.sd");
  });

  it("keeps a Replace all's step in every closed script it changed, however many, until the script is opened", () => {
    const cache = new EditorHistoryCache();
    const count = EDITOR_HISTORY_CACHE_LIMIT + 5;
    const afters = Array.from({ length: count }, (_, i) =>
      recorded(cache, `file:///s${i}.sd`, before, [at(1, 6, 12, "tale")], "replace-all"),
    );
    for (let i = 0; i < EDITOR_HISTORY_CACHE_LIMIT + 3; i++) {
      cache.save(`file:///visited${i}.sd`, typedIn(before));
    }
    for (let i = 0; i < count; i++) {
      const state = reopen(cache, `file:///s${i}.sd`, afters[i]!);
      expect(undoDepth(state)).toBe(1);
      expect(undoOnce(state).doc.toString()).toBe(before);
    }
    const saved = cache.uris().filter((uri) => uri.includes("visited"));
    expect(saved.length).toBe(EDITOR_HISTORY_CACHE_LIMIT);
  });

  it("lets an opened script's history fall back under the bound once its editor saves it", () => {
    const cache = new EditorHistoryCache(2);
    const after = recorded(cache, "file:///replaced.sd", before, [at(1, 6, 12, "tale")]);
    cache.save("file:///replaced.sd", reopen(cache, "file:///replaced.sd", after));
    cache.save("file:///a.sd", typedIn(before));
    cache.save("file:///b.sd", typedIn(before));
    expect(cache.uris()).toEqual(["file:///a.sd", "file:///b.sd"]);
  });

  it("records nothing for a script an editor holds open, and each edit once", () => {
    const cache = new EditorHistoryCache();
    const editor = {};
    cache.holdOpen(editor, "file:///main.sd");
    expect(cache.record("file:///main.sd", before, [at(1, 6, 12, "tale")])).toBeUndefined();
    expect(cache.size).toBe(0);
    cache.holdOpen(editor, undefined);
    cache.record("file:///main.sd", before, [at(1, 6, 12, "tale")], 7);
    cache.record("file:///main.sd", before, [at(1, 6, 12, "tale")], 7);
    const state = reopen(cache, "file:///main.sd", lines("scene start", "  The tale spread.", "  A rumour more.", "end"));
    expect(undoDepth(state)).toBe(1);
  });

  it("forgets every script when the project's root changes", () => {
    const cache = new EditorHistoryCache();
    cache.useRoot("file:///project-a");
    cache.record("file:///project-a/main.sd", before, [at(1, 6, 12, "tale")]);
    cache.useRoot("file:///project-a");
    expect(cache.size).toBe(1);
    cache.useRoot("file:///project-b");
    expect(cache.size).toBe(0);
    cache.record("file:///project-b/main.sd", before, [at(1, 6, 12, "tale")]);
    cache.useRoot(undefined);
    expect(cache.size).toBe(0);
  });
});
