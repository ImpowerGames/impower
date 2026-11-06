import { render, type ComponentChild } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import Disclosure from "./Disclosure";

let host: HTMLDivElement | undefined;

const mount = async (node: ComponentChild) => {
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(node, host!));
  return host.querySelector<HTMLDetailsElement>("details[data-disclosure]")!;
};

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
});

describe("Disclosure", () => {
  it("renders a closed native details element whose summary toggles it", async () => {
    const details = await mount(
      <Disclosure summary="Syntax color key">
        <p>Body</p>
      </Disclosure>,
    );
    const summary = details.querySelector("summary")!;
    expect(details.open).toBe(false);
    expect(summary.textContent).toBe("Syntax color key");
    expect(details.firstElementChild).toBe(summary);
    summary.click();
    expect(details.open).toBe(true);
    summary.click();
    expect(details.open).toBe(false);
  });

  it("draws a top edge only when asked and merges the caller's class", async () => {
    const plain = await mount(<Disclosure summary="A">B</Disclosure>);
    expect(plain.classList.contains("border-t")).toBe(false);
    await act(async () => render(null, host!));
    host!.remove();
    const edged = await mount(
      <Disclosure summary="A" edge="top" class="mt-2">
        B
      </Disclosure>,
    );
    expect(edged.classList.contains("border-t")).toBe(true);
    expect(edged.classList.contains("mt-2")).toBe(true);
  });
});
