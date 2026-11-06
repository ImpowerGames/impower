import { render, type ComponentChild } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RailIndexGroup } from "../rail-index/RailIndex";
import JumpChips from "./JumpChips";

const GROUPS: readonly RailIndexGroup[] = [
  {
    id: "prefs",
    label: "Editor preferences",
    items: [
      { id: "appearance", label: "Appearance" },
      { id: "editor", label: "Script editor" },
    ],
  },
  { id: "project", label: "Project preferences", items: [{ id: "save", label: "Save & sync" }] },
  { id: "alone", label: "Alone", items: [] },
];

let host: HTMLDivElement | undefined;

const mount = async (node: ComponentChild) => {
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(node, host!));
  return host;
};

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
});

describe("JumpChips", () => {
  it("draws a chip per item in a group per non-empty group, and jumps on click", async () => {
    const onJump = vi.fn();
    await mount(<JumpChips label="Settings sections" groups={GROUPS} onJump={onJump} />);
    const groups = Array.from(host!.querySelectorAll('[role="group"]'));
    expect(groups.map((group) => group.getAttribute("aria-label"))).toEqual(["Editor preferences", "Project preferences"]);
    expect(groups.map((group) => group.querySelectorAll("button").length)).toEqual([2, 1]);
    await act(async () => host!.querySelector<HTMLButtonElement>('[data-index-jump="editor"]')!.click());
    expect(onJump).toHaveBeenCalledWith("editor");
  });
});
