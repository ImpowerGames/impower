import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import VirtualList, { VIRTUAL_LIST_ROW_HEIGHT } from "./VirtualList";

let host: HTMLDivElement | undefined;

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
});

const ITEMS = Array.from({ length: 500 }, (_, i) => `row ${i}`);

const mount = async (height: number) => {
  host = document.body.appendChild(document.createElement("div"));
  let scroller: HTMLDivElement | null = null;
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get() {
      return this === scroller ? height : 0;
    },
  });
  await act(async () =>
    render(
      <VirtualList
        label="Rows"
        items={ITEMS}
        getKey={(item) => item}
        renderItem={(item) => <span>{item}</span>}
        overscan={2}
        listRef={(element) => {
          scroller = element;
        }}
      />,
      host!,
    ),
  );
  await act(async () => {
    scroller!.dispatchEvent(new Event("scroll"));
  });
  return scroller!;
};

const shown = () =>
  Array.from(host!.querySelectorAll('[role="listitem"]')).map((row) => row.textContent);

describe("VirtualList", () => {
  afterEach(() => {
    delete (HTMLElement.prototype as { clientHeight?: number }).clientHeight;
  });

  it("mounts only the rows in view, each the same height, with their place in the whole list", async () => {
    const rowHeight = VIRTUAL_LIST_ROW_HEIGHT.default;
    await mount(rowHeight * 4);
    expect(shown()).toEqual(["row 0", "row 1", "row 2", "row 3", "row 4", "row 5", "row 6", "row 7"]);
    const list = host!.querySelector('[role="list"]') as HTMLElement;
    expect(list.getAttribute("aria-label")).toBe("Rows");
    expect(list.style.height).toBe(`${ITEMS.length * rowHeight}px`);
    const first = host!.querySelector('[role="listitem"]') as HTMLElement;
    expect(first.getAttribute("aria-setsize")).toBe("500");
    expect(first.getAttribute("aria-posinset")).toBe("1");
    expect(first.style.height).toBe(`${rowHeight}px`);
  });

  it("moves its window as the list scrolls", async () => {
    const rowHeight = VIRTUAL_LIST_ROW_HEIGHT.default;
    const scroller = await mount(rowHeight * 4);
    scroller.scrollTop = rowHeight * 100;
    await act(async () => {
      scroller.dispatchEvent(new Event("scroll"));
    });
    expect(shown()[0]).toBe("row 98");
    expect(shown()).toContain("row 103");
    expect(shown()).not.toContain("row 0");
    const row = Array.from(host!.querySelectorAll<HTMLElement>('[role="listitem"]')).find(
      (element) => element.textContent === "row 100",
    )!;
    expect(row.style.top).toBe(`${100 * rowHeight}px`);
  });
});
