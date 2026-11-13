import { render, type ComponentChild } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import StatusBadge, { statusBadgeVariants } from "./StatusBadge";

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

describe("StatusBadge", () => {
  it("announces its text as a status and takes no pointer input", async () => {
    await mount(<StatusBadge>End of story</StatusBadge>);
    const badge = host!.querySelector("span")!;
    expect(badge.getAttribute("role")).toBe("status");
    expect(badge.textContent).toBe("End of story");
    expect(badge.dataset["statusBadge"]).toBe("default");
    expect(badge.classList).toContain("pointer-events-none");
  });

  it("draws the default tone in accent ink on the paper with the edge", async () => {
    await mount(<StatusBadge>Previewing suggestion</StatusBadge>);
    const badge = host!.querySelector("span")!;
    for (const name of ["bg-paper", "border-edge", "text-accent", "rounded-md", "text-[12px]/[1.4]", "px-2.5", "py-1.5"]) {
      expect(badge.classList).toContain(name);
    }
  });

  it("draws the error tone in error ink with the error edge", async () => {
    await mount(<StatusBadge tone="error">Stopped by an error</StatusBadge>);
    const badge = host!.querySelector("span")!;
    expect(badge.dataset["statusBadge"]).toBe("error");
    expect(badge.classList).toContain("text-error");
    expect(badge.classList).toContain("border-status-badge-error-edge");
    expect(badge.classList).not.toContain("text-accent");
    expect(badge.classList).not.toContain("border-edge");
    expect(badge.className).toBe(statusBadgeVariants({ tone: "error" }));
  });

  it("merges the page's class and forwards its ref", async () => {
    let ref: HTMLSpanElement | null = null;
    await mount(
      <StatusBadge
        ref={(element: HTMLSpanElement | null) => {
          ref = element;
        }}
        class="absolute top-3 left-3"
      >
        End of story
      </StatusBadge>,
    );
    const badge = host!.querySelector("span")!;
    expect(ref).toBe(badge);
    expect(badge.classList).toContain("absolute");
    expect(badge.classList).toContain("bg-paper");
  });
});
