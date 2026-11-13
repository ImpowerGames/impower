import { render, type ComponentChild } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import Carousel, { carouselItemVariants } from "./Carousel";

let host: HTMLDivElement | undefined;

const mount = async (node: ComponentChild) => {
  host ??= document.body.appendChild(document.createElement("div"));
  await act(async () => render(node, host!));
  return host.querySelector<HTMLElement>("[data-carousel]")!;
};

const cards = (count: number) =>
  Array.from({ length: count }, (_, at) => (
    <button key={at} type="button">
      Card {at + 1}
    </button>
  ));

const LABELS = {
  label: "Browse backdrops",
  previousLabel: "Previous backdrop",
  nextLabel: "Next backdrop",
};

const parts = (carousel: HTMLElement) => ({
  previous: carousel.querySelector<HTMLButtonElement>('[aria-label="Previous backdrop"]')!,
  next: carousel.querySelector<HTMLButtonElement>('[aria-label="Next backdrop"]')!,
  position: carousel.querySelector<HTMLElement>("[aria-live]")!,
  items: Array.from(carousel.querySelectorAll<HTMLElement>("[data-carousel-item]")),
});

const current = (carousel: HTMLElement) =>
  parts(carousel).items.findIndex((item) => item.getAttribute("aria-current") === "true");

const key = async (target: Element, name: string) =>
  act(async () => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }));
  });

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
});

describe("Carousel", () => {
  it("shows its position politely and holds the first card current", async () => {
    const carousel = await mount(<Carousel {...LABELS}>{cards(7)}</Carousel>);
    const { position, previous, next, items } = parts(carousel);
    expect(items).toHaveLength(7);
    expect(position.getAttribute("aria-live")).toBe("polite");
    expect(position.textContent).toBe("1 / 7Item 1 of 7");
    expect(position.querySelector("[aria-hidden]")!.textContent).toBe("1 / 7");
    expect(current(carousel)).toBe(0);
    expect(previous.disabled).toBe(true);
    expect(next.disabled).toBe(false);
    expect(carousel.querySelector('[role="group"]')!.getAttribute("aria-label")).toBe("Browse backdrops");
  });

  it("steps with Previous and Next and stops at either end", async () => {
    const changes: number[] = [];
    const carousel = await mount(
      <Carousel {...LABELS} onIndexChange={(index) => changes.push(index)}>
        {cards(3)}
      </Carousel>,
    );
    const { previous, next, position } = parts(carousel);
    await act(async () => next.click());
    await act(async () => next.click());
    expect(position.textContent).toContain("3 / 3");
    expect(current(carousel)).toBe(2);
    expect(next.disabled).toBe(true);
    await act(async () => next.click());
    await act(async () => previous.click());
    expect(position.textContent).toContain("2 / 3");
    expect(changes).toEqual([1, 2, 1]);
  });

  it("moves focus between cards with the arrow keys, Home and End", async () => {
    const carousel = await mount(<Carousel {...LABELS}>{cards(4)}</Carousel>);
    const buttons = () => Array.from(carousel.querySelectorAll<HTMLButtonElement>("[data-carousel-item] button"));
    buttons()[0]!.focus();
    await key(buttons()[0]!, "ArrowRight");
    expect(document.activeElement).toBe(buttons()[1]);
    await key(buttons()[1]!, "End");
    expect(document.activeElement).toBe(buttons()[3]);
    expect(current(carousel)).toBe(3);
    await key(buttons()[3]!, "ArrowRight");
    expect(document.activeElement).toBe(buttons()[3]);
    await key(buttons()[3]!, "Home");
    expect(document.activeElement).toBe(buttons()[0]);
    expect(parts(carousel).position.textContent).toContain("1 / 4");
  });

  it("follows a controlled index and keeps it within the cards when they shrink", async () => {
    let carousel = await mount(
      <Carousel {...LABELS} index={4}>
        {cards(6)}
      </Carousel>,
    );
    expect(current(carousel)).toBe(4);
    carousel = await mount(
      <Carousel {...LABELS} index={4}>
        {cards(2)}
      </Carousel>,
    );
    expect(current(carousel)).toBe(1);
    expect(parts(carousel).position.textContent).toContain("2 / 2");
    expect(parts(carousel).next.disabled).toBe(true);
  });

  it("pans its track by touch on either axis, from a card or the gap, with no card narrowing the gesture", async () => {
    const carousel = await mount(<Carousel {...LABELS}>{cards(3)}</Carousel>);
    const track = carousel.querySelector<HTMLElement>("[data-carousel-track]")!;
    const touchClasses = (el: Element) => Array.from(el.classList).filter((name) => /(^|:)touch-|scroller-x|overflow-x-/.test(name));
    expect(touchClasses(track)).toEqual(["scroller-x"]);
    for (const item of parts(carousel).items) {
      expect(touchClasses(item)).toEqual([]);
      for (const child of Array.from(item.querySelectorAll("*"))) expect(touchClasses(child)).toEqual([]);
    }
  });

  it("scrolls the chosen card into place, without motion when motion is reduced", async () => {
    const reduce = vi.fn((query: string) => ({ matches: query.includes("reduce") }) as MediaQueryList);
    vi.stubGlobal("matchMedia", reduce);
    const carousel = await mount(<Carousel {...LABELS}>{cards(3)}</Carousel>);
    const track = carousel.querySelector<HTMLElement>("[data-carousel-track]")!;
    const scrollBy = vi.fn();
    track.scrollBy = scrollBy as typeof track.scrollBy;
    parts(carousel).items[1]!.getBoundingClientRect = () => ({ left: 300 }) as DOMRect;
    track.getBoundingClientRect = () => ({ left: 0 }) as DOMRect;
    await act(async () => parts(carousel).next.click());
    expect(scrollBy).toHaveBeenCalledWith({ left: 300 - 12, behavior: "auto" });
    vi.unstubAllGlobals();
  });

  it("puts the trailing control beside the navigation, and sizes cards as a share of the track", async () => {
    const carousel = await mount(
      <Carousel {...LABELS} trailing={<a href="#settings">Settings</a>}>
        {cards(1)}
      </Carousel>,
    );
    expect(carousel.querySelector("footer a")!.textContent).toBe("Settings");
    expect(parts(carousel).previous.disabled && parts(carousel).next.disabled).toBe(true);
    expect(carouselItemVariants()).toContain("snap-start");
  });
});
