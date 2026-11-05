import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  dismissSnackbar,
  showSnackbar,
  snackbar,
} from "../../src/modules/spark-editor/utils/snackbar";

const clearSnackbars = () => {
  while (snackbar.value) {
    dismissSnackbar();
  }
};

beforeEach(() => {
  vi.useFakeTimers();
  clearSnackbars();
});

afterEach(() => {
  clearSnackbars();
  vi.useRealTimers();
});

describe("the toast queue", () => {
  it("keeps a toast for six seconds, then clears it", () => {
    showSnackbar({ message: "Moved to the recycle bin", actionLabel: "Undo" });
    vi.advanceTimersByTime(5999);
    expect(snackbar.value?.message).toBe("Moved to the recycle bin");
    vi.advanceTimersByTime(1);
    expect(snackbar.value).toBeNull();
  });

  it("shows one toast at a time, the newest replacing the last and restarting the six seconds", () => {
    showSnackbar({ message: "First" });
    vi.advanceTimersByTime(4000);
    showSnackbar({ message: "Second" });
    expect(snackbar.value?.message).toBe("Second");
    vi.advanceTimersByTime(4000);
    expect(snackbar.value?.message).toBe("Second");
    vi.advanceTimersByTime(2000);
    expect(snackbar.value).toBeNull();
  });

  it("returns to a pinned toast when a passing one leaves", () => {
    const pinned = { message: "Export a copy", actionLabel: "Export", persistent: true };
    showSnackbar(pinned);
    showSnackbar({ message: "Saved" });
    vi.advanceTimersByTime(6000);
    expect(snackbar.value).toBe(pinned);
    dismissSnackbar(pinned);
    expect(snackbar.value).toBeNull();
  });
});
