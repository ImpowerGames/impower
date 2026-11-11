import { render } from "preact";
import { useState } from "preact/hooks";
import { act } from "preact/test-utils";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { hitArea } from "../../../test/hitArea";
import { DIALOG_TRANSITION_MS, Dialog, DialogTitle, Sheet } from "../dialog/Dialog";
import Toast, { TOAST_SWIPE_DISMISS_PX, TOAST_TRANSITION_MS, toastVariants } from "./Toast";

let coarse = false;
const mediaListeners = new Set<() => void>();

beforeAll(() => {
  window.matchMedia = (query: string) =>
    ({
      get matches() {
        return query.includes("pointer: coarse") ? coarse : !query.includes("max-width");
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: () => void) => mediaListeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => mediaListeners.delete(listener),
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
});

const setCoarse = async (value: boolean) => {
  coarse = value;
  await act(async () => mediaListeners.forEach((listener) => listener()));
};

let host: HTMLDivElement | undefined;

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
  document.body.innerHTML = "";
  await setCoarse(false);
});

const settle = (ms = 0) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });

function Harness({ onAction }: { onAction: () => void }) {
  const [open, setOpen] = useState(true);
  return (
    <Toast
      open={open}
      message="Moved the scene to the recycle bin"
      actionLabel="Undo"
      onAction={() => {
        onAction();
        setOpen(false);
      }}
      onDismiss={() => setOpen(false)}
    />
  );
}

const mount = async (onAction: () => void = () => {}) => {
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(<Harness onAction={onAction} />, host!));
  await settle(20);
};

const toast = () => document.querySelector<HTMLElement>("[data-toast]");
const button = (label: string) =>
  Array.from(document.querySelectorAll<HTMLButtonElement>("[data-toast] button")).find(
    (element) => element.textContent === label || element.getAttribute("aria-label") === label,
  );

describe("Toast", () => {
  it("hangs under the title bar in a live region, outside the page's flow", async () => {
    await mount();
    const region = toast()!.parentElement!;
    expect(region.parentElement).toBe(document.body);
    expect(region.getAttribute("role")).toBe("status");
    expect(region.className).toContain("fixed");
    expect(region.className).toContain("top-[var(--toast-top)]");
    expect(region.className).not.toMatch(/(^|\s)bottom-/);
  });

  it("fires its action's callback once from the action button, then leaves after its exit", async () => {
    const onAction = vi.fn();
    await mount(onAction);
    await act(async () => button("Undo")!.click());
    expect(onAction).toHaveBeenCalledTimes(1);
    await settle(TOAST_TRANSITION_MS + 20);
    expect(toast()).toBeNull();
  });

  it("ignores its action, close and swipe while it leaves, and is inert", async () => {
    const onAction = vi.fn();
    const onDismiss = vi.fn();
    host = document.body.appendChild(document.createElement("div"));
    const draw = (open: boolean) =>
      act(async () =>
        render(
          <Toast open={open} message="Moved" actionLabel="Undo" onAction={onAction} onDismiss={onDismiss} />,
          host!,
        ),
      );
    await draw(true);
    await settle(20);
    await draw(false);
    expect(toast()?.hasAttribute("inert")).toBe(true);
    await act(async () => button("Undo")!.click());
    await act(async () => button("Dismiss")!.click());
    const element = toast()!;
    for (const [type, clientY] of [["pointerdown", 100], ["pointermove", 40], ["pointerup", 40]] as const) {
      await act(async () => {
        element.dispatchEvent(new PointerEvent(type, { bubbles: true, clientY, pointerType: "touch" }));
      });
    }
    expect(onAction).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
    await settle(TOAST_TRANSITION_MS + 20);
    expect(toast()).toBeNull();
  });

  it("fires its action once when it is pressed again during its exit", async () => {
    const onAction = vi.fn();
    await mount(onAction);
    await act(async () => button("Undo")!.click());
    expect(toast()?.hasAttribute("inert")).toBe(true);
    await act(async () => button("Undo")!.click());
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("closes from its close button under a fine pointer", async () => {
    await mount();
    await act(async () => button("Dismiss")!.click());
    await settle(TOAST_TRANSITION_MS + 20);
    expect(toast()).toBeNull();
  });

  it("drops the close button on touch and dismisses on a swipe up", async () => {
    await setCoarse(true);
    await mount();
    expect(button("Dismiss")).toBeUndefined();
    const element = toast()!;
    const pointer = (type: string, clientY: number) =>
      act(async () => {
        element.dispatchEvent(
          new PointerEvent(type, { bubbles: true, clientY, pointerType: "touch" }),
        );
      });
    await pointer("pointerdown", 100);
    await pointer("pointermove", 100 - (TOAST_SWIPE_DISMISS_PX + 6));
    await pointer("pointerup", 100 - (TOAST_SWIPE_DISMISS_PX + 6));
    await settle(TOAST_TRANSITION_MS + 20);
    expect(toast()).toBeNull();
  });

  it("stays when a touch moves less than the swipe distance", async () => {
    await setCoarse(true);
    await mount();
    const element = toast()!;
    const pointer = (type: string, clientY: number) =>
      act(async () => {
        element.dispatchEvent(
          new PointerEvent(type, { bubbles: true, clientY, pointerType: "touch" }),
        );
      });
    await pointer("pointerdown", 100);
    await pointer("pointermove", 90);
    await pointer("pointerup", 90);
    await settle(TOAST_TRANSITION_MS + 20);
    expect(toast()).not.toBeNull();
  });

  it("keeps 44px targets for its action and close", async () => {
    await mount();
    for (const label of ["Undo", "Dismiss"]) {
      const area = await hitArea(button(label)!);
      expect(area.width).toBeGreaterThanOrEqual(44);
      expect(area.height).toBeGreaterThanOrEqual(44);
    }
  });

  it("gates its enter and exit motion behind prefers-reduced-motion", () => {
    for (const visible of [true, false]) {
      const animated = toastVariants({ visible })
        .split(/\s+/)
        .filter((name) => name.includes("anim"));
      expect(animated.length).toBeGreaterThan(0);
      expect(animated.every((name) => name.startsWith("motion-safe:"))).toBe(true);
    }
  });
});

describe("Toast over a modal surface", () => {
  const tab = (shift = false) =>
    act(async () => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", shiftKey: shift, bubbles: true, cancelable: true }),
      );
    });

  const escape = () =>
    act(async () => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      );
    });

  const action = () =>
    Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((b) => b.textContent === "Undo")!;

  function Surfaces({
    surface,
    nested = false,
    onAction,
  }: {
    surface: "dialog" | "sheet";
    nested?: boolean;
    onAction: () => void;
  }) {
    const [open, setOpen] = useState(true);
    const [inner, setInner] = useState(nested);
    const Surface = surface === "dialog" ? Dialog : Sheet;
    return (
      <>
        <Surface open={open} onOpenChange={setOpen}>
          <DialogTitle>Problems to fix</DialogTitle>
          <button type="button">Use alice instead</button>
        </Surface>
        <Dialog open={inner} onOpenChange={setInner}>
          <DialogTitle>Inner</DialogTitle>
          <button type="button" onClick={() => setInner(false)}>
            Inner action
          </button>
        </Dialog>
        <Toast open message="Changed to alice." actionLabel="Undo" onAction={onAction} onDismiss={() => {}} />
      </>
    );
  }

  const mountOver = async (surface: "dialog" | "sheet", nested = false) => {
    const onAction = vi.fn();
    host = document.body.appendChild(document.createElement("div"));
    await act(async () => render(<Surfaces surface={surface} nested={nested} onAction={onAction} />, host!));
    await settle(DIALOG_TRANSITION_MS + 20);
    return onAction;
  };

  const modal = (title: string) =>
    Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]')).find((d) =>
      d.querySelector("h2")?.textContent === title,
    )!;

  it("mounts on the page, as before, when no modal surface is open", async () => {
    host = document.body.appendChild(document.createElement("div"));
    await act(async () =>
      render(<Toast open message="Saved." actionLabel="Undo" onAction={() => {}} onDismiss={() => {}} />, host!),
    );
    expect(action().closest('[role="status"]')!.parentElement).toBe(document.body);
  });

  it.each(["dialog", "sheet"] as const)(
    "puts its action inside an open %s's focus scope, where Tab reaches it and it works",
    async (surface) => {
      const onAction = await mountOver(surface);
      const card = modal("Problems to fix");
      expect(card.contains(action())).toBe(true);
      expect(action().closest('[role="status"]')!.getAttribute("aria-live")).toBe("polite");
      const first = Array.from(card.querySelectorAll<HTMLButtonElement>("button")).find(
        (b) => b.textContent === "Use alice instead",
      )!;
      const controls = Array.from(action().closest("[data-toast]")!.querySelectorAll("button"));
      expect(controls.map((b) => b.getAttribute("aria-label") ?? b.textContent)).toEqual([
        "Undo",
        "Dismiss",
      ]);
      first.focus();
      await tab(true);
      expect(document.activeElement).toBe(controls[1]);
      await tab();
      expect(document.activeElement).toBe(first);
      await setCoarse(true);
      first.focus();
      await tab(true);
      expect(document.activeElement).toBe(action());
      await act(async () => action().click());
      expect(onAction).toHaveBeenCalledTimes(1);
    },
  );

  it("lets Escape from its action close the surface, then follows the toast back to the page", async () => {
    await mountOver("dialog");
    action().focus();
    await escape();
    await settle(DIALOG_TRANSITION_MS + 20);
    expect(modal("Problems to fix")).toBeUndefined();
    expect(action().closest('[role="status"]')!.parentElement).toBe(document.body);
  });

  it("goes to the topmost of stacked surfaces, and to the next one down when that one closes", async () => {
    await mountOver("dialog", true);
    expect(modal("Inner").contains(action())).toBe(true);
    const close = Array.from(modal("Inner").querySelectorAll<HTMLButtonElement>("button")).find(
      (b) => b.textContent.trim() === "Inner action",
    )!;
    await act(async () => close.click());
    await settle(DIALOG_TRANSITION_MS + 20);
    expect(modal("Inner")).toBeUndefined();
    expect(modal("Problems to fix").contains(action())).toBe(true);
  });
});
