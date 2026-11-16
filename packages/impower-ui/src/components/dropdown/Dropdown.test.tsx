import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  DropdownCheckboxItem,
  DropdownContent,
  DropdownItem,
  DropdownItemText,
  DropdownLabel,
  DropdownRadioGroup,
  DropdownRadioItem,
  DropdownRoot,
  DropdownSeparator,
  DropdownTrigger,
} from "./Dropdown";

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

const menu = () => document.querySelector<HTMLElement>('[role="menu"]');

const key = (target: Element, name: string) =>
  act(async () => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: name,
        bubbles: true,
        cancelable: true,
      }),
    );
  });

const pointer = (target: Element, pointerType: string) =>
  act(async () => {
    for (const type of ["pointerdown", "pointerup"]) {
      target.dispatchEvent(
        new PointerEvent(type, { bubbles: true, cancelable: true, pointerType, button: 0 }),
      );
    }
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }));
  });

const tap = (target: Element) => pointer(target, "touch");

const sheetMenu = () => menu()?.closest('[role="dialog"]') ?? null;

const mount = async (onSelect = vi.fn()) => {
  host = document.body.appendChild(document.createElement("div"));
  await act(async () =>
    render(
      <DropdownRoot>
        <DropdownTrigger asChild>
          <button type="button">App menu</button>
        </DropdownTrigger>
        <DropdownContent side="top" align="start">
          <DropdownLabel>
            <span>Saved locally</span>
            <span>No account needed to start writing.</span>
          </DropdownLabel>
          <DropdownItem onSelect={onSelect}>Settings</DropdownItem>
          <DropdownSeparator />
          <DropdownItem>Report a bug</DropdownItem>
        </DropdownContent>
      </DropdownRoot>,
      host!,
    ),
  );
  const trigger = host.querySelector("button")!;
  trigger.focus();
  return { trigger, onSelect };
};

describe("Dropdown under preact/compat", () => {
  it("opens from the keyboard with its label above the items", async () => {
    const { trigger } = await mount();
    expect(menu()).toBeNull();
    await key(trigger, "ArrowDown");
    await settle(50);
    expect(menu()).not.toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const label = menu()!.firstElementChild as HTMLElement;
    expect(label.textContent).toBe(
      "Saved locallyNo account needed to start writing.",
    );
    expect(label.getAttribute("role")).toBeNull();
    expect(
      Array.from(menu()!.querySelectorAll('[role="menuitem"]')).map(
        (item) => item.textContent,
      ),
    ).toEqual(["Settings", "Report a bug"]);
    expect(menu()!.contains(document.activeElement)).toBe(true);
  });

  it("selects an item, closes and returns focus to the trigger", async () => {
    const { trigger, onSelect } = await mount();
    await key(trigger, "ArrowDown");
    await settle(50);
    const item = Array.from(
      document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ).find((element) => element.textContent === "Settings")!;
    item.focus();
    await act(async () => item.click());
    await settle(250);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    const { trigger } = await mount();
    await key(trigger, "ArrowDown");
    await settle(50);
    await key(document.activeElement!, "Escape");
    await settle(250);
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it.each([
    ["menu", false],
    ["touch-opened sheet", true],
  ])("leaves focus where an item without focus return sent it, in the %s", async (_mode, sheet) => {
    const field = document.body.appendChild(document.createElement("input"));
    host = document.body.appendChild(document.createElement("div"));
    await act(async () =>
      render(
        <DropdownRoot>
          <DropdownTrigger asChild>
            <button type="button">New</button>
          </DropdownTrigger>
          <DropdownContent>
            <DropdownItem returnFocus={false} onSelect={() => field.focus()}>
              New folder
            </DropdownItem>
          </DropdownContent>
        </DropdownRoot>,
        host!,
      ),
    );
    const trigger = host.querySelector("button")!;
    trigger.focus();
    if (sheet) await tap(trigger);
    else await key(trigger, "ArrowDown");
    await settle(300);
    const item = document.querySelector<HTMLElement>('[role="menuitem"]')!;
    item.focus();
    await act(async () => item.click());
    await settle(400);
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(field);
  });

  it("shows the label in the touch-opened sheet", async () => {
    const { trigger } = await mount();
    await tap(trigger);
    await settle(300);
    expect(menu()).not.toBeNull();
    expect(menu()!.textContent).toContain(
      "No account needed to start writing.",
    );
  });

  it("raises the touch-opened sheet as a menu sheet, with the sheet's corners and shadow", async () => {
    const { trigger } = await mount();
    await tap(trigger);
    await settle(300);
    const classes = document.querySelector('[role="dialog"]')!.className.split(" ");
    expect(classes).toEqual(expect.arrayContaining(["rounded-t-sheet", "shadow-sheet"]));
    expect(classes).not.toContain("rounded-t-card");
  });
});

const RATIOS = ["auto", "16:9", "9:16"];

const mountRadio = async (value = "auto", disabled = false, size?: "default" | "small") => {
  const onValueChange = vi.fn();
  host = document.body.appendChild(document.createElement("div"));
  await act(async () =>
    render(
      <DropdownRoot>
        <DropdownTrigger asChild>
          <button type="button">Game aspect ratio</button>
        </DropdownTrigger>
        <DropdownContent side="top">
          <DropdownRadioGroup
            label="Game aspect ratio"
            value={value}
            onValueChange={onValueChange}
          >
            {RATIOS.map((ratio) => (
              <DropdownRadioItem key={ratio} value={ratio} disabled={disabled} size={size}>
                {ratio}
              </DropdownRadioItem>
            ))}
          </DropdownRadioGroup>
        </DropdownContent>
      </DropdownRoot>,
      host!,
    ),
  );
  const trigger = host.querySelector("button")!;
  trigger.focus();
  return { trigger, onValueChange };
};

const radios = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[role="menuitemradio"]'));

const checked = () =>
  radios().map((item) => [item.textContent, item.getAttribute("aria-checked")]);

describe("Dropdown radio items under preact/compat", () => {
  it("lists menuitemradio rows in a labelled group with the value checked", async () => {
    const { trigger } = await mountRadio("16:9");
    await key(trigger, "ArrowDown");
    await settle(50);
    const group = menu()!.querySelector('[role="group"]')!;
    expect(group.getAttribute("aria-label")).toBe("Game aspect ratio");
    expect(checked()).toEqual([
      ["auto", "false"],
      ["16:9", "true"],
      ["9:16", "false"],
    ]);
    const indicator = radios()[1]!.querySelector("[data-radio-indicator]");
    expect(indicator?.getAttribute("aria-hidden")).toBe("true");
  });

  it("reports the chosen value, closes and returns focus to the trigger", async () => {
    const { trigger, onValueChange } = await mountRadio();
    await key(trigger, "ArrowDown");
    await settle(50);
    const item = radios().find((element) => element.textContent === "9:16")!;
    item.focus();
    await act(async () => item.click());
    await settle(250);
    expect(onValueChange.mock.calls).toEqual([["9:16"]]);
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("draws the chosen item semibold at the default size, and every item 13px at weight 400 at the small size", async () => {
    const { trigger } = await mountRadio("16:9");
    await key(trigger, "ArrowDown");
    await settle(50);
    expect(radios().map((item) => item.className.split(" ").includes("data-[state=checked]:font-semibold"))).toEqual([true, true, true]);
    await act(async () => render(null, host!));
    host!.remove();
    const small = await mountRadio("16:9", false, "small");
    await key(small.trigger, "ArrowDown");
    await settle(50);
    for (const item of radios()) {
      const classes = item.className.split(" ");
      expect(classes).toEqual(expect.arrayContaining(["text-[13px]", "font-normal"]));
      expect(classes).not.toContain("text-sm");
      expect(classes).not.toContain("data-[state=checked]:font-semibold");
    }
  });

  it("chooses from the keyboard with Enter", async () => {
    const { trigger, onValueChange } = await mountRadio();
    await key(trigger, "ArrowDown");
    await settle(50);
    const item = radios().find((element) => element.textContent === "16:9")!;
    item.focus();
    await key(item, "Enter");
    await settle(250);
    expect(onValueChange.mock.calls).toEqual([["16:9"]]);
  });

  it("closes on Escape without choosing", async () => {
    const { trigger, onValueChange } = await mountRadio();
    await key(trigger, "ArrowDown");
    await settle(50);
    await key(document.activeElement!, "Escape");
    await settle(250);
    expect(menu()).toBeNull();
    expect(onValueChange).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
  });

  it("keeps disabled rows from choosing in the menu", async () => {
    const { trigger, onValueChange } = await mountRadio("auto", true);
    await key(trigger, "ArrowDown");
    await settle(50);
    expect(radios().map((item) => item.getAttribute("aria-disabled"))).toEqual([
      "true",
      "true",
      "true",
    ]);
    const item = radios()[1]!;
    await act(async () => item.click());
    await key(item, "Enter");
    await settle(250);
    expect(onValueChange).not.toHaveBeenCalled();
    expect(checked()[0]).toEqual(["auto", "true"]);
  });

  it("keeps disabled rows from choosing in the touch-opened sheet", async () => {
    const { trigger, onValueChange } = await mountRadio("auto", true);
    await tap(trigger);
    await settle(300);
    expect(radios().map((item) => (item as HTMLButtonElement).disabled)).toEqual([
      true,
      true,
      true,
    ]);
    await act(async () => radios()[1]!.click());
    await settle(300);
    expect(onValueChange).not.toHaveBeenCalled();
    expect(menu()).not.toBeNull();
  });

  it("offers the same rows in the touch-opened sheet", async () => {
    const { trigger, onValueChange } = await mountRadio("9:16");
    await tap(trigger);
    await settle(300);
    expect(checked()).toEqual([
      ["auto", "false"],
      ["16:9", "false"],
      ["9:16", "true"],
    ]);
    await act(async () => radios()[1]!.click());
    await settle(300);
    expect(onValueChange.mock.calls).toEqual([["16:9"]]);
    expect(menu()).toBeNull();
  });
});

describe("Dropdown rows in the menu and in the touch-opened sheet", () => {
  const mountRows = async (handlers: {
    onFocus: (row: string) => void;
    onPointerEnter: (row: string) => void;
    onCloseAutoFocus?: (event: Event) => void;
    keepOpen?: boolean;
  }) => {
    host = document.body.appendChild(document.createElement("div"));
    const row = (name: string) => ({
      "data-row": name,
      onFocus: () => handlers.onFocus(name),
      onPointerEnter: () => handlers.onPointerEnter(name),
    });
    await act(async () =>
      render(
        <DropdownRoot>
          <DropdownTrigger asChild>
            <button type="button">Face</button>
          </DropdownTrigger>
          <DropdownContent data-menu="faces" onCloseAutoFocus={handlers.onCloseAutoFocus}>
            <DropdownItem {...row("item")}>Rename</DropdownItem>
            <DropdownCheckboxItem
              {...row("checkbox")}
              checked={false}
              onSelect={(event) => handlers.keepOpen && event.preventDefault()}
            >
              Word wrap
            </DropdownCheckboxItem>
            <DropdownRadioGroup value="sad" label="Face">
              <DropdownRadioItem value="happy" {...row("happy")}>
                Happy
              </DropdownRadioItem>
              <DropdownRadioItem value="sad" {...row("sad")}>
                Sad
              </DropdownRadioItem>
            </DropdownRadioGroup>
          </DropdownContent>
        </DropdownRoot>,
        host!,
      ),
    );
    const trigger = host.querySelector("button")!;
    trigger.focus();
    return trigger;
  };

  const openRows = async (trigger: HTMLElement, sheet: boolean) => {
    if (sheet) await tap(trigger);
    else await key(trigger, "ArrowDown");
    await settle(300);
  };

  it.each([
    ["menu", false],
    ["touch-opened sheet", true],
  ])("passes each row's attributes, focus and pointer-enter handlers through in the %s", async (_mode, sheet) => {
    const focused: string[] = [];
    const entered: string[] = [];
    const trigger = await mountRows({ onFocus: (row) => focused.push(row), onPointerEnter: (row) => entered.push(row) });
    await openRows(trigger, sheet);
    expect(menu()!.getAttribute("data-menu")).toBe("faces");
    focused.length = 0;
    for (const name of ["happy", "checkbox", "item", "sad"]) {
      const row = document.querySelector<HTMLElement>(`[data-row="${name}"]`)!;
      await act(async () => row.focus());
      await act(async () => {
        row.dispatchEvent(new Event("pointerenter"));
      });
    }
    expect(focused).toEqual(["happy", "checkbox", "item", "sad"]);
    expect(entered).toEqual(["happy", "checkbox", "item", "sad"]);
  });

  it.each([
    ["menu", false, "menu"],
    ["touch-opened sheet", true, "menu"],
  ])("marks its trigger expanded while the %s is open, and collapsed after", async (_mode, sheet, popup) => {
    const trigger = await mountRows({ onFocus: () => {}, onPointerEnter: () => {} });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.getAttribute("aria-haspopup")).toBe(popup);
    await openRows(trigger, sheet);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(trigger.getAttribute("data-state")).toBe("open");
    await act(async () => document.querySelector<HTMLElement>('[data-row="item"]')!.click());
    await settle(400);
    await settle(10);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.getAttribute("data-state")).toBe("closed");
  });

  it("opens the touch-opened sheet with focus on the chosen option, so no other option previews", async () => {
    const focused: string[] = [];
    const trigger = await mountRows({ onFocus: (row) => focused.push(row), onPointerEnter: () => {} });
    await openRows(trigger, true);
    expect(document.activeElement?.getAttribute("data-row")).toBe("sad");
    expect(focused).toEqual(["sad"]);
  });

  it.each([
    ["menu", false],
    ["touch-opened sheet", true],
  ])("keeps the %s open when a checkbox row's onSelect prevents it, and closes it otherwise", async (_mode, sheet) => {
    for (const keepOpen of [true, false]) {
      const trigger = await mountRows({ onFocus: () => {}, onPointerEnter: () => {}, keepOpen });
      await openRows(trigger, sheet);
      await act(async () => document.querySelector<HTMLElement>('[data-row="checkbox"]')!.click());
      await settle(300);
      expect(menu() !== null).toBe(keepOpen);
      await act(async () => render(null, host!));
      host!.remove();
      host = undefined;
      await settle(50);
    }
  });

  it.each([
    ["menu", false],
    ["touch-opened sheet", true],
  ])("lets onCloseAutoFocus keep focus from returning to the trigger in the %s", async (_mode, sheet) => {
    const elsewhere = document.body.appendChild(document.createElement("input"));
    const onCloseAutoFocus = vi.fn((event: Event) => {
      event.preventDefault();
      elsewhere.focus();
    });
    const trigger = await mountRows({ onFocus: () => {}, onPointerEnter: () => {}, onCloseAutoFocus });
    await openRows(trigger, sheet);
    await act(async () => document.querySelector<HTMLElement>('[data-row="item"]')!.click());
    await settle(400);
    await settle(10);
    expect(menu()).toBeNull();
    expect(onCloseAutoFocus).toHaveBeenCalled();
    expect(document.activeElement).toBe(elsewhere);
  });
});

describe("the Dropdown's form follows the pointer that opens it, at any width", () => {
  const formOf = () => (menu() === null ? "closed" : sheetMenu() ? "sheet" : "menu");

  it.each([
    ["phone", "touch", "sheet", true],
    ["desktop", "touch", "sheet", false],
    ["phone", "pen", "sheet", true],
    ["desktop", "pen", "sheet", false],
    ["phone", "mouse", "menu", true],
    ["desktop", "mouse", "menu", false],
  ])("at the %s width, a menu opened by a %s pointer opens as a %s", async (_width, pointerType, form, phoneWidth) => {
    await setPhone(phoneWidth);
    const { trigger } = await mount();
    await pointer(trigger, pointerType);
    await settle(300);
    expect(formOf()).toBe(form);
  });

  it.each([
    ["phone", "Enter", true],
    ["phone", " ", true],
    ["phone", "ArrowDown", true],
    ["desktop", "Enter", false],
  ])("at the %s width, a menu opened from the keyboard with %j opens as a menu", async (_width, name, phoneWidth) => {
    await setPhone(phoneWidth);
    const { trigger } = await mount();
    await key(trigger, name);
    await settle(300);
    expect(formOf()).toBe("menu");
  });

  it("opens as a menu when it is opened with no pointer event, at the phone width", async () => {
    await setPhone(true);
    host = document.body.appendChild(document.createElement("div"));
    await act(async () =>
      render(
        <DropdownRoot open>
          <DropdownTrigger asChild>
            <button type="button">App menu</button>
          </DropdownTrigger>
          <DropdownContent>
            <DropdownItem>Settings</DropdownItem>
          </DropdownContent>
        </DropdownRoot>,
        host!,
      ),
    );
    await settle(300);
    expect(formOf()).toBe("menu");
  });

  it("follows each opening on one page: a finger gives the sheet, then a mouse gives the menu, then a finger the sheet again", async () => {
    const { trigger } = await mount();
    const seen: string[] = [];
    for (const pointerType of ["touch", "mouse", "touch"]) {
      await pointer(trigger, pointerType);
      await settle(300);
      seen.push(formOf());
      await key(document.activeElement!, "Escape");
      await settle(400);
      expect(formOf()).toBe("closed");
    }
    expect(seen).toEqual(["sheet", "menu", "sheet"]);
  });

  it("keeps the sheet a finger opened when the window crosses into the phone width and back, and when a mouse then presses inside it", async () => {
    const { trigger } = await mount();
    await tap(trigger);
    await settle(300);
    expect(formOf()).toBe("sheet");
    await setPhone(true);
    await settle(50);
    expect(formOf()).toBe("sheet");
    await setPhone(false);
    await settle(50);
    expect(formOf()).toBe("sheet");
    await act(async () => {
      menu()!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerType: "mouse" }));
    });
    await settle(50);
    expect(formOf()).toBe("sheet");
  });

  it("keeps the menu a mouse opened at the phone width when the window widens, and when a finger then touches inside it", async () => {
    await setPhone(true);
    const { trigger } = await mount();
    await pointer(trigger, "mouse");
    await settle(300);
    expect(formOf()).toBe("menu");
    await setPhone(false);
    await settle(50);
    expect(formOf()).toBe("menu");
    await act(async () => {
      menu()!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerType: "touch" }));
    });
    await settle(50);
    expect(formOf()).toBe("menu");
  });

  it.each([
    ["phone", true],
    ["desktop", false],
  ])("at the %s width, opens as a menu from a click no pointer made, as assistive tools send", async (_width, phoneWidth) => {
    await setPhone(phoneWidth);
    const { trigger } = await mount();
    await act(async () => trigger.click());
    await settle(300);
    expect(formOf()).toBe("menu");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });

  it("closes a menu that is not modal when a mouse presses its trigger, and does not reopen it on that press's click", async () => {
    host = document.body.appendChild(document.createElement("div"));
    await act(async () =>
      render(
        <DropdownRoot modal={false}>
          <DropdownTrigger asChild>
            <button type="button">Menu</button>
          </DropdownTrigger>
          <DropdownContent>
            <DropdownItem>Settings</DropdownItem>
          </DropdownContent>
        </DropdownRoot>,
        host!,
      ),
    );
    const trigger = host.querySelector("button")!;
    await pointer(trigger, "mouse");
    await settle(300);
    expect(formOf()).toBe("menu");
    await act(async () => {
      trigger.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerType: "mouse", button: 0 }));
      trigger.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }));
    });
    await settle(400);
    expect(formOf()).toBe("closed");
  });

  it("closes a menu that is not modal when a finger presses its trigger, and does not reopen it as a sheet", async () => {
    host = document.body.appendChild(document.createElement("div"));
    await act(async () =>
      render(
        <DropdownRoot modal={false}>
          <DropdownTrigger asChild>
            <button type="button">Menu</button>
          </DropdownTrigger>
          <DropdownContent>
            <DropdownItem>Settings</DropdownItem>
          </DropdownContent>
        </DropdownRoot>,
        host!,
      ),
    );
    const trigger = host.querySelector("button")!;
    await pointer(trigger, "mouse");
    await settle(300);
    expect(formOf()).toBe("menu");
    await tap(trigger);
    await settle(400);
    expect(formOf()).toBe("closed");
  });

  it("does not open from a touch that turns into a scroll, and the next mouse press still gives the menu", async () => {
    const { trigger } = await mount();
    await act(async () => {
      trigger.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerType: "touch" }));
      trigger.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerType: "touch" }));
    });
    await settle(300);
    expect(formOf()).toBe("closed");
    await pointer(trigger, "mouse");
    await settle(300);
    expect(formOf()).toBe("menu");
  });
});

describe("Dropdown in fullscreen", () => {
  const enterFullscreen = () => {
    const stage = document.body.appendChild(document.createElement("div"));
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => stage,
    });
    return stage;
  };

  afterEach(() => {
    delete (document as { fullscreenElement?: Element }).fullscreenElement;
  });

  it("opens its menu inside the fullscreen element so it stays on screen", async () => {
    const stage = enterFullscreen();
    const { trigger } = await mountRadio();
    await key(trigger, "ArrowDown");
    await settle(50);
    expect(menu()).not.toBeNull();
    expect(stage.contains(menu())).toBe(true);
  });

  it("opens the touch-opened sheet inside the fullscreen element", async () => {
    const stage = enterFullscreen();
    const { trigger } = await mountRadio();
    await tap(trigger);
    await settle(300);
    expect(menu()).not.toBeNull();
    expect(stage.contains(menu())).toBe(true);
  });

  it("opens in the document body outside fullscreen", async () => {
    const { trigger } = await mountRadio();
    await key(trigger, "ArrowDown");
    await settle(50);
    expect(menu()!.closest("body")).toBe(document.body);
    expect(host!.contains(menu())).toBe(false);
  });
});

describe("DropdownLabel variants", () => {
  it("draws a heading label as a small uppercase muted group heading, not an item", async () => {
    host = document.body.appendChild(document.createElement("div"));
    await act(async () =>
      render(
        <DropdownRoot defaultOpen>
          <DropdownTrigger asChild>
            <button type="button">Sort</button>
          </DropdownTrigger>
          <DropdownContent>
            <DropdownLabel variant="heading">Sort by</DropdownLabel>
            <DropdownItem>Name</DropdownItem>
          </DropdownContent>
        </DropdownRoot>,
        host!,
      ),
    );
    await settle(50);
    const heading = menu()!.firstElementChild as HTMLElement;
    expect(heading.textContent).toBe("Sort by");
    expect(heading.getAttribute("role")).toBeNull();
    expect(heading.className).toContain("uppercase");
    expect(heading.className).toContain("text-muted");
  });
});

describe("DropdownItemText", () => {
  it("puts an item's hint on its own line beneath its label, and is the label alone without one", async () => {
    host = document.body.appendChild(document.createElement("div"));
    await act(async () =>
      render(
        <DropdownRoot defaultOpen>
          <DropdownTrigger asChild>
            <button type="button">Face</button>
          </DropdownTrigger>
          <DropdownContent>
            <DropdownRadioGroup value="happy" label="Face">
              <DropdownRadioItem value="happy" indicator="end">
                <DropdownItemText hint="Default">Happy</DropdownItemText>
              </DropdownRadioItem>
              <DropdownRadioItem value="sad" indicator="end">
                <DropdownItemText>Sad</DropdownItemText>
              </DropdownRadioItem>
            </DropdownRadioGroup>
          </DropdownContent>
        </DropdownRoot>,
        host!,
      ),
    );
    await settle(50);
    const [happy, sad] = Array.from(menu()!.querySelectorAll<HTMLElement>('[role="menuitemradio"]'));
    const text = happy!.querySelector<HTMLElement>("[data-dropdown-item-text]")!;
    expect(text.className.split(" ")).toContain("flex-col");
    expect(Array.from(text.children).map((child) => [child.tagName, child.textContent])).toEqual([
      ["SPAN", "Happy"],
      ["SMALL", "Default"],
    ]);
    expect(text.lastElementChild!.className.split(" ")).toEqual(expect.arrayContaining(["text-[11px]/[1.4]", "text-muted"]));
    expect(sad!.querySelector("small")).toBeNull();
    expect(sad!.textContent).toBe("Sad");
  });
});

describe("DropdownContent keepClear", () => {
  const PICTURE = { top: 158, bottom: 414, left: 892, right: 1414 };
  const SHORT_PICTURE = { top: 158, bottom: 200, left: 892, right: 1414 };
  const TRIGGER = { top: 438, bottom: 482, left: 892, right: 1058 };
  const MENU = { width: 180, height: 158 };
  const box = (r: { top: number; bottom: number; left: number; right: number }) =>
    ({ ...r, x: r.left, y: r.top, width: r.right - r.left, height: r.bottom - r.top, toJSON: () => r }) as DOMRect;

  const floating = (element: Element) =>
    element.hasAttribute("data-radix-popper-content-wrapper") || element.getAttribute("role") === "menu";

  const stubGeometry = (height: number, picture = PICTURE) => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
    Object.defineProperty(document.documentElement, "clientWidth", { configurable: true, value: 1440 });
    Object.defineProperty(document.documentElement, "clientHeight", { configurable: true, value: height });
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      if (this.hasAttribute("data-picture")) return box(picture);
      if (this.hasAttribute("data-face")) return box(TRIGGER);
      if (floating(this)) return box({ top: 0, left: 0, bottom: MENU.height, right: MENU.width });
      return box({ top: 0, left: 0, bottom: 0, right: 0 });
    });
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (this: HTMLElement) {
      return floating(this) ? MENU.width : 0;
    });
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
      return floating(this) ? MENU.height : 0;
    });
  };

  afterEach(() => {
    vi.restoreAllMocks();
    for (const target of [window, document.documentElement]) {
      for (const name of ["innerWidth", "innerHeight", "clientWidth", "clientHeight"]) {
        delete (target as unknown as Record<string, unknown>)[name];
      }
    }
  });

  const mountFaceMenu = async () => {
    host = document.body.appendChild(document.createElement("div"));
    const picture = { current: null as HTMLDivElement | null };
    await act(async () =>
      render(
        <>
          <div data-picture ref={(element) => { picture.current = element; }} />
          <DropdownRoot>
            <DropdownTrigger asChild>
              <button type="button" data-face>Happy</button>
            </DropdownTrigger>
            <DropdownContent align="end" keepClear={picture} style={{ width: `${MENU.width}px`, height: `${MENU.height}px` }}>
              <DropdownRadioGroup value="happy" label="Face">
                <DropdownRadioItem value="happy">Happy</DropdownRadioItem>
                <DropdownRadioItem value="angry">Angry</DropdownRadioItem>
                <DropdownRadioItem value="sad">Sad</DropdownRadioItem>
              </DropdownRadioGroup>
            </DropdownContent>
          </DropdownRoot>
        </>,
        host!,
      ),
    );
    const trigger = host.querySelector<HTMLButtonElement>("[data-face]")!;
    trigger.focus();
    await key(trigger, "ArrowDown");
    await settle(50);
    return placement();
  };

  const placement = () => {
    const wrapper = menu()!.closest<HTMLElement>("[data-radix-popper-content-wrapper]")!;
    const [, y] = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(wrapper.style.transform)!.slice(1).map(Number);
    return { side: menu()!.dataset.side, top: y, room: wrapper.style.getPropertyValue("--radix-popper-available-height") };
  };

  it("moves below its trigger when the kept-clear element grows while the menu is open", async () => {
    const picture = { ...SHORT_PICTURE };
    stubGeometry(560, picture);
    expect((await mountFaceMenu()).side).toBe("top");
    picture.bottom = PICTURE.bottom;
    await act(async () => {
      window.dispatchEvent(new Event("resize"));
    });
    await settle(50);
    const placed = placement();
    expect(placed.side).toBe("bottom");
    expect(placed.top).toBeGreaterThanOrEqual(PICTURE.bottom);
  });

  it("opens below its trigger in the room under the kept-clear element when the room above is under that element", async () => {
    stubGeometry(560);
    const placed = await mountFaceMenu();
    expect(placed.side).toBe("bottom");
    expect(placed.top).toBeGreaterThanOrEqual(PICTURE.bottom);
    expect(placed.room).toBe(`${560 - 12 - TRIGGER.bottom - 6}px`);
    expect(menu()!.className.split(" ")).toContain("max-h-[var(--radix-dropdown-menu-content-available-height)]");
  });

  it("opens above its trigger, still under the kept-clear element, when the room there is larger", async () => {
    stubGeometry(560, SHORT_PICTURE);
    const placed = await mountFaceMenu();
    expect(placed.side).toBe("top");
    expect(placed.top).toBeGreaterThanOrEqual(SHORT_PICTURE.bottom);
    expect(placed.room).toBe(`${TRIGGER.top - 6 - SHORT_PICTURE.bottom - 6}px`);
  });

  it("still opens below its trigger when everything fits there", async () => {
    stubGeometry(900);
    const placed = await mountFaceMenu();
    expect(placed.side).toBe("bottom");
    expect(placed.top).toBe(TRIGGER.bottom + 6);
  });
});
