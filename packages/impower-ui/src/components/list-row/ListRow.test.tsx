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
});
