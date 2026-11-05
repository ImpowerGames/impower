import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  DropdownContent,
  DropdownItem,
  DropdownLabel,
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

  it("shows the label in the phone layout's sheet", async () => {
    await setPhone(true);
    const { trigger } = await mount();
    await act(async () => trigger.click());
    await settle(300);
    expect(menu()).not.toBeNull();
    expect(menu()!.textContent).toContain(
      "No account needed to start writing.",
    );
  });
});
