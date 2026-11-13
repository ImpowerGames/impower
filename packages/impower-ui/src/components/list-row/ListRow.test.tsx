import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import ListRow, { ListRowBadge } from "./ListRow";

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

  it("offers no mark unless the row can be selected", async () => {
    const root = await mount(<ListRow label="Main" onClick={() => {}} />);
    expect(root.querySelector("input")).toBeNull();
    expect(root.querySelector("button")!.hasAttribute("aria-pressed")).toBe(false);
  });

  it("draws a selectable row's mark beside its button, reporting each change, and hides it until hovered or focused", async () => {
    const onSelectedChange = vi.fn();
    const onClick = vi.fn();
    const root = await mount(
      <ListRow
        selection="available"
        selectLabel="Select chapter.sd"
        onSelectedChange={onSelectedChange}
        label="chapter.sd"
        onClick={onClick}
      />,
    );
    const mark = root.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(mark.getAttribute("aria-label")).toBe("Select chapter.sd");
    expect(root.querySelector("button")!.contains(mark)).toBe(false);
    const label = mark.closest("label")!.className.split(/\s+/);
    expect(label).toContain("opacity-0");
    expect(label).toContain("group-hover/row:opacity-100");
    expect(label).toContain("has-focus-visible:opacity-100");
    await act(async () => mark.click());
    expect(onSelectedChange).toHaveBeenCalledWith(true);
    expect(onClick).not.toHaveBeenCalled();
    expect(root.querySelector("button")!.hasAttribute("aria-pressed")).toBe(false);
  });

  it("shows every mark while selecting, tints a picked row and reads its button as pressed", async () => {
    const root = await mount(
      <div>
        <ListRow selection="active" selected selectLabel="Select a" label="a" onClick={() => {}} />
        <ListRow selection="active" selectLabel="Select b" label="b" onClick={() => {}} />
      </div>,
    );
    const [a, b] = Array.from(root.querySelectorAll<HTMLInputElement>("input"));
    expect(a!.checked).toBe(true);
    expect(b!.checked).toBe(false);
    expect(a!.closest("label")!.className).not.toContain("opacity-0");
    const [rowA, rowB] = Array.from(root.querySelectorAll("button"));
    expect(rowA!.getAttribute("aria-pressed")).toBe("true");
    expect(rowB!.getAttribute("aria-pressed")).toBe("false");
    expect(rowA!.parentElement!.className.split(/\s+/)).toContain("bg-tint");
    expect(rowB!.parentElement!.className.split(/\s+/)).not.toContain("bg-tint");
  });

  it("marks a drop target with the accent ring and an attribute a drag can find", async () => {
    const root = await mount(<ListRow dropTarget label="Drafts" onClick={() => {}} />);
    const row = root.querySelector("button")!.parentElement!;
    expect(row.hasAttribute("data-drop-target")).toBe(true);
    expect(row.className.split(/\s+/)).toEqual(expect.arrayContaining(["ring-2", "ring-accent"]));
  });

  it("puts a leading badge before the row's button as a button of its own, in the glyph's column", async () => {
    const onBadge = vi.fn();
    const onRow = vi.fn();
    const root = await mount(
      <ListRow
        size="compact"
        leading={
          <ListRowBadge
            size="compact"
            label="2 errors in the_rumour"
            icon={<span data-glyph />}
            onClick={onBadge}
          />
        }
        label="the_rumour"
        onClick={onRow}
      />,
    );
    const [badge, row] = Array.from(root.querySelectorAll("button"));
    expect(badge!.getAttribute("aria-label")).toBe("2 errors in the_rumour");
    expect(badge!.getAttribute("title")).toBe("2 errors in the_rumour");
    expect(badge!.contains(row!)).toBe(false);
    expect(badge!.className).toContain("w-9");
    expect(row!.className).toContain("pl-0");
    await act(async () => badge!.click());
    expect(onBadge).toHaveBeenCalledTimes(1);
    expect(onRow).not.toHaveBeenCalled();
    await act(async () => row!.click());
    expect(onRow).toHaveBeenCalledTimes(1);
  });

  it("fades a node label the same way as a string label", async () => {
    const root = await mount(
      <div>
        <ListRow label="plain_name" onClick={() => {}} />
        <ListRow label={<strong data-node>node_name</strong>} onClick={() => {}} />
      </div>,
    );
    const stringLabel = Array.from(root.querySelectorAll("span")).find(
      (s) => s.textContent === "plain_name" && s.children.length === 0,
    )!;
    const nodeLabel = root.querySelector("[data-node]")!.parentElement!;
    expect(stringLabel.className).toContain("fade-edge");
    expect(nodeLabel.className).toBe(stringLabel.className);
  });

  it("leaves a self-clipping node label without the row's fade", async () => {
    const root = await mount(
      <ListRow overflow="self" label={<span data-node>field</span>} onClick={() => {}} />,
    );
    const label = root.querySelector("[data-node]")!.parentElement!;
    expect(label.className).toContain("min-w-0");
    expect(label.className).not.toContain("fade-edge");
  });

  it("wraps a label given overflow wrap instead of fading it", async () => {
    const root = await mount(
      <ListRow overflow="wrap" label={<span data-node>A long message</span>} />,
    );
    const label = root.querySelector("[data-node]")!.parentElement!;
    expect(label.className).toContain("whitespace-normal");
    expect(label.className).not.toContain("fade-edge");
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

  it("sizes a block row's badge to the block row's glyph", async () => {
    const root = await mount(
      <ListRowBadge size="block" label="Scene" icon={<span />} onClick={() => {}} />,
    );
    const badge = root.querySelector<HTMLButtonElement>("[data-list-row-badge]")!;
    expect(badge.className).toContain("[&>svg]:size-[22px]");
    expect(badge.className).toContain("pl-2.5");
  });

  it("sizes a block row's selection mark to the block row's glyph", async () => {
    const root = await mount(
      <ListRow size="block" selection="active" selectLabel="Select Scene" label="Scene" onClick={() => {}} />,
    );
    const mark = root.querySelector("input")!.closest("label")!.className.split(/\s+/);
    expect(mark).toContain("[&>span]:size-[22px]");
    expect(mark).toContain("left-2.5");
  });

  it("draws a dense row 52px tall with an 18px glyph and 14px text", async () => {
    const root = await mount(<ListRow size="dense" icon={<svg />} label="main · line 47" description="((door_chime))" onClick={() => {}} />);
    const classes = root.querySelector("button")!.className.split(" ");
    expect(classes).toEqual(expect.arrayContaining(["min-h-[52px]", "px-2.5", "py-1.5", "text-[14px]/[1.5]", "[&>svg:first-child]:size-[18px]"]));
    expect(root.querySelector("small")!.className).toContain("text-[11px]/[1.4]");
  });

  it("rejects a leading slot together with a selection mark at compile time", () => {
    const both = () => (
      // @ts-expect-error
      <ListRow leading={<span />} selection="available" label="Scene" />
    );
    expect(typeof both).toBe("function");
  });
});

describe("ListRow description fit", () => {
  it("fades a long description on one line by default and wraps it whole when asked", async () => {
    const root = await mount(
      <div>
        <ListRow label="a" description="That name is already in use in this folder." />
        <ListRow label="b" descriptionFit="wrap" description="That name is already in use in this folder." />
      </div>,
    );
    const [line, wrap] = Array.from(root.querySelectorAll("small"));
    expect(line!.className).toContain("fade-edge");
    expect(wrap!.className).not.toContain("fade-edge");
    expect(wrap!.className).toContain("whitespace-normal");
    expect(wrap!.textContent).toBe("That name is already in use in this folder.");
  });
});

describe("ListRow control", () => {
  it("puts its control before the row's button, never inside it", async () => {
    const onClick = vi.fn();
    const root = await mount(
      <ListRow label="door" control={<button type="button">Play door</button>} onClick={onClick} />,
    );
    const [control, body] = Array.from(root.querySelectorAll("button"));
    expect(control!.textContent).toBe("Play door");
    expect(body!.contains(control!)).toBe(false);
    expect(control!.closest("[data-list-row-control]")!.nextElementSibling).toBe(body);
    await act(async () => control!.click());
    expect(onClick).not.toHaveBeenCalled();
  });

  it("keeps its control in place of the selection mark until selecting starts, then hides it for the mark", async () => {
    const control = <button type="button">Play door</button>;
    const available = await mount(
      <ListRow label="door" control={control} selection="available" selectLabel="Select door" onClick={() => undefined} />,
    );
    const mark = available.querySelector("label")!;
    expect(mark.className).toContain("group-hover/row:opacity-0");
    expect(mark.className).not.toContain("group-hover/row:opacity-100");
    expect(available.querySelector("[data-list-row-control]")!.className).not.toContain("invisible");
    await act(async () => render(null, host!));
    host!.remove();
    const active = await mount(
      <ListRow label="door" control={control} selection="active" selectLabel="Select door" onClick={() => undefined} />,
    );
    expect(active.querySelector("[data-list-row-control]")!.className).toContain("invisible");
  });
});
