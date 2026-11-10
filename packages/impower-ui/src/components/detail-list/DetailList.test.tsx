import { render, type ComponentChild } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import DetailList from "./DetailList";

let host: HTMLDivElement | undefined;

const mount = async (node: ComponentChild) => {
  host ??= document.body.appendChild(document.createElement("div"));
  await act(async () => render(node, host!));
  return host.querySelector<HTMLElement>("[data-detail-list]")!;
};

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
});

describe("DetailList", () => {
  it("draws each row as a term and its value, in order", async () => {
    const list = await mount(
      <DetailList
        label="Details"
        rows={[
          { label: "Type", value: "Image · PNG" },
          { label: "Size", value: "1920 × 1080" },
          { label: "Where", value: <em>Assets root</em> },
        ]}
      />,
    );
    expect(list.tagName).toBe("DL");
    expect(list.getAttribute("aria-label")).toBe("Details");
    expect(Array.from(list.children).map((el) => `${el.tagName}:${el.textContent}`)).toEqual([
      "DT:Type",
      "DD:Image · PNG",
      "DT:Size",
      "DD:1920 × 1080",
      "DT:Where",
      "DD:Assets root",
    ]);
    expect(list.className).toContain("text-[12px]/[1.5]");
  });

  it("takes a size and draws nothing for no rows", async () => {
    const list = await mount(<DetailList size="md" rows={[]} class="mt-2" />);
    expect(list.children).toHaveLength(0);
    expect(list.className).toContain("text-[14px]/[1.5]");
    expect(list.className).toContain("mt-2");
  });
});
