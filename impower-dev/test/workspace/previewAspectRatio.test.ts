import { signal } from "@preact/signals";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PreviewMode,
  ProjectSettings,
} from "../../src/modules/spark-editor/workspace/settings/settingsSchema";

type Ratio = ProjectSettings["previewAspectRatio"];

const visualNovel = () => signal<{ previewMode: PreviewMode }>({ previewMode: "game" });

let width = 1440;
let listeners: (() => void)[] = [];

beforeEach(() => {
  width = 1440;
  listeners = [];
  vi.stubGlobal("matchMedia", (query: string) => {
    const minWidth = /\(min-width: (\d+)px\)/.exec(query);
    return {
      media: query,
      get matches() {
        return minWidth ? width >= Number(minWidth[1]) : false;
      },
      addEventListener: (_: string, listener: () => void) =>
        listeners.push(listener),
      removeEventListener: () => {},
    } as unknown as MediaQueryList;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const resize = (next: number) => {
  width = next;
  listeners.forEach((listener) => listener());
};

const load = async () => {
  vi.resetModules();
  const rule =
    await import("../../src/modules/spark-editor/workspace/previewAspectRatio");
  const { createAspectRatioSync } =
    await import("../../src/modules/spark-editor/components/preview-game/aspectRatioSync");
  return { ...rule, createAspectRatioSync };
};

describe("effectiveAspectRatio", () => {
  it.each([
    ["compact", "auto", "16:9"],
    ["compact", "16:9", "16:9"],
    ["compact", "4:3", "4:3"],
    ["compact", "1:1", "1:1"],
    ["compact", "3:4", "3:4"],
    ["compact", "9:16", "9:16"],
    ["desktop", "auto", "auto"],
    ["desktop", "9:16", "9:16"],
    ["phone", "auto", "auto"],
    ["phone", "3:4", "3:4"],
  ] as const)("in the %s layout reads %s as %s", async (layout, stored, expected) => {
    const { effectiveAspectRatio } = await load();
    expect(effectiveAspectRatio(layout, stored)).toBe(expected);
  });
});

describe("the strip's ratio through the shared sender", () => {
  it("asks for 16:9 on entering the strip and for Auto on leaving it", async () => {
    const { previewAspectRatioFor, createAspectRatioSync } = await load();
    const settings = signal<{ previewAspectRatio: Ratio }>({
      previewAspectRatio: "auto",
    });
    const request = vi.fn();
    const sync = createAspectRatioSync(
      previewAspectRatioFor(settings, visualNovel()),
      request,
    );
    sync.initialized();
    resize(1100);
    resize(900);
    resize(1101);
    resize(1440);
    resize(701);
    resize(700);
    expect(request.mock.calls).toEqual([
      ["auto"],
      ["16:9"],
      ["auto"],
      ["16:9"],
      ["auto"],
    ]);
    sync.dispose();
  });

  it("sends the strip's ratio again to a reloaded player", async () => {
    const { previewAspectRatioFor, createAspectRatioSync } = await load();
    resize(900);
    const settings = signal<{ previewAspectRatio: Ratio }>({
      previewAspectRatio: "auto",
    });
    const request = vi.fn();
    const sync = createAspectRatioSync(
      previewAspectRatioFor(settings, visualNovel()),
      request,
    );
    sync.initialized();
    sync.initialized();
    expect(request.mock.calls).toEqual([["16:9"], ["16:9"]]);
    sync.dispose();
  });

  it("keeps an author's chosen ratio in the strip and follows a change of choice", async () => {
    const { previewAspectRatioFor, createAspectRatioSync } = await load();
    resize(900);
    const settings = signal<{ previewAspectRatio: Ratio }>({
      previewAspectRatio: "9:16",
    });
    const request = vi.fn();
    const sync = createAspectRatioSync(
      previewAspectRatioFor(settings, visualNovel()),
      request,
    );
    sync.initialized();
    resize(1440);
    resize(900);
    settings.value = { previewAspectRatio: "auto" };
    settings.value = { previewAspectRatio: "4:3" };
    expect(request.mock.calls).toEqual([["9:16"], ["16:9"], ["4:3"]]);
    sync.dispose();
  });
});

describe("the ratio while Interactive Fiction fills the pane", () => {
  it("asks for Auto in Interactive Fiction and for the chosen ratio again in Visual Novel", async () => {
    const { previewAspectRatioFor, createAspectRatioSync } = await load();
    const settings = signal<{ previewAspectRatio: Ratio }>({
      previewAspectRatio: "9:16",
    });
    const mode = visualNovel();
    const request = vi.fn();
    const sync = createAspectRatioSync(
      previewAspectRatioFor(settings, mode),
      request,
    );
    sync.initialized();
    mode.value = { previewMode: "textstream" };
    settings.value = { previewAspectRatio: "4:3" };
    mode.value = { previewMode: "game" };
    mode.value = { previewMode: "screenplay" };
    resize(900);
    mode.value = { previewMode: "textstream" };
    expect(request.mock.calls).toEqual([
      ["9:16"],
      ["auto"],
      ["4:3"],
      ["16:9"],
    ]);
    sync.dispose();
  });
});
