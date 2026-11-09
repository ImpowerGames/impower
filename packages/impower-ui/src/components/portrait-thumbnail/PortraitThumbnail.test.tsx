import { render, type ComponentChild } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import PortraitThumbnail, { portraitCropLabel, portraitThumbnailVariants } from "./PortraitThumbnail";

let host: HTMLDivElement | undefined;

const mount = async (node: ComponentChild) => {
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(node, host!));
  return host.querySelector<HTMLElement>("[data-portrait-thumbnail]")!;
};

const loaded = async (frame: HTMLElement, width: number, height: number) => {
  const image = frame.querySelector("img")!;
  Object.defineProperty(image, "naturalWidth", { value: width, configurable: true });
  Object.defineProperty(image, "naturalHeight", { value: height, configurable: true });
  await act(async () => {
    image.dispatchEvent(new Event("load"));
  });
};

const windowOf = (frame: HTMLElement) => frame.firstElementChild as HTMLElement;

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
});

describe("PortraitThumbnail", () => {
  it("names a crop as the top part it keeps, or the whole image, reading an out-of-range crop as the nearest percentage", () => {
    expect([portraitCropLabel(25), portraitCropLabel(60), portraitCropLabel(100), portraitCropLabel(140), portraitCropLabel(Number.NaN)]).toEqual([
      "Top 25%",
      "Top 60%",
      "Whole image",
      "Whole image",
      "Whole image",
    ]);
  });

  it("shows the top part of the picture its crop asks for, at the picture's full width", async () => {
    const frame = await mount(<PortraitThumbnail src="blob:imani" crop={50} size="example" />);
    expect(frame.getAttribute("aria-hidden")).toBe("true");
    expect(frame.dataset.visiblePercent).toBe("50");
    await loaded(frame, 300, 600);
    expect(windowOf(frame).style.getPropertyValue("--portrait-ratio")).toBe("1");
    expect(windowOf(frame).className).toContain("aspect-(--portrait-ratio)");
    expect(frame.querySelector("img")!.className).toContain("w-full");
  });

  it("follows a new crop and shows the whole picture at 100", async () => {
    const frame = await mount(<PortraitThumbnail src="blob:imani" crop={25} />);
    await loaded(frame, 300, 600);
    expect(windowOf(frame).style.getPropertyValue("--portrait-ratio")).toBe("2");
    await act(async () => render(<PortraitThumbnail src="blob:imani" crop={100} />, host!));
    expect(windowOf(frame).style.getPropertyValue("--portrait-ratio")).toBe("0.5");
  });

  it("draws an empty frame without a picture, and names the picture when given alt text", async () => {
    const empty = await mount(<PortraitThumbnail crop={50} size="example" />);
    expect(empty.querySelector("img")).toBeNull();
    expect(empty.className).toContain("border-edge");
    await act(async () => render(<PortraitThumbnail src="blob:imani" crop={50} alt="Imani" />, host!));
    const named = host!.querySelector<HTMLElement>("[data-portrait-thumbnail]")!;
    expect(named.getAttribute("role")).toBe("img");
    expect(named.getAttribute("aria-label")).toBe("Imani");
    expect(portraitThumbnailVariants({ size: "tile" })).toContain("w-16");
  });
});
