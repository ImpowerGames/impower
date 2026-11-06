import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useHoldRepeat } from "./useHoldRepeat";

function Skip({ onSkip }: { onSkip: () => void }) {
  const hold = useHoldRepeat(onSkip);
  return (
    <button
      type="button"
      data-pressed={hold.pressed ? "" : undefined}
      onPointerDown={hold.onPointerDown}
      onPointerUp={hold.onPointerUp}
      onPointerCancel={hold.onPointerCancel}
      onPointerLeave={hold.onPointerLeave}
      onClick={hold.onClick}
    >
      Skip forward
    </button>
  );
}

let host: HTMLDivElement;

const mount = async () => {
  const onSkip = vi.fn();
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(<Skip onSkip={onSkip} />, host));
  return { button: host.querySelector("button")!, onSkip };
};

const pointer = (button: HTMLElement, type: string) =>
  act(() => {
    button.dispatchEvent(
      new MouseEvent(type, { bubbles: true, button: 0, detail: 1 }),
    );
  });

const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(async () => {
  await act(async () => render(null, host));
  host.remove();
  vi.useRealTimers();
});

describe("useHoldRepeat", () => {
  it("acts once for a tap", async () => {
    const { button, onSkip } = await mount();
    await pointer(button, "pointerdown");
    await advance(100);
    await pointer(button, "pointerup");
    await pointer(button, "click");
    await advance(1000);
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it("repeats at 400ms and then every 100ms while held, and swallows the release click", async () => {
    const { button, onSkip } = await mount();
    await pointer(button, "pointerdown");
    await advance(399);
    expect(onSkip).toHaveBeenCalledTimes(0);
    await advance(1);
    expect(onSkip).toHaveBeenCalledTimes(1);
    await advance(100);
    expect(onSkip).toHaveBeenCalledTimes(2);
    await advance(300);
    expect(onSkip).toHaveBeenCalledTimes(5);
    await pointer(button, "pointerup");
    await pointer(button, "click");
    await advance(1000);
    expect(onSkip).toHaveBeenCalledTimes(5);
  });

  it("is pressed only while held", async () => {
    const { button } = await mount();
    expect(button.hasAttribute("data-pressed")).toBe(false);
    await pointer(button, "pointerdown");
    expect(button.hasAttribute("data-pressed")).toBe(true);
    await pointer(button, "pointerup");
    expect(button.hasAttribute("data-pressed")).toBe(false);
  });

  it("stops repeating when the pointer leaves, and the next keyboard click acts", async () => {
    const { button, onSkip } = await mount();
    await pointer(button, "pointerdown");
    await advance(500);
    expect(onSkip).toHaveBeenCalledTimes(2);
    await pointer(button, "pointerleave");
    await advance(1000);
    expect(onSkip).toHaveBeenCalledTimes(2);
    await act(() => button.click());
    expect(onSkip).toHaveBeenCalledTimes(3);
  });
});
