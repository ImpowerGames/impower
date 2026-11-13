import { render, type ComponentChild } from "preact";
import { renderToString } from "preact-render-to-string";
import { act } from "preact/test-utils";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { portalContainer } from "../../utils/portalContainer";
import { topToastLayer } from "../../utils/toastLayer";
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

  it("server-renders Play disabled, so no tap lands before its handler is attached", () => {
    const html = renderToString(<PreviewStrip label="ACTION" words="Rain." onPlay={() => {}} />);
    const button = /<button[^>]*aria-label="Play from this line"[^>]*>/.exec(html)![0];
    expect(button).toContain("disabled");
  });

  it("keeps Play disabled when asked, as on a setup line", async () => {
    await mount(<PreviewStrip label="STORY SETUP" words="This line sets up your story." symbol="file" playDisabled />);
    expect(play().disabled).toBe(true);
  });

  it("reserves its height and clamps the words, giving a line to each status row", async () => {
    await mount(<PreviewStrip label="ACTION" words="Rain." />);
    expect(host!.querySelector("section")!.className).toContain("h-(--strip-h)");
    expect(words().className).toContain("line-clamp-(--words-lines)");
    await mount(<PreviewStrip label="ACTION" words="Rain." statuses={[status("problem")]} />);
    expect(words().className).toContain("line-clamp-2");
    await mount(
      <PreviewStrip label="ACTION" words="Rain." statuses={[status("problem"), status("forced")]} />,
    );
    expect(words().className).toContain("line-clamp-1");
  });

  it("offers the prototype's two heights, choosing the shorter on a short viewport by default", async () => {
    await mount(<PreviewStrip label="ACTION" words="Rain." />);
    const fit = host!.querySelector("section")!.className;
    expect(fit).toContain("[--strip-h:104px]");
    expect(fit).toContain("short-viewport:[--strip-h:91px]");
    await mount(<PreviewStrip height="short" label="ACTION" words="Rain." />);
    const short = host!.querySelector("section")!.className;
    expect(short).toContain("[--strip-h:91px]");
    expect(short).not.toContain("[--strip-h:104px]");
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
});
