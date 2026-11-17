import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  interceptBack,
  returningFromBack,
  watchBack,
} from "../../src/modules/spark-editor/workspace/nameFieldBack";

const history = { index: 0, entries: [] as { sameDocument: boolean }[] };

beforeEach(() => {
  history.index = 0;
  history.entries = [];
  (globalThis as { navigation?: unknown }).navigation = {
    get currentEntry() {
      return { index: history.index };
    },
    entries: () => history.entries,
  };
});

afterEach(() => {
  delete (globalThis as { navigation?: unknown }).navigation;
  vi.restoreAllMocks();
});

describe("the name-field Back fallback", () => {
  it("handles a pop that is not the pending return as a pop of its own, and clears the return", () => {
    history.entries = [{ sameDocument: true }, { sameDocument: true }, { sameDocument: true }];
    vi.spyOn(window.history, "go").mockImplementation(() => {});
    history.index = 2;
    const first = vi.fn();
    const stop = watchBack(first);
    history.index = 1;
    expect(interceptBack()).toBe(true);
    expect(first).toHaveBeenCalledTimes(1);
    expect(window.history.go).toHaveBeenCalledWith(1);
    expect(returningFromBack()).toBe(true);
    history.index = 0;
    expect(interceptBack()).toBe(false);
    expect(returningFromBack()).toBe(false);
    stop();
  });

  it("adds one entry of its own when Back would otherwise leave the page, and none once Back stays in it", () => {
    history.entries = [{ sameDocument: false }, { sameDocument: true }];
    history.index = 1;
    const push = vi.spyOn(window.history, "pushState");
    const stop = watchBack(() => {});
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0]![2]).toBe(window.location.href);
    stop();
    history.entries = [{ sameDocument: false }, { sameDocument: true }, { sameDocument: true }];
    history.index = 2;
    const again = watchBack(() => {});
    expect(push).toHaveBeenCalledTimes(1);
    again();
  });
});
