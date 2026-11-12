import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  popoverVariants,
} from "./Popover";

let host: HTMLDivElement | undefined;

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
  document.body.innerHTML = "";
  document.body.removeAttribute("style");
});

const settle = (ms = 0) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });

const panel = () => document.querySelector<HTMLElement>('[role="dialog"]');

const key = (target: Element, name: string) =>
  act(async () => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }),
    );
  });

const press = (target: HTMLElement) =>
  act(async () => {
    target.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 }),
    );
    target.click();
  });

const mount = async (onOpenChange = vi.fn()) => {
  host = document.body.appendChild(document.createElement("div"));
  const outside = document.body.appendChild(document.createElement("button"));
  outside.textContent = "Elsewhere";
  await act(async () =>
    render(
      <Popover onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <button type="button">Writing tools</button>
        </PopoverTrigger>
        <PopoverContent size="panel" side="top" align="start">
          <button type="button">Sparkdown guide</button>
        </PopoverContent>
      </Popover>,
      host!,
    ),
  );
  const trigger = host.querySelector("button")!;
  trigger.focus();
  return { trigger, outside, onOpenChange };
};

const open = async (trigger: HTMLElement) => {
  await act(async () => trigger.click());
  await settle(50);
};

describe("Popover under preact/compat", () => {
  it("opens from its trigger, moves focus inside and marks the trigger expanded", async () => {
    const { trigger, onOpenChange } = await mount();
    expect(panel()).toBeNull();
    await open(trigger);
    expect(panel()).not.toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(panel()!.contains(document.activeElement)).toBe(true);
    expect(panel()!.className).toContain("w-[360px]");
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    const { trigger } = await mount();
    await open(trigger);
    await key(document.activeElement!, "Escape");
    await settle(250);
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes on a press outside it", async () => {
    const { trigger, outside, onOpenChange } = await mount();
    await open(trigger);
    await press(outside);
    await settle(250);
    expect(panel()).toBeNull();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it("draws its own card frame unless frame is none, which leaves the frame to what it holds", async () => {
    const { trigger } = await mount();
    await open(trigger);
    expect(panel()!.className).toContain("rounded-card");
    expect(panel()!.className).toContain("bg-panel");
    expect(panel()!.className).toContain("shadow-float");
    const bare = popoverVariants({ frame: "none" });
    expect(bare).not.toContain("rounded-card");
    expect(bare).not.toContain("bg-panel");
    expect(bare).not.toContain("border-edge");
    expect(bare).not.toContain("shadow-float");
    expect(bare).toContain("motion-safe:data-[state=open]:anim-menu-in");
  });

  it("closes from its trigger", async () => {
    const { trigger } = await mount();
    await open(trigger);
    await act(async () => trigger.click());
    await settle(250);
    expect(panel()).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });
});
