import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import Tile, { TILE_MIN_WIDTH, tileHeight } from "./Tile";

let host: HTMLDivElement | undefined;

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
});

describe("Tile", () => {
  it("gives each shape a fixed height for its width, so a grid of them never reflows", () => {
    expect(TILE_MIN_WIDTH).toEqual({ portrait: 138, landscape: 176 });
    expect(tileHeight("landscape", 176)).toBe(Math.ceil(158 * (10 / 16) + 65));
    expect(tileHeight("portrait", 138)).toBe(Math.ceil(120 * (4 / 3) + 65));
    expect(tileHeight("portrait", 200)).toBeGreaterThan(tileHeight("landscape", 200));
  });

  it("opens on a press, draws its media at its shape with the badge in the corner, and keeps its menu beside the press", async () => {
    host = document.body.appendChild(document.createElement("div"));
    const onClick = vi.fn();
    await act(async () =>
      render(
        <Tile
          shape="portrait"
          media={<img alt="" src="/imani.png" />}
          badge={<span data-badge>2</span>}
          label="imani"
          description="Modified 2d · 4 kb"
          aria-label="Open image imani"
          actions={<button aria-label="Options for imani" />}
          onClick={onClick}
        />,
        host,
      ),
    );
    const open = host.querySelector<HTMLButtonElement>('button[aria-label="Open image imani"]')!;
    expect(open.textContent).toContain("imani");
    expect(open.textContent).toContain("Modified 2d · 4 kb");
    expect(open.querySelector('[class*="aspect-[3/4]"] [data-badge]')).not.toBeNull();
    expect(open.querySelector('[aria-label="Options for imani"]')).toBeNull();
    expect(host.querySelector('[aria-label="Options for imani"]')).not.toBeNull();
    await act(async () => open.click());
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("offers no mark unless the tile can be selected, and a mark outside the open button when it can", async () => {
    host = document.body.appendChild(document.createElement("div"));
    const onSelectedChange = vi.fn();
    await act(async () =>
      render(
        <>
          <Tile media={null} label="plain" aria-label="Open plain" onClick={() => {}} />
          <Tile
            media={null}
            label="imani"
            aria-label="Open imani"
            selection="available"
            selectLabel="Select imani"
            onSelectedChange={onSelectedChange}
            onClick={() => {}}
          />
        </>,
        host,
      ),
    );
    expect(host.querySelectorAll('input[type="checkbox"]')).toHaveLength(1);
    const mark = host.querySelector<HTMLInputElement>('input[aria-label="Select imani"]')!;
    expect(mark.closest("button")).toBeNull();
    expect(mark.closest("label")!.className).toContain("opacity-0");
    expect(host.querySelector('button[aria-label="Open imani"]')!.hasAttribute("aria-pressed")).toBe(false);
    await act(async () => mark.click());
    expect(onSelectedChange).toHaveBeenCalledWith(true);
  });

  it("shows the mark on every tile while selecting, presses the picked one, and highlights a drop target", async () => {
    host = document.body.appendChild(document.createElement("div"));
    await act(async () =>
      render(
        <>
          <Tile media={null} label="a" aria-label="Open a" selection="active" selected selectLabel="Select a" onClick={() => {}} />
          <Tile media={null} label="b" aria-label="Open b" selection="active" selectLabel="Select b" onClick={() => {}} />
          <Tile media={null} kind="folder" label="Cast" aria-label="Open Cast" dropTarget onClick={() => {}} />
        </>,
        host,
      ),
    );
    const a = host.querySelector<HTMLButtonElement>('button[aria-label="Open a"]')!;
    const b = host.querySelector<HTMLButtonElement>('button[aria-label="Open b"]')!;
    expect(a.getAttribute("aria-pressed")).toBe("true");
    expect(b.getAttribute("aria-pressed")).toBe("false");
    expect(host.querySelector<HTMLInputElement>('input[aria-label="Select a"]')!.checked).toBe(true);
    expect(host.querySelector<HTMLInputElement>('input[aria-label="Select b"]')!.closest("label")!.className).not.toContain("opacity-0");
    expect(a.className).toContain("ring-accent");
    expect(b.className).not.toContain("ring-accent");
    const folder = host.querySelector<HTMLElement>('button[aria-label="Open Cast"]')!;
    expect(folder.closest("[data-drop-target]")).not.toBeNull();
    expect(folder.className).toContain("ring-accent");
  });
});
