import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import SnackbarHost from "../../src/modules/spark-editor/components/snackbar-host/SnackbarHost";
import {
  dismissSnackbar,
  showSnackbar,
  snackbar,
} from "../../src/modules/spark-editor/utils/snackbar";

(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

let host: HTMLDivElement | undefined;

afterEach(async () => {
  while (snackbar.value) {
    dismissSnackbar();
  }
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
  document.body.innerHTML = "";
});

const mount = async () => {
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(h(SnackbarHost, {}), host!));
};

const button = (label: string) =>
  Array.from(document.querySelectorAll<HTMLButtonElement>("[data-toast] button")).find(
    (element) => element.textContent === label,
  );

describe("SnackbarHost", () => {
  it("draws the current snackbar as a toast over the workspace pane's columns", async () => {
    const pane = document.body.appendChild(document.createElement("div"));
    pane.setAttribute("data-toast-pane", "");
    pane.getBoundingClientRect = () => new DOMRect(232, 76, 636, 824);
    await mount();
    await act(async () => showSnackbar({ message: "Moved to the recycle bin", actionLabel: "Undo" }));
    const toast = document.querySelector<HTMLElement>("[data-toast]");
    expect(toast?.textContent).toContain("Moved to the recycle bin");
    expect(toast?.parentElement?.className).toContain("left-[var(--toast-left,0px)]");
    const root = document.documentElement.style;
    expect(root.getPropertyValue("--toast-left")).toBe("232px");
    expect(root.getPropertyValue("--toast-width")).toBe("636px");
    await act(async () => render(null, host!));
    expect(root.getPropertyValue("--toast-left")).toBe("");
    expect(root.getPropertyValue("--toast-width")).toBe("");
    pane.remove();
  });

  it("runs the action once and dismisses a passing toast", async () => {
    await mount();
    const onAction = vi.fn();
    await act(async () => showSnackbar({ message: "Moved", actionLabel: "Undo", onAction }));
    await act(async () => button("Undo")!.click());
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(snackbar.value).toBeNull();
  });

  it("runs Undo once when it is pressed twice before the toast leaves, leaving the earlier operation alone", async () => {
    await mount();
    const undone: string[] = [];
    const history = ["first", "second"];
    showSnackbar({ message: "Moved first", actionLabel: "Undo", onAction: () => undone.push(history.pop()!) });
    await act(async () => showSnackbar({ message: "Moved second", actionLabel: "Undo", onAction: () => undone.push(history.pop()!) }));
    await act(async () => {
      button("Undo")!.click();
      button("Undo")!.click();
    });
    await act(async () => button("Undo")?.click());
    expect(undone).toEqual(["second"]);
    expect(history).toEqual(["first"]);
  });

  it("puts a toast away after its action, since no toast is pinned", async () => {
    await mount();
    const onAction = vi.fn();
    await act(async () =>
      showSnackbar({ message: "Export a copy", actionLabel: "Export", onAction }),
    );
    await act(async () => button("Export")!.click());
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(snackbar.value).toBeNull();
  });
});
