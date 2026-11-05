import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Book, Photo, Share } from "../icon/icons.generated";
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
        <Tab value="logic" icon={Book}>
          Story
        </Tab>
        <Tab value="assets" icon={Photo}>
          Assets
        </Tab>
        <Tab value="share" icon={Share}>
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
