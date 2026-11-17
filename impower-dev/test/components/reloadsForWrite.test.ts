import { describe, expect, it } from "vitest";
import { keepsTypingOver, reloadsForWrite, rewritesTypingAfter } from "../../src/modules/spark-editor/components/logic-script-editor/reloadsForWrite";

const OWN = "editor-origin";

const editor = { text: "loaded typed", stored: "loaded", origin: OWN };

describe("whether the open script reloads for an announced write", () => {
  it.each([
    [
      "a rollback restoring the text it loaded from storage",
      { text: "loaded", remote: false, restored: true },
      false,
    ],
    [
      "another tab's announcement of that same restore",
      { text: "loaded", remote: true, restored: true },
      false,
    ],
    [
      "a rollback restoring text other than what it loaded",
      { text: "older", remote: false, restored: true },
      true,
    ],
    [
      "a rollback after it loaded the worker's interim text",
      { text: "loaded" , remote: false, restored: true, stored: "interim" },
      true,
    ],
    [
      "an ordinary write by another writer of the text it stored",
      { text: "loaded", remote: false, restored: false },
      true,
    ],
    [
      "an ordinary write by another writer of the text it holds",
      { text: "loaded typed", remote: false, restored: false },
      false,
    ],
    [
      "another tab's ordinary write while it holds unsaved typing",
      { text: "theirs", remote: true, restored: false },
      false,
    ],
    [
      "another tab's ordinary write while it holds no unsaved typing",
      { text: "theirs", remote: true, restored: false, stored: "loaded typed" },
      true,
    ],
    [
      "the echo of its own autosave",
      { text: "loaded", remote: false, restored: false, origin: OWN },
      false,
    ],
  ])("%s → reload %s", (_, write, expected) => {
    const { stored, ...announced } = write as typeof write & { stored?: string };
    expect(
      reloadsForWrite(announced, { ...editor, ...(stored ? { stored } : {}) }),
    ).toBe(expected);
  });
});

describe("whether the open script keeps its typing over an announced write and says so (I-2159)", () => {
  it.each([
    ["another tab's write of different text", { text: "theirs", remote: true, restored: false }, true],
    [
      "another tab's write while it holds no unsaved typing",
      { text: "theirs", remote: true, restored: false, stored: "loaded typed" },
      false,
    ],
    [
      "another tab's write of the text it last knew in storage",
      { text: "loaded", remote: true, restored: false },
      false,
    ],
    [
      "another tab's write of the text it holds",
      { text: "loaded typed", remote: true, restored: false },
      false,
    ],
    [
      "another tab's restore of the text it last knew in storage",
      { text: "loaded", remote: true, restored: true },
      false,
    ],
    ["this tab's write by another writer", { text: "theirs", remote: false, restored: false }, false],
  ])("%s → keeps and says so %s", (_, write, expected) => {
    const { stored, ...announced } = write as typeof write & { stored?: string };
    expect(
      keepsTypingOver(announced, { ...editor, ...(stored ? { stored } : {}) }),
    ).toBe(expected);
  });
});

describe("whether the open script saves its typing again after an announced write it did not reload for (I-2159)", () => {
  it.each([
    ["another tab's write of different text", { text: "theirs", remote: true, restored: false }, true],
    [
      "another tab's write of the text it last knew in storage",
      { text: "loaded", remote: true, restored: false },
      true,
    ],
    [
      "another tab's restore of the text it last knew in storage",
      { text: "loaded", remote: true, restored: true },
      false,
    ],
    [
      "another tab's write while it holds no unsaved typing",
      { text: "theirs", remote: true, restored: false, stored: "loaded typed" },
      false,
    ],
    ["this tab's write by another writer", { text: "loaded", remote: false, restored: false }, false],
  ])("%s → saves again %s", (_, write, expected) => {
    const { stored, ...announced } = write as typeof write & { stored?: string };
    expect(
      rewritesTypingAfter(announced, { ...editor, ...(stored ? { stored } : {}) }),
    ).toBe(expected);
  });
});
