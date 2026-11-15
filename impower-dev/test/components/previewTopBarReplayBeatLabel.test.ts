import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

const SHARED_WORDING = "Replay this beat from the shared module";

vi.mock(
  "@impower/spark-web-player/src/components/PlayerBar/replayBeat",
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    REPLAY_BEAT: SHARED_WORDING,
  }),
);

window.matchMedia = (query: string) =>
  ({
    matches: query.includes("min-width"),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList;
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const { default: PreviewTopBar } = await import(
  "../../src/modules/spark-editor/components/preview-top-bar/PreviewTopBar"
);

let host: HTMLDivElement | undefined;

afterEach(() => {
  if (host) {
    render(null, host);
    host.remove();
    host = undefined;
  }
});

describe("the preview top bar's Replay beat button", () => {
  it("takes its wording from the shared replay-beat module", async () => {
    host = document.body.appendChild(document.createElement("div"));
    await act(async () => render(h(PreviewTopBar, {}), host!));
    const labels = [...host.querySelectorAll("button")].map((button) =>
      button.getAttribute("aria-label"),
    );
    expect(labels).toContain(SHARED_WORDING);
    expect(labels).not.toContain("Replay beat");
  });
});
