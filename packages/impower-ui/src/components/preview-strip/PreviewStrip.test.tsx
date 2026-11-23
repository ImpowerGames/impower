import { render, type ComponentChild } from "preact";
import { renderToString } from "preact-render-to-string";
import { act } from "preact/test-utils";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { portalContainer } from "../../utils/portalContainer";
import { topToastLayer } from "../../utils/toastLayer";
import { applied, compiledRules, edgeTreatment } from "../../../test/fadeEdge";
import { blockExtent, hitArea } from "../../../test/hitArea";
import PreviewStrip, { type PreviewStripStatus } from "./PreviewStrip";

let host: HTMLDivElement | undefined;

const mount = async (node: ComponentChild) => {
  host ??= document.body.appendChild(document.createElement("div"));
  await act(async () => render(node, host!));
  return host;
};

const play = () =>
  host!.querySelector<HTMLButtonElement>('button[aria-label="Play from this line"]')!;
const dialog = () => host!.querySelector<HTMLDialogElement>("dialog")!;
const words = () => host!.querySelector<HTMLParagraphElement>("[data-preview-strip-copy] p")!;

const status = (key: string, onPress = vi.fn()): PreviewStripStatus => ({
  key,
  tone: key === "problem" ? "error" : "warning",
  icon: <svg data-icon={key} />,
  text: key === "problem" ? "Unknown character" : "Forced to reach this line",
  onPress,
});

beforeAll(() => {
  const proto = HTMLDialogElement.prototype as HTMLDialogElement & {
    showModal?: () => void;
    close?: () => void;
  };
  if (typeof proto.showModal !== "function") {
    proto.showModal = function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
  }
  if (typeof proto.close !== "function") {
    proto.close = function (this: HTMLDialogElement) {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    };
  }
});

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
});

describe("PreviewStrip", () => {
  it("names the line's kind, shows its words and offers Play from this line", async () => {
    const onPlay = vi.fn();
    await mount(<PreviewStrip label="IMANI" words="We need a mystery." onPlay={onPlay} />);
    const strip = host!.querySelector("section")!;
    expect(strip.getAttribute("aria-label")).toBe("Preview");
    expect(host!.querySelector("b")!.textContent).toBe("IMANI");
    expect(words().textContent).toBe("We need a mystery.");
    expect(play().disabled).toBe(false);
    await act(async () => play().click());
    expect(onPlay).toHaveBeenCalledTimes(1);
  });

  it("opens the full preview from a thumbnail tap without playing", async () => {
    const onPlay = vi.fn();
    const onOpen = vi.fn();
    await mount(
      <PreviewStrip label="IMANI" words="We need a mystery." onPlay={onPlay} onOpen={onOpen} />,
    );
    const thumbnail = host!.querySelector<HTMLButtonElement>(
      'button[aria-label="Open the full preview"]',
    )!;
    expect(thumbnail.closest("[data-preview-strip-picture]")).not.toBeNull();
    await act(async () => thumbnail.click());
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onPlay).not.toHaveBeenCalled();
  });

  it("removes the thumbnail's tap target while the full preview is open", async () => {
    await mount(<PreviewStrip label="IMANI" words="Rain." expanded onOpen={() => {}} />);
    expect(host!.querySelector('button[aria-label="Open the full preview"]')).toBeNull();
  });

  it("server-renders Play disabled only when asked, as on a setup line", () => {
    const play = (html: string) => {
      const markup = document.createElement("div");
      markup.innerHTML = html;
      return markup.querySelector<HTMLButtonElement>('button[aria-label="Play from this line"]')!;
    };
    expect(play(renderToString(<PreviewStrip label="ACTION" words="Rain." onPlay={() => {}} />)).disabled).toBe(false);
    expect(play(renderToString(<PreviewStrip label="STORY SETUP" words="Setup." playDisabled />)).disabled).toBe(true);
  });

  it("keeps Play disabled when asked, as on a setup line", async () => {
    await mount(<PreviewStrip label="STORY SETUP" words="This line sets up your story." symbol="file" playDisabled />);
    expect(play().disabled).toBe(true);
  });

  it("keeps the shorter form at every size and clamps the words to two lines, one beside two status rows", async () => {
    await mount(<PreviewStrip label="ACTION" words="Rain." />);
    const strip = host!.querySelector("section")!.className;
    expect(strip).toContain("h-[var(--preview-strip-height)]");
    expect(strip).not.toContain("104px");
    expect(host!.querySelector("[data-preview-strip-picture]")!.className).toContain("h-[72px]");
    expect(words().className).toContain("line-clamp-2");
    await mount(<PreviewStrip label="ACTION" words="Rain." statuses={[status("problem")]} />);
    expect(words().className).toContain("line-clamp-2");
    await mount(
      <PreviewStrip label="ACTION" words="Rain." statuses={[status("problem"), status("forced")]} />,
    );
    expect(words().className).toContain("line-clamp-1");
    expect(host!.querySelector("[data-preview-strip-copy]")!.className).toContain("self-start");
  });

  it("draws the tablet strip 104px tall with a 98 x 83 picture and three lines of words, two beside a status row", async () => {
    await mount(<PreviewStrip size="tablet" label="ACTION" words="Rain." />);
    const strip = host!.querySelector("section")!.className;
    expect(strip).toContain("h-[var(--preview-strip-tablet-height)]");
    expect(strip).not.toContain("h-[var(--preview-strip-height)]");
    const picture = host!.querySelector("[data-preview-strip-picture]")!.className;
    expect(picture).toContain("h-[83px]");
    expect(picture).toContain("w-[98px]");
    expect(picture).not.toContain("h-[72px]");
    expect(words().className).toContain("line-clamp-3");
    await mount(<PreviewStrip size="tablet" label="ACTION" words="Rain." statuses={[status("problem")]} />);
    expect(words().className).toContain("line-clamp-2");
    await mount(
      <PreviewStrip size="tablet" label="ACTION" words="Rain." statuses={[status("problem"), status("forced")]} />,
    );
    expect(words().className).toContain("line-clamp-2");
    expect(play().className).toContain("size-11");
  });

  it("docks the picture to fill its host with no strip chrome, never as a modal, and keeps the same picture element when it leaves the dock", async () => {
    const onCollapse = vi.fn();
    await mount(
      <PreviewStrip docked expanded label="ACTION" words="Rain." symbol="file" onOpen={vi.fn()} onCollapse={onCollapse} picture={<div data-player />} />,
    );
    const section = host!.querySelector("section")!;
    expect(section.hasAttribute("aria-label")).toBe(false);
    expect(section.className).not.toContain("--preview-strip");
    expect(host!.querySelector("[data-preview-strip-copy]")).toBeNull();
    expect(host!.querySelector('button[aria-label="Play from this line"]')).toBeNull();
    expect(host!.querySelector("[data-preview-strip-symbol]")).toBeNull();
    expect(host!.querySelector("[data-preview-strip-open]")).toBeNull();
    expect(dialog().open).toBe(false);
    expect(dialog().hasAttribute("inert")).toBe(false);
    expect(dialog().className).toContain("h-full");
    expect(dialog().className).not.toContain("scale-");
    const player = host!.querySelector("[data-player]");
    await mount(
      <PreviewStrip size="tablet" label="ACTION" words="Rain." onCollapse={onCollapse} picture={<div data-player />} />,
    );
    expect(host!.querySelector("[data-player]")).toBe(player);
    expect(dialog().hasAttribute("inert")).toBe(true);
    expect(play()).not.toBeNull();
    expect(onCollapse).not.toHaveBeenCalled();
  });

  it.each(["problem", "forced"])("gives a %s row shown alone its 44px target", async (key) => {
    await mount(<PreviewStrip label="ACTION" words="Rain." statuses={[status(key)]} />);
    const row = host!.querySelector(`[data-preview-strip-status="${key}"]`)!;
    expect((await hitArea(row)).height).toBe(44);
  });

  it("splits two rows' targets at the midpoint between them, so the boxes meet and never overlap", async () => {
    await mount(
      <PreviewStrip label="ACTION" words="Rain." statuses={[status("problem"), status("forced")]} />,
    );
    const [first, second] = Array.from(host!.querySelectorAll("[data-preview-strip-status]"));
    const upper = await blockExtent(first!);
    const lower = await blockExtent(second!);
    const upperTop = upper.marginTop;
    const upperBottom = upperTop + upper.height;
    const lowerTop = upperBottom + upper.marginBottom + lower.marginTop;
    const upperSlot = upper.height + upper.marginTop + upper.marginBottom;
    const lowerSlot = lower.height + lower.marginTop + lower.marginBottom;
    expect(lowerTop, "the lower box starts where the upper one ends").toBe(upperBottom);
    expect(upperSlot, "the boundary sits midway between the rows").toBe(lowerSlot);
    expect(upperBottom - upperTop).toBe(lower.height);
  });

  it("presses a status row and keeps its one-line title cut with an ellipsis", async () => {
    const onPress = vi.fn();
    await mount(<PreviewStrip label="ACTION" words="Rain." statuses={[status("problem", onPress)]} />);
    const row = host!.querySelector<HTMLButtonElement>('[data-preview-strip-status="problem"]')!;
    expect(row.className).toContain("text-error");
    expect(row.querySelector("span")!.className).toContain("truncate");
    expect(row.querySelector('[data-icon="problem"]')).not.toBeNull();
    await act(async () => row.click());
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("shows the file or pencil symbol in place of the picture, hidden from assistive technology", async () => {
    await mount(<PreviewStrip label="YOUR GAME" words="Write a line and it appears here." symbol="pencil" />);
    const symbol = host!.querySelector("[data-preview-strip-symbol]")!;
    expect(symbol.getAttribute("data-preview-strip-symbol")).toBe("pencil");
    expect(symbol.getAttribute("aria-hidden")).toBe("true");
  });

  it("keeps the picture inert and scaled down until expanded, then opens it as a modal portal host", async () => {
    const showModal = vi.spyOn(HTMLDialogElement.prototype, "showModal");
    const picture = <div data-player>game</div>;
    await mount(<PreviewStrip label="ACTION" words="Rain." picture={picture} />);
    expect(dialog().inert || dialog().hasAttribute("inert")).toBe(true);
    expect(dialog().className).toContain("scale-[0.1666667]");
    expect(dialog().className).toContain("pointer-events-none");
    const player = host!.querySelector("[data-player]");
    await mount(<PreviewStrip label="ACTION" words="Rain." picture={picture} expanded />);
    expect(showModal).toHaveBeenCalledTimes(1);
    expect(dialog().open).toBe(true);
    expect(dialog().inert || dialog().hasAttribute("inert")).toBe(false);
    expect(dialog().className).toContain("fixed");
    expect(host!.querySelector("[data-player]")).toBe(player);
    expect(portalContainer()).toBe(dialog());
    expect(topToastLayer()?.closest("dialog")).toBe(dialog());
    await mount(<PreviewStrip label="ACTION" words="Rain." picture={picture} expanded={false} />);
    expect(topToastLayer()).toBeNull();
    showModal.mockRestore();
  });

  it("asks to collapse on Escape and returns focus to Play when it collapses", async () => {
    const onCollapse = vi.fn();
    await mount(<PreviewStrip label="ACTION" words="Rain." expanded onCollapse={onCollapse} />);
    const cancel = new Event("cancel", { cancelable: true });
    dialog().dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(onCollapse).toHaveBeenCalledTimes(1);
    await mount(<PreviewStrip label="ACTION" words="Rain." expanded={false} onCollapse={onCollapse} />);
    expect(dialog().open).toBe(false);
    expect(dialog().style.display).toBe("");
    expect(document.activeElement).toBe(play());
    expect(portalContainer()).toBeUndefined();
  });

  it("returns focus to Play once Play is enabled again when it collapses while Play is disabled", async () => {
    await mount(<PreviewStrip label="YOUR GAME" words="Write a line." expanded playDisabled />);
    expect(document.activeElement).toBe(document.body);
    await mount(<PreviewStrip label="YOUR GAME" words="Write a line." expanded={false} playDisabled />);
    expect(dialog().open).toBe(false);
    expect(document.activeElement).not.toBe(play());
    await mount(<PreviewStrip label="ACTION" words="Rain." expanded={false} />);
    expect(document.activeElement).toBe(play());
  });

  it("leaves focus where the author put it when Play is enabled only after they acted", async () => {
    await mount(<PreviewStrip label="YOUR GAME" words="Write a line." expanded playDisabled />);
    await mount(<PreviewStrip label="YOUR GAME" words="Write a line." expanded={false} playDisabled />);
    const field = document.body.appendChild(document.createElement("input"));
    try {
      field.dispatchEvent(new Event("pointerdown", { bubbles: true }));
      field.focus();
      await mount(<PreviewStrip label="ACTION" words="Rain." expanded={false} />);
      expect(document.activeElement).toBe(field);
    } finally {
      field.remove();
    }
  });
});

describe("PreviewStrip edge", () => {
  it("fades a long label at its edge, and keeps the words' clamp to set lines", async () => {
    await mount(<PreviewStrip label="A VERY LONG CHARACTER NAME (V.O.) (CONT'D)" words="We need a mystery." />);
    const label = host!.querySelector("b")!;
    expect(await edgeTreatment([label])).toEqual([{ text: label.textContent, masked: true, ellipsis: false }]);
    const rules = await compiledRules([words()]);
    expect(applied(rules, words(), "-webkit-line-clamp")).toEqual(["2"]);
  });
});
