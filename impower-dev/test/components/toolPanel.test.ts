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

const mount = async (
  chrome?: "heading" | "none",
  onClose = vi.fn(),
  extra: Record<string, unknown> = {},
  presentation?: "keyboard",
) => {
  host = document.body.appendChild(document.createElement("div"));
  await act(async () =>
    render(
      h(
        ToolPanelRoot,
        { open: true, onOpen: () => {}, onClose, presentation },
        h(ToolPanelAnchor, null, h("div", { "data-bar": "" })),
        h(
          ToolPanel,
          {
            open: true,
            title: "Search",
            closeLabel: "Close writing tools",
            chrome,
            onClose,
            onBack: () => {},
            ...extra,
          },
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
      expect(
        panel()?.querySelector('[aria-label="Back to writing tools"]'),
      ).not.toBeNull();
      expect(
        panel()?.querySelector('[aria-label="Close writing tools"]'),
      ).not.toBeNull();
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
      expect(
        dialog.querySelector('[aria-label="Close writing tools"]'),
      ).toBeNull();
      expect(
        dialog.querySelector('[aria-label="Words to find"]'),
      ).not.toBeNull();
      const labelledBy = dialog.getAttribute("aria-labelledby");
      const name =
        dialog.getAttribute("aria-label") ??
        (labelledBy ? document.getElementById(labelledBy)?.textContent : null);
      expect(name).toBe("Search");
      await act(async () => {
        dialog.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Escape",
            bubbles: true,
            cancelable: true,
          }),
        );
      });
      expect(onClose).toHaveBeenCalledWith("escape");
    },
  );

  it("leaves Close to the trigger in a popover and keeps it in the keyboard heading", async () => {
    await mount(undefined, vi.fn(), {
      closeButton: "trigger",
      closeLabel: "Close add menu",
    });
    expect(panel()?.querySelector("header")).not.toBeNull();
    expect(panel()?.querySelector('[aria-label="Close add menu"]')).toBeNull();
    await act(async () => render(null, host!));
    host!.remove();
    layout.value = "phone";
    await mount(
      undefined,
      vi.fn(),
      { closeButton: "trigger", closeLabel: "Close add menu" },
      "keyboard",
    );
    expect(
      panel()?.querySelector('[aria-label="Close add menu"]'),
    ).not.toBeNull();
  });
});

describe("the ToolPanel heading", () => {
  const head = () => panel()!.querySelector<HTMLElement>("[data-panel-head]");
  const pressKeepsFocus = (button: HTMLElement) => {
    const down = new PointerEvent("pointerdown", { bubbles: true, cancelable: true });
    button.dispatchEvent(down);
    return down.defaultPrevented;
  };

  it.each(["desktop", "phone"])(
    "is the shared PanelHead, titled in its 15px ink style, with Back and Close that keep focus (%s)",
    async (value) => {
      layout.value = value;
      await mount();
      const header = head()!;
      expect(header).not.toBeNull();
      expect(header.className).toContain("min-h-[52px]");
      expect(header.className).toContain("border-b");
      const title = header.querySelector("h2")!;
      expect(title.textContent).toBe("Search");
      expect(title.className).toContain("text-[15px]/[1.4]");
      expect(title.className).toContain("text-ink");
      const back = header.querySelector<HTMLElement>('[aria-label="Back to writing tools"]')!;
      const close = header.querySelector<HTMLElement>('[aria-label="Close writing tools"]')!;
      expect(pressKeepsFocus(back)).toBe(true);
      expect(pressKeepsFocus(close)).toBe(true);
    },
  );

  it("names the sheet by the DialogTitle in the PanelHead", async () => {
    layout.value = "phone";
    await mount();
    const labelledBy = panel()!.getAttribute("aria-labelledby");
    const named = labelledBy ? document.getElementById(labelledBy) : null;
    expect(named?.textContent).toBe("Search");
    expect(head()!.contains(named)).toBe(true);
    expect(named!.className).toContain("text-[15px]/[1.4]");
  });

  it("sits above the keyboard panel and returns focus when Close is pressed", async () => {
    layout.value = "phone";
    const writing = document.body.appendChild(document.createElement("textarea"));
    const onClose = vi.fn();
    await mount(undefined, onClose, { returnFocus: () => writing }, "keyboard");
    const header = head()!;
    expect(header.className).toContain("absolute");
    expect(header.className).toContain("bottom-full");
    expect(header.className).toContain("h-[52px]");
    expect(header.className).toContain("bg-panel");
    const close = header.querySelector<HTMLElement>('[aria-label="Close writing tools"]')!;
    expect(pressKeepsFocus(close)).toBe(true);
    await act(async () => close.click());
    expect(onClose).toHaveBeenCalledWith("close");
    expect(document.activeElement).toBe(writing);
  });
});

describe("the bar presentation", () => {
  const mountBar = async (open: boolean, onClose = vi.fn()) => {
    host = document.body.appendChild(document.createElement("div"));
    await act(async () =>
      render(
        h(
          ToolPanelRoot,
          { presentation: "bar", open, onOpen: () => {}, onClose },
          h(
            ToolPanel,
            { open, title: "Search", chrome: "none", onClose },
            h("input", { "aria-label": "Words to find" }),
          ),
        ),
        host!,
      ),
    );
    return onClose;
  };

  it("stays in the page's flow, names itself and leaves the rest of the page usable", async () => {
    layout.value = "phone";
    await mountBar(true);
    expect(panel()).toBeNull();
    const bar = host!.querySelector<HTMLElement>('section[aria-label="Search"]')!;
    expect(bar.querySelector('[aria-label="Words to find"]')).not.toBeNull();
    expect(document.body.hasAttribute("data-scroll-locked")).toBe(false);
    expect(host!.getAttribute("aria-hidden")).toBeNull();
  });

  it("closes with Escape", async () => {
    layout.value = "phone";
    const onClose = await mountBar(true);
    await act(async () => {
      host!
        .querySelector('[aria-label="Words to find"]')!
        .dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
        );
    });
    expect(onClose).toHaveBeenCalledWith("escape");
  });

  it("draws nothing while closed", async () => {
    layout.value = "phone";
    await mountBar(false);
    expect(host!.querySelector("section")).toBeNull();
  });
});
