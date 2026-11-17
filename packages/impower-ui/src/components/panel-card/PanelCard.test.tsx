import { render, type ComponentChild } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClearIcon } from "../icon/icons.generated";
import {
  PANEL_CARD_HEIGHT,
  PanelCardAction,
  PanelCardHead,
  PanelCardNote,
  PanelCardRow,
} from "./PanelCard";

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

describe("PanelCard", () => {
  it("draws a 44px head row with a 44px toggle, the prototype's console card head, and reserves 52px for it in a virtual list", async () => {
    const root = await mount(
      <PanelCardHead title="Variables" open onOpenChange={() => {}} />,
    );
    const toggle = root.querySelector<HTMLButtonElement>("button[aria-expanded]")!;
    expect(toggle.parentElement!.classList).toContain("h-[44px]");
    expect(toggle.classList).toContain("h-11");
    expect(toggle.classList).toContain("top-0");
    expect(toggle.classList).not.toContain("inset-0");
    expect(PANEL_CARD_HEIGHT.head).toBe(52);
  });

  it("names its head toggle by title and spoken count, and reports the opposite of its open state", async () => {
    const onOpenChange = vi.fn();
    await mount(
      <PanelCardHead
        title="In the script"
        count={{ text: "(2 problems · 1 note)", spoken: "2 problems and 1 note" }}
        open
        controls="card-script"
        onOpenChange={onOpenChange}
      />,
    );
    const toggle = host!.querySelector("button")!;
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.getAttribute("aria-controls")).toBe("card-script");
    expect(toggle.getAttribute("aria-label")).toBe("In the script, 2 problems and 1 note");
    expect(toggle.querySelector("small")!.textContent).toBe("(2 problems · 1 note)");
    await act(async () => toggle.click());
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("groups its actions under the card's title, each a labelled button that can be disabled", async () => {
    const onClear = vi.fn();
    await mount(
      <PanelCardHead
        title="While playing"
        open={false}
        onOpenChange={() => {}}
        actions={
          <PanelCardAction
            label="Clear the played messages"
            icon={<ClearIcon />}
            onClick={onClear}
            disabled
          />
        }
      />,
    );
    const group = host!.querySelector('[role="group"]')!;
    expect(group.getAttribute("aria-label")).toBe("While playing");
    const clear = group.querySelector("button")!;
    expect(clear.getAttribute("aria-label")).toBe("Clear the played messages");
    expect(clear.getAttribute("title")).toBe("Clear the played messages");
    expect(clear.disabled).toBe(true);
    expect(host!.querySelector('[aria-expanded="false"]')).not.toBeNull();
  });

  it("says a card's note in muted text inside a body row of the note's height", async () => {
    await mount(
      <div style={{ height: `${PANEL_CARD_HEIGHT.note}px` }}>
        <PanelCardNote>Pause the story to inspect it.</PanelCardNote>
      </div>,
    );
    const row = host!.firstElementChild!.firstElementChild as HTMLElement;
    expect(row.className).toContain("border-x");
    const note = row.querySelector("p")!;
    expect(note.textContent).toBe("Pause the story to inspect it.");
    expect(note.className).toContain("text-muted");
    expect(PANEL_CARD_HEIGHT.note).toBe(52);
  });

  it("frames body rows at the sides and closes the card with its end row", async () => {
    await mount(
      <>
        <PanelCardRow part="body">Entry</PanelCardRow>
        <PanelCardRow part="end" />
      </>,
    );
    const [body, end] = Array.from(host!.children) as HTMLElement[];
    expect(body!.className).toContain("border-x");
    expect(body!.className).not.toContain("border-b");
    expect(end!.className).toContain("border-b");
    expect(end!.className).toContain("rounded-b-[10px]");
  });
});
