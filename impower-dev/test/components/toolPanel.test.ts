import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

const layout = vi.hoisted(() => ({ value: "desktop" }));

vi.mock("@impower/impower-ui/layout", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useLayout: () => layout.value,
}));

const { ToolPanel, ToolPanelAnchor, ToolPanelRoot } =
  await import("../../src/modules/spark-editor/components/tool-panel");

let host: HTMLDivElement | undefined;

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
  document.body.innerHTML = "";
  layout.value = "desktop";
});

const mount = async (chrome?: "heading" | "none", onClose = vi.fn()) => {
  host = document.body.appendChild(document.createElement("div"));
  await act(async () =>
    render(
      h(
        ToolPanelRoot,
        { open: true, onOpen: () => {}, onClose },
        h(ToolPanelAnchor, null, h("div", { "data-bar": "" })),
        h(
          ToolPanel,
          { open: true, title: "Search", chrome, onClose, onBack: () => {} },
          h("input", { "aria-label": "Words to find" }),
        ),
      ),
      host!,
    ),
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  return onClose;
};

const panel = () => document.querySelector<HTMLElement>('[role="dialog"]');

describe("ToolPanel chrome", () => {
  it.each(["desktop", "phone"])(
    "draws the heading with Back and Close by default (%s)",
    async (value) => {
      layout.value = value;
      await mount();
      expect(panel()?.querySelector('[aria-label="Back to writing tools"]')).not.toBeNull();
      expect(panel()?.querySelector('[aria-label="Close writing tools"]')).not.toBeNull();
      expect(panel()?.textContent).toContain("Search");
    },
  );

  it.each(["desktop", "phone"])(
    "draws no heading with chrome none, keeping the panel's name and Escape (%s)",
    async (value) => {
      layout.value = value;
      const onClose = await mount("none");
      const dialog = panel()!;
      expect(dialog.querySelector("header")).toBeNull();
      expect(dialog.querySelector('[aria-label="Close writing tools"]')).toBeNull();
      expect(dialog.querySelector('[aria-label="Words to find"]')).not.toBeNull();
      const labelledBy = dialog.getAttribute("aria-labelledby");
      const name =
        dialog.getAttribute("aria-label") ??
        (labelledBy ? document.getElementById(labelledBy)?.textContent : null);
      expect(name).toBe("Search");
      await act(async () => {
        dialog.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
        );
      });
      expect(onClose).toHaveBeenCalledWith("escape");
    },
  );
});
