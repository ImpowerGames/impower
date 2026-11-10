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

const mount = async (height: number, extra: Record<string, unknown> = {}) => {
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
        {...extra}
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

  it("places rows of fixed per-item heights by their summed offsets and mounts only those in view", async () => {
    const itemHeight = (_item: string, index: number) => (index % 2 ? 30 : 90);
    const scroller = await mount(120, { itemHeight });
    const list = host!.querySelector('[role="list"]') as HTMLElement;
    expect(list.style.height).toBe(`${250 * 90 + 250 * 30}px`);
    expect(shown()).toEqual(["row 0", "row 1", "row 2", "row 3", "row 4", "row 5"]);
    scroller.scrollTop = 120 * 50 + 90;
    await act(async () => {
      scroller.dispatchEvent(new Event("scroll"));
    });
    expect(shown()[0]).toBe("row 99");
    const row = Array.from(host!.querySelectorAll<HTMLElement>('[role="listitem"]')).find(
      (element) => element.textContent === "row 101",
    )!;
    expect(row.style.top).toBe(`${120 * 50 + 90}px`);
    expect(row.style.height).toBe("30px");
  });

  it("gives a compact slot its row height with no gap, so a 44px row fits it", async () => {
    await mount(VIRTUAL_LIST_ROW_HEIGHT.compact * 4, { size: "compact" });
    const first = host!.querySelector('[role="listitem"]') as HTMLElement;
    expect(first.style.height).toBe(`${VIRTUAL_LIST_ROW_HEIGHT.compact}px`);
    expect(first.className).not.toContain("pb-");
  });

  it("scrolls the revealed row into view", async () => {
    const rowHeight = VIRTUAL_LIST_ROW_HEIGHT.default;
    host = document.body.appendChild(document.createElement("div"));
    let scroller: HTMLDivElement | null = null;
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      get() {
        return this === scroller ? rowHeight * 4 : 0;
      },
    });
    const list = (revealIndex?: number) => (
      <VirtualList
        items={ITEMS}
        getKey={(item) => item}
        renderItem={(item) => <span>{item}</span>}
        revealIndex={revealIndex}
        listRef={(element) => {
          scroller = element;
        }}
      />
    );
    await act(async () => render(list(), host!));
    await act(async () => render(list(200), host!));
    expect(scroller!.scrollTop).toBe(201 * rowHeight - rowHeight * 4);
    await act(async () => render(list(10), host!));
    expect(scroller!.scrollTop).toBe(10 * rowHeight);
  });

  it("reveals the same row again on a new reveal request", async () => {
    const rowHeight = VIRTUAL_LIST_ROW_HEIGHT.default;
    host = document.body.appendChild(document.createElement("div"));
    let scroller: HTMLDivElement | null = null;
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      get() {
        return this === scroller ? rowHeight * 4 : 0;
      },
    });
    const list = (revealRequest: number) => (
      <VirtualList
        items={ITEMS}
        getKey={(item) => item}
        renderItem={(item) => <span>{item}</span>}
        revealIndex={0}
        revealRequest={revealRequest}
        listRef={(element) => {
          scroller = element;
        }}
      />
    );
    await act(async () => render(list(1), host!));
    scroller!.scrollTop = rowHeight * 50;
    await act(async () => render(list(1), host!));
    expect(scroller!.scrollTop).toBe(rowHeight * 50);
    await act(async () => render(list(2), host!));
    expect(scroller!.scrollTop).toBe(0);
  });

  it("reveals once per request, leaving a later change of index alone, and follows the index when it has no request", async () => {
    const rowHeight = VIRTUAL_LIST_ROW_HEIGHT.default;
    host = document.body.appendChild(document.createElement("div"));
    let scroller: HTMLDivElement | null = null;
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      get() {
        return this === scroller ? rowHeight * 4 : 0;
      },
    });
    const list = (revealIndex: number, revealRequest?: number) => (
      <VirtualList
        items={ITEMS}
        getKey={(item) => item}
        renderItem={(item) => <span>{item}</span>}
        revealIndex={revealIndex}
        revealRequest={revealRequest}
        listRef={(element) => {
          scroller = element;
        }}
      />
    );
    await act(async () => render(list(0, 1), host!));
    await act(async () => render(list(200, 1), host!));
    expect(scroller!.scrollTop).toBe(0);
    await act(async () => render(list(200, 2), host!));
    expect(scroller!.scrollTop).toBe(201 * rowHeight - rowHeight * 4);
    await act(async () => render(list(10), host!));
    expect(scroller!.scrollTop).toBe(10 * rowHeight);
  });

  it("reveals its row once a list mounted hidden gets a viewport", async () => {
    const rowHeight = VIRTUAL_LIST_ROW_HEIGHT.default;
    host = document.body.appendChild(document.createElement("div"));
    let scroller: HTMLDivElement | null = null;
    let height = 0;
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      get() {
        return this === scroller ? height : 0;
      },
    });
    await act(async () =>
      render(
        <VirtualList
          items={ITEMS}
          getKey={(item) => item}
          renderItem={(item) => <span>{item}</span>}
          revealIndex={100}
          listRef={(element) => {
            scroller = element;
          }}
        />,
        host!,
      ),
    );
    expect(scroller!.scrollTop).toBe(0);
    height = rowHeight * 4;
    await act(async () => {
      scroller!.dispatchEvent(new Event("scroll"));
    });
    expect(scroller!.scrollTop).toBe(101 * rowHeight - rowHeight * 4);
    await act(async () => {
      scroller!.dispatchEvent(new Event("scroll"));
    });
    expect(
      Array.from(host!.querySelectorAll('[role="listitem"]')).some(
        (row) => row.textContent === "row 100",
      ),
    ).toBe(true);
  });
});
