import { describe, expect, it } from "vitest";
import { reloadsForWrite } from "../../src/modules/spark-editor/components/logic-script-editor/reloadsForWrite";

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
      "another tab's ordinary write",
      { text: "loaded typed", remote: true, restored: false },
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
