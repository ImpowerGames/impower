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
  });

  it("shows the folder glyph alone when the folder holds no pictures", async () => {
    const cover = await mount([]);
    expect(cover.getAttribute("data-folder-cover")).toBe("0");
    expect(cover.querySelectorAll("img").length).toBe(0);
    expect(cover.querySelectorAll("svg").length).toBe(1);
  });
});
