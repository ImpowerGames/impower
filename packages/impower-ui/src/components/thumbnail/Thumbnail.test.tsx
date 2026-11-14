import { render, type ComponentChild } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import Thumbnail from "./Thumbnail";

let host: HTMLDivElement | undefined;

const mount = async (node: ComponentChild) => {
  host ??= document.body.appendChild(document.createElement("div"));
  await act(async () => render(node, host!));
  return host.querySelector<HTMLElement>("[data-thumbnail]")!;
};

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
});

describe("Thumbnail", () => {
  it("decodes its picture lazily inside a fixed box", async () => {
    const frame = await mount(<Thumbnail src="/a.png" />);
    const image = frame.querySelector("img")!;
    expect(image.getAttribute("loading")).toBe("lazy");
    expect(image.getAttribute("decoding")).toBe("async");
    expect(image.className).toContain("object-cover");
    expect(frame.className).toContain("size-11");
    expect((await mount(<Thumbnail src="/a.png" size="fill" fit="contain" />)).className).toContain("size-full");
    expect(host!.querySelector("img")!.className).toContain("object-contain");
  });

  it("fits a picture to the box's height, centred, letting a wide picture's sides overflow", async () => {
    const image = (await mount(<Thumbnail src="/a.png" size="fill" fit="height" />)).querySelector("img")!;
    const classes = image.className.split(" ");
    expect(classes).toEqual(expect.arrayContaining(["inset-y-0", "left-1/2", "h-full", "w-auto", "max-w-none", "-translate-x-1/2"]));
    expect(classes).not.toContain("size-full");
    expect(classes).not.toContain("inset-0");
  });

  it("shows the image glyph when the picture fails to decode or has no address, and tries a new address again", async () => {
    const frame = await mount(<Thumbnail src="/broken.png" alt="bunny" />);
    await act(async () => {
      frame.querySelector("img")!.dispatchEvent(new Event("error"));
    });
    expect(frame.querySelector("img")).toBeNull();
    expect(frame.querySelector("svg")).not.toBeNull();
    expect(frame.hasAttribute("data-thumbnail-failed")).toBe(true);
    expect(frame.getAttribute("aria-label")).toBe("bunny");
    const next = await mount(<Thumbnail src="/fixed.png" alt="bunny" />);
    expect(next.querySelector("img")?.getAttribute("src")).toBe("/fixed.png");
    const empty = await mount(<Thumbnail />);
    expect(empty.querySelector("svg")).not.toBeNull();
    expect(empty.getAttribute("aria-hidden")).toBe("true");
  });

  it("shows a given glyph in place of the picture, at the card size of a picker's list", async () => {
    const frame = await mount(<Thumbnail size="card" glyph={<svg data-sound-glyph />} />);
    expect(frame.className).toContain("h-[52px]");
    expect(frame.className).toContain("w-16");
    expect(frame.querySelector("[data-sound-glyph]")).not.toBeNull();
    expect(frame.hasAttribute("data-thumbnail-failed")).toBe(false);
  });
});
