import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import SnackbarHost from "../../src/modules/spark-editor/components/snackbar-host/SnackbarHost";
import {
  dismissSnackbar,
  showSnackbar,
  snackbar,
} from "../../src/modules/spark-editor/utils/snackbar";

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
  it("draws the current snackbar as a toast under the title bar", async () => {
    await mount();
    await act(async () => showSnackbar({ message: "Moved to the recycle bin", actionLabel: "Undo" }));
    const toast = document.querySelector<HTMLElement>("[data-toast]");
    expect(toast?.textContent).toContain("Moved to the recycle bin");
    expect(toast?.parentElement?.className).toContain("top-[var(--toast-top)]");
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

  it("names its dismiss button when the snackbar gives one, and that button puts it away", async () => {
    await mount();
    const onAction = vi.fn();
    await act(async () =>
      showSnackbar({
        message: "9 days since your last backup.",
        actionLabel: "Export",
        dismissLabel: "Remind me later",
        onAction,
      }),
    );
    const message = document.querySelector("[data-toast] span");
    expect(message?.className).not.toContain("fade-edge");
    await act(async () => button("Remind me later")!.click());
    expect(onAction).not.toHaveBeenCalled();
    expect(snackbar.value).toBeNull();
  });
});
