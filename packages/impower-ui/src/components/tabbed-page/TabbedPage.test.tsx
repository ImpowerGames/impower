import { render, type ComponentChild } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import TabbedPage, { type TabbedPageTab } from "./TabbedPage";

let host: HTMLDivElement | undefined;

const mount = async (node: ComponentChild) => {
  host ??= document.body.appendChild(document.createElement("div"));
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

const TABS: TabbedPageTab[] = [
  { value: "one", label: "First", content: <p data-body="one">one</p> },
  { value: "two", label: "Second", content: <p data-body="two">two</p> },
];

describe("TabbedPage", () => {
  it("starts with a tablist of the tabs, draws only the chosen tab's body and keeps its title as the section's name", async () => {
    await mount(<TabbedPage title="Things" tabs={TABS} value="two" onValueChange={() => {}} />);
    const section = host!.querySelector("section")!;
    expect(section.getAttribute("aria-label")).toBe("Things");
    expect(section.querySelector("header, h1")).toBeNull();
    expect(section.firstElementChild!.querySelector('[role="tablist"]')).not.toBeNull();
    const tabs = Array.from(section.querySelectorAll<HTMLElement>('[role="tablist"] [role="tab"]'));
    expect(
      tabs.map((tab) =>
        Array.from(tab.querySelectorAll("span"))
          .filter((span) => span.children.length === 0 && !span.closest("[aria-hidden='true']"))
          .map((span) => span.textContent),
      ),
    ).toEqual([["First"], ["Second"]]);
    expect(tabs[1]!.getAttribute("aria-selected")).toBe("true");
    expect(tabs[0]!.className).toContain("min-h-12");
    const panel = section.querySelector('[role="tabpanel"]')!;
    expect(document.getElementById(panel.getAttribute("aria-labelledby")!)).toBe(tabs[1]);
    expect(tabs.map((tab) => document.getElementById(tab.getAttribute("aria-controls")!))).toEqual([panel, panel]);
    expect(panel.querySelector('[data-body="two"]')).not.toBeNull();
    expect(section.querySelector('[data-body="one"]')).toBeNull();
  });

  it("draws the tab action at the end of the tab row", async () => {
    await mount(
      <TabbedPage title="Things" tabs={TABS} value="one" onValueChange={() => {}} tabAction={<button data-action />} />,
    );
    const row = host!.querySelector("section")!.firstElementChild!;
    expect(row.querySelector('[role="tablist"]')).not.toBeNull();
    expect(row.lastElementChild!.hasAttribute("data-action")).toBe(true);
  });

  it("reports a chosen tab through onValueChange", async () => {
    const onValueChange = vi.fn();
    await mount(<TabbedPage title="Things" tabs={TABS} value="one" onValueChange={onValueChange} />);
    const second = host!.querySelectorAll<HTMLElement>('[role="tab"]')[1]!;
    await act(async () => {
      second.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
      second.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onValueChange).toHaveBeenCalledWith("two");
  });

  it("drops the tab row and its action and shows the first tab's body without showTabs", async () => {
    await mount(
      <TabbedPage
        title="Things"
        tabs={TABS}
        value="two"
        showTabs={false}
        onValueChange={() => {}}
        tabAction={<button data-action />}
      />,
    );
    expect(host!.querySelector('[role="tablist"]')).toBeNull();
    expect(host!.querySelector('[role="tabpanel"]')).toBeNull();
    expect(host!.querySelector("[data-action]")).toBeNull();
    expect(host!.querySelector('[data-body="one"]')).not.toBeNull();
  });
});
