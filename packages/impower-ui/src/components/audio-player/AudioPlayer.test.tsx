import { render, type ComponentChild } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import AudioPlayer, { clock, type AudioPlayerProps } from "./AudioPlayer";

let host: HTMLDivElement | undefined;

const mount = async (node: ComponentChild) => {
  host ??= document.body.appendChild(document.createElement("div"));
  await act(async () => render(node, host!));
  return host;
};

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
});

const props = (overrides: Partial<AudioPlayerProps> = {}): AudioPlayerProps => ({
  name: "door",
  state: "ready",
  peaks: [10, 50, 100, 25],
  time: 0,
  duration: 80,
  loop: false,
  onToggle: vi.fn(),
  onSeek: vi.fn(),
  onRestart: vi.fn(),
  onLoopChange: vi.fn(),
  ...overrides,
});

const scrubber = (root: HTMLElement) => root.querySelector<HTMLElement>('[role="slider"]')!;

const key = async (target: HTMLElement, key: string) => {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
};

describe("clock", () => {
  it("writes seconds as m:ss, rounding down, hours past an hour, and an unknown length as 0:00", () => {
    expect([clock(0), clock(9.9), clock(61), clock(600), clock(3725), clock(Number.NaN), clock(-3)]).toEqual([
      "0:00",
      "0:09",
      "1:01",
      "10:00",
      "1:02:05",
      "0:00",
      "0:00",
    ]);
  });
});

describe("AudioPlayer", () => {
  it("never plays by itself: it renders Play and asks for nothing until pressed", async () => {
    const onToggle = vi.fn();
    const root = await mount(<AudioPlayer {...props({ onToggle })} />);
    const play = root.querySelector<HTMLButtonElement>("[data-audio-toggle]")!;
    expect(play.getAttribute("aria-label")).toBe("Play door");
    expect(onToggle).not.toHaveBeenCalled();
    await act(async () => play.click());
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("names its toggle Pause while playing and shows the elapsed and total time, each floored to whole seconds", async () => {
    const root = await mount(<AudioPlayer {...props({ state: "playing", time: 65, duration: 79.6 })} />);
    expect(root.querySelector("[data-audio-toggle]")!.getAttribute("aria-label")).toBe("Pause door");
    expect(root.querySelector("[data-audio-player]")!.getAttribute("data-state")).toBe("playing");
    expect(root.querySelector("[data-audio-elapsed]")!.textContent).toBe("1:05");
    expect(root.querySelector("[data-audio-total]")!.textContent).toBe("1:19");
  });

  it("names its toggle Play while paused and holds the place on the scrubber and in the time", async () => {
    const root = await mount(<AudioPlayer {...props({ state: "paused", time: 30, duration: 80 })} />);
    expect(root.querySelector("[data-audio-toggle]")!.getAttribute("aria-label")).toBe("Play door");
    expect(root.querySelector("[data-audio-player]")!.getAttribute("data-state")).toBe("paused");
    expect(scrubber(root).getAttribute("aria-valuenow")).toBe("30");
    expect(root.querySelector("[data-audio-elapsed]")!.textContent).toBe("0:30");
    expect(root.querySelector<HTMLElement>("[data-audio-wave]")!.style.getPropertyValue("--played")).toBe("37.50%");
  });

  it("lays out Play, Restart, the waveform and Loop in one row, and asks for a restart or a loop change when pressed", async () => {
    const onRestart = vi.fn();
    const onLoopChange = vi.fn();
    const root = await mount(<AudioPlayer {...props({ state: "playing", onRestart, onLoopChange })} />);
    const row = root.querySelector("[data-audio-toggle]")!.parentElement!;
    expect(Array.from(row.children).map((child) => child.getAttribute("aria-label") ?? child.querySelector("[role=slider]")?.getAttribute("aria-label"))).toEqual([
      "Pause door",
      "Restart",
      "Position",
      "Loop",
    ]);
    const restart = root.querySelector<HTMLButtonElement>("[data-audio-restart]")!;
    const loop = root.querySelector<HTMLButtonElement>("[data-audio-loop]")!;
    expect([restart.type, loop.type]).toEqual(["button", "button"]);
    expect(restart.hasAttribute("aria-pressed")).toBe(false);
    expect(loop.getAttribute("aria-pressed")).toBe("false");
    await act(async () => restart.click());
    await act(async () => loop.click());
    expect(onRestart).toHaveBeenCalledTimes(1);
    expect(onLoopChange).toHaveBeenCalledWith(true);
    await mount(<AudioPlayer {...props({ loop: true, onLoopChange })} />);
    expect(loop.getAttribute("aria-pressed")).toBe("true");
    await act(async () => loop.click());
    expect(onLoopChange).toHaveBeenLastCalledWith(false);
  });

  it("is a slider over the waveform with its bounds and spoken position", async () => {
    const root = await mount(<AudioPlayer {...props({ time: 20 })} />);
    const slider = scrubber(root);
    expect(slider.getAttribute("aria-label")).toBe("Position");
    expect(slider.tabIndex).toBe(0);
    expect([slider.getAttribute("aria-valuemin"), slider.getAttribute("aria-valuemax"), slider.getAttribute("aria-valuenow")]).toEqual([
      "0",
      "80",
      "20",
    ]);
    expect(slider.getAttribute("aria-valuetext")).toBe("0:20 of 1:20");
    expect(root.querySelectorAll("[data-audio-wave] rect").length).toBe(8);
  });

  it("seeks by the arrow keys a twentieth of the sound at a time, at least half a second, and to either end by Home and End", async () => {
    const onSeek = vi.fn();
    const root = await mount(<AudioPlayer {...props({ time: 20, onSeek })} />);
    const slider = scrubber(root);
    await key(slider, "ArrowRight");
    await key(slider, "ArrowUp");
    await key(slider, "ArrowLeft");
    await key(slider, "ArrowDown");
    await key(slider, "Home");
    await key(slider, "End");
    expect(onSeek.mock.calls.map(([seconds]) => seconds)).toEqual([24, 24, 16, 16, 0, 80]);
    onSeek.mockClear();
    await mount(<AudioPlayer {...props({ time: 1, duration: 4, onSeek })} />);
    await key(scrubber(root), "ArrowLeft");
    expect(onSeek).toHaveBeenCalledWith(0.5);
  });

  it("plays and stops by Space on the scrubber, without scrolling the page", async () => {
    const onToggle = vi.fn();
    const root = await mount(<AudioPlayer {...props({ onToggle })} />);
    const event = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
    await act(async () => {
      scrubber(root).dispatchEvent(event);
    });
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("seeks to the point pressed and follows a drag", async () => {
    const onSeek = vi.fn();
    const root = await mount(<AudioPlayer {...props({ onSeek })} />);
    const slider = scrubber(root);
    slider.getBoundingClientRect = () => ({ left: 100, width: 200, top: 0, height: 40, right: 300, bottom: 40, x: 100, y: 0, toJSON: () => ({}) }) as DOMRect;
    slider.setPointerCapture = () => undefined;
    slider.hasPointerCapture = () => true;
    await act(async () => {
      slider.dispatchEvent(new PointerEvent("pointerdown", { clientX: 150, pointerId: 1, button: 0, bubbles: true }));
      slider.dispatchEvent(new PointerEvent("pointermove", { clientX: 400, pointerId: 1, bubbles: true }));
    });
    expect(onSeek.mock.calls.map(([seconds]) => seconds)).toEqual([20, 80]);
  });

  it("leaves the wheel to the page around it", async () => {
    const root = await mount(<AudioPlayer {...props()} />);
    const wheel = new WheelEvent("wheel", { deltaY: 100, bubbles: true, cancelable: true });
    scrubber(root).dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(false);
  });

  it("shows the failure sentence in place of the controls, and draws no waveform", async () => {
    const root = await mount(<AudioPlayer {...props({ state: "failed", failure: "Can't play this file here.", peaks: null })} />);
    expect(root.querySelector('[role="status"]')!.textContent).toBe("Can't play this file here.");
    expect(root.querySelector("[data-audio-toggle]")).toBeNull();
    expect(root.querySelector("[data-audio-restart]")).toBeNull();
    expect(root.querySelector("[data-audio-loop]")).toBeNull();
    expect(root.querySelector('[role="slider"]')).toBeNull();
  });

  it("draws a plain track while loading and when the waveform is not known, and the loading bars only move when motion is allowed", async () => {
    const root = await mount(<AudioPlayer {...props({ state: "loading", peaks: undefined })} />);
    const wave = root.querySelector("[data-audio-wave]")!;
    expect(root.querySelector("[data-audio-toggle]")!.getAttribute("aria-label")).toBe("Play door");
    expect(wave.getAttribute("data-wave")).toBe("plain");
    expect(wave.className).toContain("motion-safe:animate-pulse");
    expect(wave.className).not.toMatch(/(^|\s)animate-pulse/);
    await mount(<AudioPlayer {...props({ peaks: null })} />);
    expect(root.querySelector("[data-audio-wave]")!.getAttribute("data-wave")).toBe("plain");
    expect(root.querySelector('[role="slider"]')).not.toBeNull();
  });

});
