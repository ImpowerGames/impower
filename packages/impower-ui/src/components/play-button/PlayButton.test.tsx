import { render, type ComponentChild } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import PlayButton from "./PlayButton";

let host: HTMLDivElement | undefined;

const mount = async (node: ComponentChild) => {
  host ??= document.body.appendChild(document.createElement("div"));
  await act(async () => render(node, host!));
  return host.querySelector<HTMLButtonElement>("button")!;
};

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
});

describe("PlayButton", () => {
  it("is a round button named Play, then Pause while playing, with the playing state on it", async () => {
    const onClick = vi.fn();
    const button = await mount(<PlayButton name="door" onClick={onClick} />);
    expect(button.type).toBe("button");
    expect(button.getAttribute("aria-label")).toBe("Play door");
    expect(button.hasAttribute("data-playing")).toBe(false);
    expect(button.querySelectorAll("svg path").length).toBe(1);
    await act(async () => button.click());
    expect(onClick).toHaveBeenCalledTimes(1);
    const playing = await mount(<PlayButton name="door" playing onClick={onClick} />);
    expect(playing.getAttribute("aria-label")).toBe("Pause door");
    expect(playing.title).toBe("Pause door");
    expect(playing.querySelectorAll("svg rect").length).toBe(2);
    expect(playing.hasAttribute("data-playing")).toBe(true);
    expect(playing.className).toContain("bg-tint");
  });

  it("is 44px in a row and 52px in a player", async () => {
    expect((await mount(<PlayButton name="door" />)).className).toContain("size-11");
    expect((await mount(<PlayButton name="door" size="large" />)).className).toContain("size-[52px]");
  });

  it("draws a strip's larger glyph in an accent ring, and an edge ring otherwise", async () => {
    const row = (await mount(<PlayButton name="door" />)).className;
    expect(row).toContain("border-edge");
    expect(row).toContain("[&_svg]:size-[18px]");
    const strip = (await mount(<PlayButton name="from this line" size="strip" ring="accent" />))
      .className;
    expect(strip).toContain("size-11");
    expect(strip).toContain("[&_svg]:size-[22px]");
    expect(strip).not.toContain("[&_svg]:size-[18px]");
    expect(strip).toContain("border-accent");
    expect(strip).not.toContain("border-edge");
  });
});
