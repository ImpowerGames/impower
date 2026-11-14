import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import FolderCover from "./FolderCover";

let host: HTMLDivElement | undefined;

const mount = async (sources: string[]) => {
  host ??= document.body.appendChild(document.createElement("div"));
  await act(async () => render(<FolderCover sources={sources} />, host!));
  return host.querySelector<HTMLElement>("[data-folder-cover]")!;
};

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
});

describe("FolderCover", () => {
  it("shows up to four covers from inside the folder, with the folder glyph in its corner", async () => {
    const cover = await mount(["/1.png", "/2.png", "/3.png", "/4.png", "/5.png"]);
    expect(cover.getAttribute("data-folder-cover")).toBe("4");
    expect(Array.from(cover.querySelectorAll("img")).map((image) => image.getAttribute("src"))).toEqual([
      "/1.png",
      "/2.png",
      "/3.png",
      "/4.png",
    ]);
    expect(cover.querySelectorAll("svg").length).toBe(1);
    expect(cover.querySelector("svg")!.parentElement!.className).toContain("bg-media-badge");
  });

  it("draws a single cover with the given fit and keeps several covers cropped to their tops", async () => {
    host = document.body.appendChild(document.createElement("div"));
    await act(async () => render(<FolderCover fit="height" sources={["/1.png"]} />, host!));
    expect(host.querySelector("img")!.className.split(" ")).toEqual(expect.arrayContaining(["h-full", "w-auto", "-translate-x-1/2"]));
    await act(async () => render(<FolderCover fit="height" sources={["/1.png", "/2.png"]} />, host!));
    for (const image of Array.from(host.querySelectorAll("img"))) {
      expect(image.className.split(" ")).toEqual(expect.arrayContaining(["object-cover", "object-top"]));
    }
    expect((await mount(["/1.png"])).querySelector("img")!.className).toContain("object-cover");
  });

  it("shows the folder glyph alone when the folder holds no pictures", async () => {
    const cover = await mount([]);
    expect(cover.getAttribute("data-folder-cover")).toBe("0");
    expect(cover.querySelectorAll("img").length).toBe(0);
    expect(cover.querySelectorAll("svg").length).toBe(1);
  });
});
