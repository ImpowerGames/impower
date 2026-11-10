import { render, type ComponentChild } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import MessageEntry from "./MessageEntry";

let host: HTMLDivElement | undefined;

const mount = async (node: ComponentChild) => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
  }
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(node, host!));
  return host.firstElementChild as HTMLElement;
};

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
});

describe("MessageEntry", () => {
  it("draws the glyph, the prefixed title in bold, the message beneath and a jump link, with no tooltip when it wraps", async () => {
    const onJump = vi.fn();
    const entry = await mount(
      <MessageEntry
        severity="error"
        prefix="Error · "
        title="Unexpected two dots"
        message="Remove the two dots."
        location="Line 17"
        locationLabel="Open chapter_2 at line 17"
        onJump={onJump}
      />,
    );
    expect(entry.getAttribute("data-message-entry")).toBe("error");
    expect(entry.querySelector("svg")!.getAttribute("class")).toContain("text-error");
    expect(entry.querySelector("strong")!.textContent).toBe("Error · Unexpected two dots");
    expect(entry.querySelector("strong + span")!.textContent).toBe("Remove the two dots.");
    expect(entry.querySelector("strong")!.hasAttribute("title")).toBe(false);
    const link = entry.querySelector("button")!;
    expect(link.textContent).toBe("Line 17");
    expect(link.getAttribute("aria-label")).toBe("Open chapter_2 at line 17");
    await act(async () => link.click());
    expect(onJump).toHaveBeenCalledTimes(1);
  });

  it("activates from a click anywhere on the row but its own buttons, and is plain selectable text without onActivate", async () => {
    const onActivate = vi.fn();
    const onAction = vi.fn();
    let entry = await mount(
      <MessageEntry
        severity="info"
        title="Chose · Pay."
        onActivate={onActivate}
        actions={
          <button type="button" aria-label="Go back" onClick={onAction} />
        }
      />,
    );
    expect(entry.hasAttribute("data-activatable")).toBe(true);
    expect(entry.className).toContain("cursor-pointer");
    await act(async () => entry.querySelector("strong")!.click());
    expect(onActivate).toHaveBeenCalledTimes(1);
    await act(async () => entry.querySelector("button")!.click());
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onActivate).toHaveBeenCalledTimes(1);
    entry = await mount(<MessageEntry severity="info" title="Chose · Pay." />);
    expect(entry.hasAttribute("data-activatable")).toBe(false);
    expect(entry.firstElementChild!.className).toContain("select-text");
  });

  it("leaves out what it lacks, and shows a time and actions when given", async () => {
    let entry = await mount(<MessageEntry severity="info" title="To do" />);
    expect(entry.querySelector("strong + span")).toBeNull();
    expect(entry.querySelector("button")).toBeNull();
    expect(entry.querySelector("time")).toBeNull();
    entry = await mount(
      <MessageEntry
        severity="warning"
        title="Slow"
        time={{ label: "10:15:30", dateTime: "2026-11-06T10:15:30.000Z" }}
        actions={<button type="button">Fix</button>}
      />,
    );
    const time = entry.querySelector("time")!;
    expect(time.textContent).toBe("10:15:30");
    expect(time.getAttribute("datetime")).toBe("2026-11-06T10:15:30.000Z");
    expect(entry.querySelector("button")!.textContent).toBe("Fix");
  });

  it("fills a fixed-height row, fading the title and clamping the message, when its fit is row", async () => {
    const entry = await mount(
      <MessageEntry fit="row" severity="warning" title="Sound not found" message="Long" />,
    );
    expect(entry.className).toContain("h-full");
    expect(entry.querySelector("strong")!.className).toContain("fade-edge");
    expect(entry.querySelector("strong")!.getAttribute("title")).toBe("Sound not found");
    expect(entry.querySelector("strong + span")!.className).toContain("line-clamp-2");
    expect(entry.querySelector("strong + span")!.getAttribute("title")).toBe("Long");
  });
});
