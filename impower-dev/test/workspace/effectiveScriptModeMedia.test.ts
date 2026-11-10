import { describe, expect, it } from "vitest";

let width = 360;
const listeners = new Set<() => void>();

window.matchMedia = ((query: string) => {
  const minWidth = /\(min-width: (\d+)px\)/.exec(query);
  return {
    get matches() {
      return minWidth ? width >= Number(minWidth[1]) : false;
    },
    media: query,
    onchange: null,
    addEventListener: (_: string, listener: () => void) =>
      listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) =>
      listeners.delete(listener),
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  } as unknown as MediaQueryList;
}) as typeof window.matchMedia;

const { default: workspace } =
  await import("../../src/modules/spark-editor/workspace/WorkspaceStore");

const resize = (next: number) => {
  width = next;
  [...listeners].forEach((listener) => listener());
};

describe("the script's effective mode across a window resize", () => {
  it("follows the window across the phone breakpoint in both directions", () => {
    workspace.scriptMode.value = "reading";
    expect(workspace.effectiveScriptMode.value).toBe("reading");

    resize(1440);
    expect(workspace.layout.value).toBe("desktop");
    expect(workspace.effectiveScriptMode.value).toBeUndefined();

    resize(800);
    expect(workspace.layout.value).toBe("compact");
    expect(workspace.effectiveScriptMode.value).toBeUndefined();

    resize(360);
    expect(workspace.layout.value).toBe("phone");
    expect(workspace.effectiveScriptMode.value).toBe("reading");

    workspace.scriptMode.value = "editing";
    resize(1440);
    expect(workspace.effectiveScriptMode.value).toBeUndefined();
    resize(360);
    expect(workspace.effectiveScriptMode.value).toBe("editing");
  });
});
