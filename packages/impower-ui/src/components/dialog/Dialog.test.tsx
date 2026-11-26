import { render } from "preact";
import { useRef, useState } from "preact/hooks";
import { act } from "preact/test-utils";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  DIALOG_TRANSITION_MS,
  Dialog,
  DialogActions,
  DialogDescription,
  DialogTitle,
  DockedDialog,
  Lightbox,
  Sheet,
  type DialogProps,
  type DockedDialogProps,
  type SheetSize,
} from "./Dialog";
import {
  DropdownContent,
  DropdownItem,
  DropdownRoot,
  DropdownTrigger,
} from "../dropdown/Dropdown";

let phone = false;
const mediaListeners = new Set<() => void>();

beforeAll(() => {
  window.matchMedia = (query: string) =>
    ({
      get matches() {
        return query.includes("min-width") ? !phone : false;
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: () => void) =>
        mediaListeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) =>
        mediaListeners.delete(listener),
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
});

const setPhone = async (value: boolean) => {
  phone = value;
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
  document.body.removeAttribute("style");
  await setPhone(false);
});

const settle = (ms = 0) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });

const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');

const tap = (target: Element) =>
  act(async () => {
    target.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerType: "touch", button: 0 }));
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }));
  });
const backdrop = () => dialog()?.parentElement ?? null;

const pressEscape = () =>
  act(async () => {
    (document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    );
  });

const clickBackdrop = () =>
  act(async () => {
    const target = backdrop()!;
    target.dispatchEvent(
      new MouseEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        button: 0,
      }),
    );
    target.dispatchEvent(
      new MouseEvent("pointerup", {
        bubbles: true,
        cancelable: true,
        button: 0,
      }),
    );
    target.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }),
    );
  });

type HarnessProps = Omit<DialogProps, "open" | "onOpenChange"> & {
  onOpenChange?: (open: boolean) => void;
  sheet?: boolean;
  sheetSize?: SheetSize;
  withInitialFocus?: boolean;
};

function Harness({
  onOpenChange,
  sheet,
  sheetSize,
  withInitialFocus,
  ...props
}: HarnessProps) {
  const [open, setOpen] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const change = (next: boolean) => {
    onOpenChange?.(next);
    setOpen(next);
  };
  const body = (
    <>
      <DialogTitle>Rename asset</DialogTitle>
      <DialogDescription>Choose a new name.</DialogDescription>
      <input aria-label="first field" />
      <input aria-label="name" ref={nameRef} />
      <DialogActions>
        <button type="button" onClick={() => change(false)}>
          Cancel
        </button>
        <button type="button">Save</button>
      </DialogActions>
    </>
  );
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      {sheet ? (
        <Sheet
          size={sheetSize}
          open={open}
          onOpenChange={change}
          initialFocus={withInitialFocus ? nameRef : undefined}
        >
          {body}
        </Sheet>
      ) : (
        <Dialog
          {...props}
          open={open}
          onOpenChange={change}
          initialFocus={withInitialFocus ? nameRef : undefined}
        >
          {body}
        </Dialog>
      )}
    </>
  );
}

const mount = async (props: HarnessProps = {}) => {
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(<Harness {...props} />, host!));
  const opener = host.querySelector("button")!;
  opener.focus();
  await act(async () => opener.click());
  await settle(50);
  return opener;
};

describe("Dialog under preact/compat", () => {
  it("renders nothing while closed", async () => {
    host = document.body.appendChild(document.createElement("div"));
    await act(async () => render(<Harness />, host!));
    expect(dialog()).toBeNull();
  });

  it("opens a labelled modal card on a backdrop and locks scroll behind it", async () => {
    await mount();
    const card = dialog()!;
    expect(card.getAttribute("aria-modal")).toBe("true");
    const title = document.getElementById(
      card.getAttribute("aria-labelledby")!,
    );
    expect(title?.textContent).toBe("Rename asset");
    expect(title?.tagName).toBe("H2");
    expect(
      document.getElementById(card.getAttribute("aria-describedby")!)
        ?.textContent,
    ).toBe("Choose a new name.");
    expect(card.className).toContain("max-w-sm");
    expect(backdrop()!.className).toContain("bg-scrim");
    expect(document.body.hasAttribute("data-scroll-locked")).toBe(true);
    expect(host!.getAttribute("aria-hidden")).toBe("true");
  });

  it("closes on Escape and unmounts after the exit transition", async () => {
    const onOpenChange = vi.fn();
    await mount({ onOpenChange });
    await pressEscape();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(dialog()).not.toBeNull();
    await settle(DIALOG_TRANSITION_MS + 50);
    expect(dialog()).toBeNull();
    expect(document.body.hasAttribute("data-scroll-locked")).toBe(false);
  });

  it("closes on a backdrop click but not on a click inside the card", async () => {
    const onOpenChange = vi.fn();
    await mount({ onOpenChange });
    await act(async () => {
      const card = dialog()!;
      card.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, button: 0 }),
      );
      card.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
    });
    expect(onOpenChange).not.toHaveBeenCalled();
    await clickBackdrop();
    await settle(10);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    await settle(DIALOG_TRANSITION_MS + 50);
    expect(dialog()).toBeNull();
  });

  it("ignores Escape and backdrop clicks when dismissable={false}", async () => {
    const onOpenChange = vi.fn();
    await mount({ onOpenChange, dismissable: false });
    await pressEscape();
    await clickBackdrop();
    await settle(DIALOG_TRANSITION_MS + 50);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(dialog()).not.toBeNull();
    await act(async () =>
      Array.from(dialog()!.querySelectorAll("button"))
        .find((b) => b.textContent === "Cancel")!
        .click(),
    );
    await settle(DIALOG_TRANSITION_MS + 50);
    expect(dialog()).toBeNull();
  });

  it("lets the caller keep the dialog open by preventing an Escape", async () => {
    const onOpenChange = vi.fn();
    const onEscapeKeyDown = vi.fn((event: KeyboardEvent) =>
      event.preventDefault(),
    );
    await mount({ onOpenChange, onEscapeKeyDown });
    await pressEscape();
    expect(onEscapeKeyDown).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("moves focus into the card on open and returns it to the opener on close", async () => {
    const opener = await mount();
    expect(dialog()!.contains(document.activeElement)).toBe(true);
    expect(document.activeElement?.getAttribute("aria-label")).toBe(
      "first field",
    );
    await pressEscape();
    await settle(DIALOG_TRANSITION_MS + 50);
    await settle(10);
    expect(document.activeElement).toBe(opener);
  });

  it("focuses initialFocus when given", async () => {
    await mount({ withInitialFocus: true });
    expect(document.activeElement?.getAttribute("aria-label")).toBe("name");
  });

  it.each([
    ["pointerdown", false],
    ["keydown", true],
  ] as const)(
    "focuses a sheet's first button with focusVisible following the last input (%s)",
    async (input, focusVisible) => {
      const calls: [Element, unknown][] = [];
      const focus = HTMLElement.prototype.focus;
      const spy = vi
        .spyOn(HTMLElement.prototype, "focus")
        .mockImplementation(function (this: HTMLElement, options?: FocusOptions) {
          calls.push([this, options]);
          focus.call(this, options);
        });
      document.dispatchEvent(new Event(input));
      host = document.body.appendChild(document.createElement("div"));
      await act(async () =>
        render(
          <Sheet open onOpenChange={() => {}}>
            <DialogTitle>Menu</DialogTitle>
            <button type="button">First</button>
            <button type="button">Second</button>
          </Sheet>,
          host!,
        ),
      );
      await settle(50);
      spy.mockRestore();
      const active = document.activeElement as HTMLElement;
      expect(dialog()!.contains(active)).toBe(true);
      expect(active.tagName).toBe("BUTTON");
      const last = calls.filter(([element]) => element === active).at(-1);
      expect(last?.[1]).toEqual({ preventScroll: true, focusVisible });
    },
  );

  it("focuses a sheet's text field on open without scrolling the page to it", async () => {
    const calls: [Element, unknown][] = [];
    const focus = HTMLElement.prototype.focus;
    const spy = vi
      .spyOn(HTMLElement.prototype, "focus")
      .mockImplementation(function (this: HTMLElement, options?: FocusOptions) {
        calls.push([this, options]);
        focus.call(this, options);
      });
    host = document.body.appendChild(document.createElement("div"));
    await act(async () =>
      render(
        <Sheet open onOpenChange={() => {}}>
          <DialogTitle>Rename</DialogTitle>
          <input type="text" />
        </Sheet>,
        host!,
      ),
    );
    await settle(50);
    spy.mockRestore();
    const active = document.activeElement as HTMLElement;
    expect(active.tagName).toBe("INPUT");
    const last = calls.filter(([element]) => element === active).at(-1);
    expect(last?.[1]).toEqual({ preventScroll: true });
  });

  it("traps focus inside the card", async () => {
    const opener = await mount();
    const card = dialog()!;
    const buttons = card.querySelectorAll("button");
    const last = buttons[buttons.length - 1]!;
    last.focus();
    await act(async () => {
      opener.focus();
      opener.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    });
    expect(card.contains(document.activeElement)).toBe(true);
  });

  it.each(["sm", "md", "lg"] as const)(
    "applies the %s width preset",
    async (size) => {
      await mount({ size });
      expect(dialog()!.className).toContain(`max-w-${size}`);
    },
  );

  it("keeps the card inside its backdrop and scrolls the card's own body when it is taller", async () => {
    await mount();
    const card = dialog()!.className.split(" ");
    expect(backdrop()!.className.split(" ")).toEqual(
      expect.arrayContaining(["fixed", "inset-0"]),
    );
    expect(card).toEqual(
      expect.arrayContaining(["max-h-full", "overflow-y-auto"]),
    );
  });

  it("drops the card padding when flush", async () => {
    await mount({ flush: true });
    expect(dialog()!.className).toContain("overflow-hidden");
    expect(dialog()!.className).not.toContain("p-5");
  });

  it("gates its motion behind prefers-reduced-motion", async () => {
    await mount();
    for (const element of [dialog()!, backdrop()!]) {
      const transitions = element.className
        .split(/\s+/)
        .filter((c) => /transition|duration/.test(c));
      expect(transitions.length).toBeGreaterThan(0);
      expect(transitions.every((c) => c.startsWith("motion-safe:"))).toBe(true);
    }
    expect(dialog()!.className).toContain("motion-safe:duration-180");
    expect(dialog()!.className).toContain("ease-[ease-out]");
  });
});

describe("Sheet and the responsive Dialog", () => {
  it("rises from the bottom edge with the same contract", async () => {
    const opener = await mount({ sheet: true, withInitialFocus: true });
    const card = dialog()!;
    expect(card.className).toContain("rounded-t-card");
    expect(card.className.split(" ")).toContain("max-h-[80%]");
    expect(card.className).not.toContain("vh]");
    expect(backdrop()!.className).toContain("justify-end");
    expect(card.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement?.getAttribute("aria-label")).toBe("name");
    await pressEscape();
    await settle(DIALOG_TRANSITION_MS + 50);
    await settle(10);
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("fills the screen at the full size with the same focus and Escape contract", async () => {
    const opener = await mount({ sheet: true, sheetSize: "full", withInitialFocus: true });
    const card = dialog()!;
    expect(card.className).toContain("h-full");
    expect(card.className).toContain("max-h-none");
    expect(card.className).toContain("rounded-none");
    expect(card.className).not.toContain("max-h-[80%]");
    expect(card.className).not.toContain("rounded-t-card");
    expect(document.activeElement?.getAttribute("aria-label")).toBe("name");
    await pressEscape();
    await settle(DIALOG_TRANSITION_MS + 50);
    await settle(10);
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("stays a centred card in the phone layout unless responsive", async () => {
    await setPhone(true);
    await mount();
    expect(dialog()!.className).toContain("rounded-dialog");
    expect(dialog()!.className).not.toContain("rounded-t-card");
  });

  it("becomes a Sheet in the phone layout when responsive and a card otherwise", async () => {
    await setPhone(true);
    await mount({ responsive: true });
    expect(dialog()!.className).toContain("rounded-t-card");
    await setPhone(false);
    await settle(50);
    expect(dialog()!.className).not.toContain("rounded-t-card");
    expect(dialog()!.className).toContain("max-w-sm");
  });
});

describe("Lightbox under preact/compat", () => {
  function LightboxHarness() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          View full size
        </button>
        <Lightbox label="harbor full size" open={open} onOpenChange={setOpen}>
          <img alt="" data-picture />
        </Lightbox>
      </>
    );
  }

  const open = async () => {
    host = document.body.appendChild(document.createElement("div"));
    await act(async () => render(<LightboxHarness />, host!));
    const opener = host.querySelector("button")!;
    opener.focus();
    await act(async () => opener.click());
    await settle(50);
    return opener;
  };

  const closed = async () => {
    await settle(DIALOG_TRANSITION_MS + 50);
    await settle(10);
    return dialog() === null;
  };

  it("covers the screen on the stage colour, named by its label, with focus inside", async () => {
    await open();
    const box = dialog()!;
    expect(box.getAttribute("aria-modal")).toBe("true");
    expect(document.getElementById(box.getAttribute("aria-labelledby")!)!.textContent).toBe("harbor full size");
    expect(box.className).toContain("size-full");
    expect(box.className).toContain("bg-stage");
    expect(backdrop()!.className).toContain("items-stretch");
    expect(box.contains(document.activeElement)).toBe(true);
  });

  it("closes on Escape and returns focus to the button that opened it", async () => {
    const opener = await open();
    expect(dialog()!.contains(document.activeElement)).toBe(true);
    await pressEscape();
    expect(await closed()).toBe(true);
    expect(document.activeElement).toBe(opener);
  });

  it("closes from its Close button and on a click beside the picture, but not on the picture", async () => {
    const opener = await open();
    await act(async () => dialog()!.querySelector<HTMLElement>("[data-picture]")!.click());
    await settle(10);
    expect(dialog()).not.toBeNull();
    await act(async () => dialog()!.querySelector<HTMLElement>("[data-lightbox-stage]")!.click());
    expect(await closed()).toBe(true);
    expect(document.activeElement).toBe(opener);
    await act(async () => opener.click());
    await settle(50);
    const close = dialog()!.querySelector<HTMLButtonElement>("[data-lightbox-close]")!;
    expect(close.getAttribute("aria-label")).toBe("Close");
    await act(async () => close.click());
    expect(await closed()).toBe(true);
    expect(document.activeElement).toBe(opener);
  });

  it("gates its fade behind prefers-reduced-motion", async () => {
    await open();
    expect(dialog()!.className.split(" ")).toContain("motion-safe:transition-opacity");
  });
});

describe("focus return across openers and layout changes", () => {
  const closeAndSettle = async () => {
    await pressEscape();
    await settle(DIALOG_TRANSITION_MS + 50);
    await settle(10);
    expect(dialog()).toBeNull();
  };

  it("keeps the opener when a responsive dialog changes from card to sheet while open", async () => {
    const opener = await mount({ responsive: true });
    await setPhone(true);
    await settle(50);
    expect(dialog()!.className).toContain("rounded-t-card");
    expect(dialog()!.contains(document.activeElement)).toBe(true);
    await closeAndSettle();
    expect(document.activeElement).toBe(opener);
  });

  it("keeps the opener when a responsive dialog changes from sheet to card while open", async () => {
    await setPhone(true);
    const opener = await mount({ responsive: true });
    await setPhone(false);
    await settle(50);
    expect(dialog()!.className).toContain("max-w-sm");
    await closeAndSettle();
    expect(document.activeElement).toBe(opener);
  });

  it("keeps the first opener when the dialog reopens during its exit", async () => {
    const opener = await mount();
    await pressEscape();
    await act(async () => host!.querySelector("button")!.click());
    await settle(50);
    expect(dialog()!.contains(document.activeElement)).toBe(true);
    await closeAndSettle();
    expect(document.activeElement).toBe(opener);
  });

  function MenuHarness() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <DropdownRoot>
          <DropdownTrigger asChild>
            <button type="button">More options</button>
          </DropdownTrigger>
          <DropdownContent>
            <DropdownItem onSelect={() => setOpen(true)}>
              Recycle bin
            </DropdownItem>
          </DropdownContent>
        </DropdownRoot>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTitle>Recycle bin</DialogTitle>
          <button type="button" onClick={() => setOpen(false)}>
            Close
          </button>
        </Dialog>
      </>
    );
  }

  const mountMenu = async () => {
    host = document.body.appendChild(document.createElement("div"));
    await act(async () => render(<MenuHarness />, host!));
    const trigger = host.querySelector("button")!;
    trigger.focus();
    return trigger;
  };

  it("returns focus to the menu's trigger when a menu item opened the dialog", async () => {
    const trigger = await mountMenu();
    await act(async () => {
      trigger.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowDown",
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await settle(50);
    const item = document.querySelector<HTMLElement>('[role="menuitem"]')!;
    item.focus();
    await act(async () => item.click());
    await settle(50);
    expect(dialog()!.contains(document.activeElement)).toBe(true);
    await closeAndSettle();
    expect(document.activeElement).toBe(trigger);
  });

  it("returns focus to the trigger of the sheet menu a finger opens", async () => {
    const trigger = await mountMenu();
    await tap(trigger);
    await settle(50);
    const item = document.querySelector<HTMLElement>('[role="menuitem"]')!;
    item.focus();
    await act(async () => item.click());
    await settle(300);
    expect(dialog()!.contains(document.activeElement)).toBe(true);
    await closeAndSettle();
    expect(document.activeElement).toBe(trigger);
  });

  it("returns focus to returnFocus when the opener has gone", async () => {
    function Gone() {
      const [open, setOpen] = useState(false);
      const [showOpener, setShowOpener] = useState(true);
      const fallback = useRef<HTMLButtonElement>(null);
      return (
        <>
          {showOpener && (
            <button
              type="button"
              onClick={() => {
                setOpen(true);
                setShowOpener(false);
              }}
            >
              Open
            </button>
          )}
          <button type="button" ref={fallback}>
            Row
          </button>
          <Dialog
            open={open}
            onOpenChange={setOpen}
            returnFocus={() => fallback.current}
          >
            <DialogTitle>Gone</DialogTitle>
            <button type="button">Inside</button>
          </Dialog>
        </>
      );
    }
    host = document.body.appendChild(document.createElement("div"));
    await act(async () => render(<Gone />, host!));
    const opener = host.querySelector("button")!;
    opener.focus();
    await act(async () => opener.click());
    await settle(50);
    expect(dialog()!.contains(document.activeElement)).toBe(true);
    await closeAndSettle();
    const row = Array.from(host!.querySelectorAll("button")).find(
      (button) => button.textContent === "Row",
    );
    expect(document.activeElement).toBe(row);
  });
});

describe("Dropdown motion", () => {
  it.each([false, true])(
    "gates the menu's motion behind prefers-reduced-motion (opened by a finger as a sheet at the phone width: %s)",
    async (bySheet) => {
      host = document.body.appendChild(document.createElement("div"));
      await act(async () =>
        render(
          <DropdownRoot defaultOpen={!bySheet}>
            <DropdownTrigger asChild>
              <button type="button">Menu</button>
            </DropdownTrigger>
            <DropdownContent>
              <DropdownItem>Item</DropdownItem>
            </DropdownContent>
          </DropdownRoot>,
          host!,
        ),
      );
      if (bySheet) {
        await setPhone(true);
        await tap(host.querySelector("button")!);
      }
      await settle(50);
      const menu = document.querySelector<HTMLElement>('[role="menu"]')!;
      const elements = bySheet
        ? [menu.closest<HTMLElement>('[role="dialog"]')!, dialog()!.parentElement!]
        : [menu];
      const animated = elements
        .flatMap((element) => element.className.split(" "))
        .filter((c) => c.includes("anim") || c.includes("transition"));
      expect(animated.length).toBeGreaterThan(0);
      expect(animated.every((c) => c.startsWith("motion-safe:"))).toBe(true);
    },
  );
});

describe("Dialog form size", () => {
  it("is the prototype's 440px tool dialog with 26px padding, 19px on a phone", async () => {
    const { dialogVariants } = await import("./Dialog");
    const form = dialogVariants({ size: "form" }).split(/\s+/);
    expect(form).toEqual(expect.arrayContaining(["max-w-[440px]", "p-[26px]", "phone:p-[19px]"]));
    expect(form).not.toContain("p-5");
    expect(dialogVariants().split(/\s+/)).toContain("p-5");
    expect(dialogVariants({ size: "form", flush: true }).split(/\s+/)).not.toContain("p-[26px]");
  });
});

describe("a padded dialog or sheet body", () => {
  it("gives the stable scrollbar gutter back from its right padding, so its content ends as far from each edge", async () => {
    const { dialogVariants, sheetVariants } = await import("./Dialog");
    expect(dialogVariants().split(/\s+/)).toEqual(expect.arrayContaining(["p-5", "pr-gutter-5"]));
    expect(dialogVariants({ size: "form" }).split(/\s+/)).toEqual(
      expect.arrayContaining(["p-[26px]", "pr-gutter-[26px]", "phone:p-[19px]", "phone:pr-gutter-[19px]"]),
    );
    expect(sheetVariants().split(/\s+/)).toEqual(expect.arrayContaining(["p-5", "pr-gutter-5"]));
    expect(dialogVariants({ flush: true }).split(/\s+/)).not.toContain("pr-gutter-5");
    expect(sheetVariants({ flush: true }).split(/\s+/)).not.toContain("pr-gutter-5");
  });
});

describe("DockedDialog", () => {
  const mountDocked = async (props: Partial<DockedDialogProps> = {}) => {
    if (host) {
      await act(async () => render(null, host!));
      host.remove();
    }
    host = document.body.appendChild(document.createElement("div"));
    const before = document.body.appendChild(document.createElement("button"));
    before.textContent = "Before";
    before.focus();
    await act(async () =>
      render(
        <div data-dock>
          <DockedDialog label="Tools" onDismiss={() => {}} data-docked class="h-10" {...props}>
            <button type="button">Inside</button>
          </DockedDialog>
        </div>,
        host!,
      ),
    );
    await settle(10);
    return before;
  };

  const pointerDown = (target: Element) =>
    act(async () => {
      target.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 }));
    });

  it("renders a labelled non-modal section in place, with only the caller's classes, and leaves focus where it was", async () => {
    const before = await mountDocked();
    const panel = dialog()!;
    expect(panel.tagName).toBe("SECTION");
    expect(panel.parentElement!.hasAttribute("data-dock")).toBe(true);
    expect(panel.hasAttribute("data-docked")).toBe(true);
    expect(panel.getAttribute("class")).toBe("h-10");
    expect(panel.getAttribute("aria-label")).toBe("Tools");
    expect(panel.hasAttribute("aria-modal")).toBe(false);
    expect(document.body.style.pointerEvents).toBe("");
    expect(document.activeElement).toBe(before);
  });

  it("dismisses on Escape unless the caller prevents it", async () => {
    const onDismiss = vi.fn();
    await mountDocked({ onDismiss });
    await pressEscape();
    expect(onDismiss).toHaveBeenCalledTimes(1);
    const kept = vi.fn();
    await mountDocked({ onDismiss: kept, onEscapeKeyDown: (event) => event.preventDefault() });
    await pressEscape();
    expect(kept).not.toHaveBeenCalled();
  });

  it("dismisses on the press outside itself, with no click after it, but not on a press inside", async () => {
    const onDismiss = vi.fn();
    const before = await mountDocked({ onDismiss });
    await pointerDown(dialog()!.querySelector("button")!);
    expect(onDismiss).not.toHaveBeenCalled();
    await pointerDown(before);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("stays open on a press outside the caller prevents", async () => {
    const kept = vi.fn();
    const before = await mountDocked({ onDismiss: kept, onPointerDownOutside: (event) => event.preventDefault() });
    await pointerDown(before);
    expect(kept).not.toHaveBeenCalled();
  });

  it("stays open when focus moves outside", async () => {
    const onDismiss = vi.fn();
    const before = await mountDocked({ onDismiss });
    await act(async () => dialog()!.querySelector("button")!.focus());
    await act(async () => before.focus());
    expect(onDismiss).not.toHaveBeenCalled();
  });
});

