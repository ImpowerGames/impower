import { render, type ComponentChild } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import FixMenu from "./FixMenu";

let host: HTMLDivElement | undefined;

beforeAll(() => {
  window.matchMedia = (query: string) =>
    ({
      matches: query.includes("min-width"),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
});

const mount = async (node: ComponentChild) => {
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(node, host!));
  return host;
};

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
  document.body.innerHTML = "";
});

const settle = (ms = 0) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });

const USE = { name: "Use alice instead", done: "Changed to alice." };
const REMOVE = { name: "Remove the note", done: "Note removed." };

describe("FixMenu", () => {
  it("draws nothing without actions", async () => {
    const root = await mount(<FixMenu actions={[]} onChoose={() => {}} />);
    expect(root.innerHTML).toBe("");
  });

  it("is one button labelled with the action when there is one", async () => {
    const onChoose = vi.fn();
    const root = await mount(<FixMenu actions={[USE]} onChoose={onChoose} />);
    const buttons = root.querySelectorAll("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]!.textContent).toBe("Use alice instead");
    expect(buttons[0]!.getAttribute("aria-haspopup")).toBeNull();
    await act(async () => buttons[0]!.click());
    expect(onChoose).toHaveBeenCalledWith(USE);
  });

  it("shows the busy state while a choice is in flight, keeps its focus and ignores another press", async () => {
    const onChoose = vi.fn();
    const root = await mount(<FixMenu busy actions={[USE]} onChoose={onChoose} />);
    const button = root.querySelector("button")!;
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.disabled).toBe(false);
    button.focus();
    await act(async () => button.click());
    expect(onChoose).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(button);
  });

  it("is a Fix menu of the action labels when there are several, choosing one", async () => {
    const onChoose = vi.fn();
    const onOpenChange = vi.fn();
    const root = await mount(
      <FixMenu
        actions={[USE, REMOVE]}
        onChoose={onChoose}
        onOpenChange={onOpenChange}
      />,
    );
    const trigger = root.querySelector("button")!;
    expect(trigger.textContent).toBe("Fix");
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    trigger.focus();
    await act(async () => {
      trigger.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }),
      );
    });
    await settle(50);
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    const items = Array.from(
      document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    );
    expect(items.map((item) => item.textContent)).toEqual([
      "Use alice instead",
      "Remove the note",
    ]);
    await act(async () => items[1]!.click());
    await settle(50);
    expect(onChoose).toHaveBeenCalledWith(REMOVE);
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });
});
