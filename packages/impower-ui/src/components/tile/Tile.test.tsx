import { compile, optimize } from "@tailwindcss/node";
import { render } from "preact";
import { act } from "preact/test-utils";
import { existsSync } from "node:fs";
import { chromium } from "playwright";
import { afterEach, describe, expect, it, vi } from "vitest";
import { edgeTreatment } from "../../../test/fadeEdge";
import { visibleTextInName } from "../../../test/visibleTextInName";
import Tile, { tileGrid, tileHeight, type TileSize } from "./Tile";

let host: HTMLDivElement | undefined;

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
});

const inBrowser = it.skipIf(!existsSync(chromium.executablePath()));

const SIZES: readonly TileSize[] = ["portrait", "landscape", "small"];

describe("Tile", () => {
  it("keeps its label, description and badge separate words in that order, so a name that repeats them contains its visible text", async () => {
    host = document.body.appendChild(document.createElement("div"));
    await act(async () =>
      render(
        <Tile
          media={null}
          badge={<span>4</span>}
          label="imani"
          description="Modified 2d · 330 B"
          aria-label="Open image imani, Modified 2d · 330 B, 4 variants"
          onClick={() => {}}
        />,
        host!,
      ),
    );
    expect(visibleTextInName(host.querySelector("button")!)).toMatchObject({ contained: true });
  });

  it("gives each size the prototype's grid minimum and gap on desktop, at 1100px and below, and in a desktop pane 440 wide or less", () => {
    const tracks = (track: "desktop" | "narrow" | "pane") =>
      Object.fromEntries(SIZES.map((size) => { const { minWidth, gap } = tileGrid(size, track); return [size, [minWidth, gap]]; }));
    expect(tracks("desktop")).toEqual({ portrait: [138, 12], landscape: [176, 12], small: [96, 8] });
    expect(tracks("narrow")).toEqual({ portrait: [150, 10], landscape: [160, 10], small: [88, 8] });
    expect(tracks("pane")).toEqual({ portrait: [140, 12], landscape: [150, 12], small: [96, 8] });
    for (const size of SIZES) {
      expect(tileGrid(size, "desktop").height(176)).toBe(tileHeight(size, 176));
    }
  });

  inBrowser("renders each size at exactly the height tileHeight gives it, so the classes and the numbers describe one tile", async () => {
    host = document.body.appendChild(document.createElement("div"));
    const widths = [96, 141, 194];
    await act(async () =>
      render(
        <>
          {SIZES.flatMap((size) =>
            widths.map((width) => (
              <div data-cell={`${size}:${width}`} style={`width:${width}px`}>
                <Tile size={size} media={null} label="picture" description="Modified 2d · 4 kb" aria-label={`Open ${size}`} onClick={() => {}} />
              </div>
            )),
          )}
        </>,
        host!,
      ),
    );
    const markup = host.innerHTML;
    const compiler = await compile('@import "./src/style.css";', { base: `${process.cwd()}`, onDependency: () => {} });
    const css = optimize(compiler.build([...markup.matchAll(/class="([^"]*)"/g)].flatMap((match) => match[1]!.replace(/&amp;/g, "&").split(/\s+/))), { minify: false }).code;
    const browser = await chromium.launch();
    try {
      const view = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await view.setContent(`<!doctype html><html data-layout="desktop"><head><style>${css}</style></head><body style="margin:0">${markup}</body></html>`);
      const heights = await view.evaluate(() =>
        Object.fromEntries(
          [...document.querySelectorAll<HTMLElement>("[data-cell]")].map((cell) => [cell.dataset.cell, cell.querySelector("button")!.getBoundingClientRect().height]),
        ),
      );
      for (const size of SIZES) {
        for (const width of widths) {
          expect(heights[`${size}:${width}`], `${size} at ${width}`).toBeCloseTo(tileHeight(size, width), 1);
        }
      }
    } finally {
      await browser.close();
    }
  }, 60_000);

  it("gives each size a fixed height for its width, so a grid of them never reflows", () => {
    expect(tileHeight("landscape", 176)).toBeCloseTo(158 * (10 / 16) + 64.6, 6);
    expect(tileHeight("landscape", 192)).toBeCloseTo(173.35, 6);
    expect(tileHeight("portrait", 138)).toBeCloseTo(120 * (4 / 3) + 64.6, 6);
    expect(tileHeight("portrait", 200)).toBeGreaterThan(tileHeight("landscape", 200));
    expect(tileHeight("small", 96)).toBeCloseTo(84 + 35.4, 6);
    expect(tileGrid("small", "desktop").height(113.59375)).toBeCloseTo(136.98, 1);
  });

  it("draws the Small size with a square picture, an 11px name, no meta line and the smaller mark and menu", async () => {
    host = document.body.appendChild(document.createElement("div"));
    await act(async () =>
      render(
        <Tile
          size="small"
          media={<img alt="" src="/imani.png" />}
          label="imani"
          description="Modified 2d · 4 kb"
          aria-label="Open image imani"
          selection="available"
          selectLabel="Select imani"
          actions={<button aria-label="Options for imani" />}
          onClick={() => {}}
        />,
        host!,
      ),
    );
    const tile = host.querySelector<HTMLElement>("[data-tile]")!;
    expect(tile.dataset.tile).toBe("small");
    const open = tile.querySelector<HTMLButtonElement>('button[aria-label="Open image imani"]')!;
    expect(open.className.split(" ")).toEqual(expect.arrayContaining(["gap-1.5", "rounded-[10px]", "px-[5px]", "pt-[5px]", "pb-[7px]"]));
    expect(open.querySelector('[class*="aspect-square"]')).not.toBeNull();
    const name = Array.from(open.querySelectorAll("span")).find((span) => span.textContent === "imani")!;
    expect(name.className.split(" ")).toContain("text-[11px]/[1.4]");
    expect(open.querySelector("small")!.className.split(" ")).toContain("hidden");
    expect(tile.querySelector("label")!.className.split(" ")).toEqual(expect.arrayContaining(["top-[9px]", "left-[9px]", "[&>span]:size-[18px]"]));
    expect(host.querySelector('[aria-label="Options for imani"]')!.parentElement!.className.split(" ")).toEqual(
      expect.arrayContaining(["top-1.5", "right-1.5", "[&>button]:size-11", "has-aria-expanded:opacity-100"]),
    );
    expect(host.querySelector('[aria-label="Options for imani"]')!.parentElement!.className).not.toMatch(/size-7|size-\[34px\]|coarse\]_&\]:\[&>button\]/);
  });

  it("opens on a press, draws its media at its size with the badge in the corner, and keeps its menu beside the press", async () => {
    host = document.body.appendChild(document.createElement("div"));
    const onClick = vi.fn();
    await act(async () =>
      render(
        <Tile
          size="portrait"
          media={<img alt="" src="/imani.png" />}
          badge={<span data-badge>2</span>}
          label="imani"
          description="Modified 2d · 4 kb"
          aria-label="Open image imani"
          actions={<button aria-label="Options for imani" />}
          onClick={onClick}
        />,
        host!,
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
        host!,
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
        host!,
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

  it("edges the current tile in the accent alone, even under the pointer, and shows its menu without hover", async () => {
    host = document.body.appendChild(document.createElement("div"));
    await act(async () =>
      render(
        <>
          <Tile media={null} label="a" aria-label="Open a" current actions={<button aria-label="Options for a" />} onClick={() => {}} />
          <Tile media={null} label="b" aria-label="Open b" actions={<button aria-label="Options for b" />} onClick={() => {}} />
        </>,
        host!,
      ),
    );
    const classes = (label: string) => host!.querySelector<HTMLElement>(`button[aria-label="${label}"]`)!.className.split(" ");
    const borders = (label: string) => classes(label).filter((name) => /^(hover:)?border-(?!solid|\[)[a-z]/.test(name));
    expect(borders("Open a")).toEqual(["border-accent", "hover:border-accent"]);
    expect(classes("Open a")).toContain("bg-tint");
    expect(classes("Open a")).not.toContain("bg-panel/55");
    expect(borders("Open b")).toEqual(["border-edge", "hover:border-muted/45"]);
    const menu = (label: string) => host!.querySelector(`[aria-label="${label}"]`)!.parentElement!.className.split(" ");
    expect(menu("Options for a")).toContain("opacity-100");
    expect(menu("Options for a")).not.toContain("opacity-0");
    expect(menu("Options for b")).toContain("opacity-0");
  });

  it("sets its name and meta lines at 1.4 and backs its menu with the page colour at 78%", async () => {
    host = document.body.appendChild(document.createElement("div"));
    await act(async () =>
      render(
        <Tile media={null} label="imani" description="Modified Sep 29" aria-label="Open imani" actions={<button aria-label="Options for imani" />} onClick={() => {}} />,
        host!,
      ),
    );
    const open = host.querySelector('button[aria-label="Open imani"]')!;
    const name = Array.from(open.querySelectorAll("span")).find((span) => span.textContent === "imani")!;
    expect(name.className.split(" ")).toContain("text-[13px]/[1.4]");
    expect(open.querySelector("small")!.className.split(" ")).toContain("text-[11px]/[1.4]");
    expect(host.querySelector('[aria-label="Options for imani"]')!.parentElement!.className.split(" ")).toEqual(expect.arrayContaining(["bg-bg/78", "rounded-full", "[&>button]:rounded-full"]));
  });
});

describe("Tile editor", () => {
  it("keeps the framed picture without the open button, selection mark or actions, and draws the editor and notice over the frame", async () => {
    host = document.body.appendChild(document.createElement("div"));
    await act(async () =>
      render(
        <Tile
          size="small"
          media={<img alt="" src="/imani.png" />}
          label="imani"
          selection="available"
          selectLabel="Select imani"
          actions={<button type="button" aria-label="Options for imani" />}
          editor={<input aria-label="Rename imani" />}
          notice={<span role="alert">Use a name without @ or ~.</span>}
        />,
        host!,
      ),
    );
    const frame = host.querySelector<HTMLElement>("[data-tile] > div")!;
    expect(host.querySelector("button")).toBeNull();
    expect(host.querySelector('input[type="checkbox"]')).toBeNull();
    expect(frame.className.split(" ")).toEqual(expect.arrayContaining(["border", "border-edge", "relative"]));
    expect(frame.querySelector("img")).not.toBeNull();
    expect(frame.querySelector('input[aria-label="Rename imani"]')).not.toBeNull();
    expect(frame.querySelector('[role="alert"]')!.parentElement!.className.split(" ")).toEqual(expect.arrayContaining(["text-[10px]/[1.3]", "shrink-0", "bg-bg"]));
  });
});

describe("Tile edge", () => {
  it("fades a long label and description at their edge with no ellipsis under the mask", async () => {
    host = document.body.appendChild(document.createElement("div"));
    await act(async () =>
      render(<Tile size="landscape" media={<img alt="" src="/harbor.png" />} label="a very long backdrop name that runs off" description="backdrops/harbor/night" />, host!),
    );
    const label = Array.from(host.querySelectorAll("span")).find((span) => span.textContent === "a very long backdrop name that runs off")!;
    const description = host.querySelector("small")!;
    expect(await edgeTreatment([label, description])).toEqual([
      { text: label.textContent, masked: true, ellipsis: false },
      { text: description.textContent, masked: true, ellipsis: false },
    ]);
  });
});
