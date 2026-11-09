import { render, type ComponentChild } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import PageFrame from "./PageFrame";

let host: HTMLDivElement | undefined;

const mount = async (node: ComponentChild) => {
  host = document.body.appendChild(document.createElement("div"));
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

describe("PageFrame", () => {
  it("draws the eyebrow, heading, line, Back to story and children in a labelled section", async () => {
    const onBack = vi.fn();
    await mount(
      <PageFrame id="share-page" eyebrow="Kicker" title="Share your story" line="The line." onBack={onBack}>
        <div data-child>child</div>
      </PageFrame>,
    );
    const section = host!.querySelector("section")!;
    expect(section.id).toBe("share-page");
    expect(section.getAttribute("aria-label")).toBe("Share your story");
    expect(section.querySelector("h1")!.textContent).toBe("Share your story");
    expect(section.textContent).toContain("Kicker");
    expect(section.querySelector("p")!.textContent).toBe("The line.");
    expect(section.querySelector("[data-child]")).not.toBeNull();
    const back = section.querySelector("button")!;
    expect(back.textContent).toBe("Back to story");
    await act(async () => back.click());
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("omits the back action without onBack, and sizes the title by variant", async () => {
    await mount(<PageFrame size="compact" eyebrow="K" title="T" line="L" />);
    expect(host!.querySelector("button")).toBeNull();
    expect(host!.querySelector("h1")!.className).toContain("text-[32px]/[1.15]");
    expect(host!.querySelector("h1")!.className).not.toContain("text-[40px]");
  });
});
