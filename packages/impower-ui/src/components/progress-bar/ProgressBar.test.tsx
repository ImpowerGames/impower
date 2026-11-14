import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import ProgressBar from "./ProgressBar";

let host: HTMLDivElement | undefined;

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
});

const mount = async (bar: preact.VNode) => {
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(bar, host!));
  return host.querySelector<HTMLElement>('[role="progressbar"]')!;
};

describe("ProgressBar", () => {
  it("reports a measured share as a whole percent and fills that much", async () => {
    const bar = await mount(<ProgressBar value={0.333} label="rain.ogg" />);
    expect(bar.getAttribute("aria-label")).toBe("rain.ogg");
    expect(bar.getAttribute("aria-valuenow")).toBe("33");
    expect(bar.getAttribute("aria-busy")).toBeNull();
    expect((bar.firstElementChild as HTMLElement).style.width).toBe("33%");
  });

  it("eases a partial share toward its width", async () => {
    const bar = await mount(<ProgressBar value={0.5} label="half" />);
    expect((bar.firstElementChild as HTMLElement).className).toContain("motion-safe:transition-[width]");
  });

  it("draws a finished share full at once, even straight from the unknown sweep", async () => {
    host = document.body.appendChild(document.createElement("div"));
    await act(async () => render(<ProgressBar label="rain.ogg" />, host!));
    await act(async () => render(<ProgressBar value={1} label="rain.ogg" />, host!));
    const fill = host.querySelector<HTMLElement>('[role="progressbar"] > span')!;
    expect(fill.style.width).toBe("100%");
    expect(fill.className).not.toContain("transition");
  });

  it("clamps a share outside 0 to 1", async () => {
    const bar = await mount(<ProgressBar value={1.5} label="full" />);
    expect(bar.getAttribute("aria-valuenow")).toBe("100");
  });

  it("is busy with no value while the share is unknown, and sweeps only when motion is allowed", async () => {
    const bar = await mount(<ProgressBar label="adding" />);
    expect(bar.getAttribute("aria-valuenow")).toBeNull();
    expect(bar.getAttribute("aria-busy")).toBe("true");
    const fill = bar.querySelector("span")!;
    expect(fill.className).toContain("motion-safe:animate-");
    expect(fill.className.split(" ").filter((name) => name.startsWith("animate-"))).toEqual([]);
  });

  it("fades for a file that was not added", async () => {
    const bar = await mount(<ProgressBar value={0} label="x" tone="faded" />);
    expect(bar.className).toContain("opacity-40");
  });
});
