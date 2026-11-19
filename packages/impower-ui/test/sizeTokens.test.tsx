import { render, type ComponentChild } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import ListRow, { ListRowBadge } from "../src/components/list-row/ListRow";
import PanelHead from "../src/components/panel-head/PanelHead";
import { popoverVariants } from "../src/components/popover/Popover";
import Tabs, { Tab } from "../src/components/tabs/Tabs";
import { declaredStyle, resolveLength, themeTokens } from "./hitArea";

let host: HTMLDivElement | undefined;

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
  document.body.innerHTML = "";
});

const mount = async (node: ComponentChild): Promise<HTMLDivElement> => {
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(node, host!));
  return host;
};

const WEB_VALUES: [string, string][] = [
  ["--tab-height", "48px"],
  ["--tab-padding-x", "20px"],
  ["--tab-gap", "8px"],
  ["--tab-font-size", "14px"],
  ["--panel-head-height", "44px"],
  ["--panel-head-padding-x", "10px"],
  ["--panel-head-gap", "4px"],
  ["--list-row-compact-height", "44px"],
  ["--list-row-compact-padding-x", "8px"],
  ["--list-row-compact-padding-y", "4px"],
  ["--list-row-compact-gap", "10px"],
  ["--list-row-compact-font-size", "12px"],
  ["--control-size", "44px"],
  ["--popover-width", "360px"],
];

describe("size tokens", () => {
  it.each(WEB_VALUES)("declares %s at the web editor's %s", (token, value) => {
    expect(themeTokens().get(token)).toBe(value);
  });

  const expectReads = async (
    element: Element | null,
    reads: [property: string, token: string, px: number][],
  ) => {
    expect(element).not.toBeNull();
    const declared = await declaredStyle(element!);
    for (const [property, token, px] of reads) {
      expect(declared(property), property).toBe(`var(${token})`);
      expect(resolveLength(declared(property)!), property).toBe(px);
    }
  };

  it.each(["above", "beside"] as const)("sizes a Tabs trigger with icons %s its label from the tab tokens", async (iconLayout) => {
    const root = await mount(
      <Tabs value="a" onChange={() => {}} iconLayout={iconLayout}>
        <Tab value="a">Routes</Tab>
      </Tabs>,
    );
    await expectReads(root.querySelector('[role="tab"]'), [
      ["min-height", "--tab-height", 48],
      ["padding-inline", "--tab-padding-x", 20],
      ["column-gap", "--tab-gap", 8],
      ["font-size", "--tab-font-size", 14],
    ]);
  });

  it("sizes a compact inset PanelHead from the panel-head tokens", async () => {
    const root = await mount(<PanelHead size="compact" spacing="inset" title="Routes" />);
    await expectReads(root.querySelector("[data-panel-head]"), [
      ["height", "--panel-head-height", 44],
      ["padding-inline", "--panel-head-padding-x", 10],
      ["gap", "--panel-head-gap", 4],
    ]);
  });

  it("sizes a compact ListRow body from the list-row tokens", async () => {
    const root = await mount(<ListRow size="compact" label="start" onClick={() => {}} />);
    await expectReads(root.querySelector("button"), [
      ["min-height", "--list-row-compact-height", 44],
      ["padding-inline", "--list-row-compact-padding-x", 8],
      ["padding-block", "--list-row-compact-padding-y", 4],
      ["gap", "--list-row-compact-gap", 10],
      ["font-size", "--list-row-compact-font-size", 12],
    ]);
  });

  it("sizes a trailing ListRow action button from the control token", async () => {
    const root = await mount(<ListRowBadge label="Scene" severity="warning" onClick={() => {}} />);
    await expectReads(root.querySelector("[data-list-row-badge]"), [
      ["height", "--control-size", 44],
      ["width", "--control-size", 44],
    ]);
  });

  it("sizes a panel Popover from the popover token", async () => {
    const root = await mount(<div class={popoverVariants({ size: "panel" })} />);
    await expectReads(root.firstElementChild, [["width", "--popover-width", 360]]);
  });
});
