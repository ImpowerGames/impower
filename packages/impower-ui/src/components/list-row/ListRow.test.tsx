import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import ListRow from "./ListRow";

let host: HTMLDivElement | undefined;

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
});

const mount = async (row: preact.JSX.Element) => {
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(row, host!));
  return host;
};

describe("ListRow", () => {
  it("is one button holding the label and description, with actions beside it", async () => {
    const onClick = vi.fn();
    const root = await mount(
      <ListRow
        label="chapter.sd"
        description="Modified 5m · 2 kB"
        aria-label="Open script chapter.sd"
        actions={<button type="button">Options</button>}
        onClick={onClick}
      />,
    );
    const buttons = root.querySelectorAll("button");
    expect(buttons).toHaveLength(2);
    expect(buttons[0]!.textContent).toBe("chapter.sdModified 5m · 2 kB");
    expect(buttons[0]!.getAttribute("aria-label")).toBe("Open script chapter.sd");
    expect(buttons[0]!.contains(buttons[1]!)).toBe(false);
    await act(async () => buttons[0]!.click());
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("marks the current row for assistive technology", async () => {
    const root = await mount(<ListRow current label="Main" onClick={() => {}} />);
    expect(root.querySelector("button")!.getAttribute("aria-current")).toBe("true");
  });

  it("draws no button when it has nothing to do on a press, so it can hold a field", async () => {
    const root = await mount(<ListRow label={<input aria-label="Name" />} />);
    expect(root.querySelector("button")).toBeNull();
    expect(root.querySelector("input")).not.toBeNull();
  });

  it("reads as the location when current is location, and the ancestors only contain it", async () => {
    const root = await mount(
      <div>
        <ListRow containsCurrent label="Scene" onClick={() => {}} />
        <ListRow current="location" depth={1} label="Menu" onClick={() => {}} />
      </div>,
    );
    const [ancestor, row] = Array.from(root.querySelectorAll("button"));
    expect(ancestor!.getAttribute("aria-current")).toBeNull();
    expect(ancestor!.parentElement!.className).toContain("text-accent");
    expect(ancestor!.parentElement!.className).not.toContain("bg-tint");
    expect(row!.getAttribute("aria-current")).toBe("location");
  });

  it("indents a nested row by its depth and draws its own guide in the accent when it is current", async () => {
    const root = await mount(
      <div>
        <ListRow depth={2} current label="Current" onClick={() => {}} />
        <ListRow depth={2} label="Other" onClick={() => {}} />
      </div>,
    );
    const [current, other] = Array.from(
      root.querySelectorAll<HTMLElement>('[aria-hidden="true"]'),
    );
    expect(current!.style.width).toBe("36px");
    expect(current!.lastElementChild!.className).toContain("bg-accent");
    expect(other!.lastElementChild!.className).toContain("bg-edge");
  });

  it("draws a muted-tone row's label muted, in ink when current, and in the accent when it contains the current row", async () => {
    const root = await mount(
      <div>
        <ListRow tone="muted" label="Plain" onClick={() => {}} />
        <ListRow tone="muted" current="location" label="Here" onClick={() => {}} />
        <ListRow tone="muted" containsCurrent label="Above" onClick={() => {}} />
        <ListRow label="Default" onClick={() => {}} />
      </div>,
    );
    const [plain, here, above, ink] = Array.from(root.querySelectorAll("button")).map(
      (button) => button.parentElement!.className.split(/\s+/),
    );
    expect(plain).toContain("text-muted");
    expect(plain).not.toContain("text-ink");
    expect(here).toContain("text-ink");
    expect(here).not.toContain("text-muted");
    expect(above).toContain("text-accent");
    expect(ink).toContain("text-ink");
  });

  it("clamps a long label to two lines instead of fading it", async () => {
    const root = await mount(
      <ListRow overflow="clamp" label="A long prompt" onClick={() => {}} />,
    );
    const label = Array.from(root.querySelectorAll("span")).find(
      (s) => s.textContent === "A long prompt" && s.children.length === 0,
    )!;
    expect(label.className).toContain("line-clamp-2");
    expect(label.className).not.toContain("fade-edge");
  });

  it("draws a block row 64px tall with a 12px help line, and keeps 11px help on the other sizes", async () => {
    const root = await mount(
      <ListRow size="block" label="Scene" description="Start a new part of the story." onClick={() => {}} />,
    );
    expect(root.querySelector("button")!.className).toContain("min-h-16");
    expect(root.querySelector("small")!.className).toContain("text-[12px]/[1.5]");
    await act(async () => render(null, host!));
    await act(async () =>
      render(<ListRow label="main.sd" description="2 kB" onClick={() => {}} />, host!),
    );
    expect(root.querySelector("small")!.className).toContain("text-[11px]/[1.4]");
  });
});
