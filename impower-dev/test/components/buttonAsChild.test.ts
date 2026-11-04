import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, expect, it } from "vitest";

afterEach(() => {
  document.body.innerHTML = "";
});

it("Button asChild slots its props onto the single child element", async () => {
  const { Button } = await import("@impower/impower-ui/components");
  const host = document.body.appendChild(document.createElement("div"));
  await act(async () => {
    render(
      h(Button, { asChild: true, variant: "outline" }, h("a", { href: "#open" }, "Open")),
      host,
    );
  });
  const anchor = host.querySelector("a");
  expect(host.children).toHaveLength(1);
  expect(host.firstElementChild).toBe(anchor);
  expect(anchor?.textContent).toBe("Open");
  expect(anchor?.getAttribute("href")).toBe("#open");
  expect(anchor?.className).toContain("inline-flex");
  expect(host.querySelector("button")).toBeNull();
});

it("Button without asChild renders a button that keeps its ripple", async () => {
  const { Button } = await import("@impower/impower-ui/components");
  const host = document.body.appendChild(document.createElement("div"));
  await act(async () => {
    render(h(Button, {}, "Go"), host);
  });
  const button = host.querySelector("button");
  expect(button?.getAttribute("type")).toBe("button");
  expect(button?.textContent).toBe("Go");
  expect(button?.childNodes.length).toBeGreaterThan(1);
});
