import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, expect, it } from "vitest";
import { Button, Tab, Tabs } from "@impower/impower-ui/components";

let host: HTMLDivElement | undefined;

const mount = async (node: ReturnType<typeof h>) => {
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => {
    render(node, host!);
  });
  return host;
};

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
});

it("renders a button from the real component kit", async () => {
  const clicks: string[] = [];
  const root = await mount(h(Button, { onClick: () => clicks.push("open") }, "Open"));
  const button = root.querySelector("button");
  expect(button?.getAttribute("type")).toBe("button");
  expect(button?.textContent).toBe("Open");
  await act(async () => button!.click());
  expect(clicks).toEqual(["open"]);
});

it("renders Radix tabs from the real component kit", async () => {
  const root = await mount(
    h(
      Tabs,
      { value: "logic", onChange: () => {}, indicator: "none" },
      h(Tab, { value: "logic" }, "Logic"),
      h(Tab, { value: "assets" }, "Assets"),
    ),
  );
  const tabs = [...root.querySelectorAll('[role="tab"]')];
  expect(tabs.map((tab) => tab.getAttribute("aria-selected"))).toEqual(["true", "false"]);
});
