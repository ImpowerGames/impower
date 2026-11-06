import { render, type ComponentChild } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import RailIndex, { type RailIndexGroup } from "./RailIndex";

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

describe("RailIndex", () => {
  it("lists each group as a heading row with its items nested under a labelled list", async () => {
    await mount(<RailIndex title="Settings" label="Settings sections" groups={GROUPS} onJump={() => {}} />);
    expect(host!.querySelector("h2")!.textContent).toBe("Settings");
    expect(host!.querySelector("nav")!.getAttribute("aria-label")).toBe("Settings sections");
    const nested = Array.from(host!.querySelectorAll("ul ul"));
    expect(nested.map((list) => list.getAttribute("aria-label"))).toEqual(["Editor preferences", "Project preferences"]);
    expect(Array.from(host!.querySelectorAll("[data-index-jump]")).map((b) => b.getAttribute("data-index-jump"))).toEqual([
      "prefs",
      "appearance",
      "editor",
      "project",
      "save",
      "alone",
    ]);
  });

  it("marks the current item and the group holding it", async () => {
    await mount(<RailIndex title="Settings" label="Sections" groups={GROUPS} current="editor" onJump={() => {}} />);
    const marked = Array.from(host!.querySelectorAll('[aria-current="true"]'));
    expect(marked.map((b) => b.getAttribute("data-index-jump"))).toEqual(["editor"]);
    expect(marked[0]!.parentElement!.hasAttribute("data-current")).toBe(true);
    const prefs = host!.querySelector('[data-index-jump="prefs"]')!.parentElement!;
    expect(prefs.hasAttribute("data-contains-current")).toBe(true);
    const project = host!.querySelector('[data-index-jump="project"]')!.parentElement!;
    expect(project.hasAttribute("data-contains-current")).toBe(false);
  });

  it("jumps by id on click, as buttons in the tab order", async () => {
    const onJump = vi.fn();
    await mount(<RailIndex title="Settings" label="Sections" groups={GROUPS} onJump={onJump} />);
    const save = host!.querySelector<HTMLButtonElement>('[data-index-jump="save"]')!;
    expect(save.type).toBe("button");
    save.focus();
    expect(document.activeElement).toBe(save);
    await act(async () => save.click());
    expect(onJump).toHaveBeenCalledWith("save");
  });
});
