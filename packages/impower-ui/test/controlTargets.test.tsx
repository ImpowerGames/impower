import { render, type ComponentChild } from "preact";
import { act } from "preact/test-utils";
import { afterEach, expect, it } from "vitest";
import Button from "../src/components/button/Button";
import {
  DropdownCheckboxItem,
  DropdownContent,
  DropdownItem,
  DropdownRoot,
  DropdownTrigger,
} from "../src/components/dropdown/Dropdown";
import Tabs, { Tab } from "../src/components/tabs/Tabs";
import { hitArea } from "./hitArea";

let host: HTMLDivElement | undefined;

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
  document.body.innerHTML = "";
});

const mount = async (node: ComponentChild) => {
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(node, host!));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
};

const expectTarget = async (element: Element | null, axes: ("width" | "height")[]) => {
  expect(element).not.toBeNull();
  const area = await hitArea(element!);
  for (const axis of axes) {
    expect(area[axis], `${axis} of ${element!.outerHTML.slice(0, 80)}`).toBeGreaterThanOrEqual(44);
  }
};

it("gives every Button kind a 44px square or taller target", async () => {
  await mount(
    <>
      <Button>Text</Button>
      <Button size="icon" aria-label="Close">
        x
      </Button>
      <Button size="pill">Done</Button>
      <Button variant="field" size="field">
        As is
      </Button>
    </>,
  );
  for (const button of Array.from(host!.querySelectorAll("button"))) {
    await expectTarget(button, ["width", "height"]);
  }
});

it.each([
  ["a max size", "max-h-6 max-w-6"],
  ["a later fixed size", "size-6"],
])("measures a button capped by %s below 44px", async (_label, cap) => {
  await mount(
    <Button size="icon" class={cap} aria-label="Close">
      x
    </Button>,
  );
  const area = await hitArea(host!.querySelector("button")!);
  expect(area.width).toBe(24);
  expect(area.height).toBe(24);
});

it("keeps a min-height above a smaller max-height, as layout does", async () => {
  await mount(<Button class="max-h-6">Text</Button>);
  const area = await hitArea(host!.querySelector("button")!);
  expect(area.height).toBe(44);
});

it("gives every menu row a 44px tall target", async () => {
  await mount(
    <DropdownRoot defaultOpen>
      <DropdownTrigger asChild>
        <Button>Menu</Button>
      </DropdownTrigger>
      <DropdownContent>
        <DropdownItem>Rename</DropdownItem>
        <DropdownCheckboxItem checked>Word wrap</DropdownCheckboxItem>
      </DropdownContent>
    </DropdownRoot>,
  );
  const rows = Array.from(document.querySelectorAll('[role="menuitem"], [role="menuitemcheckbox"]'));
  expect(rows).toHaveLength(2);
  for (const row of rows) {
    await expectTarget(row, ["height"]);
  }
});

it.each(["above", "beside"] as const)("gives every tab with icons %s its label a 44px tall target", async (iconLayout) => {
  await mount(
    <Tabs value="a" onChange={() => {}} iconLayout={iconLayout}>
      <Tab value="a">Logic</Tab>
      <Tab value="b">Assets</Tab>
    </Tabs>,
  );
  const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
  expect(tabs).toHaveLength(2);
  for (const tab of tabs) {
    await expectTarget(tab, ["height"]);
  }
});

it.each([
  ["above", "min-h-11"],
  ["beside", "min-h-12"],
] as const)("floors every vertical tab with icons %s its label at %s so a basis-0 column cannot collapse it", async (iconLayout, floor) => {
  await mount(
    <Tabs value="a" onChange={() => {}} vertical iconLayout={iconLayout}>
      <Tab value="a">Logic</Tab>
      <Tab value="b">Assets</Tab>
    </Tabs>,
  );
  const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
  expect(tabs).toHaveLength(2);
  for (const tab of tabs) {
    expect(Array.from(tab.classList)).toContain(floor);
    expect(Array.from(tab.classList).filter((name) => /^h-/.test(name))).toEqual([]);
    await expectTarget(tab, ["height"]);
  }
});
