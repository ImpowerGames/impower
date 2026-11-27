import { render, type ComponentChild } from "preact";
import { renderToString } from "preact-render-to-string";
import { act } from "preact/test-utils";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { portalContainer } from "../../../src/utils/portalContainer";
import { topToastLayer } from "../../../src/utils/toastLayer";
import { applied, compiledRules, edgeTreatment } from "../../fadeEdge";
import { blockExtent, hitArea } from "../../hitArea";
import PreviewStrip, { usePreviewStripFull, type PreviewStripStatus } from "../../../src/components/preview-strip/PreviewStrip";

let host: HTMLDivElement | undefined;

const mount = async (node: ComponentChild) => {
  host ??= document.body.appendChild(document.createElement("div"));
  await act(async () => render(node, host!));
  return host;
};

const faded = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

const exitRunning = () => {
  const running = { playState: "running", animationName: "fade-out", effect: { pseudoElement: null } } as unknown as Animation;
  const element = dialog();
  Object.defineProperty(element, "getAnimations", { configurable: true, value: () => [running] });
  const fire = async (type: string, animationName: string, pseudoElement: string) => {
    const event = new Event(type);
    Object.defineProperty(event, "animationName", { value: animationName });
    Object.defineProperty(event, "pseudoElement", { value: pseudoElement });
    await act(async () => {
      dialog().dispatchEvent(event);
    });
  };
  return {
    end: (pseudoElement = "") => fire("animationend", "fade-out", pseudoElement),
    cancelEntrance: () => fire("animationcancel", "fade-in", ""),
    restore: () => {
      Reflect.deleteProperty(element, "getAnimations");
    },
  };
};

const animated = (className: string) => className.split(/\s+/).filter((name) => name.includes("anim-"));

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

  it("fades the full preview and its backdrop in from the strip and out on collapse in 180ms, with the same picture throughout", async () => {
    const picture = <div data-player>game</div>;
    await mount(<PreviewStrip label="ACTION" words="Rain." picture={picture} />);
    const player = host!.querySelector("[data-player]");
    expect(animated(dialog().className)).toEqual([]);
    await mount(<PreviewStrip label="ACTION" words="Rain." picture={picture} expanded />);
    expect(dialog().open).toBe(true);
    expect(animated(dialog().className)).toEqual(["motion-safe:anim-scrim-in", "motion-safe:backdrop:anim-scrim-in"]);
    await mount(<PreviewStrip label="ACTION" words="Rain." picture={picture} expanded={false} />);
    expect(dialog().open).toBe(true);
    expect(dialog().className).toContain("fixed");
    expect(dialog().inert || dialog().hasAttribute("inert")).toBe(true);
    expect(animated(dialog().className)).toEqual(["motion-safe:anim-scrim-out", "motion-safe:backdrop:anim-scrim-out"]);
    expect(dialog().className).toContain("motion-reduce:invisible");
    expect(dialog().className).toContain("motion-reduce:backdrop:invisible");
    expect(host!.querySelector("[data-player]")).toBe(player);
    await faded();
    expect(dialog().open).toBe(false);
    expect(dialog().className).toContain("scale-[0.1666667]");
    expect(animated(dialog().className)).toEqual([]);
    expect(host!.querySelector("[data-player]")).toBe(player);
  });

  it("stays full screen while its exit fade runs, however long it takes, and reports collapsed once when the dialog's own fade ends", async () => {
    const onCollapsed = vi.fn();
    await mount(<PreviewStrip label="ACTION" words="Rain." expanded onCollapsed={onCollapsed} />);
    const exit = exitRunning();
    try {
      await mount(<PreviewStrip label="ACTION" words="Rain." expanded={false} onCollapsed={onCollapsed} />);
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 400));
      });
      expect(dialog().open).toBe(true);
      expect(onCollapsed).not.toHaveBeenCalled();
      await exit.end("::backdrop");
      expect(dialog().open).toBe(true);
      expect(onCollapsed).not.toHaveBeenCalled();
      await exit.end();
      expect(dialog().open).toBe(false);
      expect(onCollapsed).toHaveBeenCalledTimes(1);
      await exit.end();
      expect(onCollapsed).toHaveBeenCalledTimes(1);
    } finally {
      exit.restore();
    }
  });

  it("leaves the top layer in the same step that drops its full-screen form, and reports collapsed once it has", async () => {
    const openWhenCollapsed: boolean[] = [];
    const onCollapsed = vi.fn(() => openWhenCollapsed.push(dialog().open));
    await mount(<PreviewStrip label="ACTION" words="Rain." expanded onCollapsed={onCollapsed} />);
    const exit = exitRunning();
    try {
      await mount(<PreviewStrip label="ACTION" words="Rain." expanded={false} onCollapsed={onCollapsed} />);
      const end = new Event("animationend");
      Object.defineProperty(end, "animationName", { value: "fade-out" });
      Object.defineProperty(end, "pseudoElement", { value: "" });
      dialog().dispatchEvent(end);
      for (let i = 0; i < 5; i += 1) {
        await Promise.resolve();
      }
      expect(dialog().className).toContain("scale-[0.1666667]");
      expect(dialog().open).toBe(false);
      expect(openWhenCollapsed).toEqual([false]);
    } finally {
      exit.restore();
    }
  });

  it("tells its picture it is full screen from opening until its exit fade ends", async () => {
    const Picture = () => <div data-full={usePreviewStripFull() ? "" : undefined} />;
    const full = () => host!.querySelector("[data-full]") !== null;
    await mount(<PreviewStrip label="ACTION" words="Rain." picture={<Picture />} />);
    expect(full()).toBe(false);
    await mount(<PreviewStrip label="ACTION" words="Rain." picture={<Picture />} expanded />);
    expect(full()).toBe(true);
    const exit = exitRunning();
    try {
      await mount(<PreviewStrip label="ACTION" words="Rain." picture={<Picture />} expanded={false} />);
      expect(full()).toBe(true);
      await exit.end();
      expect(full()).toBe(false);
    } finally {
      exit.restore();
    }
  });

  it("keeps fading out when Close cancels its entrance fade, and reports collapsed only when the exit fade ends", async () => {
    const onCollapsed = vi.fn();
    await mount(<PreviewStrip label="ACTION" words="Rain." expanded onCollapsed={onCollapsed} />);
    const exit = exitRunning();
    try {
      await mount(<PreviewStrip label="ACTION" words="Rain." expanded={false} onCollapsed={onCollapsed} />);
      await exit.cancelEntrance();
      await faded();
      expect(dialog().open).toBe(true);
      expect(onCollapsed).not.toHaveBeenCalled();
      await exit.end();
      expect(dialog().open).toBe(false);
      expect(onCollapsed).toHaveBeenCalledTimes(1);
    } finally {
      exit.restore();
    }
  });

  it("compiles its fades as 180ms opacity animations on the dialog and its backdrop, only when motion is allowed", async () => {
    const element = document.createElement("div");
    element.className = [
      "motion-safe:anim-scrim-in",
      "motion-safe:backdrop:anim-scrim-in",
      "motion-safe:anim-scrim-out",
      "motion-safe:backdrop:anim-scrim-out",
    ].join(" ");
    const rules = await compiledRules([element]);
    const animation = (name: string, backdrop: boolean) =>
      rules
        .filter((rule) => rule.selectorText.includes(name) && rule.selectorText.includes("::backdrop") === backdrop)
        .map((rule) => ({
          value: rule.style.getPropertyValue("animation"),
          media: (rule.parentRule as CSSMediaRule | null)?.media?.mediaText ?? "",
        }));
    const seconds = (value: string) => {
      const token = value.split(/\s+/).find((part) => /^[\d.]+m?s$/.test(part)) ?? "";
      return token.endsWith("ms") ? parseFloat(token) : parseFloat(token) * 1000;
    };
    for (const backdrop of [false, true]) {
      const [enter = { value: "", media: "" }] = animation("anim-scrim-in", backdrop);
      const [leave = { value: "", media: "" }] = animation("anim-scrim-out", backdrop);
      expect(enter.value).toContain("fade-in");
      expect(enter.value).toContain("ease-out");
      expect(seconds(enter.value)).toBe(180);
      expect(enter.media).toContain("no-preference");
      expect(leave.value).toContain("fade-out");
      expect(leave.value).toContain("ease-in");
      expect(leave.value).toContain("forwards");
      expect(seconds(leave.value)).toBe(180);
      expect(leave.media).toContain("no-preference");
    }
  });

  it("collapses on the next frame when no exit fade runs, as under reduced motion, and reports collapsed", async () => {
    const onCollapsed = vi.fn();
    await mount(<PreviewStrip label="ACTION" words="Rain." expanded onCollapsed={onCollapsed} />);
    await mount(<PreviewStrip label="ACTION" words="Rain." expanded={false} onCollapsed={onCollapsed} />);
    expect(dialog().open).toBe(true);
    await faded();
    expect(dialog().open).toBe(false);
    expect(onCollapsed).toHaveBeenCalledTimes(1);
  });

  it("reports nothing collapsed when it opens again during its exit fade", async () => {
    const onCollapsed = vi.fn();
    await mount(<PreviewStrip label="ACTION" words="Rain." expanded onCollapsed={onCollapsed} />);
    const exit = exitRunning();
    try {
      await mount(<PreviewStrip label="ACTION" words="Rain." expanded={false} onCollapsed={onCollapsed} />);
      await mount(<PreviewStrip label="ACTION" words="Rain." expanded onCollapsed={onCollapsed} />);
      await exit.end();
      await faded();
      expect(dialog().open).toBe(true);
      expect(onCollapsed).not.toHaveBeenCalled();
    } finally {
      exit.restore();
    }
  });

  it("reports collapsed when it leaves the page during its exit fade", async () => {
    const onCollapsed = vi.fn();
    await mount(<PreviewStrip label="ACTION" words="Rain." expanded onCollapsed={onCollapsed} />);
    const exit = exitRunning();
    try {
      await mount(<PreviewStrip label="ACTION" words="Rain." expanded={false} onCollapsed={onCollapsed} />);
      await mount(null);
      expect(onCollapsed).toHaveBeenCalledTimes(1);
    } finally {
      exit.restore();
    }
  });

  it("asks to collapse on Escape and returns focus to Play when it collapses", async () => {
    const onCollapse = vi.fn();
    await mount(<PreviewStrip label="ACTION" words="Rain." expanded onCollapse={onCollapse} />);
    const cancel = new Event("cancel", { cancelable: true });
    dialog().dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(onCollapse).toHaveBeenCalledTimes(1);
    await mount(<PreviewStrip label="ACTION" words="Rain." expanded={false} onCollapse={onCollapse} />);
    await faded();
    expect(dialog().open).toBe(false);
    expect(dialog().style.display).toBe("");
    expect(document.activeElement).toBe(play());
    expect(portalContainer()).toBeUndefined();
  });

  it("returns focus to Play once Play is enabled again when it collapses while Play is disabled", async () => {
    await mount(<PreviewStrip label="YOUR GAME" words="Write a line." expanded playDisabled />);
    expect(document.activeElement).toBe(document.body);
    await mount(<PreviewStrip label="YOUR GAME" words="Write a line." expanded={false} playDisabled />);
    await faded();
    expect(dialog().open).toBe(false);
    expect(document.activeElement).not.toBe(play());
    await mount(<PreviewStrip label="ACTION" words="Rain." expanded={false} />);
    expect(document.activeElement).toBe(play());
  });

  it("leaves focus where the author put it when Play is enabled only after they acted", async () => {
    await mount(<PreviewStrip label="YOUR GAME" words="Write a line." expanded playDisabled />);
    await mount(<PreviewStrip label="YOUR GAME" words="Write a line." expanded={false} playDisabled />);
    await faded();
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
