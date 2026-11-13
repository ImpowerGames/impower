import { signal } from "@preact/signals";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({ shown: 0 }));

vi.mock(
  "../../src/modules/spark-editor/workspace/problems/ProblemsStore",
  () => ({
    default: {
      counts: signal({ errors: 1, problems: 5, notes: 0 }),
      showProblems: () => {
        store.shown += 1;
      },
    },
  }),
);

const { default: StoryProblemCount } =
  await import("../../src/modules/spark-editor/components/desktop-shell/StoryProblemCount");

let host: HTMLDivElement | undefined;

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
});

describe("the title bar's problem count", () => {
  it("keeps its line height and lays its touch target down from its box through a label, away from the name above", async () => {
    host = document.body.appendChild(document.createElement("div"));
    await act(async () => render(h(StoryProblemCount, null), host!));
    const button = host.querySelector("button")!;
    expect(button.textContent).toBe("5 problems");
    const box = button.parentElement!;
    expect(box.tagName).toBe("LABEL");
    expect(box.classList.contains("inline-hit-down")).toBe(true);
    expect(box.className).toMatch(/\bh-\[18px\]/);
    expect(button.className).toMatch(/\bmin-h-0\b/);
    await act(async () => button.click());
    expect(store.shown).toBe(1);
  });
});
