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
});
