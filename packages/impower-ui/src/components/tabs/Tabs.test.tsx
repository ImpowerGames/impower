import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArtIcon, BookIcon, ShareIcon } from "../icon/icons.generated";
import Tabs, { Tab, type TabsProps } from "./Tabs";

let host: HTMLDivElement | undefined;

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
});

const mount = async (props: Partial<TabsProps> = {}) => {
  const onChange = vi.fn();
  host = document.body.appendChild(document.createElement("div"));
  await act(async () =>
    render(
      <Tabs value="logic" onChange={onChange} {...props}>
        <Tab value="logic" icon={BookIcon}>
          Story
        </Tab>
        <Tab value="assets" icon={ArtIcon}>
          Assets
        </Tab>
        <Tab value="share" icon={ShareIcon}>
          Share
        </Tab>
      </Tabs>,
      host!,
    ),
  );
  const tabs = Array.from(host.querySelectorAll<HTMLElement>('[role="tab"]'));
  return { tabs, onChange };
};

const classes = (element: Element) => element.className.split(/\s+/);

describe("Tabs rail variant", () => {
  it("lays the tabs out as rail rows with the accent on the current one", async () => {
    const { tabs } = await mount({
      variant: "rail",
      vertical: true,
      iconLayout: "beside",
      indicator: "none",
    });
    expect(classes(host!.firstElementChild!)).toContain("@container");
    for (const tab of tabs) {
      expect(classes(tab)).toEqual(
        expect.arrayContaining([
          "justify-start",
          "min-h-[46px]",
          "data-[state=active]:bg-tint",
          "@max-[140px]:flex-col",
        ]),
      );
      expect(classes(tab)).not.toContain("justify-center");
    }
    expect(tabs[0]!.getAttribute("data-state")).toBe("active");
    expect(tabs[0]!.querySelector(".text-accent")).not.toBeNull();
    expect(tabs[1]!.querySelector(".text-muted")).not.toBeNull();
    expect(tabs[0]!.querySelector("svg")!.style.width).toBe("18px");
  });

  it("lays the bar variant out as 64px targets with the icon over an unscaled word", async () => {
    const { tabs } = await mount({ variant: "bar", indicator: "none" });
    expect(classes(host!.querySelector('[role="tablist"]')!)).toContain(
      "justify-evenly",
    );
    for (const tab of tabs) {
      expect(classes(tab)).toEqual(
        expect.arrayContaining(["flex-col", "size-16", "text-[10px]/none"]),
      );
      expect(classes(tab)).not.toContain("flex-1");
      expect(tab.innerHTML).not.toContain("scale-80");
    }
    expect(tabs[0]!.querySelector(".text-accent")).not.toBeNull();
    expect(tabs[1]!.querySelector(".text-muted")).not.toBeNull();
    expect(tabs[0]!.querySelector("svg")!.style.width).toBe("19px");
  });

  it("keeps the default variant's look when no variant is given", async () => {
    const { tabs } = await mount();
    expect(classes(host!.firstElementChild!)).not.toContain("@container");
    expect(classes(tabs[0]!)).toContain("justify-center");
    expect(tabs[0]!.querySelector(".text-tab-ink")).not.toBeNull();
  });

  it("reports a click on another tab and moves focus with the arrow keys", async () => {
    const { tabs, onChange } = await mount({ variant: "rail", vertical: true });
    tabs[0]!.focus();
    await act(async () => {
      tabs[0]!.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowDown",
          bubbles: true,
          cancelable: true,
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(document.activeElement).toBe(tabs[1]);
    await act(async () => {
      tabs[2]!.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, button: 0 }),
      );
      tabs[2]!.click();
    });
    expect(onChange).toHaveBeenCalledWith("share");
  });
});

describe("Tabs inline variant", () => {
  it("sizes each tab to its label and puts the current one in the accent", async () => {
    const { tabs } = await mount({ variant: "inline", iconLayout: "beside" });
    const list = host!.querySelector('[role="tablist"]')!;
    expect(classes(host!.firstElementChild!)).toEqual(expect.arrayContaining(["min-h-[52px]", "items-center"]));
    expect(classes(host!.firstElementChild!)).not.toContain("items-stretch");
    expect(classes(list)).toEqual(expect.arrayContaining(["gap-[18px]", "phone:gap-2"]));
    for (const tab of tabs) {
      expect(classes(tab)).toEqual(
        expect.arrayContaining(["flex-none", "min-h-[50px]", "min-w-11", "px-1", "text-[13px]", "font-normal"]),
      );
      expect(classes(tab)).not.toContain("flex-1");
    }
    expect(tabs[0]!.querySelector(".text-accent")).not.toBeNull();
    expect(list.querySelector('[aria-hidden="true"].bg-accent')).not.toBeNull();
  });

  it("does not scroll unless asked", async () => {
    await mount({ variant: "inline" });
    expect(classes(host!.querySelector('[role="tablist"]')!)).not.toContain("overflow-x-auto");
  });

  it("scrolls sideways without a scrollbar and fades its right edge when asked", async () => {
    const { tabs, onChange } = await mount({ variant: "inline", scroll: true });
    const list = host!.querySelector('[role="tablist"]')!;
    expect(classes(list)).toEqual(
      expect.arrayContaining([
        "overflow-x-auto",
        "[scrollbar-width:none]",
        "pr-5",
        "[mask-image:linear-gradient(to_right,#000_calc(100%_-_20px),transparent)]",
      ]),
    );
    await act(async () => {
      tabs[1]!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
      tabs[1]!.click();
    });
    expect(onChange).toHaveBeenCalledWith("assets");
  });
});

describe("Tabs scroll reveal", () => {
  const values = ["image", "audio", "video", "text", "font", "other"];
  const TAB_STEP = 80;
  const TAB_WIDTH = 64;
  const VIEWPORT = 180;

  const strip = (value: string) => (
    <Tabs value={value} onChange={() => {}} variant="inline" iconLayout="beside" scroll>
      {values.map((v) => (
        <Tab key={v} value={v}>
          {v}
        </Tab>
      ))}
    </Tabs>
  );

  it("scrolls an overflowing strip to show the selected tab, either way", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const list = this.closest<HTMLElement>('[role="tablist"]');
      if (this.getAttribute("role") === "tab" && list) {
        const index = Array.from(list.querySelectorAll('[role="tab"]')).indexOf(this);
        return new DOMRect(index * TAB_STEP - list.scrollLeft, 0, TAB_WIDTH, 50);
      }
      return new DOMRect(0, 0, VIEWPORT, 50);
    });
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(VIEWPORT);
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(TAB_WIDTH);
    try {
      host = document.body.appendChild(document.createElement("div"));
      await act(async () => render(strip("other"), host!));
      const list = host.querySelector<HTMLElement>('[role="tablist"]')!;
      const selected = () => list.querySelector<HTMLElement>('[data-state="active"]')!.getBoundingClientRect();
      expect(list.scrollLeft).toBeGreaterThan(0);
      expect(selected().left).toBeGreaterThanOrEqual(0);
      expect(selected().right).toBeLessThanOrEqual(VIEWPORT);
      await act(async () => render(strip("image"), host!));
      expect(list.scrollLeft).toBe(0);
      expect(selected().left).toBe(0);
    } finally {
      vi.restoreAllMocks();
    }
  });
});
