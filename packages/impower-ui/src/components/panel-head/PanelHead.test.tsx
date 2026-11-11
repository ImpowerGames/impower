import { render, type ComponentChild } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import PanelHead, { panelHeadTitleVariants } from "./PanelHead";

let host: HTMLDivElement | undefined;

const mount = async (node: ComponentChild) => {
  host ??= document.body.appendChild(document.createElement("div"));
  await act(async () => render(node, host!));
  return host.querySelector<HTMLElement>("[data-panel-head]")!;
};

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
});

describe("PanelHead", () => {
  it("puts the start controls, the titled column and the end controls in order", async () => {
    const head = await mount(
      <PanelHead
        title="harbor"
        subtitle="Image · PNG"
        start={<button type="button">Close</button>}
        end={<button type="button">Next</button>}
      />,
    );
    expect(head.tagName).toBe("HEADER");
    const children = Array.from(head.children);
    expect(children[0]!.textContent).toBe("Close");
    expect(children[1]!.querySelector("h2")!.textContent).toBe("harbor");
    expect(children[1]!.querySelector("small")!.textContent).toBe("Image · PNG");
    expect(children[2]!.textContent).toBe("Next");
    expect(head.className).toContain("min-h-[52px]");
    expect(head.className).toContain("border-b");
  });

  it("takes a size, an edge, a title size and a heading node of the caller's own", async () => {
    const head = await mount(
      <PanelHead size="tall" edge={false} titleSize="sm" title={<h3 data-own>Rename</h3>} class="pl-6" />,
    );
    expect(head.className).toContain("h-[68px]");
    expect(head.className).not.toContain("border-b");
    expect(head.className).toContain("pl-6");
    expect(head.querySelector("h2")).toBeNull();
    expect(head.querySelector("[data-own]")!.textContent).toBe("Rename");
    expect(head.querySelector("small")).toBeNull();
    const compact = await mount(<PanelHead size="compact" titleSize="sm" title="Search" />);
    expect(compact.className).toContain("h-11");
    expect(compact.querySelector("h2")!.className).toContain("text-[14px]/[1.4]");
  });

  it.each(["sm", "md"] as const)(
    "styles a title node of the caller's own exactly as its own %s title",
    async (titleSize) => {
      const own = await mount(<PanelHead titleSize={titleSize} title="Search" />);
      const shared = own.querySelector("h2")!.className;
      const node = await mount(
        <PanelHead titleSize={titleSize} title={<h2 data-own class={panelHeadTitleVariants({ titleSize })}>Search</h2>} />,
      );
      expect(node.querySelector("[data-own]")!.className).toBe(shared);
      expect(shared).toContain("text-ink");
    },
  );
});
