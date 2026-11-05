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
  Sheet,
  type DialogProps,
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
  withInitialFocus?: boolean;
};

function Harness({
  onOpenChange,
  sheet,
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
    expect(card.className).toContain("rounded-t-lg");
    expect(backdrop()!.className).toContain("justify-end");
    expect(card.getAttribute("aria-modal")).toBe("true");
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
    expect(dialog()!.className).toContain("rounded-lg");
    expect(dialog()!.className).not.toContain("rounded-t-lg");
  });

  it("becomes a Sheet in the phone layout when responsive and a card otherwise", async () => {
    await setPhone(true);
    await mount({ responsive: true });
    expect(dialog()!.className).toContain("rounded-t-lg");
    await setPhone(false);
    await settle(50);
    expect(dialog()!.className).not.toContain("rounded-t-lg");
    expect(dialog()!.className).toContain("max-w-sm");
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
    expect(dialog()!.className).toContain("rounded-t-lg");
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

  it("returns focus to the trigger of the phone layout's sheet menu", async () => {
    await setPhone(true);
    const trigger = await mountMenu();
    await act(async () => trigger.click());
    await settle(50);
    const item = document.querySelector<HTMLElement>('[role="menuitem"]')!;
    item.focus();
    await act(async () => item.click());
    await settle(300);
    expect(dialog()!.contains(document.activeElement)).toBe(true);
    await closeAndSettle();
    expect(document.activeElement).toBe(trigger);
  });
});
