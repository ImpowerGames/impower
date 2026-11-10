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
  it("draws the header, a tablist of the tabs and only the chosen tab's body", async () => {
    const onBack = vi.fn();
    await mount(
      <TabbedPage title="Things" tabs={TABS} value="two" onValueChange={() => {}} onBack={onBack} />,
    );
    const section = host!.querySelector("section")!;
    expect(section.getAttribute("aria-label")).toBe("Things");
    expect(section.querySelector("h1")!.textContent).toBe("Things");
    const tabs = Array.from(section.querySelectorAll<HTMLElement>('[role="tablist"] [role="tab"]'));
    expect(tabs.map((tab) => tab.textContent)).toEqual(["FirstFirst", "SecondSecond"]);
    expect(tabs[1]!.getAttribute("aria-selected")).toBe("true");
    expect(tabs[0]!.className).toContain("min-h-12");
    const panel = section.querySelector('[role="tabpanel"]')!;
    expect(panel.getAttribute("aria-label")).toBe("Second");
    expect(panel.querySelector('[data-body="two"]')).not.toBeNull();
    expect(section.querySelector('[data-body="one"]')).toBeNull();
    const back = Array.from(section.querySelectorAll("button")).find((b) => b.textContent === "Back to story")!;
    await act(async () => back.click());
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("reports a chosen tab through onValueChange", async () => {
    const onValueChange = vi.fn();
    await mount(
      <TabbedPage title="Things" tabs={TABS} value="one" onValueChange={onValueChange} onBack={() => {}} />,
    );
    const second = host!.querySelectorAll<HTMLElement>('[role="tab"]')[1]!;
    await act(async () => {
      second.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
      second.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onValueChange).toHaveBeenCalledWith("two");
  });

  it("drops the tab row and shows the first tab's body without showTabs", async () => {
    await mount(
      <TabbedPage title="Things" tabs={TABS} value="two" showTabs={false} onValueChange={() => {}} onBack={() => {}} />,
    );
    expect(host!.querySelector('[role="tablist"]')).toBeNull();
    expect(host!.querySelector('[role="tabpanel"]')).toBeNull();
    expect(host!.querySelector('[data-body="one"]')).not.toBeNull();
  });
});
