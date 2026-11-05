import { render } from "preact";
import { useState } from "preact/hooks";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DIALOG_TRANSITION_MS } from "../dialog/Dialog";
import * as components from "../index";
import ActionSheet, {
  ActionSheet as NamedActionSheet,
  type ActionSheetItem,
} from "./ActionSheet";

let host: HTMLDivElement | undefined;

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
  document.body.innerHTML = "";
  document.body.removeAttribute("style");
});

const settle = (ms = 0) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });

const sheet = () => document.querySelector<HTMLElement>('[role="dialog"]');
const items = () =>
  Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));

function Harness({
  list,
  onOpenChange,
}: {
  list: readonly ActionSheetItem[];
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <ActionSheet
        open={open}
        onOpenChange={(next) => {
          onOpenChange?.(next);
          setOpen(next);
        }}
        title="Edit"
        items={list}
      />
    </>
  );
}

const mount = async (
  list: readonly ActionSheetItem[],
  onOpenChange?: (open: boolean) => void,
) => {
  host = document.body.appendChild(document.createElement("div"));
  await act(async () =>
    render(<Harness list={list} onOpenChange={onOpenChange} />, host!),
  );
  const opener = host.querySelector("button")!;
  opener.focus();
  await act(async () => opener.click());
  await settle(50);
  return opener;
};

describe("ActionSheet's exports", () => {
  it("exports one component by name from its own module and from the package entry", () => {
    expect(NamedActionSheet).toBe(ActionSheet);
    expect(components.ActionSheet).toBe(NamedActionSheet);
  });
});

describe("ActionSheet under preact/compat", () => {
  it("renders nothing while closed", async () => {
    host = document.body.appendChild(document.createElement("div"));
    await act(async () => render(<Harness list={[]} />, host!));
    expect(sheet()).toBeNull();
  });

  it("opens a modal sheet labelled by its title holding a menu of its items", async () => {
    const onSelect = vi.fn();
    await mount([
      { label: "Copy", onSelect },
      { type: "separator" },
      { label: "Rename", disabled: true, onSelect },
    ]);
    const card = sheet()!;
    expect(card.getAttribute("aria-modal")).toBe("true");
    expect(
      document.getElementById(card.getAttribute("aria-labelledby")!)
        ?.textContent,
    ).toBe("Edit");
    expect(card.querySelector('[role="menu"]')?.getAttribute("aria-label")).toBe(
      "Edit",
    );
    expect(items().map((item) => item.textContent)).toEqual(["Copy", "Rename"]);
    expect(card.querySelectorAll('[role="separator"]')).toHaveLength(1);
    expect(items()[1]!.disabled).toBe(true);
    expect(card.className).toContain("translate-y-0");
  });

  it("runs an item when it is chosen", async () => {
    const onSelect = vi.fn();
    await mount([{ label: "Copy", onSelect }]);
    await act(async () => items()[0]!.click());
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape, unmounts after the exit and returns focus to the opener", async () => {
    const onOpenChange = vi.fn();
    const opener = await mount([{ label: "Copy", onSelect: () => {} }], onOpenChange);
    expect(sheet()!.contains(document.activeElement)).toBe(true);
    await act(async () => {
      (document.activeElement ?? document.body).dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    await settle(DIALOG_TRANSITION_MS + 50);
    expect(sheet()).toBeNull();
    await settle(10);
    expect(document.activeElement).toBe(opener);
  });

  it("keeps showing its items through the exit transition", async () => {
    function Closing() {
      const [open, setOpen] = useState(true);
      const [list, setList] = useState<ActionSheetItem[]>([
        { label: "Copy", onSelect: () => {} },
      ]);
      return (
        <>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setList([]);
            }}
          >
            Close
          </button>
          <ActionSheet open={open} onOpenChange={setOpen} title="Edit" items={list} />
        </>
      );
    }
    host = document.body.appendChild(document.createElement("div"));
    await act(async () => render(<Closing />, host!));
    await settle(50);
    await act(async () => host!.querySelector("button")!.click());
    expect(items().map((item) => item.textContent)).toEqual(["Copy"]);
  });
});
